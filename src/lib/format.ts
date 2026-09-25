// Utilidades compartidas entre la tienda, el panel y el servidor.

// URL pública del sitio. Se usa para las etiquetas de redes sociales
// (og:image, og:url). Si el sitio pasa a un dominio propio, cambia solo esto.
export const SITE_URL = 'https://ritualcobre.gadr-net.workers.dev'

export const CURRENCIES = [
  { code: 'USD', label: 'Dólar estadounidense ($)', locale: 'en-US' },
  { code: 'DOP', label: 'Peso dominicano (RD$)', locale: 'es-DO' },
  { code: 'EUR', label: 'Euro (€)', locale: 'es-ES' },
  { code: 'MXN', label: 'Peso mexicano ($)', locale: 'es-MX' },
  { code: 'COP', label: 'Peso colombiano ($)', locale: 'es-CO' },
] as const

const formatters = new Map<string, Intl.NumberFormat>()

/** Formatea un monto guardado en centavos con la moneda configurada. */
export function formatMoney(cents: number, currency = 'USD') {
  const option = CURRENCIES.find((item) => item.code === currency) ?? CURRENCIES[0]
  const code = option.code
  let formatter = formatters.get(code)
  if (!formatter) {
    formatter = new Intl.NumberFormat(option.locale, { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 })
    formatters.set(code, formatter)
  }
  return formatter.format((Number(cents) || 0) / 100)
}

/** Deja solo los dígitos de un número de WhatsApp (wa.me no acepta +, espacios ni paréntesis). */
export function whatsappDigits(raw: string | undefined) {
  return String(raw ?? '').replace(/\D/g, '')
}

/** Enlace de WhatsApp listo para usar, con mensaje opcional. Vacío si no hay número. */
export function whatsappLink(raw: string | undefined, message?: string) {
  const digits = whatsappDigits(raw)
  if (!digits) return ''
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`
}

export function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character)
}

export const shortDate = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
export const dateTime = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))

/** Convierte "36.50" (lo que escribe el administrador) a 3650 centavos. */
export function toCents(value: string | number) {
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : 0
}
