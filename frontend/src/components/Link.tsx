import type { ReactNode } from 'react'
import { useLinkHandler } from '../router'

interface LinkProps {
  to: string
  children: ReactNode
  className?: string
  'aria-current'?: 'page' | undefined
}

/** Anchor that routes client-side but stays a real link (middle-click, copy, a11y). */
export default function Link({ to, children, className, ...rest }: LinkProps) {
  const onClick = useLinkHandler(to)

  return (
    <a href={to} className={className} onClick={onClick} {...rest}>
      {children}
    </a>
  )
}
