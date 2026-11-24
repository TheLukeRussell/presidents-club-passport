// The app shell: top bar, the demo panel, and the two screens. Routes are
// #/passport/<rep-id> and #/standings, with filters in the query string.
// The live passport has no demo panel, and no standings yet: a signed-in rep
// can only read their own stamps, so there's no board to rank them on.

import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router'
import { useAnalyticsIdentity } from './analytics/useAnalyticsIdentity'
import { ConsentBanner } from './components/shell/ConsentBanner'
import { DemoPanel } from './components/shell/DemoPanel'
import { LoadState } from './components/shell/LoadState'
import { TopBar } from './components/shell/TopBar'
import { PassportScreen } from './components/passport/PassportScreen'
import { StandingsScreen } from './components/standings/StandingsScreen'
import { PROGRAM_YEAR } from './config'
import { findRep, type Model } from './lib/model'
import { useApp } from './state/AppState'

// Short, for the end of every tab title. The full name is in index.html.
const PRODUCT = `President’s Club ${PROGRAM_YEAR}`
// The two real screens. Anything else redirects to one of them.
const SCREEN = /^\/(passport\/[^/]+|standings)$/

// The tab title says which screen you're on, so a screen reader (and a tab
// strip full of them) can tell them apart.
function titleFor(pathname: string, model: Model | null, signedOut: boolean): string {
  if (signedOut) return `Sign in · ${PRODUCT}`
  if (pathname === '/standings') return `Standings · ${PRODUCT}`
  const repId = /^\/passport\/([^/]+)$/.exec(pathname)?.[1]
  if (!repId) return `President’s Club Passport ${PROGRAM_YEAR}`
  if (!model) return `Passport · ${PRODUCT}`
  const rep = findRep(model, repId)
  return rep ? `${rep.name}’s passport · ${PRODUCT}` : `No passport found · ${PRODUCT}`
}

// Standings in the live passport, for now. The demo still has them, on the
// sample data, at the same address with ?demo.
function StandingsLater() {
  return (
    <div className="container">
      <section className="state" aria-labelledby="state-title">
        <h1 id="state-title" className="state__title">
          Standings aren’t here yet
        </h1>
        <p className="state__text">
          For now the passport shows only your own stamps. You can see how the standings will work in the demo, which runs on made-up sample data.
        </p>
        <a className="btn btn--quiet" href={`${import.meta.env.BASE_URL}?demo#/standings`}>
          Open the demo’s standings
        </a>
      </section>
    </div>
  )
}

export function App() {
  const app = useApp()
  const [demoOpen, setDemoOpen] = useState(false)
  const home = app.ready ? `/passport/${app.ready.viewAs.id}` : '/passport'
  const { pathname } = useLocation()
  useAnalyticsIdentity()

  // A new screen starts at the top. Opening a passport from far down the
  // board used to leave the page scrolled, with the top bar out of view.
  // Not Standings while rows are about to slide, though: the board scrolls
  // your row into view itself, and this runs after it.
  const slide = useRef(app.slideFrom)
  useEffect(() => {
    slide.current = app.slideFrom
  })
  useEffect(() => {
    if (pathname === '/standings' && slide.current) return
    window.scrollTo(0, 0)
  }, [pathname])

  const model = app.ready?.model ?? null
  const signedOut = app.status === 'signed-out'
  useEffect(() => {
    document.title = titleFor(pathname, model, signedOut)
  }, [pathname, model, signedOut])

  // A new screen also moves focus to the top of it, the way a page load
  // would, so the next Tab starts there and a screen reader hears the
  // change. Not on the first screen, not on a page turn (?page= isn't part
  // of the path), and not while you're using a select or a box that changed
  // the screen, like View as: that would pull focus out from under you.
  const lastPath = useRef(pathname)
  useEffect(() => {
    const from = lastPath.current
    lastPath.current = pathname
    if (from === pathname || !SCREEN.test(from)) return
    const active = document.activeElement
    if (active && active !== document.body && active.matches('select, input, textarea')) return
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="app">
      {/* The router owns the hash, so the link moves focus itself instead of
          following #main, which the router would read as a page. */}
      <a
        className="skip"
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Skip to content
      </a>
      <TopBar demoOpen={demoOpen} onToggleDemo={() => setDemoOpen((open) => !open)} />
      {!app.live && <DemoPanel open={demoOpen} onClose={() => setDemoOpen(false)} />}
      <main id="main" className="main" tabIndex={-1}>
        <Routes>
          <Route path="/passport/:repId" element={app.ready ? <PassportScreen /> : <LoadState screen="passport" />} />
          <Route
            path="/standings"
            element={app.live && app.ready ? <StandingsLater /> : app.ready ? <StandingsScreen /> : <LoadState screen="standings" />}
          />
          <Route path="*" element={app.ready ? <Navigate to={home} replace /> : <LoadState screen="passport" />} />
        </Routes>
      </main>
      <ConsentBanner />
    </div>
  )
}
