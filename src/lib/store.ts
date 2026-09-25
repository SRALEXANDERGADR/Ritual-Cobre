import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { content, customers, orders, products } from '../../db/schema'
import { createSession, clearSession, verifyPassword, verifySession } from './auth'
import { sendOrderNotificationEmail } from './email'

export type CartLine = { productId: number; name: string; price: number; quantity: number; image: string }
export type OrderResult = { orderNumber: string; total: number; items?: Array<{ name: string; quantity: number; price: number }> }

// Contenido editable desde el panel (Editor de contenido). Las claves nuevas
// se agregan solas a la base de datos la próxima vez que se cargue la tienda,
// sin pisar lo que ya se haya editado.
export const defaultContent: Record<string, string> = {
  brandName: 'Ritual Cobre',
  navCatalog: 'Rituales',
  navBenefits: 'Por qué elegirnos',
  navContact: 'Contacto',
  eyebrow: 'Cuidado personal · hecho con intención',
  heroTitle: 'Tu piel también merece bajar el ritmo.',
  heroDescription: 'Fórmulas sensoriales para convertir lo cotidiano en un pequeño ritual de presencia.',
  heroCta: 'Descubrir la colección',
  heroImage: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=1400&q=85',
  heroBadge: 'Fórmulas sensoriales para días reales',
  trust1: 'Pedidos confirmados por WhatsApp',
  trust2: 'Pago y entrega coordinados contigo',
  trust3: 'Pequeños lotes, hechos a mano',
  benefitsTitle: 'Menos ruido. Más ritual.',
  benefit1Title: 'Ingredientes honestos',
  benefit1Text: 'Seleccionados por su función, origen y experiencia sobre la piel.',
  benefit2Title: 'Pequeños lotes',
  benefit2Text: 'Producción cuidada para conservar frescura y atención al detalle.',
  benefit3Title: 'Belleza consciente',
  benefit3Text: 'Empaques pensados para reducir lo innecesario sin perder belleza.',
  catalogTitle: 'Elige tu próximo ritual',
  catalogDescription: 'Texturas, aromas y activos que acompañan tu mañana, tu pausa o tu noche.',
  storyTitle: 'Nacimos para hacer espacio.',
  storyText: 'Ritual Cobre surge de una idea simple: el cuidado personal no tiene que sentirse como otra tarea. Creamos objetos cotidianos que invitan a tocar, respirar y volver al presente.',
  storyImage: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=700&q=85',
  footerText: 'Cuidado personal sensorial para días reales.',
  whatsapp: '',
  contactEmail: '',
  instagram: '',
  schedule: 'Lunes a viernes · 9:00 a 18:00',
  developerCredit: 'Diseño y desarrollo por GADR Net',
  cartTitle: 'Tu ritual',
  checkoutTitle: 'Completa tu pedido',
  currency: 'USD',
  policiesUpdated: '25 de septiembre de 2026',
  policyPrivacy: 'Usamos tus datos únicamente para gestionar pedidos, entregas y comunicaciones relacionadas con tu compra. No vendemos ni compartimos tu información con terceros ajenos a la operación. Puedes pedirnos en cualquier momento que actualicemos o eliminemos tus datos.',
  policyOrders: 'Al enviar tu pedido recibes un número de confirmación. Nuestro equipo te contacta para confirmar disponibilidad, método de pago y entrega antes de procesar la compra. Aceptamos transferencia bancaria y pago contra entrega en zonas seleccionadas.',
  policyShipping: 'Coordinamos la entrega contigo después de confirmar el pedido. El costo y el tiempo de envío dependen de tu zona y se informan antes de despachar. Los pedidos confirmados se preparan en un plazo de 1 a 3 días laborables.',
  policyReturns: 'Aceptamos solicitudes de cambio o devolución dentro de los 7 días posteriores a la entrega, para productos sin abrir y en su empaque original. Si recibes un producto dañado, escríbenos con fotografías y lo resolvemos.',
  policyTerms: 'Los precios y la disponibilidad pueden cambiar sin previo aviso. Un pedido se considera confirmado cuando nuestro equipo lo valida contigo. Nos reservamos el derecho de cancelar pedidos con datos incompletos o que no puedan verificarse.',
  policyContact: 'Para consultas sobre privacidad, pedidos, envíos o devoluciones, escríbenos por WhatsApp o al correo de contacto de la tienda. Respondemos dentro del horario de atención.',
  notificationEmail: '',
}

// Claves que nunca se envían a la tienda pública.
const PRIVATE_CONTENT_KEYS = new Set(['notificationEmail'])

const seedProducts = [
  { name: 'Aceite Luz Lenta', slug: 'aceite-luz-lenta', category: 'Rostro', description: 'Aceite facial ligero con escualano y rosa mosqueta para sellar hidratación sin sensación pesada.', price: 3600, stock: 14, image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85', featured: true },
  { name: 'Bálsamo Nube', slug: 'balsamo-nube', category: 'Cuerpo', description: 'Manteca corporal fundente con cacao y avena, ideal para piel seca y pausas largas.', price: 2900, stock: 8, image: 'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85', featured: false },
  { name: 'Bruma Hora Azul', slug: 'bruma-hora-azul', category: 'Aromas', description: 'Bruma de almohada y ambiente con lavanda, cedro y una nota mineral inesperada.', price: 2400, stock: 0, image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=900&q=85', featured: false },
  { name: 'Jabón Marea', slug: 'jabon-marea', category: 'Baño', description: 'Barra cremosa de arcilla rosada y sal marina para limpiar suavemente manos y cuerpo.', price: 1600, stock: 21, image: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?auto=format&fit=crop&w=900&q=85', featured: false },
]

let seeded = false
async function ensureSeeded() {
  if (seeded) return
  await db.insert(content).values(Object.entries(defaultContent).map(([key, value]) => ({ key, value }))).onConflictDoNothing()
  const existing = await db.select({ count: sql<number>`count(*)` }).from(products)
  if (Number(existing[0]?.count ?? 0) === 0) await db.insert(products).values(seedProducts)
  seeded = true
}

async function requireAdmin() {
  const ok = await verifySession()
  if (!ok) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
const slugify = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const ORDER_STATUSES = ['Pendiente', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado', 'Reembolsado']
// Estados en los que la mercancía ya no está reservada para el cliente.
const RELEASES_STOCK = (status: string) => status === 'Cancelado'

async function readContent() {
  const rows = await db.select().from(content)
  return Object.fromEntries(rows.map((item) => [item.key, item.value])) as Record<string, string>
}

async function adjustStock(items: Array<{ productId: number; quantity: number }>, direction: 1 | -1) {
  for (const item of items) {
    await db.update(products).set({ stock: sql`${products.stock} + ${direction * item.quantity}` }).where(eq(products.id, item.productId))
  }
}

export const login = createServerFn({ method: 'POST' })
  .inputValidator((data: { password: string }) => ({ password: text(data?.password, 200) }))
  .handler(async ({ data }) => {
    const ok = await verifyPassword(data.password)
    if (!ok) {
      // Pequeña espera para frenar intentos repetidos de adivinar la contraseña.
      await new Promise((resolve) => setTimeout(resolve, 700))
      throw new Error('Contraseña incorrecta.')
    }
    await createSession()
    return true
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  clearSession()
  return true
})

export const checkSession = createServerFn({ method: 'GET' }).handler(async () => {
  return verifySession()
})

export const getStorefront = createServerFn({ method: 'GET' }).handler(async () => {
  await ensureSeeded()
  const [productRows, contentMap] = await Promise.all([
    db.select().from(products).orderBy(desc(products.featured), products.id),
    readContent(),
  ])
  const publicContent = { ...defaultContent, ...contentMap }
  for (const key of PRIVATE_CONTENT_KEYS) delete publicContent[key]
  return { products: productRows, content: publicContent }
})

type OrderInput = { name: string; phone: string; email: string; address: string; notes?: string; rc_confirm?: string; items: Array<{ productId: number; quantity: number }> }

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: OrderInput) => data)
  .handler(async ({ data }) => {
    // Campo trampa para bots: si viene lleno, se simula éxito sin registrar nada.
    if (text(data.rc_confirm, 100)) return { orderNumber: 'RC-00000000', total: 0 }

    const name = text(data.name, 120)
    const phone = text(data.phone, 40)
    const email = text(data.email, 180).toLowerCase()
    const address = text(data.address, 400)
    const notes = text(data.notes, 500)
    if (name.length < 2) throw new Error('Escribe tu nombre completo.')
    if (phone.replace(/\D/g, '').length < 7) throw new Error('Escribe un número de teléfono válido.')
    if (!isEmail(email)) throw new Error('Escribe un correo electrónico válido.')
    if (address.length < 5) throw new Error('Escribe la dirección de entrega.')
    if (!Array.isArray(data.items) || !data.items.length) throw new Error('Tu bolsa está vacía.')

    // Agrupa líneas repetidas y valida cantidades (enteros positivos, máximo 50 por producto).
    const quantities = new Map<number, number>()
    for (const item of data.items.slice(0, 50)) {
      const productId = Number(item?.productId)
      const quantity = Number(item?.quantity)
      if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) throw new Error('Hay una cantidad no válida en tu bolsa.')
      quantities.set(productId, (quantities.get(productId) ?? 0) + quantity)
    }

    const productRows = await db.select().from(products).where(inArray(products.id, [...quantities.keys()]))
    const calculated = [...quantities.entries()].map(([productId, quantity]) => {
      const product = productRows.find((row) => row.id === productId)
      if (!product) throw new Error('Uno de los productos de tu bolsa ya no está disponible.')
      if (product.stock < quantity) throw new Error(product.stock > 0 ? `Solo quedan ${product.stock} unidades de ${product.name}.` : `${product.name} se agotó.`)
      return { productId, name: product.name, price: product.price, quantity, image: product.image }
    })
    const total = calculated.reduce((sum, item) => sum + item.price * item.quantity, 0)

    // Reserva el stock primero (solo descuenta si todavía alcanza). Si algún
    // producto falla, se devuelve lo ya descontado. El driver HTTP de Neon no
    // soporta transacciones, por eso se hace de forma secuencial.
    const reserved: typeof calculated = []
    for (const item of calculated) {
      const updated = await db.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` })
        .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity))).returning({ id: products.id })
      if (!updated.length) {
        await adjustStock(reserved, 1)
        throw new Error(`${item.name} acaba de agotarse. Actualiza tu bolsa e inténtalo de nuevo.`)
      }
      reserved.push(item)
    }

    let orderNumber = ''
    const createdAt = new Date()
    const fullAddress = notes ? `${address}\nNota: ${notes}` : address
    try {
      const [existingCustomer] = await db.select().from(customers).where(sql`lower(${customers.email}) = ${email}`).limit(1)
      const customer = existingCustomer
        ? (await db.update(customers).set({ name, phone, address, updatedAt: new Date() }).where(eq(customers.id, existingCustomer.id)).returning())[0]
        : (await db.insert(customers).values({ name, email, phone, address }).returning())[0]
      orderNumber = `RC-${Date.now().toString().slice(-8)}`
      await db.insert(orders).values({ orderNumber, customerId: customer.id, customerName: name, email, phone, address: fullAddress, items: calculated, total, createdAt })
    } catch (caught) {
      // El pedido no se guardó: se libera el stock reservado.
      await adjustStock(reserved, 1)
      console.error('No se pudo registrar el pedido:', caught)
      throw new Error('No pudimos registrar el pedido. Inténtalo de nuevo en unos minutos.')
    }

    // El pedido ya está guardado: un fallo en el aviso por correo nunca debe afectar al cliente.
    try {
      const settings = await readContent()
      if (settings.notificationEmail) {
        await sendOrderNotificationEmail(env, settings.notificationEmail, {
          orderNumber,
          createdAt,
          customerName: name,
          email,
          phone,
          address: fullAddress,
          total,
          currency: settings.currency || 'USD',
          brandName: settings.brandName || 'Ritual Cobre',
          items: calculated.map((item) => ({ name: item.name, price: item.price, quantity: item.quantity })),
        })
      }
    } catch (caught) {
      console.error('No se pudo enviar el aviso del pedido:', caught)
    }

    return { orderNumber, total, items: calculated.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price })) }
  })

export const getAdminData = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  await ensureSeeded()
  const [productRows, orderRows, customerRows, contentMap] = await Promise.all([
    db.select().from(products).orderBy(desc(products.createdAt)),
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(customers).orderBy(desc(customers.createdAt)),
    readContent(),
  ])
  return { products: productRows, orders: orderRows, customers: customerRows, content: { ...defaultContent, ...contentMap } }
})

type ProductInput = { id?: number; name: string; category: string; description: string; price: number; stock: number; image: string; featured: boolean }

export const saveProduct = createServerFn({ method: 'POST' })
  .inputValidator((data: ProductInput) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = text(data.name, 120)
    const category = text(data.category, 60)
    const description = text(data.description, 2000)
    const image = text(data.image, 1000)
    const price = Math.round(Number(data.price))
    const stock = Math.round(Number(data.stock))
    if (name.length < 2) throw new Error('El producto necesita un nombre.')
    if (!category) throw new Error('Elige o escribe una categoría.')
    if (!Number.isFinite(price) || price < 0) throw new Error('El precio no es válido.')
    if (!Number.isFinite(stock) || stock < 0) throw new Error('Las existencias no son válidas.')
    if (image && !/^https?:\/\//i.test(image) && !image.startsWith('/')) throw new Error('La imagen debe ser una URL (https://...) o una imagen subida.')
    const values = { name, category, description, image, price, stock, featured: Boolean(data.featured) }
    if (data.id) {
      await db.update(products).set({ ...values, slug: `${slugify(name)}-${data.id}` }).where(eq(products.id, data.id))
      return data.id
    }
    const [created] = await db.insert(products).values({ ...values, slug: `${slugify(name)}-${Date.now()}` }).returning({ id: products.id })
    await db.update(products).set({ slug: `${slugify(name)}-${created.id}` }).where(eq(products.id, created.id))
    return created.id
  })

export const deleteProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => Number(id)).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(products).where(eq(products.id, data))
  return true
})

export const updateOrderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!ORDER_STATUSES.includes(data.status) || !PAYMENT_STATUSES.includes(data.paymentStatus)) throw new Error('Estado no válido.')
    const [order] = await db.select().from(orders).where(eq(orders.id, Number(data.id))).limit(1)
    if (!order) throw new Error('El pedido ya no existe.')
    // Se actualiza solo si nadie lo cambió entretanto (evita devolver stock dos veces).
    const updated = await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus })
      .where(and(eq(orders.id, order.id), eq(orders.status, order.status))).returning({ id: orders.id })
    if (!updated.length) throw new Error('El pedido cambió mientras lo editabas. Recarga e inténtalo de nuevo.')
    // Al cancelar se devuelve la mercancía al inventario; al reactivar un
    // pedido cancelado se vuelve a descontar (solo si todavía hay stock).
    const wasReleased = RELEASES_STOCK(order.status)
    const willRelease = RELEASES_STOCK(data.status)
    if (!wasReleased && willRelease) await adjustStock(order.items, 1)
    if (wasReleased && !willRelease) {
      const reserved: typeof order.items = []
      for (const item of order.items) {
        const ok = await db.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` })
          .where(and(eq(products.id, item.productId), gte(products.stock, item.quantity))).returning({ id: products.id })
        if (!ok.length) {
          await adjustStock(reserved, 1)
          await db.update(orders).set({ status: order.status, paymentStatus: order.paymentStatus }).where(eq(orders.id, order.id))
          throw new Error(`No hay suficiente stock de ${item.name} para reactivar este pedido.`)
        }
        reserved.push(item)
      }
    }
    return true
  })

export const saveContent = createServerFn({ method: 'POST' }).inputValidator((data: Record<string, string>) => data).handler(async ({ data }) => {
  await requireAdmin()
  for (const [key, raw] of Object.entries(data)) {
    if (!Object.hasOwn(defaultContent, key)) continue
    const value = typeof raw === 'string' ? raw.slice(0, 5000) : ''
    await db.insert(content).values({ key, value }).onConflictDoUpdate({ target: content.key, set: { value, updatedAt: new Date() } })
  }
  return true
})

export const saveCustomer = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; email: string; phone: string; address: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = text(data.name, 120)
    if (!name) throw new Error('El nombre es obligatorio.')
    const email = text(data.email, 180).toLowerCase()
    if (email && !isEmail(email)) throw new Error('El correo no es válido.')
    const values = { name, email, phone: text(data.phone, 40), address: text(data.address, 400), notes: text(data.notes, 1000) }
    if (data.id) {
      await db.update(customers).set({ ...values, updatedAt: new Date() }).where(eq(customers.id, data.id))
      return data.id
    }
    const [created] = await db.insert(customers).values(values).returning({ id: customers.id })
    return created.id
  })

export const deleteCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => Number(id)).handler(async ({ data }) => {
  await requireAdmin()
  // Los pedidos se conservan en el historial; solo se desvinculan del cliente.
  await db.update(orders).set({ customerId: null }).where(eq(orders.customerId, data))
  await db.delete(customers).where(eq(customers.id, data))
  return true
})

export const deleteOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => Number(id)).handler(async ({ data }) => {
  await requireAdmin()
  const [order] = await db.delete(orders).where(eq(orders.id, data)).returning()
  if (!order) return true
  // Si el pedido todavía no se había entregado ni cancelado, la mercancía vuelve al inventario.
  if (order.status === 'Pendiente' || order.status === 'Preparando') await adjustStock(order.items, 1)
  return true
})
