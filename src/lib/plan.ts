// ───────────────────────────────────────────────────────────────────────
// PLANES DE LA WEB (Básico · Profesional · Completo)
//
// Es el MISMO código para los tres planes: lo que cambia es la variable
// PLAN de wrangler.jsonc. Este archivo es la única lista de funciones y de
// su plan mínimo; todo el código pregunta aquí con `puede(plan, función)`.
// No tiene nada del servidor, así que lo usan igual la tienda, el panel y
// el servidor (ver plan-server.ts para cómo se decide el plan de cada visita).
//
// Cambiar de plan NUNCA borra datos: lo que el plan no incluye solo se
// esconde (y el servidor lo rechaza); al subir de plan vuelve a aparecer.
// ───────────────────────────────────────────────────────────────────────

export const PLANES = ['basico', 'profesional', 'completo'] as const
export type Plan = (typeof PLANES)[number]

export const PLAN_NOMBRES: Record<Plan, string> = {
  basico: 'Básico',
  profesional: 'Profesional',
  completo: 'Completo',
}

/** Nombre de la cookie con la que la demo recuerda el plan elegido (30 días). */
export const PLAN_COOKIE = 'gadr_plan'
export const PLAN_COOKIE_SEGUNDOS = 30 * 24 * 60 * 60

/** Cada función y el plan MÁS BAJO que la incluye. Lo que no está aquí
 * (catálogo, fotos, precios, categorías, buscador, «Pedir por WhatsApp»,
 * textos, políticas y existencias) lo trae todo plan, incluido el Básico. */
export const FUNCIONES = {
  /** Opciones por producto (aroma, tamaño…) con su precio, foto y cantidad. */
  opciones: 'profesional',
  /** Bolsa de compra y envío del pedido desde la web. */
  carrito: 'profesional',
  /** Pedidos guardados con su estado, factura en PDF, descuentos y ventas por fuera. */
  pedidos: 'profesional',
  /** Lista de clientes en el panel. */
  clientes: 'profesional',
  /** Métodos de pago visibles en la tienda. */
  metodosPago: 'profesional',
  /** Compras por lotes (Reponer) con su costo. */
  lotes: 'completo',
  /** Finanzas: ganancias, dinero del negocio, reinversión y gastos. */
  finanzas: 'completo',
  /** App del panel («RC Admin») con avisos de pedidos en el teléfono. */
  app: 'completo',
  /** Aviso por correo de cada pedido nuevo. */
  avisosCorreo: 'completo',
  /** Papelera de 30 días para recuperar lo eliminado. */
  papelera: 'completo',
} as const satisfies Record<string, Plan>

export type Funcion = keyof typeof FUNCIONES

export const MENSAJE_NO_INCLUIDO = 'Esta función no está incluida en tu plan'

export function esPlan(valor: unknown): valor is Plan {
  return typeof valor === 'string' && (PLANES as readonly string[]).includes(valor)
}

/** ¿Este plan incluye esta función? */
export function puede(plan: Plan, funcion: Funcion): boolean {
  return PLANES.indexOf(plan) >= PLANES.indexOf(FUNCIONES[funcion])
}

/** Plan más bajo que trae la función (para el candado de la demo). */
export function planMinimo(funcion: Funcion): Plan {
  return FUNCIONES[funcion]
}

/** Texto del candado: «Disponible en el plan Profesional». */
export function textoCandado(funcion: Funcion): string {
  return `Disponible en el plan ${PLAN_NOMBRES[planMinimo(funcion)]}`
}
