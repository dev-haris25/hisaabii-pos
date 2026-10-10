"use client";

import { ChevronDown } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { HisabiSpinner } from "@/components/hisabi-spinner";
import { flagCdnPngUrl } from "@/lib/geo/flag-cdn-url";
import { cn } from "@/lib/utils";

/**
 * @typedef {{ code: string, name: string, dial?: string | null, flag: string, flagUrl?: string | null }} CountryRow
 */

/**
 * @param {CountryRow} c
 * @param {string} rawQuery
 */
function matchesCountryFilter(c, rawQuery) {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (c.name.toLowerCase().includes(q)) return true;
  const code = (c.code || "").toLowerCase();
  if (code.includes(q)) return true;
  if (c.dial) {
    const dial = String(c.dial).toLowerCase().replace(/\s/g, "");
    const qn = q.replace(/\s/g, "");
    if (dial.includes(qn)) return true;
    const digits = (s) => s.replace(/\D/g, "");
    const qd = digits(qn);
    if (qd.length > 0 && digits(dial).includes(qd)) return true;
  }
  return false;
}

/**
 * @param {{ src: string, emojiFallback: string }} props
 */
function FlagMarkImg({ src, emojiFallback }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt=""
        width={22}
        height={16}
        className="shrink-0 rounded-sm object-cover shadow-sm"
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    );
  }
  return (
    <span
      className="hisabi-emoji-font flex size-[1.375rem] shrink-0 items-center justify-center text-lg leading-none"
      aria-hidden
    >
      {emojiFallback || "·"}
    </span>
  );
}

/**
 * @param {{ country: CountryRow }} props
 */
function FlagMark({ country }) {
  const apiUrl =
    country.flagUrl && /^https?:\/\//i.test(country.flagUrl)
      ? country.flagUrl
      : "";
  const cdnUrl = flagCdnPngUrl(country.code);
  const src = apiUrl || cdnUrl;

  return (
    <FlagMarkImg
      key={src}
      src={src}
      emojiFallback={country.flag || "·"}
    />
  );
}

/**
 * Custom country picker so flags render (native &lt;select&gt; often breaks emoji on Windows).
 * With `compactDialTrigger` and `showDial`, the trigger shows flag + dial only (no country name).
 * The same combination makes the **dropdown list** show flag + dial code only (e.g. +92), with full country name on `aria-label` for accessibility.
 * The dropdown includes a search field; results match country name, ISO code, or dial code.
 * Pass `dropdownMinWidthPx` to make the floating panel wider than the trigger (e.g. phone dial).
 *
 * @param {{
 *   id: string
 *   value: string
 *   onChange: (code: string) => void
 *   countries: CountryRow[]
 *   emptyLabel: string
 *   showDial?: boolean
 *   allowClear?: boolean
 *   compactDialTrigger?: boolean
 *   rootClassName?: string
 *   triggerClassName: string
 *   dropdownMinWidthPx?: number
 *   loading?: boolean
 * }} props
 */
export function FlagCountrySelect({
  id,
  value,
  onChange,
  countries,
  emptyLabel,
  showDial = false,
  allowClear = true,
  compactDialTrigger = false,
  rootClassName,
  triggerClassName,
  dropdownMinWidthPx,
  loading = false,
}) {
  const t = useTranslations("Clients");
  const listboxId = useId();
  const searchInputId = useId();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuRect, setMenuRect] = useState(
    /** @type {DOMRect | null} */ (null),
  );
  const buttonRef = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const menuRef = useRef(/** @type {HTMLUListElement | null} */ (null));
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const searchInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));

  const selected = countries.find((c) => c.code === value);

  const filteredCountries = useMemo(
    () => countries.filter((c) => matchesCountryFilter(c, searchQuery)),
    [countries, searchQuery],
  );

  useLayoutEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale anchor when menu closes
      setMenuRect(null);
      return;
    }
    const el = buttonRef.current;
    if (!el) return;
    function update() {
      const r = buttonRef.current?.getBoundingClientRect();
      if (r) setMenuRect(r);
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      const t = /** @type {Node | null} */ (e.target);
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const maxMenuHeight =
    menuRect != null
      ? Math.max(120, window.innerHeight - menuRect.bottom - 12)
      : 240;

  /** Phone dial picker: list rows show flag + code only (no country name). */
  const dialPickerMenu = showDial && compactDialTrigger;

  const panelMaxHeight = Math.min(320, Math.max(140, maxMenuHeight));
  const searchAreaApproxPx = 58;
  const listMaxHeight = Math.max(96, panelMaxHeight - searchAreaApproxPx);

  /** Measured panel geometry, handed to `.hisabi-floating-panel` via CSS custom properties. */
  const panelGeometry =
    menuRect == null
      ? null
      : (() => {
          const triggerW = menuRect.width;
          const panelWidth =
            dropdownMinWidthPx != null
              ? Math.max(triggerW, dropdownMinWidthPx)
              : triggerW;
          let left = menuRect.left;
          if (typeof window !== "undefined") {
            const pad = 8;
            const maxLeft = window.innerWidth - pad - panelWidth;
            if (left > maxLeft) left = Math.max(pad, maxLeft);
          }
          return { top: menuRect.bottom + 4, left, width: panelWidth };
        })();

  const panelTop = panelGeometry?.top;
  const panelLeft = panelGeometry?.left;
  const panelWidthPx = panelGeometry?.width;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel && panelTop != null) {
      panel.style.setProperty("--hisabi-floating-top", `${panelTop}px`);
      panel.style.setProperty("--hisabi-floating-left", `${panelLeft}px`);
      panel.style.setProperty("--hisabi-floating-width", `${panelWidthPx}px`);
      panel.style.setProperty("--hisabi-floating-max-h", `${panelMaxHeight}px`);
    }
    menuRef.current?.style.setProperty(
      "--hisabi-floating-list-max-h",
      `${listMaxHeight}px`,
    );
  }, [open, panelTop, panelLeft, panelWidthPx, panelMaxHeight, listMaxHeight]);

  const listContent = (
    <div
      ref={panelRef}
      className={cn(
        "hisabi-floating-panel type-body-md text-hisabi-on-surface z-[200] flex flex-col overflow-hidden rounded-lg border border-hisabi-outline-variant bg-hisabi-surface-container-lowest shadow-xl",
        panelGeometry == null && "hidden",
      )}
    >
      <div className="border-hisabi-outline-variant shrink-0 border-b bg-hisabi-surface-container-lowest px-hisabi-sm py-2">
        <label htmlFor={searchInputId} className="sr-only">
          {t("flagCountrySearchPlaceholder")}
        </label>
        <input
          ref={searchInputRef}
          id={searchInputId}
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("flagCountrySearchPlaceholder")}
          autoComplete="off"
          spellCheck={false}
          className="type-body-md w-full rounded-md border border-hisabi-outline-variant bg-hisabi-surface px-hisabi-sm py-2 text-hisabi-on-surface outline-none placeholder:text-hisabi-on-surface-variant focus:border-hisabi-primary"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        />
      </div>
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        className="hisabi-floating-list overflow-y-auto py-1"
      >
        {loading ? (
          <li
            role="none"
            className="flex items-center justify-center px-hisabi-md py-6"
          >
            <HisabiSpinner className="text-hisabi-primary" />
          </li>
        ) : (
          <>
        {allowClear ? (
          <li role="none">
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className="hover:bg-hisabi-surface-container-low flex w-full items-center gap-2 px-hisabi-md py-2.5 text-start"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <span className="text-hisabi-on-surface-variant min-w-0 flex-1 truncate">
                {emptyLabel}
              </span>
            </button>
          </li>
        ) : null}
        {filteredCountries.map((c) => (
          <li key={c.code} role="none">
            <button
              type="button"
              role="option"
              aria-selected={value === c.code}
              aria-label={
                dialPickerMenu
                  ? [c.name, c.dial].filter(Boolean).join(" ")
                  : undefined
              }
              className={cn(
                "flex w-full items-center gap-2 px-hisabi-md py-2.5 text-start",
                value === c.code
                  ? "bg-hisabi-primary-container/15"
                  : "hover:bg-hisabi-surface-container-low",
              )}
              onClick={() => {
                onChange(c.code);
                setOpen(false);
              }}
            >
              <FlagMark country={c} />
              {dialPickerMenu ? (
                <span className="min-w-0 flex-1 truncate font-medium tabular-nums">
                  {c.dial ?? ""}
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate">
                  {c.name}
                  {showDial && c.dial ? (
                    <span className="text-hisabi-on-surface-variant">
                      {" "}
                      ({c.dial})
                    </span>
                  ) : null}
                </span>
              )}
            </button>
          </li>
        ))}
        {searchQuery.trim() && filteredCountries.length === 0 ? (
          <li
            role="none"
            className="type-body-sm pointer-events-none px-hisabi-md py-4 text-center text-hisabi-on-surface-variant"
          >
            {t("flagCountrySearchNoResults")}
          </li>
        ) : null}
          </>
        )}
      </ul>
    </div>
  );

  return (
    <div ref={rootRef} className={cn("relative w-full", rootClassName)}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={
          compactDialTrigger && selected
            ? [selected.name, selected.dial].filter(Boolean).join(", ")
            : undefined
        }
        onClick={() =>
          setOpen((wasOpen) => {
            if (!wasOpen) setSearchQuery("");
            return !wasOpen;
          })
        }
        className={cn(
          triggerClassName,
          "flex h-full min-h-[2.75rem] w-full cursor-pointer items-center justify-between gap-hisabi-sm text-start",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selected ? (
            compactDialTrigger && showDial ? (
              <>
                <FlagMark country={selected} />
                <span className="min-w-0 truncate font-medium tabular-nums">
                  {selected.dial || selected.name}
                </span>
              </>
            ) : (
              <>
                <FlagMark country={selected} />
                <span className="min-w-0 truncate">
                  {selected.name}
                  {showDial && selected.dial ? (
                    <span className="text-hisabi-on-surface-variant">
                      {" "}
                      ({selected.dial})
                    </span>
                  ) : null}
                </span>
              </>
            )
          ) : (
            <span className="text-hisabi-outline/70 truncate">
              {emptyLabel}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "text-hisabi-outline size-5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {open && menuRect && typeof document !== "undefined"
        ? createPortal(listContent, document.body)
        : null}
    </div>
  );
}
