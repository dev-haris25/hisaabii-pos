"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { AuthSubmitButton } from "@/components/auth/auth-submit-button";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { useSuppressBrowserAutofillUntilFocus } from "@/hooks/use-suppress-browser-autofill-until-focus";
import { cn } from "@/lib/utils";

const fieldClass =
  "type-body-md focus:border-hisabi-teal-container focus:ring-hisabi-teal-container w-full rounded-xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest px-hisabi-md py-3 text-hisabi-on-surface outline-none transition-all focus:ring-2 focus:ring-inset";

const readOnlyClass = cn(
  fieldClass,
  "type-body-md bg-hisabi-surface-container-low text-hisabi-on-surface-variant",
);

/**
 * @typedef {{
 *   companyNameEn: string
 *   companyNameAr: string
 *   addressEn: string
 *   addressAr: string
 *   streetEn?: string
 *   streetAr?: string
 *   districtEn?: string
 *   districtAr?: string
 *   cityEn?: string
 *   cityAr?: string
 * }} BilingualSnapshot
 */

/**
 * @typedef {{ pairKey: string, filledLang: 'en' | 'ar' }} AutoTranslatedPair
 */

/**
 * @param {string} pairKey
 */
function pairSuffix(pairKey) {
  const i = pairKey.lastIndexOf(".");
  return i >= 0 ? pairKey.slice(i + 1) : pairKey;
}

/**
 * Map tracked pair keys → snapshot fields + i18n label keys.
 * @param {string} pairKey
 * @returns {null | {
 *   enKey: keyof BilingualSnapshot
 *   arKey: keyof BilingualSnapshot
 *   enLabelKey: string
 *   arLabelKey: string
 *   arPlaceholderKey: string
 *   kind: 'text' | 'textarea'
 *   useAddressMax?: boolean
 *   order: number
 * }}
 */
function resolvePairUi(pairKey) {
  switch (pairSuffix(pairKey)) {
    case "name":
      return {
        enKey: "companyNameEn",
        arKey: "companyNameAr",
        enLabelKey: "companyNameEnglish",
        arLabelKey: "companyNameArabic",
        arPlaceholderKey: "companyNameArabicPlaceholder",
        kind: "text",
        order: 0,
      };
    case "description":
      return {
        enKey: "addressEn",
        arKey: "addressAr",
        enLabelKey: "addressEnglish",
        arLabelKey: "addressArabic",
        arPlaceholderKey: "addressArabicPlaceholder",
        kind: "textarea",
        useAddressMax: true,
        order: 1,
      };
    case "district":
      return {
        enKey: "districtEn",
        arKey: "districtAr",
        enLabelKey: "fieldDistrictEn",
        arLabelKey: "fieldDistrictAr",
        arPlaceholderKey: "placeholderDistrictAr",
        kind: "text",
        order: 2,
      };
    case "city":
      return {
        enKey: "cityEn",
        arKey: "cityAr",
        enLabelKey: "fieldCityEn",
        arLabelKey: "fieldCityAr",
        arPlaceholderKey: "placeholderCityAr",
        kind: "text",
        order: 3,
      };
    case "street":
      return {
        enKey: "streetEn",
        arKey: "streetAr",
        enLabelKey: "fieldStreetEn",
        arLabelKey: "fieldStreetAr",
        arPlaceholderKey: "placeholderStreetAr",
        kind: "text",
        order: 4,
      };
    default:
      return null;
  }
}

/**
 * @param {{
 *   remountKey: string | number
 *   snapshot: BilingualSnapshot
 *   onClose: () => void
 *   onConfirm: (next: BilingualSnapshot) => void
 *   translationNamespace?: 'BilingualInvoiceCompany' | 'Clients' | 'Products'
 *   hideInvoiceAddressSection?: boolean
 *   addressArMaxChars?: number
 *   autoTranslatedPairs?: AutoTranslatedPair[]
 * }} props
 */
export function BilingualInvoiceFieldsConfirmModal({
  remountKey,
  snapshot,
  onClose,
  onConfirm,
  translationNamespace = "BilingualInvoiceCompany",
  hideInvoiceAddressSection = false,
  addressArMaxChars,
  autoTranslatedPairs = [],
}) {
  const portalEl = typeof document !== "undefined" ? document.body : null;

  if (!portalEl) {
    return null;
  }

  return createPortal(
    <BilingualInvoiceFieldsConfirmModalInner
      key={String(remountKey)}
      snapshot={snapshot}
      onClose={onClose}
      onConfirm={onConfirm}
      translationNamespace={translationNamespace}
      hideInvoiceAddressSection={hideInvoiceAddressSection}
      addressArMaxChars={addressArMaxChars}
      autoTranslatedPairs={autoTranslatedPairs}
    />,
    portalEl,
  );
}

/**
 * @param {{
 *   snapshot: BilingualSnapshot
 *   onClose: () => void
 *   onConfirm: (next: BilingualSnapshot) => void
 *   translationNamespace: 'BilingualInvoiceCompany' | 'Clients' | 'Products'
 *   hideInvoiceAddressSection: boolean
 *   addressArMaxChars?: number
 *   autoTranslatedPairs: AutoTranslatedPair[]
 * }} props
 */
function BilingualInvoiceFieldsConfirmModalInner({
  snapshot,
  onClose,
  onConfirm,
  translationNamespace,
  hideInvoiceAddressSection,
  addressArMaxChars,
  autoTranslatedPairs,
}) {
  const t = useTranslations(translationNamespace);
  const titleId = useId();
  const panelRef = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [draft, setDraft] = useState(snapshot);

  const visiblePairs = autoTranslatedPairs
    .map((entry) => {
      const ui = resolvePairUi(entry.pairKey);
      if (!ui) return null;
      // Clients hide the combined address/description block only.
      if (
        hideInvoiceAddressSection &&
        pairSuffix(entry.pairKey) === "description"
      ) {
        return null;
      }
      return { ...entry, ui };
    })
    .filter(Boolean)
    .sort((a, b) => a.ui.order - b.ui.order);

  useLayoutEffect(() => {
    const focusable = panelRef.current?.querySelector(
      "input, textarea, button, [href]",
    );
    if (focusable instanceof HTMLElement) {
      focusable.focus();
    }
  }, []);

  useBodyScrollLock(true);

  useEffect(() => {
    function onKeyDown(/** @type {KeyboardEvent} */ e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-hisabi-md"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 z-0 bg-black/50"
        aria-label={t("confirmBackdropDismiss")}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="type-body-md text-hisabi-on-surface relative z-10 max-h-[min(90vh,40rem)] w-[min(100vw-2rem,var(--width-hisabi-overlay-2xl))] overflow-hidden rounded-2xl border border-hisabi-outline-variant bg-hisabi-surface-container-lowest shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="h-1 w-full shrink-0 bg-hisabi-secondary" aria-hidden />
        <div className="max-h-[min(90vh,40rem)] space-y-hisabi-lg overflow-y-auto p-hisabi-xl">
          <div>
            <h2
              id={titleId}
              className="type-headline-md text-hisabi-teal mb-hisabi-sm"
            >
              {t("confirmTitle")}
            </h2>
            <p className="type-body-md text-hisabi-on-surface-variant">
              {t("confirmIntro")}
            </p>
          </div>

          <div className="space-y-hisabi-md">
            {visiblePairs.map((entry) => (
              <ConfirmPairRow
                key={entry.pairKey}
                filledLang={entry.filledLang}
                enLabel={t(entry.ui.enLabelKey)}
                arLabel={t(entry.ui.arLabelKey)}
                arPlaceholder={t(entry.ui.arPlaceholderKey)}
                enValue={String(draft[entry.ui.enKey] ?? "")}
                arValue={String(draft[entry.ui.arKey] ?? "")}
                kind={entry.ui.kind}
                maxChars={
                  entry.ui.useAddressMax && typeof addressArMaxChars === "number"
                    ? addressArMaxChars
                    : entry.ui.kind === "text"
                      ? 200
                      : undefined
                }
                onEnChange={(v) =>
                  setDraft((d) => ({ ...d, [entry.ui.enKey]: v }))
                }
                onArChange={(v) =>
                  setDraft((d) => ({ ...d, [entry.ui.arKey]: v }))
                }
              />
            ))}
          </div>

          <div className="flex w-full flex-col-reverse gap-hisabi-sm pt-hisabi-md sm:flex-row sm:gap-hisabi-md">
            <button
              type="button"
              className="type-label-md border-hisabi-outline text-hisabi-on-surface-variant hover:bg-hisabi-surface-container-low inline-flex min-h-[48px] w-full flex-1 basis-0 cursor-pointer items-center justify-center rounded-xl border-2 px-hisabi-sm font-semibold transition-all sm:min-w-0"
              onClick={onClose}
            >
              {t("confirmBack")}
            </button>
            <AuthSubmitButton
              type="button"
              className="min-h-[48px] w-full flex-1 basis-0 sm:min-w-0"
              onClick={() => {
                const next =
                  typeof addressArMaxChars === "number"
                    ? {
                        ...draft,
                        addressAr: draft.addressAr.slice(0, addressArMaxChars),
                      }
                    : draft;
                onConfirm(next);
              }}
            >
              {t("confirmSave")}
            </AuthSubmitButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   filledLang: 'en' | 'ar'
 *   enLabel: string
 *   arLabel: string
 *   arPlaceholder: string
 *   enValue: string
 *   arValue: string
 *   kind: 'text' | 'textarea'
 *   maxChars?: number
 *   onEnChange: (v: string) => void
 *   onArChange: (v: string) => void
 * }} props
 */
function ConfirmPairRow({
  filledLang,
  enLabel,
  arLabel,
  arPlaceholder,
  enValue,
  arValue,
  kind,
  maxChars,
  onEnChange,
  onArChange,
}) {
  const enEditable = filledLang === "en";
  const arEditable = filledLang === "ar";
  const enAutofill = useSuppressBrowserAutofillUntilFocus();
  const arAutofill = useSuppressBrowserAutofillUntilFocus();

  const clamp = (/** @type {string} */ v) =>
    typeof maxChars === "number" ? v.slice(0, maxChars) : v;

  return (
    <div
      dir="ltr"
      className={cn(
        "grid grid-cols-1 gap-hisabi-md min-[480px]:grid-cols-2",
        kind === "textarea" && "items-stretch",
      )}
    >
      <div
        className={cn(
          "space-y-hisabi-xs",
          kind === "textarea" && "flex min-h-0 flex-col",
        )}
      >
        {enEditable ? (
          <>
            <label className="type-label-md text-hisabi-on-surface-variant block">
              {enLabel}
            </label>
            {kind === "textarea" ? (
              <textarea
                rows={4}
                className={cn(
                  fieldClass,
                  "min-h-[9rem] flex-1 resize-none sm:min-h-[10rem]",
                )}
                dir="ltr"
                autoComplete="off"
                value={enValue}
                maxLength={maxChars}
                onChange={(e) => onEnChange(clamp(e.target.value))}
                {...enAutofill}
              />
            ) : (
              <input
                className={fieldClass}
                dir="ltr"
                autoComplete="off"
                value={enValue}
                maxLength={maxChars}
                onChange={(e) => onEnChange(clamp(e.target.value))}
                {...enAutofill}
              />
            )}
          </>
        ) : (
          <>
            <span className="type-label-md text-hisabi-on-surface-variant block">
              {enLabel}
            </span>
            <div
              className={cn(
                readOnlyClass,
                kind === "textarea" &&
                  "flex min-h-[9rem] flex-1 items-start whitespace-pre-wrap sm:min-h-[10rem]",
              )}
              dir="ltr"
            >
              {enValue.trim() || "—"}
            </div>
          </>
        )}
      </div>
      <div
        className={cn(
          "space-y-hisabi-xs",
          kind === "textarea" && "flex min-h-0 flex-col",
        )}
      >
        {arEditable ? (
          <>
            <label className="type-label-md text-hisabi-on-surface-variant block">
              {arLabel}
            </label>
            {kind === "textarea" ? (
              <textarea
                rows={4}
                className={cn(
                  fieldClass,
                  "min-h-[9rem] flex-1 resize-none sm:min-h-[10rem]",
                )}
                dir="rtl"
                autoComplete="off"
                placeholder={arPlaceholder}
                value={arValue}
                maxLength={maxChars}
                onChange={(e) => onArChange(clamp(e.target.value))}
                {...arAutofill}
              />
            ) : (
              <input
                className={fieldClass}
                dir="rtl"
                autoComplete="off"
                placeholder={arPlaceholder}
                value={arValue}
                maxLength={maxChars}
                onChange={(e) => onArChange(clamp(e.target.value))}
                {...arAutofill}
              />
            )}
          </>
        ) : (
          <>
            <span className="type-label-md text-hisabi-on-surface-variant block">
              {arLabel}
            </span>
            <div
              className={cn(
                readOnlyClass,
                kind === "textarea" &&
                  "flex min-h-[9rem] flex-1 items-start whitespace-pre-wrap sm:min-h-[10rem]",
              )}
              dir="rtl"
            >
              {arValue.trim() || "—"}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
