import { useCallback, useEffect, useState } from 'react'

/**
 * Minimal History API router state.
 *
 * Implemented in-repo rather than pulling in a routing dependency: EchoMind has
 * six static routes and no nested layouts, so a router library would be more
 * machinery than the app needs. Vite's dev server and preview server both fall
 * back to index.html for unknown paths, so deep links work in both.
 *
 * Admin sub-sections (memories, testimonials, ...) are in-page tabs inside
 * OrganizationPage rather than separate routes, so a single `route` value is
 * still enough to describe the whole app.
 *
 * The <Link> component lives in components/Link.tsx so that this module exports
 * no components and the dev server's fast refresh stays reliable.
 */

export type RouteId = 'home' | 'support' | 'organization' | 'about' | 'why' | 'admin-login'

const ROUTES: Record<string, RouteId> = {
  '/': 'home',
  '/support': 'support',
  '/organization': 'organization',
  '/about': 'about',
  '/why-echomind': 'why',
  '/admin/login': 'admin-login',
}

function resolve(pathname: string): RouteId {
  const clean = pathname.replace(/\/+$/, '') || '/'
  return ROUTES[clean] ?? 'home'
}

function currentPath(): string {
  return window.location.pathname
}

export function navigate(to: string): void {
  if (to === currentPath()) return
  window.history.pushState({}, '', to)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * The canonical path for a route id.
 *
 * The navigation needs this to mark the current page with `aria-current`. The
 * previous comparison against a route id never matched, because route ids are
 * not paths ('support' vs '/support'), so no link but Home was ever marked as
 * the current page. Resolving through the same table keeps one source of truth.
 */
export function pathOf(route: RouteId): string {
  const found = Object.keys(ROUTES).find((path) => ROUTES[path] === route)
  return found ?? '/'
}

export function useRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => resolve(currentPath()))

  useEffect(() => {
    const onChange = () => setRoute(resolve(currentPath()))
    window.addEventListener('popstate', onChange)
    return () => window.removeEventListener('popstate', onChange)
  }, [])

  return route
}

export function useLinkHandler(to: string) {
  return useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      event.preventDefault()
      navigate(to)
    },
    [to],
  )
}
