// Solo del servidor: decide qué plan tiene cada visita.
//
// • PLAN = "basico" | "profesional" | "completo" (wrangler.jsonc) → la web ya
//   vendida a un cliente: el plan queda fijo y la dirección no lo cambia.
// • PLAN = "demo" → la web de muestra: el plan se escoge con ?plan=… en la
//   dirección (se recuerda 30 días en la cookie «gadr_plan»).
// • Sin PLAN (o con un valor raro) → "completo", para que nada de lo que ya
//   funciona se rompa.
// Sin ?plan y sin cookie, la demo también es «completo».
import { env } from 'cloudflare:workers'
import { getCookie, getRequest, setCookie } from '@tanstack/react-start/server'
import { MENSAJE_NO_INCLUIDO, PLAN_COOKIE, PLAN_COOKIE_SEGUNDOS, esPlan, puede } from './plan'
import type { Funcion, Plan } from './plan'

export type PlanInfo = { plan: Plan; demo: boolean }

function demoActiva(): boolean {
  return String(env.PLAN ?? '').trim().toLowerCase() === 'demo'
}

function planFijo(): Plan {
  const raw = String(env.PLAN ?? '').trim().toLowerCase()
  return esPlan(raw) ? raw : 'completo'
}

/** El ?plan= de la dirección de la página (solo existe cuando el servidor
 * arma la página; en las llamadas internas del navegador no viene). */
function planDeLaDireccion(): Plan | null {
  try {
    const valor = new URL(getRequest().url).searchParams.get('plan')?.trim().toLowerCase()
    return esPlan(valor) ? valor : null
  } catch {
    return null
  }
}

function planDeLaCookie(): Plan | null {
  try {
    const valor = getCookie(PLAN_COOKIE)?.trim().toLowerCase()
    return esPlan(valor) ? valor : null
  } catch {
    return null
  }
}

/** Plan de esta visita. En la web de un cliente es siempre el fijo. */
export function planActual(): PlanInfo {
  if (!demoActiva()) return { plan: planFijo(), demo: false }
  return { plan: planDeLaDireccion() ?? planDeLaCookie() ?? 'completo', demo: true }
}

/** En la demo, guarda el plan pedido en la dirección para que siga en él al
 * navegar. Si no se puede (por ejemplo, ya salió la respuesta), no pasa
 * nada: la página lo guarda también desde el navegador. */
export function recordarPlanDemo() {
  if (!demoActiva()) return
  const pedido = planDeLaDireccion()
  if (!pedido) return
  try {
    setCookie(PLAN_COOKIE, pedido, { path: '/', maxAge: PLAN_COOKIE_SEGUNDOS, sameSite: 'lax', secure: true })
  } catch { /* se guarda desde el navegador */ }
}

/** Para el servidor: rechaza lo que el plan no incluye (no basta con
 * esconder el botón). */
export function requierePlan(funcion: Funcion): Plan {
  const { plan } = planActual()
  if (!puede(plan, funcion)) throw new Error(MENSAJE_NO_INCLUIDO)
  return plan
}
