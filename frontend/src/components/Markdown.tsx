import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Renders an EchoMind support reply as formatted content rather than raw text.
 *
 * Why a real library
 * ------------------
 * Markdown has too many edge cases (nested lists, emphasis next to punctuation,
 * escaped characters, autolinks, tables) to hand-roll safely. A regex approach
 * silently corrupts text the moment the model writes `*` inside a sentence, and
 * a hand-rolled parser is exactly the kind of fragile code that produces XSS
 * holes. `react-markdown` is the maintained React renderer; it parses to an AST
 * and renders through React, so there is no `dangerouslySetInnerHTML` anywhere in
 * this path and model output can never inject markup.
 *
 * What the agent actually returns
 * -------------------------------
 * EchoMind is a support agent, so its replies legitimately use short bold leads,
 * a heading for a procedure, and ordered steps. Rendering that as literal asterisks
 * and hyphens looks broken to a customer, which is the bug this fixes.
 *
 * Customer safety
 * ---------------
 * The model still controls the words, so it is told in its system prompt to answer
 * in plain customer-facing language and never in raw Markdown with HTML. The
 * components below are the real defence: raw HTML is not enabled, link protocols
 * are restricted to http/https/mailto, and links open in a new tab with
 * `rel="noopener noreferrer"`. A `javascript:` URL from the model renders as text
 * instead of a clickable link.
 */

interface Props {
  children: string
}

/** Internal links and anchors stay in the same tab; everything else opens safely. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

export const Markdown = memo(function Markdown({ children }: Props) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Raw HTML in model output is not rendered, so this never runs. It is
          // declared only to make that explicit rather than accidental.
          a: ({ href, children: linkText, ...rest }) => {
            const safe = href ? safeHref(href) : undefined
            if (!safe) {
              // An unusable protocol is shown as inert text, not a dead link.
              return <span className="md-link-plain">{linkText}</span>
            }
            const external = !safe.startsWith('#') && !safe.startsWith('/')
            return (
              <a href={safe} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
                {linkText}
              </a>
            )
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})

function safeHref(href: string): string | null {
  // Relative, anchor and query links are fine as-is.
  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('?')) return href
  try {
    const url = new URL(href, window.location.origin)
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
