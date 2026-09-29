import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import InteractionCard from './components/InteractionCard'
import LearnedCard from './components/LearnedCard'
import Masthead from './components/Masthead'
import MemoryCard from './components/MemoryCard'
import OutcomeCard from './components/OutcomeCard'
import ResponseCard from './components/ResponseCard'
import TimelineCard from './components/TimelineCard'
import type {
  AgentResponse,
  LearnedResponse,
  OutcomeResponse,
  TimelineResponse,
} from './types'

type Busy = 'respond' | 'outcome' | 'learned' | null

export default function App() {
  const [customer, setCustomer] = useState('Customer A')
  const [message, setMessage] = useState('')
  const [lesson, setLesson] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)

  const [result, setResult] = useState<AgentResponse | null>(null)
  const [outcome, setOutcome] = useState<OutcomeResponse | null>(null)
  const [learned, setLearned] = useState<LearnedResponse | null>(null)
  const [timeline, setTimeline] = useState<TimelineResponse | null>(null)

  const refreshTimeline = useCallback(async () => {
    try {
      setTimeline(await api.timeline())
    } catch {
      /* timeline is supplementary; never block the demo on it */
    }
  }, [])

  useEffect(() => {
    api
      .health()
      .then(() => setConnected(true))
      .catch(() => setConnected(false))
    void refreshTimeline()
  }, [refreshTimeline])

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
    }
  }

  const askEchoMind = () =>
    run('respond', async () => {
      const res = await api.respond(customer.trim() || 'Customer', message.trim())
      setResult(res)
      setOutcome(null)
      setLearned(null)
      void refreshTimeline()
    })

  const recordOutcome = () =>
    run('outcome', async () => {
      const res = await api.recordOutcome(
        customer.trim() || 'Customer',
        lesson.trim(),
      )
      setOutcome(res)
      setLearned(null)
      void refreshTimeline()
    })

  const askLearned = () =>
    run('learned', async () => {
      setLearned(await api.learned())
    })

  const recalledNow = (result?.memory_count ?? 0) > 0
  const step1 = Boolean(outcome?.retained)
  const step2 = recalledNow
  const step3 = Boolean(learned && learned.memory_count > 0)

  return (
    <div className="app">
      <Masthead
        experienceCount={timeline?.entries.length ?? 0}
        connected={connected}
      />

      <main className="shell">
        <div className="steps" aria-label="Demo steps">
          <span className={`step ${step1 ? 'step-done' : 'step-active'}`}>
            1 · Record an outcome
          </span>
          <span className={`step ${step2 ? 'step-done' : ''}`}>
            2 · Similar request recalls it
          </span>
          <span className={`step ${step3 ? 'step-done' : ''}`}>
            3 · Organizational learning
          </span>
        </div>

        {error && (
          <div className="alert" role="alert">
            <strong>Request failed.</strong> <code>{error}</code>
          </div>
        )}

        <div className="grid">
          <div className="col">
            <InteractionCard
              customer={customer}
              message={message}
              busy={busy !== null}
              onCustomerChange={setCustomer}
              onMessageChange={setMessage}
              onAsk={askEchoMind}
            />
            <ResponseCard result={result} busy={busy === 'respond'} />
            <MemoryCard
              memories={result?.memories_used ?? []}
              totalRecalled={result?.memory_count ?? 0}
              recalledNow={recalledNow}
            />
            <OutcomeCard
              lesson={lesson}
              busy={busy === 'outcome'}
              recorded={outcome}
              onLessonChange={setLesson}
              onRecord={recordOutcome}
            />
          </div>

          <div className="col">
            <LearnedCard
              result={learned}
              busy={busy === 'learned'}
              onAsk={askLearned}
            />
            <TimelineCard entries={timeline?.entries ?? []} />
          </div>
        </div>
      </main>
    </div>
  )
}
