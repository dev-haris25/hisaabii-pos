"use client";

import { useEffect, useRef, useState } from "react";

import { authPost } from "@/lib/api/auth-client";

/**
 * When `arabicText` changes, debounce-call Gemini (via server) and push English into `setEnglish`.
 * Mirror of `useGeminiArSuggestion` for AR→EN. Failures are silent.
 *
 * @param {string} arabicText
 * @param {(en: string) => void} setEnglish
 * @param {{ debounceMs?: number, arabicBaseline?: string, enabled?: boolean, shouldSkip?: (trimmed: string) => boolean }} [opts]
 */
export function useGeminiEnSuggestion(arabicText, setEnglish, opts = {}) {
  const debounceMs = opts.debounceMs ?? 500;
  const arabicBaseline = opts.arabicBaseline;
  const enabled = opts.enabled !== false;
  const shouldSkip = opts.shouldSkip;
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const setEnglishRef = useRef(setEnglish);
  const lastHandledArabicTrimRef = useRef(/** @type {string | null} */ (null));
  const prevBaselineRef = useRef(arabicBaseline);
  const shouldSkipRef = useRef(shouldSkip);

  useEffect(() => {
    setEnglishRef.current = setEnglish;
  }, [setEnglish]);

  useEffect(() => {
    shouldSkipRef.current = shouldSkip;
  }, [shouldSkip]);

  useEffect(() => {
    if (prevBaselineRef.current !== arabicBaseline) {
      prevBaselineRef.current = arabicBaseline;
      lastHandledArabicTrimRef.current = null;
    }
  }, [arabicBaseline]);

  useEffect(() => {
    if (!enabled) {
      seq.current += 1;
      const id = requestAnimationFrame(() => {
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    const trimmed = arabicText.trim();

    if (shouldSkipRef.current?.(trimmed)) {
      seq.current += 1;
      lastHandledArabicTrimRef.current = trimmed;
      const id = requestAnimationFrame(() => {
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    if (
      lastHandledArabicTrimRef.current !== null &&
      lastHandledArabicTrimRef.current === trimmed
    ) {
      seq.current += 1;
      const id = requestAnimationFrame(() => {
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    if (!trimmed) {
      seq.current += 1;
      lastHandledArabicTrimRef.current = "";
      const id = requestAnimationFrame(() => {
        setLoading(false);
      });
      return () => cancelAnimationFrame(id);
    }

    if (arabicBaseline !== undefined) {
      const baseTrim = String(arabicBaseline ?? "").trim();
      if (trimmed === baseTrim) {
        seq.current += 1;
        lastHandledArabicTrimRef.current = trimmed;
        const id = requestAnimationFrame(() => {
          setLoading(false);
        });
        return () => cancelAnimationFrame(id);
      }
    }

    const my = ++seq.current;

    const timer = setTimeout(async () => {
      if (my !== seq.current) return;
      setLoading(true);
      try {
        const data = await authPost("/translate-to-arabic", {
          text: trimmed,
          sourceLang: "ar",
          targetLang: "en",
        });
        const en =
          typeof data?.en === "string"
            ? data.en.trim()
            : typeof data?.text === "string"
              ? data.text.trim()
              : "";
        if (my === seq.current && en) {
          setEnglishRef.current(en);
        }
      } catch {
        // leave English as-is
      } finally {
        if (my === seq.current) {
          setLoading(false);
          lastHandledArabicTrimRef.current = trimmed;
        }
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
    };
  }, [arabicText, debounceMs, arabicBaseline, enabled]);

  return { loading };
}
