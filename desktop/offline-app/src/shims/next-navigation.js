export function useRouter() {
  return {
    push() {},
    replace() {},
    refresh() {},
    back() {},
    prefetch() {
      return Promise.resolve()
    },
  }
}

export function usePathname() {
  return '/pos'
}

export function useSearchParams() {
  return new URLSearchParams()
}

export function redirect() {}
export function notFound() {}
