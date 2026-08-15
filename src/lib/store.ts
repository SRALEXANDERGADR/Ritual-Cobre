import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db'
import { content, customers, orders, products } from '../../db/schema'
import { createSession, clearSession, verifyPassword, verifySession } from './auth'
import { sendOrderNotificationEmail } from './email'

export type CartLine = { productId: number; name: string; price: number; quantity: number; image: string }

const defaultContent: Record<string, string> = {
  brandName: 'Ritual Cobre',
  navCatalog: 'Rituales',
  navBenefits: 'Por qué elegirnos',
  navContact: 'Contacto',
  eyebrow: 'Cuidado personal · hecho con intención',
  heroTitle: 'Tu piel también merece bajar el ritmo.',
  heroDescription: 'Fórmulas sensoriales para convertir lo cotidiano en un pequeño ritual de presencia.',
  heroCta: 'Descubrir la colección',
  heroImage: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=1400&q=85',
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
  footerText: 'Cuidado personal sensorial para días reales.',
  whatsapp: '15551234567',
  schedule: 'Lunes a viernes · 9:00 a 18:00',
  developerCredit: 'Diseño y desarrollo por GADR Net',
  cartTitle: 'Tu ritual',
  checkoutTitle: 'Completa tu pedido',
  notificationEmail: '',
}

const seedProducts = [
  { name: 'Aceite Luz Lenta', slug: 'aceite-luz-lenta', category: 'Rostro', description: 'Aceite facial ligero con escualano y rosa mosqueta para sellar hidratación sin sensación pesada.', price: 3600, stock: 14, image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85', featured: true },
  { name: 'Bálsamo Nube', slug: 'balsamo-nube', category: 'Cuerpo', description: 'Manteca corporal fundente con cacao y avena, ideal para piel seca y pausas largas.', price: 2900, stock: 8, image: 'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85', featured: false },
  { name: 'Bruma Hora Azul', slug: 'bruma-hora-azul', category: 'Aromas', description: 'Bruma de almohada y ambiente con lavanda, cedro y una nota mineral inesperada.', price: 2400, stock: 0, image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=900&q=85', featured: false },
  { name: 'Jabón Marea', slug: 'jabon-marea', category: 'Baño', description: 'Barra cremosa de arcilla rosada y sal marina para limpiar suavemente manos y cuerpo.', price: 1600, stock: 21, image: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?auto=format&fit=crop&w=900&q=85', featured: false },
]

async function ensureSeeded() {
  await db.insert(content).values(Object.entries(defaultContent).map(([key, value]) => ({ key, value }))).onConflictDoNothing()
  const existing = await db.select({ count: sql<number>`count(*)` }).from(products)
  if (Number(existing[0]?.count ?? 0) === 0) await db.insert(products).values(seedProducts)
}

async function requireAdmin() {
  const ok = await verifySession()
  if (!ok) throw new Error('Debes iniciar sesión para continuar.')
}

export const login = createServerFn({ method: 'POST' })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const ok = await verifyPassword(data.password)
    if (!ok) throw new Error('Contraseña incorrecta.')
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
  const [productRows, contentRows] = await Promise.all([
    db.select().from(products).orderBy(desc(products.featured), products.id),
    db.select().from(content),
  ])
  return { products: productRows, content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])) }
})

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; address: string; items: CartLine[] }) => data)
  .handler(async ({ data }) => {
    if (!data.name || !data.phone || !data.email || !data.address || !data.items.length) throw new Error('Completa todos los datos del pedido.')
    const productRows = await db.select().from(products).where(inArray(products.id, data.items.map((item) => item.productId)))
    const calculated = data.items.map((item) => {
      const product = productRows.find((row) => row.id === item.productId)
      if (!product || product.stock < item.quantity) throw new Error(`Stock insuficiente para ${item.name}.`)
      return { ...item, name: product.name, price: product.price, image: product.image }
    })
    const total = calculated.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const [existingCustomer] = await db.select().from(customers).where(eq(customers.email, data.email)).limit(1)
    const customer = existingCustomer
      ? (await db.update(customers).set({ name: data.name, phone: data.phone, address: data.address, updatedAt: new Date() }).where(eq(customers.id, existingCustomer.id)).returning())[0]
      : (await db.insert(customers).values({ name: data.name, email: data.email, phone: data.phone, address: data.address }).returning())[0]
    const orderNumber = `RC-${Date.now().toString().slice(-8)}`
    const createdAt = new Date()
    await db.transaction(async (tx) => {
      await tx.insert(orders).values({ orderNumber, customerId: customer.id, customerName: data.name, email: data.email, phone: data.phone, address: data.address, items: calculated, total, createdAt })
      for (const item of calculated) await tx.update(products).set({ stock: sql`${products.stock} - ${item.quantity}` }).where(and(eq(products.id, item.productId), sql`${products.stock} >= ${item.quantity}`))
    })

    const [notificationRow] = await db.select().from(content).where(eq(content.key, 'notificationEmail')).limit(1)
    if (notificationRow?.value) {
      await sendOrderNotificationEmail(env, notificationRow.value, {
        orderNumber,
        createdAt,
        customerName: data.name,
        email: data.email,
        phone: data.phone,
        address: data.address,
        total,
        items: calculated.map((item) => ({ name: item.name, price: item.price, quantity: item.quantity })),
      })
    }

    return { orderNumber, total }
  })

export const getAdminData = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  await ensureSeeded()
  const [productRows, orderRows, customerRows, contentRows] = await Promise.all([
    db.select().from(products).orderBy(desc(products.createdAt)),
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(customers).orderBy(desc(customers.createdAt)),
    db.select().from(content),
  ])
  return { products: productRows, orders: orderRows, customers: customerRows, content: Object.fromEntries(contentRows.map((item) => [item.key, item.value])) }
})

export const saveProduct = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; category: string; description: string; price: number; stock: number; image: string; featured: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const values = { ...data, slug: `${data.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-${data.id ?? Date.now()}`, price: Number(data.price), stock: Number(data.stock) }
    if (data.id) {
      const { id, ...update } = values
      await db.update(products).set(update).where(eq(products.id, id))
      return id
    }
    const [created] = await db.insert(products).values(values).returning({ id: products.id })
    return created.id
  })

export const deleteProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(products).where(eq(products.id, data))
  return true
})

export const updateOrderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus }).where(eq(orders.id, data.id))
    return true
  })

export const saveContent = createServerFn({ method: 'POST' }).inputValidator((data: Record<string, string>) => data).handler(async ({ data }) => {
  await requireAdmin()
  for (const [key, value] of Object.entries(data)) await db.insert(content).values({ key, value }).onConflictDoUpdate({ target: content.key, set: { value, updatedAt: new Date() } })
  return true
})

export const saveCustomer = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; email: string; phone: string; address: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = data.name.trim()
    if (!name) throw new Error('El nombre es obligatorio.')
    const values = { name, email: data.email.trim(), phone: data.phone.trim(), address: data.address.trim(), notes: data.notes.trim() }
    if (data.id) {
      await db.update(customers).set({ ...values, updatedAt: new Date() }).where(eq(customers.id, data.id))
      return data.id
    }
    const [created] = await db.insert(customers).values(values).returning({ id: customers.id })
    return created.id
  })

export const deleteCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(customers).where(eq(customers.id, data))
  return true
})

export const deleteOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(orders).where(eq(orders.id, data))
  return true
})
