// Envía el correo de aviso cuando un cliente registra un pedido desde la
// tienda pública. Usa la API de Resend (https://resend.com) vía fetch, sin
// necesidad de instalar ningún paquete adicional (funciona igual que
// `src/lib/github.ts`).
//
// Requiere el secreto de Cloudflare RESEND_API_KEY. Opcionalmente
// RESEND_FROM_EMAIL (remitente). Si RESEND_API_KEY no está configurado, o si
// no hay un correo de destino guardado en el panel de admin (campo
// "notificationEmail" del editor de contenido), simplemente no se envía
// nada y el pedido se registra igual: un fallo o falta de configuración en
// el correo nunca debe romper el registro del pedido.

import { escapeHtml, formatMoney } from './format'

const longDate = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santo_Domingo' }).format(new Date(value))

type EmailOrder = {
  orderNumber: string
  createdAt: string | Date
  customerName: string
  email: string
  phone: string
  address: string
  total: number
  currency: string
  brandName: string
  items: Array<{ name: string; price: number; quantity: number }>
}

const INK = '#182431'
const CLAY = '#ba5b46'
const PAPER = '#f4eee9'
const MUTED = '#6d6e70'

function buildOrderEmailHtml(order: EmailOrder): string {
  const money = (cents: number) => formatMoney(cents, order.currency)
  const phoneDigits = order.phone.replace(/\D/g, '')
  const rows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px;border-bottom:1px solid #ece4dd;color:${INK};font-size:14px;">${escapeHtml(item.name)}</td>
          <td style="padding:12px;border-bottom:1px solid #ece4dd;color:${INK};font-size:14px;text-align:center;">${item.quantity}</td>
          <td style="padding:12px;border-bottom:1px solid #ece4dd;color:${INK};font-size:14px;text-align:right;">${money(item.price)}</td>
          <td style="padding:12px;border-bottom:1px solid #ece4dd;color:${INK};font-size:14px;text-align:right;font-weight:700;">${money(item.price * item.quantity)}</td>
        </tr>`,
    )
    .join('')

  return `
  <!DOCTYPE html>
  <html lang="es">
  <body style="margin:0;padding:0;background-color:${PAPER};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAPER};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:14px;overflow:hidden;max-width:600px;width:100%;">
            <tr>
              <td style="background-color:${INK};padding:28px 32px;">
                <p style="margin:0;color:#d8a09b;font-size:11px;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(order.brandName)} · Nuevo pedido</p>
                <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;">Pedido ${escapeHtml(order.orderNumber)}</h1>
                <p style="margin:6px 0 0;color:#aeb5bb;font-size:13px;">${longDate(order.createdAt)} · Total ${money(order.total)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 0;">
                <p style="margin:0 0 10px;color:${CLAY};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Cliente</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf7f4;border-radius:10px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:14px;color:${INK};line-height:1.6;">
                      <strong style="font-size:16px;">${escapeHtml(order.customerName)}</strong><br>
                      Teléfono: ${escapeHtml(order.phone)}<br>
                      Correo: ${order.email ? `<a href="mailto:${escapeHtml(order.email)}" style="color:${CLAY};">${escapeHtml(order.email)}</a>` : 'No proporcionado'}<br>
                      Dirección: ${order.address ? escapeHtml(order.address).replace(/\n/g, '<br>') : 'No proporcionada'}
                    </td>
                  </tr>
                </table>
                ${phoneDigits ? `<p style="margin:14px 0 0;"><a href="https://wa.me/${phoneDigits}" style="display:inline-block;background-color:${CLAY};color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:11px 18px;border-radius:4px;">Escribir al cliente por WhatsApp</a></p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:26px 32px 0;">
                <p style="margin:0 0 10px;color:${CLAY};font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">Productos</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  <thead>
                    <tr>
                      <th style="padding:10px 12px;border-bottom:2px solid ${INK};color:${MUTED};font-size:11px;text-align:left;text-transform:uppercase;">Producto</th>
                      <th style="padding:10px 12px;border-bottom:2px solid ${INK};color:${MUTED};font-size:11px;text-align:center;text-transform:uppercase;">Cant.</th>
                      <th style="padding:10px 12px;border-bottom:2px solid ${INK};color:${MUTED};font-size:11px;text-align:right;text-transform:uppercase;">Precio</th>
                      <th style="padding:10px 12px;border-bottom:2px solid ${INK};color:${MUTED};font-size:11px;text-align:right;text-transform:uppercase;">Total</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
                  <tr>
                    <td style="padding:14px 12px;color:${INK};font-size:16px;font-weight:700;">Total del pedido</td>
                    <td style="padding:14px 12px;color:${CLAY};font-size:20px;font-weight:700;text-align:right;">${money(order.total)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 30px;">
                <p style="margin:0;color:#9a9a9a;font-size:12px;text-align:center;line-height:1.6;">Correo automático de ${escapeHtml(order.brandName)}. Gestiona este pedido desde el panel de administración.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`
}

/** Envía el correo de aviso de pedido. Nunca lanza: si falta configuración o
 * falla el envío, solo registra un aviso en consola para no interrumpir el
 * registro del pedido del cliente. */
export async function sendOrderNotificationEmail(env: Env, to: string, order: EmailOrder): Promise<void> {
  if (!to) return
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY no está configurado: no se envió el correo de aviso de pedido.')
    return
  }

  try {
    const from = env.RESEND_FROM_EMAIL || `${order.brandName} <onboarding@resend.dev>`
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Nuevo pedido ${order.orderNumber} · ${order.customerName} · ${formatMoney(order.total, order.currency)}`,
        reply_to: order.email || undefined,
        html: buildOrderEmailHtml(order),
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error(`No se pudo enviar el correo de aviso de pedido (${response.status}). ${detail.slice(0, 300)}`)
    }
  } catch (caught) {
    console.error('Error enviando el correo de aviso de pedido:', caught)
  }
}
