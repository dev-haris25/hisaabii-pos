"use client";

import { useEffect, useRef, useState } from "react";

import { authPost } from "@/lib/api/auth-client";

const logDebounce =
  process.env.NODE_ENV === "development"
    ? (...args) => {
        console.log("[Hisabi translate debounce]", ...args);
      }
    : () => {};

/**
 * When `englishText` changes, debounce-call Gemini (via server) and push Arabic into `setArabic`.
 * Failures are silent — Arabic stays editable manually.
 *
 * @param {string} englishText
 * @param {(ar: string) => void} setArabic
 * @param {{ debounceMs?: number, englishBaseline?: string, enabled?: boolean, shouldSkip?: (trimmed: string) => boolean }} [opts]
 *   When `englishBaseline` is provided, skips the API while trimmed `englishText`
 *   equals trimmed baseline (hydrated server value) so opening an edit sheet does not translate.
 *   When `enabled` is false, skips scheduling (e.g. while a confirm modal is open).
 *   Re-enabling does not re-fetch if trimmed English is unchanged since the last handled value.
 *   When `shouldSkip(trimmed)` returns true, treat as handled with no API (auto-fill gap-fill).
 */
export function useGeminiArSuggestion(englishText, setArabic, opts = {}) {
  const debounceMs = opts.debounceMs ?? 500;
  const englishBaseline = opts.englishBaseline;
  const enabled = opts.enabled !== false;
  const shouldSkip = opts.shouldSkip;
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const setArabicRef = useRef(setArabic);
  /** Last trimmed English we finished handling (skip, fetch, or apply) — avoids re-calling API when only `enabled` flips. */
  const lastHandledEnglishTrimRef = useRef(/** @type {string | null} */ (null));
  const prevBaselineRef = useRef(englishBaseline);
  const shouldSkipRef = useRef(shouldSkip);

  useEffect(() => {
    setArabicRef.current = setArabic;
  }, [setArabic]);

  useEffect(() => {
    shouldSkipRef.current = shouldSkip;
  }, [shouldSkip]);

  useEffect(() => {
    if (prevBaselineRef.current !== englishBaseline) {
      prevBaselineRef.current = englishBaseline;
      lastHandledEnglishTrimRef.current = null;
    }
  }, [englishBaseline]);

  useEffect(() => {
    if (!enabled) {
      seq.current += 1;
      const id = requestAnimationFrame(() => {
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    const trimmed = englishText.trim();
    logDebounce("effect run (runs on every englishText change)", {
      rawLen: englishText.length,
      trimmedLen: trimmed.length,
      preview: trimmed.slice(0, 60),
      debounceMs,
    });

    if (shouldSkipRef.current?.(trimmed)) {
      seq.current += 1;
      lastHandledEnglishTrimRef.current = trimmed;
      logDebounce("→ shouldSkip (auto-fill): no API", {
        preview: trimmed.slice(0, 60),
      });
      const id = requestAnimationFrame(() => {
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    if (
      lastHandledEnglishTrimRef.current !== null &&
      lastHandledEnglishTrimRef.current === trimmed
    ) {
      seq.current += 1;
      logDebounce(
        "→ same English as last handled: no API (e.g. modal closed)",
        {
          preview: trimmed.slice(0, 60),
        },
      );
      const id = requestAnimationFrame(() => {
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    if (!trimmed) {
      seq.current += 1;
      lastHandledEnglishTrimRef.current = "";
      logDebounce(
        "→ empty trimmed text: no API call, invalidate in-flight seq",
      );
      const id = requestAnimationFrame(() => {
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    if (englishBaseline !== undefined) {
      const baseTrim = String(englishBaseline ?? "").trim();
      if (trimmed === baseTrim) {
        seq.current += 1;
        lastHandledEnglishTrimRef.current = trimmed;
        logDebounce("→ matches englishBaseline: no API call", {
          preview: trimmed.slice(0, 60),
        });
        const id = requestAnimationFrame(() => {
          setLoading(false);
        });
        return () => cancelAnimationFrame(id);
      }
    }

    const my = ++seq.current;
    logDebounce("→ scheduled debounced translate", {
      seq: my,
      fireInMs: debounceMs,
    });

    const timer = setTimeout(async () => {
      if (my !== seq.current) {
        logDebounce("→ timer fired but STALE (skipped request)", {
          timerSeq: my,
          currentSeq: seq.current,
        });
        return;
      }
      logDebounce("→ DEBOUNCE END: sending POST /translate-to-arabic", {
        seq: my,
        charCount: trimmed.length,
      });
      setLoading(true);
      try {
        const data = await authPost("/translate-to-arabic", { text: trimmed });
        const ar = typeof data?.ar === "string" ? data.ar.trim() : "";
        logDebounce("← API returned", {
          seq: my,
          arLen: ar.length,
          applied: my === seq.current && Boolean(ar),
        });
        if (my === seq.current && ar) {
          setArabicRef.current(ar);
        }
      } catch (err) {
        logDebounce("← API error (Arabic left unchanged)", {
          seq: my,
          message: err instanceof Error ? err.message : String(err),
        });
        // leave Arabic as-is
      } finally {
        if (my === seq.current) {
          setLoading(false);
          lastHandledEnglishTrimRef.current = trimmed;
        }
      }
    }, debounceMs);

    return () => {
      logDebounce("cleanup: cleared pending timer (new keystroke or unmount)");
      clearTimeout(timer);
    };
  }, [englishText, debounceMs, englishBaseline, enabled]);

  return { loading };
}
