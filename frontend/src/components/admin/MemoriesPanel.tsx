import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from '../../api'
import type { AdminMemory } from '../../types'
import { AdminAsync, AdminBadge, AdminHeader, AdminPanel, MetaRow } from './AdminPanel'
import { formatWhen } from '../../lib/experiences'

/**
 * Organizational memory management.
 *
 * The important honesty constraint in this panel is deletion. Hindsight has no
 * per-memory DELETE endpoint -- the only destructive route it offers clears a
 * whole bank, which would destroy far more than the selected memory. Rather
 * than ship a Delete button that would either do the wrong thing or quietly do
 * nothing, this panel offers the two operations Hindsight genuinely supports:
 *
 *   Retire  -> PATCH state="invalidated". Excluded from recall and consolidation,
 *              links and derived observations pruned, archived and reversible.
 *   Restore -> PATCH state="valid". Back in active recall.
 *
 * The limitation is stated in the UI, not just here, so an administrator is
 * never told a memory was destroyed when it was archived.
 */

const PAGE_SIZE = 20

export default function MemoriesPanel() {
  const [memories, setMemories] = useState<AdminMemory[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [stateFilter, setStateFilter] = useState<'all' | 'valid' | 'invalidated'>('all')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState<AdminMemory | null>(null)
  const [editing, setEditing] = useState<AdminMemory | null>(null)
  const [confirming, setConfirming] = useState<AdminMemory | null>(null)
  const [retireReason, setRetireReason] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.admin.listMemories({
        q: appliedSearch || undefined,
        state: stateFilter === 'all' ? undefined : stateFilter,
        limit: PAGE_SIZE,
        offset,
      })
      setMemories(result.memories)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [appliedSearch, stateFilter, offset])

  useEffect(() => {
    // Mirrors the existing cancellable-read pattern in OrganizationPage: the
    // first await keeps every setState out of the effect body itself, and the
    // token stops an in-flight read writing into an unmounted panel.
    const token = { cancelled: false }
    const start = async () => {
      try {
        const result = await api.admin.listMemories({
          q: appliedSearch || undefined,
          state: stateFilter === 'all' ? undefined : stateFilter,
          limit: PAGE_SIZE,
          offset,
        })
        if (token.cancelled) return
        setMemories(result.memories)
        setTotal(result.total)
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
  }, [appliedSearch, stateFilter, offset])

  /** Retire a memory. Real Hindsight invalidation, and the list is re-read after. */
  const runRetire = async (memory: AdminMemory) => {
    setBusyId(memory.id)
    setError(null)
    try {
      await api.admin.retireMemory(memory.id, retireReason.trim() || undefined)
      setConfirming(null)
      setRetireReason('')
      setNotice(
        `Retired "${truncate(memory.text)}". It is no longer recalled, and it can be restored.`,
      )
      setInspecting(null)
      await load()
    } catch (err) {
      setError(describeMemoryError(err))
    } finally {
      setBusyId(null)
    }
  }

  const runRestore = async (memory: AdminMemory) => {
    setBusyId(memory.id)
    setError(null)
    try {
      await api.admin.restoreMemory(memory.id)
      setNotice(`Restored "${truncate(memory.text)}" to active recall.`)
      setInspecting(null)
      await load()
    } catch (err) {
      setError(describeMemoryError(err))
    } finally {
      setBusyId(null)
    }
  }

  const runEdit = async () => {
    if (!editing) return
    setBusyId(editing.id)
    setError(null)
    try {
      const result = await api.admin.editMemory(editing.id, { text: editing.text })
      setEditing(null)
      setInspecting(result.memory)
      setNotice('Memory corrected. Hindsight re-indexed it, so future recall uses the new text.')
      await load()
    } catch (err) {
      setError(describeMemoryError(err))
    } finally {
      setBusyId(null)
    }
  }

  const hasFilters = Boolean(appliedSearch) || stateFilter !== 'all'

  return (
    <>
      <AdminHeader
        eyebrow="Memory"
        title="Organizational Memories"
        lede="Every lesson EchoMind has retained. Search, inspect, correct, or retire what the organization has learned."
        actions={
          <button type="button" className="btn btn-soft btn-sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <AdminPanel
        note={
          <>
            <strong>Retire, not delete.</strong> Hindsight has no per-memory delete
            endpoint. Retiring a memory archives it so EchoMind stops recalling it, and
            it can be restored afterwards. It is a real change to what the agent
            will use, and it is not a permanent destruction.
          </>
        }
      >
        <form
          className="admin-search"
          onSubmit={(event) => {
            event.preventDefault()
            setOffset(0)
            setAppliedSearch(search.trim())
          }}
        >
          <div className="admin-search-field">
            <label htmlFor="memory-search">Search memories</label>
            <input
              id="memory-search"
              type="search"
              value={search}
              placeholder="Search stored memory text..."
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="admin-search-field admin-search-field-narrow">
            <label htmlFor="memory-state">State</label>
            <select
              id="memory-state"
              value={stateFilter}
              onChange={(e) => {
                setOffset(0)
                setStateFilter(e.target.value as 'all' | 'valid' | 'invalidated')
              }}
            >
              <option value="all">All</option>
              <option value="valid">Active</option>
              <option value="invalidated">Retired</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary btn-sm">
            Search
          </button>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('')
                setAppliedSearch('')
                setStateFilter('all')
                setOffset(0)
              }}
            >
              Clear
            </button>
          )}
        </form>

        {notice && (
          <p className="inline-notice inline-notice-success" role="status">
            {notice}
          </p>
        )}

        <AdminAsync
          loading={loading}
          error={error}
          isEmpty={!loading && memories.length === 0}
          empty={
            hasFilters
              ? 'No organizational memories match this search.'
              : "No organizational memories yet. EchoMind hasn't learned anything yet. Memories will appear as your agents process experiences."
          }
          onRetry={() => void load()}
        >
          <>
            <p className="admin-count">
              {total} {total === 1 ? 'memory' : 'memories'}
              {offset > 0 ? ` (showing ${offset + 1}-${offset + memories.length})` : ''}
            </p>

            <ul className="admin-memory-list">
              {memories.map((memory) => (
                <li className="admin-memory" key={memory.id}>
                  <div className="admin-memory-main">
                    <p className="admin-memory-text">{memory.text}</p>
                    <div className="admin-memory-meta">
                      <AdminBadge tone={memory.state === 'invalidated' ? 'retired' : 'live'}>
                        {memory.state === 'invalidated' ? 'Retired' : 'Active'}
                      </AdminBadge>
                      {memory.fact_type && <AdminBadge tone="neutral">{memory.fact_type}</AdminBadge>}
                      {memory.tags.slice(0, 2).map((tag) => (
                        <AdminBadge tone="neutral" key={tag}>
                          {tag}
                        </AdminBadge>
                      ))}
                      <span className="admin-memory-when">{formatWhen(memory.mentioned_at)}</span>
                    </div>
                  </div>
                  <div className="admin-memory-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setInspecting(memory)
                        setEditing(null)
                        setConfirming(null)
                      }}
                    >
                      View
                    </button>
                    {memory.state === 'invalidated' ? (
                      <button
                        type="button"
                        className="btn btn-soft btn-sm"
                        disabled={busyId === memory.id}
                        onClick={() => void runRestore(memory)}
                      >
                        {busyId === memory.id ? '...' : 'Restore'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-danger-soft btn-sm"
                        disabled={busyId === memory.id}
                        onClick={() => {
                          setConfirming(memory)
                          setRetireReason('')
                          setInspecting(null)
                        }}
                      >
                        Retire
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <div className="admin-pager">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </button>
            </div>
          </>
        </AdminAsync>
      </AdminPanel>

      {inspecting && (
        <MemoryInspector
          memory={inspecting}
          busy={busyId === inspecting.id}
          onClose={() => setInspecting(null)}
          onEdit={() => {
            setEditing(inspecting)
            setConfirming(null)
          }}
          onRetire={() => {
            setConfirming(inspecting)
            setInspecting(null)
            setRetireReason('')
          }}
          onRestore={() => void runRestore(inspecting)}
        />
      )}

      {editing && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Correct memory">
          <div className="admin-modal">
            <h2 className="admin-modal-title">Correct this memory</h2>
            <p className="admin-modal-note">
              Saving re-embeds the memory in Hindsight and drops its derived observations, so
              future recall uses the corrected text. Only world and experience memories can be
              edited; derived observations cannot.
            </p>
            <div className="field">
              <label htmlFor="edit-memory-text">Memory text</label>
              <textarea
                id="edit-memory-text"
                rows={5}
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              />
            </div>
            {!editing.curatable && (
              <p className="admin-modal-warning">
                This is a derived <code>observation</code> memory. Hindsight derives these and
                does not allow editing them.
              </p>
            )}
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!editing.curatable || busyId === editing.id || !editing.text.trim()}
                onClick={() => void runEdit()}
              >
                {busyId === editing.id ? 'Saving...' : 'Save correction'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Confirm retire memory">
          <div className="admin-modal">
            <h2 className="admin-modal-title">Retire this organizational memory?</h2>
            <p className="admin-modal-warning">
              This may affect what EchoMind remembers in future interactions. The memory stops
              being recalled, and its links and derived observations are pruned.
            </p>
            <p className="admin-modal-note">
              Hindsight archives a retired memory rather than destroying it, so this can be
              undone with Restore. There is no permanent per-memory delete in Hindsight.
            </p>
            <blockquote className="admin-modal-quote">{confirming.text}</blockquote>
            <div className="field">
              <label htmlFor="retire-reason">
                Reason <span className="field-optional">optional, recorded by Hindsight</span>
              </label>
              <input
                id="retire-reason"
                type="text"
                value={retireReason}
                placeholder="Superseded by a corrected lesson"
                onChange={(e) => setRetireReason(e.target.value)}
              />
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busyId === confirming.id}
                onClick={() => void runRetire(confirming)}
              >
                {busyId === confirming.id ? 'Retiring...' : 'Retire Memory'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MemoryInspector({
  memory,
  busy,
  onClose,
  onEdit,
  onRetire,
  onRestore,
}: {
  memory: AdminMemory
  busy: boolean
  onClose: () => void
  onEdit: () => void
  onRetire: () => void
  onRestore: () => void
}) {
  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Memory details">
      <div className="admin-modal admin-modal-wide">
        <div className="admin-modal-head">
          <h2 className="admin-modal-title">Memory detail</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="admin-memory-badges">
          <AdminBadge tone={memory.state === 'invalidated' ? 'retired' : 'live'}>
            {memory.state === 'invalidated' ? 'Retired' : 'Active'}
          </AdminBadge>
          {memory.fact_type && <AdminBadge tone="neutral">{memory.fact_type}</AdminBadge>}
          {memory.curatable ? null : <AdminBadge tone="neutral">derived, not editable</AdminBadge>}
        </div>

        <p className="admin-inspect-text">{memory.text}</p>

        <dl className="admin-meta">
          <MetaRow label="Memory ID">
            <code>{memory.id}</code>
          </MetaRow>
          <MetaRow label="Type">{memory.fact_type ?? 'Not recorded'}</MetaRow>
          <MetaRow label="Context">{memory.context || 'None recorded'}</MetaRow>
          <MetaRow label="Entities">
            {memory.entities.length ? memory.entities.join(', ') : 'None recorded'}
          </MetaRow>
          <MetaRow label="Tags">{memory.tags.length ? memory.tags.join(', ') : 'None'}</MetaRow>
          <MetaRow label="Source document">
            <code>{memory.document_id ?? 'Not recorded'}</code>
          </MetaRow>
          <MetaRow label="Created / mentioned">{formatWhen(memory.mentioned_at)}</MetaRow>
          <MetaRow label="Occurred between">
            {formatWhen(memory.occurred_start)}
            {memory.occurred_end ? ` — ${formatWhen(memory.occurred_end)}` : ''}
          </MetaRow>
          <MetaRow label="Last updated">{formatWhen(memory.updated_at)}</MetaRow>
          <MetaRow label="Last hand-edited">{formatWhen(memory.edited_at)}</MetaRow>
          {memory.proof_count !== null && (
            <MetaRow label="Times independently seen">{memory.proof_count}</MetaRow>
          )}
          {memory.metadata && Object.keys(memory.metadata).length > 0 && (
            <MetaRow label="Metadata">
              <ul className="admin-kv">
                {Object.entries(memory.metadata).map(([key, value]) => (
                  <li key={key}>
                    <span className="admin-kv-key">{key}</span>
                    <span className="admin-kv-value">{value}</span>
                  </li>
                ))}
              </ul>
            </MetaRow>
          )}
          {memory.invalidated_at && (
            <MetaRow label="Retired at">
              {formatWhen(memory.invalidated_at)}
              {memory.invalidation_reason ? ` — ${memory.invalidation_reason}` : ''}
            </MetaRow>
          )}
        </dl>

        <div className="admin-modal-actions">
          {memory.state === 'invalidated' ? (
            <button type="button" className="btn btn-soft" disabled={busy} onClick={onRestore}>
              {busy ? 'Restoring...' : 'Restore to active recall'}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-soft" disabled={!memory.curatable} onClick={onEdit}>
                Correct text
              </button>
              <button type="button" className="btn btn-danger-soft" onClick={onRetire}>
                Retire
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function truncate(value: string, max = 60): string {
  const clean = value.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

/** Keeps a 502 from Hindsight readable and never blames the admin session for it. */
function describeMemoryError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'Your admin session has expired. Sign in again.'
    if (err.status === 502) return `Hindsight rejected the request. ${err.message}`
  }
  return err instanceof Error ? err.message : String(err)
}
