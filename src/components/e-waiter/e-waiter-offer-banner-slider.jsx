'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'

import { offerDisplayName } from '@/components/e-waiter/e-waiter-offer-utils'
import { cn } from '@/lib/utils'

const AUTO_ADVANCE_MS = 5000
/** After the guest touches / hovers the slider, wait this long before auto-advancing again. */
const RESUME_AFTER_MS = 8000
/** Scroll is considered settled after this quiet period (loop jump check). */
const SETTLE_MS = 120

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Offer banners at the top of the QR menu. One banner → static; several →
 * native scroll-snap slider (swipe), dots and auto-advance every 5 s.
 * Auto-advance always runs (it only pauses briefly after the guest touches,
 * hovers or focuses it); with reduced motion the slide changes instantly
 * instead of animating. Scrolling uses element geometry so RTL and LTR match.
 *
 * Endless loop, one direction only: a hidden copy of the first banner sits
 * after the last one. The slider moves forward onto that copy (so banner 1
 * enters from the right in LTR / from the left in RTL) and, once the scroll
 * settles, jumps instantly to the real first banner — never rewinding.
 *
 * @param {{
 *   offers: Array<Record<string, unknown>>
 *   locale: 'ar' | 'en'
 *   onActivate: (offer: Record<string, unknown>) => void
 * }} props
 */
export function EWaiterOfferBannerSlider({ offers, locale, onActivate }) {
  const t = useTranslations('EWaiter')
  const trackRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const resumeTimer = useRef(/** @type {number | null} */ (null))
  const settleTimer = useRef(/** @type {number | null} */ (null))
  const count = offers.length
  const activeIndex = Math.min(index, Math.max(0, count - 1))

  /** Slide position 0…count (count = the loop copy of banner 1). */
  const positionIndex = useCallback((track) => {
    if (track.clientWidth <= 0) return 0
    return Math.round(Math.abs(track.scrollLeft) / track.clientWidth)
  }, [])

  const scrollToIndex = useCallback((next, instant = false) => {
    const track = trackRef.current
    if (!track || track.clientWidth <= 0) return
    // Slides are full-width: slide N sits at N × width (negative in RTL).
    const rtl = getComputedStyle(track).direction === 'rtl'
    const left = next * track.clientWidth * (rtl ? -1 : 1)
    track.scrollTo({
      left,
      // 'instant' also overrides the track's CSS smooth scrolling.
      behavior: instant || prefersReducedMotion() ? 'instant' : 'smooth',
    })
  }, [])

  const pauseForInteraction = useCallback(() => {
    setPaused(true)
    if (resumeTimer.current != null) window.clearTimeout(resumeTimer.current)
    resumeTimer.current = window.setTimeout(() => {
      setPaused(false)
      resumeTimer.current = null
    }, RESUME_AFTER_MS)
  }, [])

  useEffect(
    () => () => {
      if (resumeTimer.current != null) window.clearTimeout(resumeTimer.current)
      if (settleTimer.current != null) window.clearTimeout(settleTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (count < 2 || paused) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      // Forward only: after the last banner this lands on the loop copy.
      scrollToIndex(activeIndex + 1)
    }, AUTO_ADVANCE_MS)
    return () => window.clearInterval(id)
  }, [count, paused, activeIndex, scrollToIndex])

  function handleScroll() {
    const track = trackRef.current
    if (!track || track.clientWidth <= 0) return
    const pos = positionIndex(track)
    // The loop copy shows banner 1, so its dot is the first one.
    const visible = pos >= count ? 0 : Math.max(0, pos)
    if (visible !== index) setIndex(visible)

    if (settleTimer.current != null) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null
      const current = trackRef.current
      if (current && positionIndex(current) >= count) scrollToIndex(0, true)
    }, SETTLE_MS)
  }

  if (count === 0) return null

  const slides = offers.map((offer, i) => {
    const name = offerDisplayName(offer, locale)
    return (
      <button
        key={String(offer.id)}
        type="button"
        onClick={() => onActivate(offer)}
        className="e-waiter-banner-slide block overflow-hidden rounded-xl text-start"
        aria-label={
          count > 1
            ? t('offers.bannerSlideAria', {
                name,
                index: i + 1,
                count,
              })
            : name
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- public offer banner (same as menu images) */}
        <img
          src={String(offer.bannerUrl)}
          alt={name}
          className="e-waiter-banner-img"
          loading={i === 0 ? 'eager' : 'lazy'}
        />
      </button>
    )
  })

  if (count === 1) {
    return (
      <section className="mb-hisabi-md" aria-label={t('offers.bannersAria')}>
        {slides}
      </section>
    )
  }

  return (
    <section
      className="mb-hisabi-md space-y-hisabi-xs"
      aria-label={t('offers.bannersAria')}
      aria-roledescription="carousel"
      onPointerDown={pauseForInteraction}
      onFocus={pauseForInteraction}
      onMouseEnter={pauseForInteraction}
    >
      <div
        ref={trackRef}
        className="e-waiter-banner-track rounded-xl"
        onScroll={handleScroll}
        onTouchStart={pauseForInteraction}
      >
        {slides}
        {/* Loop copy of banner 1 — lets the slider keep moving forward. */}
        <div className="e-waiter-banner-slide block overflow-hidden rounded-xl" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- loop copy of the first banner */}
          <img src={String(offers[0].bannerUrl)} alt="" className="e-waiter-banner-img" loading="lazy" />
        </div>
      </div>
      <div className="flex items-center justify-center gap-hisabi-xs">
        {offers.map((offer, i) => (
          <button
            key={String(offer.id)}
            type="button"
            aria-label={t('offers.goToBanner', { index: i + 1 })}
            aria-current={i === activeIndex ? 'true' : undefined}
            onClick={() => {
              pauseForInteraction()
              scrollToIndex(i)
            }}
            className="e-waiter-banner-dot-hit inline-flex items-center justify-center"
          >
            <span
              className={cn(
                'e-waiter-banner-dot',
                i === activeIndex && 'e-waiter-banner-dot-active',
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </section>
  )
}
