import { useState } from 'react'
import { PLANES, PLAN_COOKIE, PLAN_COOKIE_SEGUNDOS, PLAN_NOMBRES } from '@/lib/plan'
import type { Plan } from '@/lib/plan'

/** Barrita discreta de la demo: «Demo · Plan Básico · Cambiar plan · Ver
 * precios». Solo sale cuando PLAN = "demo"; en la web de un cliente nunca. */
export function PlanBar({ plan, demo }: { plan: Plan; demo: boolean }) {
  const [open, setOpen] = useState(false)
  if (!demo) return null

  function choose(next: Plan) {
    try { document.cookie = `${PLAN_COOKIE}=${next};max-age=${PLAN_COOKIE_SEGUNDOS};path=/;samesite=lax` } catch { /* sin cookies */ }
    // Se recarga la página con ?plan=… para que salga ya en ese plan, sin parpadeo.
    const url = new URL(window.location.href)
    url.searchParams.set('plan', next)
    window.location.assign(url.toString())
  }

  return (
    <div className="plan-bar" role="region" aria-label="Plan de la demo">
      <span className="plan-bar-text">Demo · Plan {PLAN_NOMBRES[plan]}</span>
      <button type="button" className="plan-bar-link" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Cambiar plan</button>
      <a className="plan-bar-link" href="https://gadrnet.com" target="_blank" rel="noopener noreferrer">Ver precios</a>
      {open && (
        <div className="plan-bar-menu" role="menu">
          {PLANES.map((item) => (
            <button key={item} type="button" role="menuitemradio" aria-checked={item === plan} className={item === plan ? 'active' : ''} onClick={() => choose(item)}>
              {PLAN_NOMBRES[item]}{item === plan ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
