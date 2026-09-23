// Module-level singleton so the returned object has a STABLE identity across
// renders/calls — matches real Next.js `useRouter()` semantics and avoids
// re-firing effects that list `router` as a dependency (an unstable
// reference there caused an infinite render loop / React error #185).
const stableRouter = {
  push() {},
  replace() {},
  refresh() {},
  back() {},
  prefetch() {
    return Promise.resolve()
  },
}

export function useRouter() {
  return stableRouter
}

export function usePathname() {
  return '/pos'
}

export function useSearchParams() {
  return new URLSearchParams()
}

export function redirect() {}
export function notFound() {}
