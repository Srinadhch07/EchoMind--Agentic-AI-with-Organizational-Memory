import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { isValidEmail } from '../session'
import { ErrorState, InlineNotice, Loading } from './States'
import type { Testimonial } from '../types'

/**
 * Public testimonials: what people have said, and a form to share an experience.
 *
 * Privacy rules enforced here and in the backend:
 *   - Nothing is published automatically. A submission is stored as pending and
 *     only appears after a moderator approves it.
 *   - The email field is optional and is never rendered back. The public
 *     response type has no email field, so there is nothing to leak.
 *   - A submission without the permission checkbox is never displayed.
 */

const MIN_LENGTH = 40
const MAX_LENGTH = 1200

type FormState = 'idle' | 'submitting' | 'submitted'

function firstNameOf(value: string): string {
  return value.trim().split(/\s+/)[0] ?? ''
}

function byline(item: Testimonial): string {
  const parts = [item.role, item.organization].filter(Boolean)
  return parts.join(' · ')
}

function TestimonialCard({ item }: { item: Testimonial }) {
  return (
    <li className="quote-card">
      <blockquote className="quote-text">{item.testimonial}</blockquote>
      <div className="quote-meta">
        <span className="quote-name">{item.name}</span>
        {byline(item) && <span className="quote-byline">{byline(item)}</span>}
      </div>
      {item.is_sample && <span className="sample-badge">Sample content — not a real customer</span>}
    </li>
  )
}

export default function TestimonialSection() {
  const [items, setItems] = useState<Testimonial[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [formState, setFormState] = useState<FormState>('idle')
  const [submitError, setSubmitError] = useState('')
  const [touched, setTouched] = useState(false)
  const [submittedAs, setSubmittedAs] = useState('')

  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [organization, setOrganization] = useState('')
  const [email, setEmail] = useState('')
  const [testimonial, setTestimonial] = useState('')
  const [permission, setPermission] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const data = await api.testimonials()
      setItems(data.testimonials)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetching the published list is synchronising with an external system, so
  // this is exactly the case an effect is for. State updates happen in the
  // async callbacks, never synchronously in the effect body.
  useEffect(() => {
    let active = true

    api
      .testimonials()
      .then((data) => {
        if (active) setItems(data.testimonials)
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const nameError = name.trim().length >= 2 ? '' : 'Please tell us your name.'
  const emailError = !email.trim() || isValidEmail(email) ? '' : 'Please enter a valid email address.'
  const trimmed = testimonial.trim()
  const lengthError =
    trimmed.length >= MIN_LENGTH
      ? ''
      : `Please write at least ${MIN_LENGTH} characters so there is enough to share.`
  const permissionError = permission ? '' : 'Please confirm permission to display this publicly.'
  const valid = !nameError && !emailError && !lengthError && !permissionError

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    setSubmitError('')
    if (!valid || formState === 'submitting') return

    setFormState('submitting')
    try {
      await api.submitTestimonial({
        name,
        testimonial: trimmed,
        role,
        organization,
        email,
      })
      setSubmittedAs(firstNameOf(name))
      setFormState('submitted')
      setName('')
      setRole('')
      setOrganization('')
      setEmail('')
      setTestimonial('')
      setPermission(false)
      setTouched(false)
    } catch (err) {
      setFormState('idle')
      setSubmitError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="testimonials">
      <div className="testimonial-list-wrap">
        {loading && <Loading label="Loading experiences…" />}
        {!loading && loadError && <ErrorState message={loadError} onRetry={() => void load()} />}
        {!loading && !loadError && items.length === 0 && (
          <div className="state state-empty">
            <p className="state-title">No experiences have been published yet</p>
            <p className="state-text">
              Every submission is reviewed before it appears here, so this list starts
              empty. If you have used EchoMind, your experience would be welcome.
            </p>
          </div>
        )}
        {!loading && !loadError && items.length > 0 && (
          <ul className="quote-list">
            {items.map((item) => (
              <TestimonialCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>

      <form className="testimonial-form" onSubmit={onSubmit} noValidate>
        <h3 className="testimonial-form-title">Share Your Experience</h3>
        <p className="testimonial-form-lede">
          Tell us what happened with EchoMind. Submissions are voluntary and are reviewed
          before anything appears on this page.
        </p>

        {formState === 'submitted' && (
          <InlineNotice tone="success">
            <strong>Thank you for sharing your experience.</strong> Your testimonial has been
            submitted for review. It is not published yet — it will only appear here once it
            has been approved.
          </InlineNotice>
        )}

        {submitError && <ErrorState message={submitError} />}

        {formState !== 'submitted' && (
          <>
            <div className="field">
              <label htmlFor="quote-name">Name</label>
              <input
                id="quote-name"
                type="text"
                autoComplete="name"
                value={name}
                placeholder="Your name"
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {touched && nameError && <p className="field-error">{nameError}</p>}
            </div>

            <div className="testimonial-row">
              <div className="field">
                <label htmlFor="quote-role">
                  Role <span className="field-optional">optional</span>
                </label>
                <input
                  id="quote-role"
                  type="text"
                  autoComplete="organization-title"
                  value={role}
                  placeholder="Support lead"
                  onChange={(e) => setRole(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="quote-org">
                  Organization <span className="field-optional">optional</span>
                </label>
                <input
                  id="quote-org"
                  type="text"
                  autoComplete="organization"
                  value={organization}
                  placeholder="Your organization"
                  onChange={(e) => setOrganization(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="quote-email">
                Email <span className="field-optional">optional</span>
              </label>
              <input
                id="quote-email"
                type="email"
                autoComplete="email"
                value={email}
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {touched && emailError && <p className="field-error">{emailError}</p>}
              <p className="field-hint">
                Only used to follow up if we have a question. It is never displayed on this
                page.
              </p>
            </div>

            <div className="field">
              <label htmlFor="quote-text">Your experience</label>
              <textarea
                id="quote-text"
                rows={5}
                value={testimonial}
                placeholder="What did you use EchoMind for, and what changed?"
                onChange={(e) => setTestimonial(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {touched && lengthError && <p className="field-error">{lengthError}</p>}
              <p className="field-hint">
                {trimmed.length}/{MAX_LENGTH} characters.
              </p>
            </div>

            <div className="field field-check">
              <label className="check-label" htmlFor="quote-permission">
                <input
                  id="quote-permission"
                  type="checkbox"
                  checked={permission}
                  onChange={(e) => setPermission(e.target.checked)}
                  onBlur={() => setTouched(true)}
                />
                <span>
                  I give permission for EchoMind to display this testimonial publicly.
                </span>
              </label>
              {touched && permissionError && <p className="field-error">{permissionError}</p>}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={formState === 'submitting'}
            >
              {formState === 'submitting' ? 'Sending…' : 'Share Your Experience'}
            </button>
            <p className="testimonial-privacy">
              Testimonials are submitted voluntarily and are reviewed before publication.
              Please do not include confidential customer data or other people&apos;s private
              information.
            </p>
          </>
        )}

        {formState === 'submitted' && (
          <p className="testimonial-thanks" role="note">
            Signed as {submittedAs || 'you'}. Want to add another?{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setFormState('idle')
                setSubmitError('')
                setSubmittedAs('')
              }}
            >
              Share another experience
            </button>
          </p>
        )}
      </form>
    </div>
  )
}
