'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { InternetRequiredModal } from '@/components/desktop/internet-required-modal'
import { useCloudConnectivity } from '@/hooks/use-cloud-connectivity'
import { useIsHisabiDesktop } from '@/hooks/use-is-hisabi-desktop'
import { INTERNET_REQUIRED_EVENT } from '@/lib/desktop/internet-required-bus'

const InternetRequiredContext = createContext(
  /** @type {{
   *   canWrite: boolean
   *   cloudOnline: boolean
   *   checking: boolean
   *   showInternetRequired: () => void
   *   guardWrite: (action: () => void) => void
   * }} */ ({
    canWrite: true,
    cloudOnline: true,
    checking: false,
    showInternetRequired: () => {},
    guardWrite: (action) => {
      action()
    },
  }),
)

/**
 * Shell-level connectivity + Internet required modal for desktop write gates.
 */
export function InternetRequiredProvider({ children }) {
  const desktop = useIsHisabiDesktop()
  const { cloudOnline, checking, refresh } = useCloudConnectivity()
  const [open, setOpen] = useState(false)

  const canWrite = !desktop || cloudOnline

  const showInternetRequired = useCallback(() => {
    setOpen(true)
  }, [])

  const guardWrite = useCallback(
    (action) => {
      if (!desktop || cloudOnline) {
        action()
        return
      }
      setOpen(true)
    },
    [desktop, cloudOnline],
  )

  useEffect(() => {
    if (!desktop) return undefined
    const onNeed = () => setOpen(true)
    window.addEventListener(INTERNET_REQUIRED_EVENT, onNeed)
    return () => window.removeEventListener(INTERNET_REQUIRED_EVENT, onNeed)
  }, [desktop])

  const value = useMemo(
    () => ({
      canWrite,
      cloudOnline: desktop ? cloudOnline : true,
      checking: desktop ? checking : false,
      showInternetRequired,
      guardWrite,
      refresh,
    }),
    [
      canWrite,
      cloudOnline,
      checking,
      desktop,
      showInternetRequired,
      guardWrite,
      refresh,
    ],
  )

  return (
    <InternetRequiredContext.Provider value={value}>
      {children}
      {desktop ? (
        <InternetRequiredModal open={open} onOpenChange={setOpen} />
      ) : null}
    </InternetRequiredContext.Provider>
  )
}

export function useRequireCloudForWrite() {
  return useContext(InternetRequiredContext)
}
