// Recibo en IMAGEN (PNG) para mandarlo por WhatsApp (plan Completo). Tiene
// forma de ticket de tienda: papel claro con bordes en zigzag sobre fondo
// oscuro, el isotipo de cobre y un sello de «Pagado» o «Pago pendiente».
// Se dibuja en el navegador con <canvas>, sin librerías. La factura en PDF
// sigue aparte (botón «Descargar factura»).

export type ReceiptData = {
  brand: string
  site: string
  whatsapp: string
  orderNumber: string
  createdAt: string
  customerName: string
  phone: string
  address: string
  items: Array<{ name: string; price: number; quantity: number; exchangeDays?: number }>
  discount: number
  total: number
  paymentStatus: string
  exchangeTerms: string
  money: (cents: number) => string
}

const C = {
  bg: '#182431',
  paper: '#fffaf7',
  ink: '#182431',
  soft: '#49515a',
  muted: '#7b7d80',
  line: '#d8cdc4',
  clay: '#ba5b46',
  clayDark: '#8d3d31',
  green: '#2f6b4b',
}
const DISPLAY = "'Syne', 'Manrope', system-ui, sans-serif"
const BODY = "'Manrope', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const MONO = "'DM Mono', ui-monospace, Menlo, Consolas, monospace"
const W = 1000
const PAD = 64 // fondo oscuro alrededor del ticket
const IN = 60 // margen dentro del ticket
const TOOTH = 22 // ancho de cada pico del zigzag

const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 280"><defs><linearGradient id="g" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="#d98a63"/><stop offset=".45" stop-color="#ba5b46"/><stop offset="1" stop-color="#8d3d31"/></linearGradient></defs><path d="M20 272V120a100 100 0 0 1 200 0v152z" fill="url(#g)"/><path d="M120 96c0 0-40 48-40 76a40 40 0 0 0 80 0c0-28-40-76-40-76z" fill="#fffaf7"/><path d="M168 84l3.6 9.4 9.4 3.6-9.4 3.6-3.6 9.4-3.6-9.4-9.4-3.6 9.4-3.6z" fill="#fffaf7"/></svg>`

const fullDate = (value: string) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

/** Espera las letras de la tienda (si no cargan, se usan las del sistema). */
async function fontsReady() {
  try {
    await Promise.race([
      Promise.all(['600 52px Syne', '700 28px Manrope', '500 24px Manrope', '400 20px "DM Mono"'].map((font) => document.fonts.load(font))),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ])
  } catch { /* letras del sistema */ }
}

/** Parte un texto en líneas que caben en `width`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines = 99): string[] {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= width || !current) current = next
    else { lines.push(current); current = word }
  }
  if (current) lines.push(current)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** Contorno del ticket con picos arriba y abajo. */
function ticketPath(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const teeth = Math.floor((x1 - x0) / TOOTH)
  const step = (x1 - x0) / teeth
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  for (let index = 0; index < teeth; index += 1) {
    ctx.lineTo(x0 + step * index + step / 2, y0 - 11)
    ctx.lineTo(x0 + step * (index + 1), y0)
  }
  ctx.lineTo(x1, y1)
  for (let index = teeth; index > 0; index -= 1) {
    ctx.lineTo(x0 + step * index - step / 2, y1 + 11)
    ctx.lineTo(x0 + step * (index - 1), y1)
  }
  ctx.closePath()
}

/** Dibuja (o, con draw = false, solo mide) el recibo. Devuelve la altura total. */
function paint(ctx: CanvasRenderingContext2D, data: ReceiptData, mark: HTMLImageElement | null, height: number, draw: boolean): number {
  const X0 = PAD
  const X1 = W - PAD
  const L = X0 + IN
  const R = X1 - IN
  const CW = R - L
  const text = (value: string, x: number, y: number, font: string, color: string, align: CanvasTextAlign = 'left') => {
    ctx.font = font
    if (!draw) return
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.fillText(value, x, y)
    ctx.textAlign = 'left'
  }
  const dashed = (y: number) => {
    if (!draw) return
    ctx.save()
    ctx.strokeStyle = C.line
    ctx.lineWidth = 2
    ctx.setLineDash([10, 8])
    ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke()
    ctx.restore()
  }

  if (draw) {
    ctx.fillStyle = C.bg
    ctx.fillRect(0, 0, W, height)
    ticketPath(ctx, X0, PAD, X1, height - PAD)
    ctx.fillStyle = C.paper
    ctx.fill()
  }

  // Encabezado: isotipo, nombre de la tienda y su dirección web.
  let y = PAD + 58
  if (mark && draw) ctx.drawImage(mark, W / 2 - 36, y, 72, 84)
  y += 84 + 64
  text(data.brand, W / 2, y, `600 54px ${DISPLAY}`, C.ink, 'center')
  y += 40
  text(data.site, W / 2, y, `400 20px ${MONO}`, C.muted, 'center')
  y += 44
  dashed(y)

  // Número, fecha y cliente.
  y += 52
  text('RECIBO', L, y, `500 20px ${MONO}`, C.clay)
  text(data.orderNumber, R, y, `500 22px ${MONO}`, C.ink, 'right')
  y += 38
  text(fullDate(data.createdAt), L, y, `500 22px ${BODY}`, C.soft)
  ctx.font = `700 26px ${BODY}`
  const customer = wrap(ctx, data.customerName, CW, 2)
  y += 22
  for (const line of customer) { y += 38; text(line, L, y, `700 26px ${BODY}`, C.ink) }
  const details = [data.phone, data.address].filter(Boolean).join(' · ')
  if (details) {
    ctx.font = `500 22px ${BODY}`
    for (const line of wrap(ctx, details, CW, 3)) { y += 32; text(line, L, y, `500 22px ${BODY}`, C.soft) }
  }
  y += 34
  dashed(y)

  // Productos.
  y += 14
  const priceWidth = 210
  for (const item of data.items) {
    ctx.font = `700 26px ${BODY}`
    const lines = wrap(ctx, `${item.quantity} × ${item.name}`, CW - priceWidth, 3)
    y += 44
    text(data.money(item.price * item.quantity), R, y, `600 26px ${DISPLAY}`, C.ink, 'right')
    lines.forEach((line, index) => text(line, L, y + index * 34, `700 26px ${BODY}`, C.ink))
    y += (lines.length - 1) * 34
    if (item.quantity > 1) { y += 32; text(`${data.money(item.price)} cada una`, L, y, `500 21px ${BODY}`, C.muted) }
    if ((item.exchangeDays ?? 0) > 0) {
      const days = item.exchangeDays ?? 0
      y += 32
      text(`↺  Cambio: ${days} ${days === 1 ? 'día' : 'días'} después de recibirlo`, L, y, `400 19px ${MONO}`, C.clay)
    }
    y += 22
  }
  y += 12
  dashed(y)

  // Totales.
  const subtotal = data.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  if (data.discount > 0) {
    y += 46
    text('Subtotal', L, y, `500 23px ${BODY}`, C.soft)
    text(data.money(subtotal), R, y, `500 23px ${BODY}`, C.soft, 'right')
    y += 36
    text('Descuento', L, y, `500 23px ${BODY}`, C.green)
    text(`-${data.money(data.discount)}`, R, y, `500 23px ${BODY}`, C.green, 'right')
  }
  y += 68
  text('TOTAL', L, y, `500 22px ${MONO}`, C.ink)
  text(data.money(data.total), R, y + 4, `600 50px ${DISPLAY}`, C.clay, 'right')

  // Sello del pago.
  y += 54
  const paid = data.paymentStatus === 'Pagado'
  const stamp = paid ? 'PAGADO' : 'PAGO PENDIENTE'
  ctx.font = `600 26px ${DISPLAY}`
  const stampW = ctx.measureText(stamp).width + 56
  if (draw) {
    ctx.save()
    ctx.translate(L + stampW / 2 + 6, y + 36)
    ctx.rotate(-0.05)
    ctx.strokeStyle = paid ? C.green : C.clay
    ctx.lineWidth = 4
    ctx.strokeRect(-stampW / 2, -30, stampW, 60)
    ctx.lineWidth = 1.5
    ctx.strokeRect(-stampW / 2 + 7, -23, stampW - 14, 46)
    ctx.fillStyle = paid ? C.green : C.clay
    ctx.textAlign = 'center'
    ctx.fillText(stamp, 0, 10)
    ctx.restore()
  }
  y += 72 + 34
  dashed(y)

  // Condiciones de cambio (si algún producto tiene días para cambio).
  const terms = data.items.some((item) => (item.exchangeDays ?? 0) > 0) ? data.exchangeTerms.trim() : ''
  if (terms) {
    y += 48
    text('CAMBIOS', L, y, `500 20px ${MONO}`, C.clay)
    ctx.font = `500 21px ${BODY}`
    for (const line of wrap(ctx, terms, CW, 7)) { y += 31; text(line, L, y, `500 21px ${BODY}`, C.soft) }
    y += 36
    dashed(y)
  }

  // Pie.
  y += 66
  text('Gracias por tu compra.', W / 2, y, `600 32px ${DISPLAY}`, C.ink, 'center')
  const phone = data.whatsapp.replace(/\D/g, '').replace(/^1?(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
  if (phone) { y += 40; text(`WhatsApp ${phone}`, W / 2, y, `400 20px ${MONO}`, C.muted, 'center') }
  y += 58
  return y + PAD
}

/** Dibuja el recibo y lo devuelve como PNG. */
export async function receiptImage(data: ReceiptData): Promise<Blob> {
  await fontsReady()
  const mark = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(MARK)}`)
  const probe = document.createElement('canvas').getContext('2d')!
  const height = Math.ceil(paint(probe, data, mark, 0, false))
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.textBaseline = 'alphabetic'
  paint(ctx, data, mark, height, true)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen del recibo.'))), 'image/png'))
}
