import { useRoute } from './router'
import Navigation, { SiteFooter } from './components/Shell'
import HomePage from './pages/HomePage'
import SupportPage from './pages/SupportPage'
import OrganizationPage from './pages/OrganizationPage'
import AboutPage from './pages/AboutPage'
import WhyEchoMindPage from './pages/WhyEchoMindPage'

/**
 * Two clearly separated portals over one agent:
 *   Customer Support  -> what a customer sees (no organizational memory internals)
 *   Organization      -> what Thridha Labs sees (aggregated, synthesized learning)
 *
 * Plus two public explanatory pages: Home and Why EchoMind.
 */
export default function App() {
  const route = useRoute()

  return (
    <div className="app" data-portal={route}>
      <Navigation route={route} />
      <main className="app-main" id="main">
        {route === 'home' && <HomePage />}
        {route === 'why' && <WhyEchoMindPage />}
        {route === 'support' && <SupportPage />}
        {route === 'organization' && <OrganizationPage />}
        {route === 'about' && <AboutPage />}
      </main>
      <SiteFooter />
    </div>
  )
}
