import { useState } from 'react'
import SupportGate from '../components/SupportGate'
import SupportChat from '../components/SupportChat'
import Link from '../components/Link'
import { COMPANY } from '../brand'
import { clearIdentity, loadIdentity, type SupportIdentity } from '../session'

export default function SupportPage() {
  const [identity, setIdentity] = useState<SupportIdentity | null>(() => loadIdentity())

  const endSession = () => {
    clearIdentity()
    setIdentity(null)
  }

  return (
    <div className="page page-support">
      {!identity ? (
        <>
          <SupportGate onStart={setIdentity} />
          <p className="support-gate-foot">
            {COMPANY.supportAgent} is a support agent from {COMPANY.name}.{' '}
            <Link to="/about">About this support experience</Link>
          </p>
        </>
      ) : (
        <>
          {/* The conversation card carries its own header, so an extra title block
              above it only repeated the agent's name. */}
          <SupportChat identity={identity} onSignOut={endSession} />
          <p className="support-foot">
            {COMPANY.supportAgent} can make mistakes. For anything urgent or sensitive, reach a
            human at <a href="mailto:support@example.com">support@example.com</a>, or{' '}
            <Link to="/about">read about this support experience</Link>.
          </p>
        </>
      )}
    </div>
  )
}
