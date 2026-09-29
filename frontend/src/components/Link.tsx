import type { MouseEvent, ReactNode } from 'react'
import { useLinkHandler } from '../router'

interface LinkProps {
  to: string
  children: ReactNode
  className?: string
  'aria-current'?: 'page' | undefined
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * Anchor that routes client-side but stays a real link (middle-click, copy, a11y).
 *
 * A caller-supplied onClick is composed with the router handler rather than
 * replacing it. Spreading `...rest` after `onClick` would otherwise overwrite
 * the handler, so a link that also needed to close the mobile menu would quietly
 * stop navigating.
 */
export default function Link({ to, children, className, onClick, ...rest }: LinkProps) {
  const navigate = useLinkHandler(to)

  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        navigate(event)
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
