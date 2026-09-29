import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'
import type { AdminSystemInfo } from '../../types'
import { AdminAsync, AdminHeader, AdminPanel, AdminBadge } from './AdminPanel'

/**
 * Settings and capabilities.
 *
 * This panel reports configuration FACTS, not a settings editor. Secrets live in
 * the backend environment and are never sent to the browser, so there is
 * nothing here to change: it tells an administrator which integrations are
 * configured, and it states plainly which memory operations Hindsight does not
 * support, so a missing Delete button is explained rather than mysterious.
 */
export default function SettingsPanel({ onSignOut }: { onSignOut: () => void }) {
  const [info, setInfo] = useState<AdminSystemInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const read = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setInfo(await api.admin.system())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = { cancelled: false }
    const start = async () => {
      try {
        const result = await api.admin.system()
        if (token.cancelled) return
        setInfo(result)
        setError(null)
      } catch (err) {
        if (token.cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!token.cancelled) setLoading(false)
      }
    }
    void start()
    return () => {
      token.cancelled = true
    }
  }, [])

  const capabilities = Object.entries(info?.capabilities ?? {})

  return (
    <>
      <AdminHeader
        eyebrow="Configuration"
        title="Settings"
        lede="How this EchoMind instance is configured, and exactly what the memory backend can do."
      />

      <AdminPanel
        title="Integrations"
        note="Read from the backend. Secret values are never sent to the browser, so only the configured / not configured state is visible here."
      >
        <AdminAsync loading={loading} error={error} onRetry={() => void read()}>
          <ul className="admin-config-list">
            <ConfigRow
              label="Hindsight memory backend"
              configured={info?.hindsight_configured}
              detail={info?.memory_bank}
            />
            <ConfigRow label="Groq language model" configured={info?.groq_configured} />
            <ConfigRow
              label="Admin authentication"
              configured={info?.admin_auth_configured}
              detail={info?.admin_auth_configured ? `${info?.session_minutes} minute sessions` : undefined}
            />
            <ConfigRow
              label="Legacy testimonial key"
              configured={info?.testimonial_moderation_enabled}
              detail={info?.testimonial_moderation_enabled ? 'X-Admin-Key route still accepted' : undefined}
            />
          </ul>
        </AdminAsync>
      </AdminPanel>

      <AdminPanel
        title="Memory capabilities"
        note="Straight from the Hindsight API. This is why the memory panel offers Retire and Restore rather than Delete."
      >
        <AdminAsync loading={loading} error={error} onRetry={() => void read()}>
          <ul className="admin-capability-list">
            {capabilities.map(([name, description]) => (
              <li className="admin-capability" key={name}>
                <code className="admin-capability-name">{name}</code>
                <p className="admin-capability-text">{description}</p>
              </li>
            ))}
          </ul>
        </AdminAsync>
      </AdminPanel>

      <AdminPanel title="Session" note="End this administrative session on this device.">
        <button type="button" className="btn btn-danger-soft" onClick={onSignOut}>
          Sign out
        </button>
      </AdminPanel>
    </>
  )
}

function ConfigRow({
  label,
  configured,
  detail,
}: {
  label: string
  configured: boolean | undefined
  detail?: string
}) {
  return (
    <li className="admin-config-row">
      <span className="admin-config-label">{label}</span>
      {configured === undefined ? (
        <AdminBadge tone="neutral">unknown</AdminBadge>
      ) : configured ? (
        <AdminBadge tone="approved">configured</AdminBadge>
      ) : (
        <AdminBadge tone="rejected">not configured</AdminBadge>
      )}
      {detail && <span className="admin-config-detail">{detail}</span>}
    </li>
  )
}
