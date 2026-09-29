import { useEffect } from 'react'
import { useAdminSession } from './admin'
import { useRoute, navigate } from './router'
import Navigation, { SiteFooter } from './components/Shell'
import HomePage from './pages/HomePage'
import SupportPage from './pages/SupportPage'
import OrganizationPage from './pages/OrganizationPage'
import AdminLoginPage from './pages/AdminLoginPage'
import AboutPage from './pages/AboutPage'
import WhyEchoMindPage from './pages/WhyEchoMindPage'
import { ErrorState, Loading } from './components/States'

/**
 * Three surfaces over one agent:
 *   Customer Support  -> what a customer sees (no organizational memory internals)
 *   Why EchoMind      -> public explanation, approved testimonials only
 *   Organization      -> the admin control plane, behind a real server session
 *
 * The organization redirect below is a UX convenience, not the access control.
 * `useAdminSession` only ever reports what the backend said about the session,
 * and every /api/admin/* route independently requires it. A user who edits the
 * URL or calls the API directly still gets 401.
 */
export default function App() {
  const route = useRoute()
  // Only the organization route checks for a session. A public visitor should
  // never fire an admin auth request, and the dashboard is the only consumer.
  const needsSession = route === 'organization'
  const session = useAdminSession(needsSession)

  useEffect(() => {
    if (needsSession && session.state === 'anonymous') {
      navigate('/admin/login')
    }
  }, [needsSession, session.state])

  // The admin pages render their own full-bleed layout, so they opt out of the
  // public topbar and footer.
  const isAdminSurface = route === 'organization' || route === 'admin-login'

  return (
    <div className="app" data-portal={route}>
      {!isAdminSurface && <Navigation route={route} />}
      <main className="app-main" id="main">
        {route === 'home' && <HomePage />}
        {route === 'why' && <WhyEchoMindPage />}
        {route === 'support' && <SupportPage />}
        {route === 'admin-login' && <AdminLoginPage />}

        {route === 'organization' && (
          <>
            {session.state === 'checking' && (
              <div className="admin-gate">
                <Loading label="Checking administrator session..." />
              </div>
            )}

            {/* A backend failure is reported as a failure. It is deliberately
                not treated as "not signed in", so an outage never masquerades
                as a credentials problem. */}
            {session.state === 'error' && (
              <div className="admin-gate">
                <ErrorState
                  message={`${session.error} This is a problem reaching the backend, not a sign-in problem.`}
                  onRetry={session.retry}
                />
              </div>
            )}

            {session.state === 'authenticated' && <OrganizationPage username={session.username} />}
          </>
        )}

        {route === 'about' && <AboutPage />}
      </main>
      {!isAdminSurface && <SiteFooter />}
    </div>
  )
}
