import { useState } from 'react'
import SupportGate from '../components/SupportGate'
import SupportChat from '../components/SupportChat'
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
            {COMPANY.supportAgent} is an experimental agent from {COMPANY.name}.{' '}
            <a href="/about">About this support experience</a>
          </p>
        </>
      ) : (
        <>
          <div className="support-intro">
            <div>
              <p className="eyebrow">{COMPANY.name} customer support</p>
              <h1 className="page-title page-title-sm">How can we help?</h1>
            </div>
            <p className="support-intro-note">
              Simulated support environment for the {COMPANY.product} demonstration.
            </p>
          </div>
          <SupportChat identity={identity} onSignOut={endSession} />
        </>
      )}
    </div>
  )
}
