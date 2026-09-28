import { createServerFn } from '@tanstack/react-start'
import { env } from 'cloudflare:workers'
import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import { content, customers, expenses, imageTrash, orders, products, purchases, pushSubscriptions } from '../../db/schema'
import { createSession, clearSession, verifyPassword, verifySession } from './auth'
import { sendOrderNotificationEmail, parseEmailList } from './email'
import { SITE_URL, formatMoney as formatCurrency } from './format'
import { deleteImage, imagePathFromUrl } from './fotos'
import { lineName, normalizeVariants, optionPrice, optionStock, parseOptions, resolveOption, tracksOptionStock } from './variants'
import type { ProductVariant } from './variants'
import { generateVapidKeys, sendPush } from './push'
import type { PushMessage, VapidKeys } from './push'

// Días que un elemento permanece en papelera (productos, clientes, pedidos
// e imágenes) antes de eliminarse definitivamente.
const TRASH_DAYS = 30
const TRASH_MS = TRASH_DAYS * 24 * 60 * 60 * 1000

export type CartLine = { productId: number; name: string; price: number; quantity: number; image: string; option?: string }
type OrderItem = { id: number; name: string; price: number; quantity: number; cost: number; option?: string; reinvCost?: number; reinvQty?: number }
type ProductRow = typeof products.$inferSelect

// Con qué dinero se paga una compra (ver `purchases.fund`).
const FUNDS = ['capital', 'reinversion'] as const
type Fund = (typeof FUNDS)[number]

/** Lo que costaron unas unidades vendidas: el total, y cuánto de eso (y
 * cuántas unidades) salió de lotes pagados con el dinero para reinvertir. */
type TakenCost = { cost: number; reinv: number; reinvQty: number }

/** Línea de pedido con su parte de reinversión (solo se guarda si la hay). */
function withReinv(item: Omit<OrderItem, 'reinvCost' | 'reinvQty'>, reinvCost: number, reinvQty: number): OrderItem {
  return reinvQty > 0 ? { ...item, reinvCost, reinvQty } : item
}

export const CATEGORIES = ['Rostro', 'Cuerpo', 'Aromas', 'Baño', 'Cabello', 'Kits y regalos', 'Otros']

// Contenido editable desde el panel (Textos). Las claves nuevas se agregan
// solas a la base de datos la próxima vez que se cargue la tienda, sin pisar
// lo que ya se haya editado.
const defaultContent: Record<string, string> = {
  brandName: 'Ritual Cobre',
  navCatalog: 'Rituales',
  navContact: 'Contacto',
  storyTitle: 'Nacimos para hacer espacio.',
  storyText: 'Ritual Cobre surge de una idea simple: el cuidado personal no tiene que sentirse como otra tarea. Creamos objetos cotidianos que invitan a tocar, respirar y volver al presente.',
  storyImage: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=700&q=85',
  footerText: 'Cuidado personal sensorial para días reales.',
  whatsapp: '',
  contactEmail: '',
  instagram: '',
  schedule: 'Lunes a viernes · 9:00 a 18:00',
  // Se muestran en el pie de la tienda (separados por coma). Vacío = no se muestran.
  paymentMethods: 'Transferencia, Pago contra entrega',
  cartTitle: 'Tu ritual',
  checkoutTitle: 'Completa tu pedido',
  currency: 'DOP',
  policiesUpdated: '25 de septiembre de 2026',
  policyPrivacy: 'Usamos tus datos únicamente para gestionar pedidos, entregas y comunicaciones relacionadas con tu compra. No vendemos ni compartimos tu información con terceros ajenos a la operación. Puedes pedirnos en cualquier momento que actualicemos o eliminemos tus datos.',
  policyOrders: 'Al enviar tu pedido recibes un número de confirmación. Nuestro equipo te contacta para confirmar disponibilidad, método de pago y entrega antes de procesar la compra. Aceptamos transferencia bancaria y pago contra entrega en zonas seleccionadas.',
  policyShipping: 'Coordinamos la entrega contigo después de confirmar el pedido. El costo y el tiempo de envío dependen de tu zona y se informan antes de despachar. Los pedidos confirmados se preparan en un plazo de 1 a 3 días laborables.',
  policyReturns: 'Aceptamos solicitudes de cambio o devolución dentro de los 7 días posteriores a la entrega, para productos sin abrir y en su empaque original. Si recibes un producto dañado, escríbenos con fotografías y lo resolvemos.',
  policyTerms: 'Los precios y la disponibilidad pueden cambiar sin previo aviso. Un pedido se considera confirmado cuando nuestro equipo lo valida contigo. Nos reservamos el derecho de cancelar pedidos con datos incompletos o que no puedan verificarse.',
  policyContact: 'Para consultas sobre privacidad, pedidos, envíos o devoluciones, escríbenos por WhatsApp o al correo de contacto de la tienda. Respondemos dentro del horario de atención.',
  notificationEmail: '',
  // Configuración de Finanzas (se editan desde Finanzas, no desde Textos).
  // capitalInicial en centavos; reinvestPercent de 0 a 100.
  capitalInicial: '0',
  reinvestPercent: '70',
}

// Productos de ejemplo para que la tienda no se vea vacía en el primer
// despliegue. Precios en centavos.
const seedProducts = [
  { name: 'Aceite Luz Lenta', category: 'Rostro', description: 'Aceite facial ligero con escualano y rosa mosqueta para sellar hidratación sin sensación pesada.', price: 3600, originalPrice: 0, stock: 14, featured: true, isNew: false, bestSeller: false, image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85' },
  { name: 'Bálsamo Nube', category: 'Cuerpo', description: 'Manteca corporal fundente con cacao y avena, ideal para piel seca y pausas largas.', price: 2900, originalPrice: 0, stock: 8, featured: false, isNew: false, bestSeller: false, image: 'https://images.unsplash.com/photo-1556229010-6c3f2c9ca5f8?auto=format&fit=crop&w=900&q=85' },
  { name: 'Bruma Hora Azul', category: 'Aromas', description: 'Bruma de almohada y ambiente con lavanda, cedro y una nota mineral inesperada.', price: 2400, originalPrice: 0, stock: 0, featured: false, isNew: false, bestSeller: false, image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=900&q=85' },
  { name: 'Jabón Marea', category: 'Baño', description: 'Barra cremosa de arcilla rosada y sal marina para limpiar suavemente manos y cuerpo.', price: 1600, originalPrice: 0, stock: 21, featured: false, isNew: false, bestSeller: false, image: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?auto=format&fit=crop&w=900&q=85' },
]

function pad(value: number, length = 2) {
  return String(value).padStart(length, '0')
}

/** Folio con el mismo espíritu que usa Alexander Perfiles: prefijo + fecha
 * de emisión (DDMMAAAA) + un número corto, para que sea legible de un
 * vistazo y no se repita entre pedidos. */
function makeFolio(prefix: string) {
  const now = new Date()
  const fecha = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`
  const rand = pad(Math.floor(Math.random() * 10000), 4)
  return `${prefix}-${fecha}-${rand}`
}

// ───────────────────────────────────────────────────────────────────────
// ESQUEMA — las columnas nuevas (cantidad por opción y opción de cada
// lote) se crean solas la primera vez que arranca el Worker, así que no
// hace falta correr ninguna migración a mano en Neon. Si ya existen, solo
// se hace una consulta rápida de lectura (una vez por instancia).
// ───────────────────────────────────────────────────────────────────────
let schemaReady: Promise<void> | null = null
function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const result = await db.execute(sql`select
        (select count(*) from information_schema.columns where table_schema = current_schema() and ((table_name = 'products' and column_name in ('option_stock', 'deleted_at', 'variant_images')) or (table_name = 'orders' and column_name = 'discount') or (table_name = 'purchases' and column_name in ('option', 'fund'))))
        + (select count(*) from information_schema.tables where table_schema = current_schema() and table_name in ('push_subscriptions', 'expenses', 'image_trash')) as n`)
      const rows = ((result as unknown as { rows?: Array<{ n: number | string }> }).rows ?? (result as unknown as Array<{ n: number | string }>)) || []
      if (Number(rows[0]?.n ?? 0) >= 9) return
      // Tablas de la primera versión de la tienda: se completan sin borrar nada.
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "options" text NOT NULL DEFAULT ''`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "original_price" integer NOT NULL DEFAULT 0`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "cost" integer NOT NULL DEFAULT 0`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "variant_images" jsonb NOT NULL DEFAULT '[]'::jsonb`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "option_stock" boolean NOT NULL DEFAULT false`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_new" boolean NOT NULL DEFAULT false`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "best_seller" boolean NOT NULL DEFAULT false`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true`)
      await db.execute(sql`ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`)
      await db.execute(sql`ALTER TABLE "products" ALTER COLUMN "category" SET DEFAULT 'Otros'`)
      await db.execute(sql`ALTER TABLE "products" ALTER COLUMN "price" SET DEFAULT 0`)
      // `slug` era obligatorio en la primera versión; ya no se usa.
      await db.execute(sql`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'products' AND column_name = 'slug') THEN ALTER TABLE "products" ALTER COLUMN "slug" DROP NOT NULL; END IF; END $$`)
      await db.execute(sql`ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`)
      await db.execute(sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount" integer NOT NULL DEFAULT 0`)
      await db.execute(sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "notes" text NOT NULL DEFAULT ''`)
      await db.execute(sql`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`)
      // Los pedidos se quedan aunque se borre su cliente para siempre.
      await db.execute(sql`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_customer_id_customers_id_fkey"`)
      await db.execute(sql`ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_customer_id_customers_id_fk"`)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "purchases" ("id" serial PRIMARY KEY, "product_id" integer NOT NULL, "product_name" text NOT NULL, "option" text NOT NULL DEFAULT '', "fund" text NOT NULL DEFAULT 'capital', "quantity" integer NOT NULL, "unit_cost" integer NOT NULL, "total_cost" integer NOT NULL, "remaining_quantity" integer NOT NULL, "notes" text NOT NULL DEFAULT '', "created_at" timestamp NOT NULL DEFAULT now())`)
      await db.execute(sql`ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "option" text NOT NULL DEFAULT ''`)
      await db.execute(sql`ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "fund" text NOT NULL DEFAULT 'capital'`)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "expenses" ("id" serial PRIMARY KEY, "type" text NOT NULL DEFAULT 'negocio', "description" text NOT NULL, "amount" integer NOT NULL, "created_at" timestamp NOT NULL DEFAULT now())`)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "image_trash" ("id" serial PRIMARY KEY, "path" text NOT NULL, "url" text NOT NULL, "reason" text NOT NULL DEFAULT '', "deleted_at" timestamp NOT NULL DEFAULT now())`)
      await db.execute(sql`CREATE TABLE IF NOT EXISTS "push_subscriptions" ("id" serial PRIMARY KEY, "endpoint" text NOT NULL UNIQUE, "p256dh" text NOT NULL, "auth" text NOT NULL, "label" text NOT NULL DEFAULT '', "created_at" timestamp NOT NULL DEFAULT now())`)
    })().catch((error) => {
      schemaReady = null // se reintenta en la próxima petición
      throw error
    })
  }
  return schemaReady
}

async function loadProduct(productId: number): Promise<ProductRow | undefined> {
  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1)
  return product
}

// ───────────────────────────────────────────────────────────────────────
// INVENTARIO Y LOTES (FIFO)
//
// Cada compra registrada es un "lote" con su propio costo. Al vender, se
// saca primero del lote más viejo que todavía tenga unidades (FIFO: el
// primero que entra es el primero que sale). Si el producto lleva cantidad
// por opción, una venta de "negro/amarillo" solo sale de los lotes de esa
// opción o de los lotes generales (sin opción, ej. compras de antes de
// separar por opción) — nunca del lote de otra opción.
// ───────────────────────────────────────────────────────────────────────

/** Lotes de los que puede salir (o a los que puede volver) una unidad de
 * esa opción. */
function lotsFor(product: ProductRow, option: string) {
  if (tracksOptionStock(product) && option) {
    return and(eq(purchases.productId, product.id), or(eq(purchases.option, option), eq(purchases.option, '')))
  }
  return eq(purchases.productId, product.id)
}

/** Costo a usar si se vende algo que no tiene lote registrado detrás (ej.
 * stock que ya existía antes de activar Finanzas): el último costo
 * conocido de esa opción o, si no hay, el costo actual del producto. */
async function fallbackCost(product: ProductRow, option: string): Promise<number> {
  if (tracksOptionStock(product) && option) {
    const [last] = await db.select({ unitCost: purchases.unitCost }).from(purchases)
      .where(and(eq(purchases.productId, product.id), eq(purchases.option, option)))
      .orderBy(desc(purchases.createdAt), desc(purchases.id)).limit(1)
    if (last) return last.unitCost
  }
  return product.cost
}

// Consume del lote más viejo primero (FIFO) para vender `quantity`
// unidades y devuelve el costo total (centavos) de esa cantidad, y cuánto
// de eso salió de lotes pagados con el dinero para reinvertir. Si no hay
// suficiente cantidad registrada en lotes, usa fallbackCost para lo que
// falte (como dinero del negocio), para no bloquear la venta.
async function consumeFifoCost(product: ProductRow, option: string, quantity: number): Promise<TakenCost> {
  let remaining = quantity
  const taken: TakenCost = { cost: 0, reinv: 0, reinvQty: 0 }
  const batches = await db.select().from(purchases)
    .where(and(lotsFor(product, option), gt(purchases.remainingQuantity, 0)))
    .orderBy(purchases.createdAt, purchases.id)
  for (const batch of batches) {
    if (remaining <= 0) break
    const take = Math.min(remaining, batch.remainingQuantity)
    taken.cost += take * batch.unitCost
    if (batch.fund === 'reinversion') {
      taken.reinv += take * batch.unitCost
      taken.reinvQty += take
    }
    remaining -= take
    await db.update(purchases).set({ remainingQuantity: batch.remainingQuantity - take }).where(eq(purchases.id, batch.id))
  }
  if (remaining > 0) taken.cost += remaining * (await fallbackCost(product, option))
  // El "costo actual" mostrado del producto pasa a ser el del próximo lote
  // disponible (el siguiente que se va a consumir), no un promedio.
  await syncCurrentCost(product.id)
  return taken
}

/** Devuelve unidades a los lotes de los que salieron (pedido cancelado o
 * editado a menos unidades): primero al lote más reciente que ya se había
 * empezado a vender, luego a los anteriores — el reverso de consumeFifoCost.
 * Las `reinvQty` unidades que salieron de lotes del dinero para reinvertir
 * vuelven a lotes de esa misma caja, y las demás a lotes del negocio; lo
 * que no quepa ahí va a cualquier lote con espacio. */
async function returnToFifo(product: ProductRow, option: string, quantity: number, reinvQty = 0) {
  const batches = await db.select().from(purchases)
    .where(and(lotsFor(product, option), lt(purchases.remainingQuantity, purchases.quantity)))
    .orderBy(desc(purchases.createdAt), desc(purchases.id))
  const put = new Map<number, number>()
  const fill = (list: typeof batches, amount: number) => {
    let remaining = amount
    for (const batch of list) {
      if (remaining <= 0) break
      const room = batch.quantity - batch.remainingQuantity - (put.get(batch.id) ?? 0)
      if (room <= 0) continue
      const add = Math.min(room, remaining)
      put.set(batch.id, (put.get(batch.id) ?? 0) + add)
      remaining -= add
    }
    return remaining
  }
  const reinv = Math.min(quantity, Math.max(0, reinvQty))
  const left = fill(batches.filter((batch) => batch.fund === 'reinversion'), reinv)
    + fill(batches.filter((batch) => batch.fund !== 'reinversion'), quantity - reinv)
  fill(batches, left)
  for (const batch of batches) {
    const add = put.get(batch.id)
    if (add) await db.update(purchases).set({ remainingQuantity: batch.remainingQuantity + add }).where(eq(purchases.id, batch.id))
  }
}

/** Suma (delta > 0) o resta (delta < 0) unidades al inventario. Si el
 * producto lleva cantidad por opción, cambia la de esa opción y el total
 * del producto se recalcula como la suma de todas. */
async function changeStock(productId: number, option: string, delta: number) {
  if (!delta) return
  const product = await loadProduct(productId)
  if (!product) return
  if (tracksOptionStock(product)) {
    // Una opción que ya no existe (se borró del producto) no tiene dónde
    // guardar unidades: se ignora.
    if (!option || !parseOptions(product.options).includes(option)) return
    const variants = normalizeVariants(product).map((entry) => (entry.option === option ? { ...entry, stock: Math.max(0, (entry.stock ?? 0) + delta) } : entry))
    const total = variants.reduce((sum, entry) => sum + (entry.stock ?? 0), 0)
    await db.update(products).set({ variantImages: variants, stock: total }).where(eq(products.id, productId))
    return
  }
  await db.update(products).set({ stock: sql`greatest(0, ${products.stock} + ${delta})` }).where(eq(products.id, productId))
}

/** Saca `quantity` unidades del inventario (FIFO) y devuelve su costo
 * total (y la parte del dinero para reinvertir). Falla con un mensaje
 * claro si no hay suficientes. */
async function takeStock(productId: number, option: string, quantity: number, label: string): Promise<TakenCost> {
  if (quantity <= 0) return { cost: 0, reinv: 0, reinvQty: 0 }
  const product = await loadProduct(productId)
  if (!product) throw new Error(`El producto ${label} ya no existe.`)
  if (tracksOptionStock(product) && !option) throw new Error(`Elige la opción (color/diseño) de ${product.name}.`)
  const available = optionStock(product, option)
  if (available < quantity) throw new Error(`No hay suficientes unidades de ${label} (quedan ${available}).`)
  const taken = await consumeFifoCost(product, option, quantity)
  await changeStock(productId, option, -quantity)
  return taken
}

/** Devuelve `quantity` unidades al inventario y a sus lotes (`reinvQty` de
 * ellas habían salido de lotes del dinero para reinvertir). */
async function returnStock(productId: number, option: string, quantity: number, reinvQty = 0) {
  if (quantity <= 0) return
  const product = await loadProduct(productId)
  if (!product) return // el producto se eliminó definitivamente: no hay a dónde devolver
  await returnToFifo(product, option, quantity, reinvQty)
  await changeStock(productId, option, quantity)
  await syncCurrentCost(productId)
}

/** El "costo actual" del producto es el del próximo lote que se va a
 * vender (FIFO). Si ya no quedan lotes con unidades, se deja como está. */
async function syncCurrentCost(productId: number) {
  const [nextBatch] = await db.select({ unitCost: purchases.unitCost }).from(purchases)
    .where(and(eq(purchases.productId, productId), gt(purchases.remainingQuantity, 0)))
    .orderBy(purchases.createdAt, purchases.id).limit(1)
  if (nextBatch) await db.update(products).set({ cost: nextBatch.unitCost }).where(eq(products.id, productId))
}

/** Revisa, ANTES de tocar nada, que alcance el inventario para todas las
 * líneas juntas. Suma por "cajón": el producto entero, o cada opción por
 * separado si el producto lleva cantidad por opción (dos líneas del mismo
 * producto sin cantidad por opción comparten el mismo cajón). */
function checkAvailability(lines: Array<{ productId: number; option: string; quantity: number }>, rows: ProductRow[]) {
  const totals = new Map<string, { product: ProductRow; option: string; quantity: number }>()
  for (const line of lines) {
    if (line.quantity <= 0) continue
    const product = rows.find((row) => row.id === line.productId)
    if (!product) throw new Error('Uno de los productos ya no existe.')
    const tracking = tracksOptionStock(product)
    if (tracking && !line.option) throw new Error(`Elige la opción (color/diseño) de ${product.name}.`)
    const key = tracking ? `${product.id}::${line.option}` : `${product.id}`
    const current = totals.get(key)
    totals.set(key, { product, option: tracking ? line.option : '', quantity: (current?.quantity ?? 0) + line.quantity })
  }
  for (const { product, option, quantity } of totals.values()) {
    const available = optionStock(product, option)
    if (available < quantity) throw new Error(`No hay suficientes unidades de ${lineName(product.name, option)} (quedan ${available}).`)
  }
}

/** Opción de una línea de pedido: la guardada o, en pedidos viejos, la que
 * viene en el nombre ("Producto — opción"). */
function itemOption(rows: ProductRow[], item: { id: number; name: string; option?: string }) {
  const product = rows.find((row) => row.id === item.id)
  return product ? resolveOption(product, item.option, item.name) : String(item.option || '')
}

/** Unidades de un mismo producto+opción dentro de un pedido, con lo que
 * costaron en total y la parte que salió del dinero para reinvertir. */
type CostPool = { quantity: number; cost: number; reinvCost: number; reinvQty: number }

/** Deja el grupo en `quantity` unidades (menos que antes): las que salen se
 * reparten entre las dos cajas en la misma proporción que tenía, y el costo
 * de cada caja baja en proporción. Devuelve también cuántas de las que
 * salen eran del dinero para reinvertir (para devolverlas a esos lotes). */
function shrinkPool(pool: CostPool, quantity: number): { kept: CostPool; removedReinvQty: number } {
  if (quantity <= 0 || pool.quantity <= 0) return { kept: { quantity: 0, cost: 0, reinvCost: 0, reinvQty: 0 }, removedReinvQty: pool.reinvQty }
  const removed = pool.quantity - quantity
  const capitalQty = pool.quantity - pool.reinvQty
  const removedReinvQty = Math.min(pool.reinvQty, Math.max(removed - capitalQty, Math.round((removed * pool.reinvQty) / pool.quantity)))
  const reinvQty = pool.reinvQty - removedReinvQty
  const reinvCost = pool.reinvQty > 0 ? Math.round((pool.reinvCost * reinvQty) / pool.reinvQty) : 0
  const capitalKept = capitalQty - (removed - removedReinvQty)
  const capitalCost = capitalQty > 0 ? Math.round((Math.max(0, pool.cost - pool.reinvCost) * capitalKept) / capitalQty) : 0
  return { kept: { quantity, cost: capitalCost + reinvCost, reinvCost, reinvQty }, removedReinvQty }
}

/** Reparte `total` según los pesos, redondeando sobre lo acumulado para que
 * la suma de las partes dé exacto el total (y ninguna parte pase de su peso
 * cuando el total no pasa de la suma de los pesos). */
function splitByWeight(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, weight) => acc + weight, 0)
  let accWeight = 0
  let previous = 0
  return weights.map((weight) => {
    accWeight += weight
    const upTo = sum > 0 ? Math.round((total * accWeight) / sum) : 0
    const part = upTo - previous
    previous = upTo
    return part
  })
}

// Mantenimiento (textos por defecto + limpieza de papelera): antes se
// hacía en CADA carga de la tienda y después de CADA acción del panel,
// lo que agregaba varias consultas lentas a Neon cada vez. Ahora se hace
// como máximo una vez cada 6 horas por instancia del Worker.
const MAINTENANCE_MS = 6 * 60 * 60 * 1000
let seededAt = 0
let cleanedAt = 0

async function ensureSeededThrottled() {
  if (Date.now() - seededAt < MAINTENANCE_MS) return
  await ensureSeeded()
  seededAt = Date.now()
}

async function cleanupThrottled() {
  if (Date.now() - cleanedAt < MAINTENANCE_MS) return
  cleanedAt = Date.now()
  await cleanupExpired()
}

const ORDER_STATUSES = ['Pendiente', 'Confirmado', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado']

async function ensureSeeded() {
  await db.insert(content).values(Object.entries(defaultContent).map(([key, value]) => ({ key, value }))).onConflictDoNothing()
  const existing = await db.select({ count: sql<number>`count(*)` }).from(products)
  if (Number(existing[0]?.count ?? 0) === 0) await db.insert(products).values(seedProducts)
}

async function requireAdmin() {
  const ok = await verifySession()
  if (!ok) throw new Error('Debes iniciar sesión para continuar.')
  await ensureSchema()
}

// Envía una imagen a la papelera de imágenes. Si la URL no es de una foto
// que subimos nosotros (a GitHub o a R2), ej. un placeholder de la semilla
// inicial o una URL externa pegada a mano, no hace nada.
async function trashImage(url: string, reason: string) {
  if (!url) return
  const path = imagePathFromUrl(env, url)
  if (!path) return
  await db.insert(imageTrash).values({ path, url, reason })
}

// Job de limpieza: borra definitivamente lo que lleva más de 30 días en
// papelera (productos, clientes, pedidos) y, por separado, lo que lleva
// más de 30 días en la papelera de imágenes. Se ejecuta de forma
// perezosa cada vez que se abre el panel admin (mismo espíritu que
// `ensureSeeded`), así no depende de configurar un cron aparte. Cada paso
// está aislado con try/catch para que un fallo puntual (ej. GitHub caído)
// no tumbe el resto de la limpieza.
async function cleanupExpired() {
  const cutoff = new Date(Date.now() - TRASH_MS)

  try {
    const expiredProducts = await db.select().from(products).where(and(isNotNull(products.deletedAt), lt(products.deletedAt, cutoff)))
    for (const product of expiredProducts) {
      await db.delete(products).where(eq(products.id, product.id))
      if (product.image) await trashImage(product.image, 'Producto eliminado definitivamente tras 30 días en papelera')
      for (const variant of product.variantImages || []) {
        if (variant.image) await trashImage(variant.image, 'Producto eliminado definitivamente tras 30 días en papelera')
      }
    }
  } catch { /* se reintenta en el próximo acceso al panel */ }

  try { await db.delete(customers).where(and(isNotNull(customers.deletedAt), lt(customers.deletedAt, cutoff))) } catch { /* idem */ }
  try { await db.delete(orders).where(and(isNotNull(orders.deletedAt), lt(orders.deletedAt, cutoff))) } catch { /* idem */ }

  try {
    const expiredImages = await db.select().from(imageTrash).where(lt(imageTrash.deletedAt, cutoff))
    for (const image of expiredImages) {
      try { await deleteImage(env, image.path) } catch { /* si GitHub o R2 fallan, se reintenta luego: la fila no se borra */ continue }
      await db.delete(imageTrash).where(eq(imageTrash.id, image.id))
    }
  } catch { /* idem */ }
}

async function findOrCreateCustomer(data: { name: string; email?: string; phone: string; address?: string }) {
  if (data.email) {
    const [existing] = await db.select().from(customers).where(eq(customers.email, data.email)).limit(1)
    if (existing) return existing
  }
  const [existingByPhone] = data.phone ? await db.select().from(customers).where(eq(customers.phone, data.phone)).limit(1) : []
  if (existingByPhone) return existingByPhone
  const [created] = await db.insert(customers).values({ name: data.name, email: data.email || '', phone: data.phone, address: data.address || '' }).returning()
  return created
}

// ───────────────────────────────────────────────────────────────────────
// SESIÓN
// ───────────────────────────────────────────────────────────────────────
export const login = createServerFn({ method: 'POST' })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const ok = await verifyPassword(String(data.password ?? ''))
    if (!ok) {
      // Pequeña espera en cada intento fallido: hace muy lento probar
      // contraseñas al azar (fuerza bruta) sin molestar al usarlo normal.
      await new Promise((resolve) => setTimeout(resolve, 1200))
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

// ───────────────────────────────────────────────────────────────────────
// TIENDA PÚBLICA
// ───────────────────────────────────────────────────────────────────────
export const getStorefront = createServerFn({ method: 'GET' }).handler(async () => {
  await ensureSchema()
  await ensureSeededThrottled()
  const [productRows, contentRows] = await Promise.all([
    db.select().from(products).where(and(eq(products.active, true), isNull(products.deletedAt))).orderBy(desc(products.featured), products.id),
    db.select().from(content),
  ])
  // El costo (lo que se pagó por cada producto) es solo para el panel: no
  // se manda a la tienda pública, donde cualquiera podría verlo en el
  // código de la página.
  const publicProducts = productRows.map(({ cost: _cost, ...product }) => product)
  const publicContent = Object.fromEntries(contentRows.filter((item) => !PRIVATE_CONTENT_KEYS.has(item.key)).map((item) => [item.key, item.value]))
  return { products: publicProducts, content: publicContent }
})

// Configuración privada guardada en la tabla `content` que la tienda no
// necesita (y que no debe verse en el código de la página).
const PRIVATE_CONTENT_KEYS = new Set(['capitalInicial', 'reinvestPercent', 'notificationEmail', 'vapidKeys'])

export const createOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; phone: string; email: string; address: string; website?: string; items: CartLine[] }) => data)
  .handler(async ({ data }) => {
    // Campo trampa: si viene lleno, lo mandó un robot. Se responde como si
    // todo hubiera salido bien, pero no se guarda nada ni se toca el stock.
    if (data.website) return { orderNumber: makeFolio('PED'), total: 0, orderId: 0 }
    if ((data.phone || '').replace(/\D/g, '').length < 10) throw new Error('Escribe un teléfono válido de 10 dígitos.')
    data = { ...data, name: String(data.name || '').trim().slice(0, 80), phone: String(data.phone || '').trim().slice(0, 30), email: String(data.email || '').trim().slice(0, 120), address: String(data.address || '').trim().slice(0, 300) }
    if (!data.name?.trim() || !data.phone?.trim() || !Array.isArray(data.items) || !data.items.length) throw new Error('Completa todos los datos del pedido.')
    // Las cantidades vienen del navegador del cliente: se validan aquí para
    // que nadie pueda mandar cantidades negativas o con decimales (eso
    // sumaría stock falso y daría totales negativos).
    for (const item of data.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw new Error('Hay una cantidad inválida en el carrito.')
    }
    await ensureSchema()
    const productRows = await db.select().from(products).where(and(inArray(products.id, data.items.map((item) => item.productId)), isNull(products.deletedAt), eq(products.active, true)))
    // Cada línea se amarra a su producto y a su opción (color/diseño). El
    // precio y el nombre siempre salen de la base de datos, nunca del
    // navegador del cliente.
    const lines = data.items.map((item) => {
      const product = productRows.find((row) => row.id === item.productId)
      if (!product) throw new Error(`El producto ${String(item.name || '').slice(0, 80) || 'que elegiste'} ya no está disponible.`)
      const option = resolveOption(product, item.option, item.name)
      if (parseOptions(product.options).length > 0 && !option) throw new Error(`Elige una opción (color/diseño) de ${product.name} antes de enviar el pedido.`)
      return { product, productId: product.id, option, quantity: item.quantity }
    })
    // Un mismo producto puede venir en varias líneas (una por opción): se
    // revisa todo junto antes de sacar nada del inventario.
    checkAvailability(lines, productRows)

    // El driver HTTP de Neon no soporta transacciones interactivas, así que
    // estas operaciones (consumo FIFO + descuento de stock) se hacen en
    // secuencia en vez de dentro de una tx.
    const calculated: OrderItem[] = []
    for (const line of lines) {
      const name = lineName(line.product.name, line.option)
      const taken = await takeStock(line.productId, line.option, line.quantity, name)
      calculated.push(withReinv({ id: line.productId, name, price: optionPrice(line.product, line.option), quantity: line.quantity, cost: Math.round(taken.cost / line.quantity), option: line.option }, taken.reinv, taken.reinvQty))
    }
    const total = calculated.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const customer = await findOrCreateCustomer(data)
    const orderNumber = makeFolio('PED')
    const createdAt = new Date()

    const [order] = await db.insert(orders).values({ orderNumber, customerId: customer.id, customerName: data.name, email: data.email, phone: data.phone, address: data.address, items: calculated, total, createdAt }).returning()

    const [notificationRow] = await db.select().from(content).where(eq(content.key, 'notificationEmail')).limit(1)
    if (notificationRow?.value) {
      const settings = Object.fromEntries((await db.select().from(content).where(inArray(content.key, ['currency', 'brandName']))).map((row) => [row.key, row.value]))
      await sendOrderNotificationEmail(env, notificationRow.value, { orderNumber, createdAt, customerName: data.name, email: data.email, phone: data.phone, address: data.address, total, currency: settings.currency || 'DOP', brandName: settings.brandName || 'Ritual Cobre', items: calculated })
    }

    // Aviso al teléfono (app del panel admin). Si algo falla aquí, el
    // pedido ya quedó guardado igual: nunca se le muestra error al cliente.
    try {
      const units = calculated.reduce((sum, item) => sum + item.quantity, 0)
      const names = calculated.map((item) => `${item.quantity}× ${item.name}`).join(', ')
      await notifyAdmins({
        title: `🛒 Nuevo pedido · ${formatMoney(total)}`,
        body: `${data.name} pidió ${units} ${units === 1 ? 'artículo' : 'artículos'}: ${names}`.slice(0, 220),
        url: '/admin?tab=pedidos',
        tag: orderNumber,
      })
    } catch { /* sin aviso, pero el pedido está bien */ }

    return { orderNumber, total, orderId: order.id }
  })

// ───────────────────────────────────────────────────────────────────────
// ADMIN — lectura
// ───────────────────────────────────────────────────────────────────────
export const getAdminData = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  await ensureSeededThrottled()
  await cleanupThrottled()
  const [productRows, orderRows, customerRows, contentRows, purchaseRows, expenseRows, trashedProducts, trashedOrders, trashedCustomers, trashedImages] = await Promise.all([
    db.select().from(products).where(isNull(products.deletedAt)).orderBy(desc(products.createdAt)),
    db.select().from(orders).where(isNull(orders.deletedAt)).orderBy(desc(orders.createdAt)),
    db.select().from(customers).where(isNull(customers.deletedAt)).orderBy(desc(customers.createdAt)),
    db.select().from(content),
    db.select().from(purchases).orderBy(desc(purchases.createdAt)),
    db.select().from(expenses).orderBy(desc(expenses.createdAt)),
    db.select().from(products).where(isNotNull(products.deletedAt)).orderBy(desc(products.deletedAt)),
    db.select().from(orders).where(isNotNull(orders.deletedAt)).orderBy(desc(orders.deletedAt)),
    db.select().from(customers).where(isNotNull(customers.deletedAt)).orderBy(desc(customers.deletedAt)),
    db.select().from(imageTrash).orderBy(desc(imageTrash.deletedAt)),
  ])
  return {
    products: productRows,
    orders: orderRows,
    customers: customerRows,
    content: Object.fromEntries(contentRows.filter((item) => item.key !== 'vapidKeys').map((item) => [item.key, item.value])),
    purchases: purchaseRows,
    expenses: expenseRows,
    trash: { products: trashedProducts, orders: trashedOrders, customers: trashedCustomers, images: trashedImages },
  }
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — catálogo
// ───────────────────────────────────────────────────────────────────────
export const saveProduct = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; category: string; description: string; options: string; price: number; originalPrice: number; stock: number; image: string; variantImages: ProductVariant[]; optionStock?: boolean; renames?: Array<{ from: string; to: string }>; featured: boolean; isNew: boolean; bestSeller: boolean; active: boolean }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = data.name.trim()
    if (!name) throw new Error('El nombre del producto es obligatorio.')
    const optionNames = parseOptions(data.options)
    const typedNames = String(data.options || '').split(',').map((item) => item.trim()).filter(Boolean)
    if (typedNames.length !== optionNames.length) throw new Error('Hay dos opciones con el mismo nombre. Cámbiale el nombre a una de ellas.')
    const isNew = !data.id
    const trackOptions = Boolean(data.optionStock) && optionNames.length > 0
    // Una entrada por cada opción vigente (foto, descripción, precio propio y
    // cantidad). Lo de opciones que ya se borraron no se guarda. Un producto
    // nuevo siempre empieza en 0: las unidades se suman con «Reponer», así
    // queda registrado lo que costaron.
    const variantImages: ProductVariant[] = optionNames.map((option) => {
      const entry = (data.variantImages || []).find((item) => item.option === option)
      return {
        option,
        image: String(entry?.image || ''),
        description: String(entry?.description || '').trim(),
        price: Math.max(0, Math.round(Number(entry?.price || 0))),
        stock: isNew ? 0 : Math.max(0, Math.round(Number(entry?.stock || 0))),
      }
    })
    const stock = isNew ? 0 : trackOptions ? variantImages.reduce((sum, entry) => sum + (entry.stock ?? 0), 0) : Math.max(0, Math.round(Number(data.stock) || 0))
    const values = { name, category: data.category || 'Otros', description: data.description.trim(), options: optionNames.join(', '), price: Math.max(0, Math.round(data.price)), originalPrice: Math.max(0, Math.round(data.originalPrice)), stock, image: data.image, variantImages, optionStock: trackOptions, featured: data.featured, isNew: data.isNew, bestSeller: data.bestSeller, active: data.active }
    if (data.id) {
      // Si se le cambió el nombre a una opción, sus lotes de compra la siguen.
      for (const rename of data.renames || []) {
        const from = String(rename.from || '').trim()
        const to = String(rename.to || '').trim()
        if (from && to && from !== to && optionNames.includes(to) && !optionNames.includes(from)) {
          await db.update(purchases).set({ option: to }).where(and(eq(purchases.productId, data.id), eq(purchases.option, from)))
        }
      }
      const [previous] = await db.select({ image: products.image, variantImages: products.variantImages }).from(products).where(eq(products.id, data.id)).limit(1)
      if (previous && previous.image && previous.image !== data.image) await trashImage(previous.image, 'Imagen reemplazada')
      const keptUrls = new Set(variantImages.map((entry) => entry.image).filter(Boolean))
      for (const old of previous?.variantImages || []) {
        if (old.image && !keptUrls.has(old.image)) await trashImage(old.image, 'Imagen de opción reemplazada')
      }
      await db.update(products).set(values).where(eq(products.id, data.id))
      return data.id
    }
    const [created] = await db.insert(products).values(values).returning({ id: products.id })
    return created.id
  })

export const deleteProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(products).set({ deletedAt: new Date() }).where(eq(products.id, data))
  return true
})

export const restoreProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(products).set({ deletedAt: null }).where(eq(products.id, data))
  return true
})

export const purgeProduct = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  const [product] = await db.select({ image: products.image, variantImages: products.variantImages }).from(products).where(eq(products.id, data)).limit(1)
  await db.delete(products).where(eq(products.id, data))
  if (product?.image) await trashImage(product.image, 'Producto eliminado definitivamente desde la papelera')
  for (const variant of product?.variantImages || []) {
    if (variant.image) await trashImage(variant.image, 'Producto eliminado definitivamente desde la papelera')
  }
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — pedidos
// ───────────────────────────────────────────────────────────────────────
export const updateOrderStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; status: string; paymentStatus: string; notes?: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!ORDER_STATUSES.includes(data.status) || !PAYMENT_STATUSES.includes(data.paymentStatus)) throw new Error('Estado inválido.')
    const [order] = await db.select().from(orders).where(eq(orders.id, data.id)).limit(1)
    if (!order) throw new Error('Ese pedido ya no existe.')
    const wasCancelled = order.status === 'Cancelado'
    const willBeCancelled = data.status === 'Cancelado'
    let items = order.items
    // Cancelar un pedido devuelve sus unidades al inventario (el cliente no
    // se lo llevó). Quitarle el "Cancelado" las vuelve a sacar — si todavía
    // hay stock suficiente; si no, avisa y no cambia nada.
    if (!wasCancelled && willBeCancelled) {
      const rows = await db.select().from(products).where(inArray(products.id, order.items.map((item) => item.id)))
      for (const item of order.items) await returnStock(item.id, itemOption(rows, item), item.quantity, item.reinvQty ?? 0)
    } else if (wasCancelled && !willBeCancelled) {
      const rows = await db.select().from(products).where(inArray(products.id, order.items.map((item) => item.id)))
      if (order.items.some((item) => !rows.some((row) => row.id === item.id))) throw new Error('Uno de los productos de este pedido ya no existe; no se puede reactivar.')
      const lines = order.items.map((item) => ({ productId: item.id, option: itemOption(rows, item), quantity: item.quantity }))
      checkAvailability(lines, rows)
      const next: OrderItem[] = []
      for (const [index, item] of order.items.entries()) {
        const option = lines[index].option
        const taken = await takeStock(item.id, option, item.quantity, item.name)
        // El costo (y de qué dinero salió) se vuelve a calcular: las unidades
        // pueden salir ahora de otros lotes que cuando se hizo el pedido.
        const { reinvCost: _reinvCost, reinvQty: _reinvQty, ...rest } = item
        next.push(withReinv({ ...rest, option, cost: Math.round(taken.cost / Math.max(1, item.quantity)) }, taken.reinv, taken.reinvQty))
      }
      items = next
    }
    await db.update(orders).set({ status: data.status, paymentStatus: data.paymentStatus, items, ...(data.notes !== undefined ? { notes: data.notes } : {}) }).where(eq(orders.id, data.id))
    return true
  })

export const updateOrder = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; customerName: string; email: string; phone: string; address: string; notes: string; items: OrderItem[]; discount?: number }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const customerName = data.customerName.trim()
    if (!customerName) throw new Error('El nombre del cliente es obligatorio.')
    if (!data.items.length) throw new Error('El pedido debe tener al menos un producto.')
    const [previous] = await db.select().from(orders).where(eq(orders.id, data.id)).limit(1)
    if (!previous) throw new Error('Ese pedido ya no existe.')
    const ids = [...new Set([...previous.items.map((item) => item.id), ...data.items.map((item) => Number(item.id))])]
    const rows = await db.select().from(products).where(inArray(products.id, ids))
    // Del navegador solo se toman nombre, cantidad y precio. El costo (y de
    // qué dinero salió) se calcula aquí, a partir del pedido anterior.
    const items: OrderItem[] = data.items.map((item) => {
      const clean = { id: Number(item.id), name: String(item.name || '').trim().slice(0, 200) || 'Producto', price: Math.max(0, Math.round(Number(item.price) || 0)), quantity: Math.max(1, Math.round(Number(item.quantity) || 1)), cost: 0, option: String(item.option || '') }
      return { ...clean, option: itemOption(rows, clean) }
    })
    // Se cuenta por producto Y por opción: cuántas unidades tenía el pedido,
    // lo que costaron en total y la parte del dinero para reinvertir.
    const keyOf = (item: { id: number; option?: string }) => `${item.id}::${item.option || ''}`
    const before = new Map<string, CostPool>()
    for (const item of previous.items) {
      const key = keyOf({ id: item.id, option: itemOption(rows, item) })
      const pool = before.get(key) ?? { quantity: 0, cost: 0, reinvCost: 0, reinvQty: 0 }
      pool.quantity += item.quantity
      pool.cost += item.cost * item.quantity
      pool.reinvCost += Math.max(0, item.reinvCost ?? 0)
      pool.reinvQty += Math.min(item.quantity, Math.max(0, item.reinvQty ?? 0))
      before.set(key, pool)
    }
    const after = new Map<string, number>()
    for (const item of items) after.set(keyOf(item), (after.get(keyOf(item)) ?? 0) + item.quantity)
    const changes = [...new Set([...before.keys(), ...after.keys()])].map((key) => {
      const [id, ...rest] = key.split('::')
      const pool = before.get(key) ?? { quantity: 0, cost: 0, reinvCost: 0, reinvQty: 0 }
      return { key, productId: Number(id), option: rest.join('::'), pool, extra: (after.get(key) ?? 0) - pool.quantity }
    })
    // Si cambió la cantidad de algún producto (o se quitó uno), el
    // inventario se ajusta solo: menos unidades = vuelven al stock (y a su
    // lote); más unidades = se sacan del stock. Un pedido cancelado no toca
    // el stock.
    const active = previous.status !== 'Cancelado'
    const increases = changes.filter((change) => change.extra > 0 && rows.some((row) => row.id === change.productId))
    if (active) checkAvailability(increases.map((change) => ({ productId: change.productId, option: change.option, quantity: change.extra })), rows)
    const pools = new Map<string, CostPool>()
    for (const change of changes) {
      if (change.extra >= 0) continue
      // Menos unidades: todo baja en proporción.
      const { kept, removedReinvQty } = shrinkPool(change.pool, change.pool.quantity + change.extra)
      if (active) await returnStock(change.productId, change.option, -change.extra, removedReinvQty)
      pools.set(change.key, kept)
    }
    for (const change of changes) {
      if (change.extra < 0) continue
      const pool = { ...change.pool }
      if (change.extra > 0) {
        if (active && increases.includes(change)) {
          // Más unidades: se suma lo que costaron las que se sacaron ahora.
          const target = items.find((item) => keyOf(item) === change.key)
          const taken = await takeStock(change.productId, change.option, change.extra, target?.name ?? 'un producto')
          pool.cost += taken.cost
          pool.reinvCost += taken.reinv
          pool.reinvQty += taken.reinvQty
        } else {
          // Pedido cancelado (no saca del inventario) o producto que ya no
          // existe: las unidades nuevas toman el costo promedio que ya tenía.
          const unitCost = pool.quantity > 0 ? pool.cost / pool.quantity : rows.find((row) => row.id === change.productId)?.cost ?? 0
          pool.cost += Math.round(unitCost * change.extra)
        }
        pool.quantity += change.extra
      }
      pools.set(change.key, pool)
    }
    // Cada grupo se reparte entre sus líneas (normalmente es una sola).
    for (const [key, pool] of pools) {
      const positions = items.flatMap((item, index) => (keyOf(item) === key ? [index] : []))
      if (!positions.length) continue
      const quantities = positions.map((position) => items[position].quantity)
      const reinvQtys = splitByWeight(pool.reinvQty, quantities)
      const reinvCosts = splitByWeight(pool.reinvCost, reinvQtys)
      const capitalWeights = quantities.map((quantity, index) => quantity - reinvQtys[index])
      const capitalCosts = splitByWeight(Math.max(0, pool.cost - pool.reinvCost), capitalWeights.some((weight) => weight > 0) ? capitalWeights : quantities)
      positions.forEach((position, index) => {
        const line = items[position]
        items[position] = withReinv({ ...line, cost: Math.round((capitalCosts[index] + reinvCosts[index]) / line.quantity) }, reinvCosts[index], reinvQtys[index])
      })
    }
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    // El descuento nunca puede ser negativo ni superar el subtotal, para
    // que el total del pedido jamás quede en números rojos.
    const discount = Math.min(subtotal, Math.max(0, Math.round(data.discount ?? 0)))
    const total = subtotal - discount
    await db.update(orders).set({ customerName, email: data.email.trim(), phone: data.phone.trim(), address: data.address.trim(), notes: data.notes.trim(), items, discount, total }).where(eq(orders.id, data.id))
    return true
  })

export const deleteOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(orders).set({ deletedAt: new Date() }).where(eq(orders.id, data))
  return true
})

export const restoreOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(orders).set({ deletedAt: null }).where(eq(orders.id, data))
  return true
})

export const purgeOrder = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(orders).where(eq(orders.id, data))
  return true
})

// Venta hecha POR FUERA de la web (en persona, por WhatsApp, etc.). Se
// registra como un pedido normal —ya entregado y pagado— para que salga en
// Pedidos, descuente el stock (FIFO) y cuente solo en Finanzas. El precio
// por unidad lo pone quien registra la venta (puede ser más bajo que el de
// la tienda, ej. una venta al por mayor).
export const recordManualSale = createServerFn({ method: 'POST' })
  .inputValidator((data: { customerName: string; phone: string; notes: string; paymentStatus: string; items: Array<{ productId: number; option: string; quantity: number; price: number }> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    if (!Array.isArray(data.items) || !data.items.length) throw new Error('Agrega al menos un producto.')
    const lines = data.items.map((item) => ({ productId: Number(item.productId), option: String(item.option || '').trim(), quantity: Math.round(Number(item.quantity)), price: Math.max(0, Math.round(Number(item.price))) }))
    for (const line of lines) {
      if (!line.productId) throw new Error('Elige el producto de cada línea.')
      if (!Number.isFinite(line.quantity) || line.quantity < 1) throw new Error('La cantidad debe ser 1 o más.')
      if (!Number.isFinite(line.price)) throw new Error('El precio no es válido.')
    }
    const rows = await db.select().from(products).where(inArray(products.id, [...new Set(lines.map((line) => line.productId))]))
    for (const line of lines) {
      const row = rows.find((item) => item.id === line.productId)
      if (!row) throw new Error('Uno de los productos ya no existe.')
      line.option = resolveOption(row, line.option)
      if (parseOptions(row.options).length > 0 && !line.option) throw new Error(`Elige la opción (color/diseño) de ${row.name}.`)
    }
    try {
      checkAvailability(lines, rows)
    } catch (caught) {
      throw new Error(`${caught instanceof Error ? caught.message : 'No hay suficientes unidades.'} Si tienes más, regístralas primero con «Reponer».`)
    }
    const items: OrderItem[] = []
    for (const line of lines) {
      const row = rows.find((item) => item.id === line.productId)!
      const name = lineName(row.name, line.option)
      const taken = await takeStock(row.id, line.option, line.quantity, name)
      items.push(withReinv({ id: row.id, name, price: line.price, quantity: line.quantity, cost: Math.round(taken.cost / line.quantity), option: line.option }, taken.reinv, taken.reinvQty))
    }
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    const customerName = String(data.customerName || '').trim().slice(0, 80) || 'Venta en tienda'
    const phone = String(data.phone || '').trim().slice(0, 30)
    const customer = phone ? await findOrCreateCustomer({ name: customerName, phone }) : null
    const orderNumber = makeFolio('VTA')
    await db.insert(orders).values({
      orderNumber, customerId: customer?.id ?? null, customerName, email: '', phone, address: '', items, total,
      status: 'Entregado', paymentStatus: PAYMENT_STATUSES.includes(data.paymentStatus) ? data.paymentStatus : 'Pagado',
      notes: ['Venta por fuera', String(data.notes || '').trim()].filter(Boolean).join(' · ').slice(0, 500),
    })
    return { orderNumber, total }
  })

// ───────────────────────────────────────────────────────────────────────
// ADMIN — contenido del sitio
// ───────────────────────────────────────────────────────────────────────
export const saveContent = createServerFn({ method: 'POST' }).inputValidator((data: Record<string, string>) => data).handler(async ({ data }) => {
  await requireAdmin()
  // Todo en UNA sola consulta (antes era una consulta por cada campo,
  // ~40 viajes a Neon uno tras otro: por eso "Guardar" tardaba tanto).
  const rows = Object.entries(data || {})
    .filter(([key]) => typeof key === 'string' && key.length > 0 && key.length <= 64)
    // Los correos de avisos se guardan limpios: "a@x.com, b@y.com".
    .map(([key, value]) => ({ key, value: key === 'notificationEmail' ? parseEmailList(String(value ?? '')).join(', ') : String(value ?? '') }))
  if (rows.length) await db.insert(content).values(rows).onConflictDoUpdate({ target: content.key, set: { value: sql`excluded.value` } })
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — clientes
// ───────────────────────────────────────────────────────────────────────
export const saveCustomer = createServerFn({ method: 'POST' })
  .inputValidator((data: { id?: number; name: string; email: string; phone: string; address: string; notes: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const name = data.name.trim()
    if (!name) throw new Error('El nombre es obligatorio.')
    const values = { name, email: data.email.trim(), phone: data.phone.trim(), address: data.address.trim(), notes: data.notes.trim() }
    if (data.id) {
      await db.update(customers).set(values).where(eq(customers.id, data.id))
      return data.id
    }
    const [created] = await db.insert(customers).values(values).returning({ id: customers.id })
    return created.id
  })

export const deleteCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, data))
  return true
})

export const restoreCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.update(customers).set({ deletedAt: null }).where(eq(customers.id, data))
  return true
})

export const purgeCustomer = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(customers).where(eq(customers.id, data))
  return true
})

// ───────────────────────────────────────────────────────────────────────
// ADMIN — Finanzas (compras y gastos)
// ───────────────────────────────────────────────────────────────────────

// Registra una compra/reposición de inventario: suma el stock del
// producto y crea un lote nuevo (las ventas consumen primero el lote más
// viejo — FIFO). Si se registró mal, se puede borrar (ver deletePurchase).
// `fund` dice con qué dinero se pagó: el del negocio o el de reinvertir.
export const recordPurchase = createServerFn({ method: 'POST' })
  .inputValidator((data: { productId: number; notes: string; fund?: Fund; lines: Array<{ option: string; quantity: number; unitCost: number }> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const fund: Fund = FUNDS.includes(data.fund as Fund) ? (data.fund as Fund) : 'capital'
    const product = await loadProduct(Number(data.productId))
    if (!product) throw new Error('Ese producto ya no existe.')
    const tracking = tracksOptionStock(product)
    const options = parseOptions(product.options)
    // Cada línea con cantidad es un lote aparte (en un producto con cantidad
    // por opción, un lote por cada opción que se compró).
    const lines = (Array.isArray(data.lines) ? data.lines : [])
      .map((line) => ({ option: tracking ? String(line.option || '').trim() : '', quantity: Math.round(Number(line.quantity)), unitCost: Math.max(0, Math.round(Number(line.unitCost))) }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0)
    if (!lines.length) throw new Error('Pon cuántas unidades compraste (al menos 1).')
    for (const line of lines) {
      if (!Number.isFinite(line.unitCost)) throw new Error('El costo no es válido.')
      if (tracking && !options.includes(line.option)) throw new Error('Elige la opción de cada compra.')
    }
    const notes = String(data.notes || '').trim().slice(0, 300)

    if (tracking) {
      const added = new Map<string, number>()
      for (const line of lines) added.set(line.option, (added.get(line.option) ?? 0) + line.quantity)
      const variants = normalizeVariants(product).map((entry) => ({ ...entry, stock: (entry.stock ?? 0) + (added.get(entry.option) ?? 0) }))
      const total = variants.reduce((sum, entry) => sum + (entry.stock ?? 0), 0)
      await db.update(products).set({ variantImages: variants, stock: total, cost: product.stock <= 0 ? lines[0].unitCost : product.cost }).where(eq(products.id, product.id))
    } else {
      // FIFO: este lote nuevo solo se vuelve "el costo actual" si ya no
      // queda stock de lotes anteriores (o sea, si es el próximo que se va a
      // consumir). Si todavía hay stock viejo, el costo mostrado no cambia
      // hasta que ese stock se agote.
      const quantity = lines.reduce((sum, line) => sum + line.quantity, 0)
      const newCost = product.stock <= 0 ? lines[0].unitCost : product.cost
      await db.update(products).set({ stock: product.stock + quantity, cost: newCost }).where(eq(products.id, product.id))
    }
    await db.insert(purchases).values(lines.map((line) => ({
      productId: product.id, productName: product.name, option: line.option, fund, quantity: line.quantity, unitCost: line.unitCost,
      totalCost: line.quantity * line.unitCost, remainingQuantity: line.quantity, notes,
    })))
    return { lots: lines.length, total: lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0), fund }
  })

// Elimina una compra registrada por error (ej. una de prueba). Solo
// resta del stock la parte de ese lote que TODAVÍA no se ha vendido
// (remainingQuantity) — lo que ya se vendió de ese lote se queda como
// está, porque esas ventas ya guardaron su propio costo y no se tocan.
// Al bajar su totalCost, ese dinero vuelve solo en Finanzas a la caja con
// que se pagó (Dinero del negocio o Dinero para reinvertir).
export const deletePurchase = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  const [purchase] = await db.select().from(purchases).where(eq(purchases.id, data)).limit(1)
  if (!purchase) throw new Error('Esa compra ya no existe.')
  if (purchase.remainingQuantity <= 0) throw new Error('Ese lote ya se vendió completo: no queda nada que quitar.')
  const sold = purchase.quantity - purchase.remainingQuantity
  if (sold > 0) {
    // Ya se vendieron unidades de este lote: esas ventas guardaron este
    // costo, así que el lote no se puede borrar entero sin descuadrar las
    // Finanzas (el Capital disponible subiría de más). En vez de borrarlo,
    // se reduce a lo que ya se vendió y solo se quita lo que queda.
    await db.update(purchases).set({ quantity: sold, remainingQuantity: 0, totalCost: sold * purchase.unitCost, notes: `${purchase.notes ? `${purchase.notes} · ` : ''}ajustada: se quitaron ${purchase.remainingQuantity} sin vender` }).where(eq(purchases.id, data))
  } else {
    await db.delete(purchases).where(eq(purchases.id, data))
  }
  const product = await loadProduct(purchase.productId)
  let adjustByHand = false
  if (product) {
    if (tracksOptionStock(product) && !purchase.option) {
      // Lote general (de antes de separar por opción): no se sabe de cuál
      // opción eran esas unidades, así que las cantidades no se tocan; el
      // panel avisa para corregirlas a mano en «Editar».
      adjustByHand = true
    } else {
      await changeStock(product.id, purchase.option, -purchase.remainingQuantity)
    }
    await syncCurrentCost(purchase.productId)
  }
  return { adjustByHand }
})

// Reparte un lote "general" (sin opción, ej. una compra registrada antes de
// separar por opción) entre las opciones del producto: "de estos 8 a 26,
// 3 son negro/amarillo y 5 son azul MagSafe". No cambia cuántas unidades
// hay ni el dinero gastado: solo deja claro de qué opción es cada unidad
// para que, al vender, cada opción salga con SU costo. Los lotes nuevos
// conservan la fecha del original, así siguen en su mismo turno (FIFO).
export const splitPurchase = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; parts: Array<{ option: string; quantity: number }> }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const [purchase] = await db.select().from(purchases).where(eq(purchases.id, Number(data.id))).limit(1)
    if (!purchase) throw new Error('Esa compra ya no existe.')
    if (purchase.option) throw new Error('Este lote ya pertenece a una opción.')
    if (purchase.remainingQuantity <= 0) throw new Error('De este lote ya no queda nada por repartir.')
    const product = await loadProduct(purchase.productId)
    if (!product) throw new Error('El producto de esta compra ya no existe.')
    const options = parseOptions(product.options)
    if (!options.length) throw new Error('Este producto no tiene opciones para repartir.')
    const byOption = new Map<string, number>()
    for (const part of Array.isArray(data.parts) ? data.parts : []) {
      const quantity = Math.round(Number(part.quantity))
      if (!Number.isFinite(quantity) || quantity <= 0) continue
      const option = String(part.option || '').trim()
      if (!options.includes(option)) throw new Error(`La opción «${option}» ya no existe en este producto.`)
      byOption.set(option, (byOption.get(option) ?? 0) + quantity)
    }
    const total = [...byOption.values()].reduce((sum, quantity) => sum + quantity, 0)
    if (total !== purchase.remainingQuantity) throw new Error(`Tienes que repartir exactamente ${purchase.remainingQuantity} (llevas ${total}).`)
    await db.insert(purchases).values([...byOption.entries()].map(([option, quantity]) => ({
      productId: purchase.productId, productName: purchase.productName, option, fund: purchase.fund, quantity, unitCost: purchase.unitCost,
      totalCost: quantity * purchase.unitCost, remainingQuantity: quantity, notes: purchase.notes, createdAt: purchase.createdAt,
    })))
    const sold = purchase.quantity - purchase.remainingQuantity
    if (sold > 0) {
      await db.update(purchases).set({ quantity: sold, remainingQuantity: 0, totalCost: sold * purchase.unitCost }).where(eq(purchases.id, purchase.id))
    } else {
      await db.delete(purchases).where(eq(purchases.id, purchase.id))
    }
    await syncCurrentCost(purchase.productId)
    return true
  })

// Registra un gasto del negocio o un gasto/retiro personal. `type`
// 'negocio' sale del Capital disponible (no toca la ganancia a repartir);
// 'personal' se resta de lo que ya le corresponde a la dueña, sin tocar la
// ganancia del negocio.
export const recordExpense = createServerFn({ method: 'POST' })
  .inputValidator((data: { type: 'negocio' | 'personal'; description: string; amount: number }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const description = data.description.trim()
    const amount = Math.max(0, Math.round(data.amount))
    if (!description) throw new Error('Escribe una descripción del gasto.')
    if (amount <= 0) throw new Error('El monto debe ser mayor a 0.')
    await db.insert(expenses).values({ type: data.type === 'personal' ? 'personal' : 'negocio', description, amount })
    return true
  })

export const deleteExpense = createServerFn({ method: 'POST' }).inputValidator((id: number) => id).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(expenses).where(eq(expenses.id, data))
  return true
})

// ───────────────────────────────────────────────────────────────────────
// NOTIFICACIONES AL TELÉFONO (app del panel admin) — ver src/lib/push.ts
// ───────────────────────────────────────────────────────────────────────
const PUSH_SUBJECT = SITE_URL

function formatMoney(cents: number) {
  return formatCurrency(cents, 'DOP')
}

/** Claves VAPID de la tienda: se crean solas la primera vez y se guardan
 * (juntas, en una sola fila) en la tabla de contenido. Nunca se mandan a
 * la tienda pública ni al panel. */
async function getVapidKeys(): Promise<VapidKeys> {
  const read = async () => {
    const [row] = await db.select().from(content).where(eq(content.key, 'vapidKeys')).limit(1)
    if (!row?.value) return null
    try { return JSON.parse(row.value) as VapidKeys } catch { return null }
  }
  const existing = await read()
  if (existing?.publicKey && existing.privateJwk) return existing
  const fresh = await generateVapidKeys()
  await db.insert(content).values({ key: 'vapidKeys', value: JSON.stringify(fresh) }).onConflictDoNothing()
  return (await read()) ?? fresh
}

async function sendToSubscriptions(rows: Array<{ id: number; endpoint: string; p256dh: string; auth: string }>, message: PushMessage) {
  if (!rows.length) return { sent: 0, failed: 0, problem: '' }
  const keys = await getVapidKeys()
  const results = await Promise.all(rows.map((row) => sendPush(row, message, keys, PUSH_SUBJECT)))
  // Si el servicio de avisos falló un momento (sin conexión, "muy ocupado"
  // o error de su lado), se intenta una vez más antes de rendirse.
  const retry = rows.map((_, index) => index).filter((index) => results[index].result === 'error' && (results[index].status === 0 || results[index].status === 429 || results[index].status >= 500))
  if (retry.length) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await Promise.all(retry.map(async (index) => { results[index] = await sendPush(rows[index], message, keys, PUSH_SUBJECT) }))
  }
  // Aparatos que ya no existen (app desinstalada o permiso quitado): fuera.
  const gone = rows.filter((_, index) => results[index].result === 'gone').map((row) => row.id)
  if (gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone))
  const firstProblem = results.find((item) => item.result !== 'ok')
  return {
    sent: results.filter((item) => item.result === 'ok').length,
    failed: results.filter((item) => item.result !== 'ok').length,
    problem: firstProblem ? `${firstProblem.result === 'gone' ? 'el aparato ya no acepta avisos' : 'error'} (código ${firstProblem.status || 'sin respuesta'}${firstProblem.detail ? `: ${firstProblem.detail}` : ''})` : '',
  }
}

async function notifyAdmins(message: PushMessage) {
  await ensureSchema()
  const rows = await db.select().from(pushSubscriptions)
  return sendToSubscriptions(rows, message)
}

/** Lo que la app necesita para activar las notificaciones en un aparato. */
export const getPushSetup = createServerFn({ method: 'GET' }).handler(async () => {
  await requireAdmin()
  const keys = await getVapidKeys()
  const rows = await db.select({ id: pushSubscriptions.id, endpoint: pushSubscriptions.endpoint, label: pushSubscriptions.label, createdAt: pushSubscriptions.createdAt }).from(pushSubscriptions).orderBy(desc(pushSubscriptions.createdAt))
  return { publicKey: keys.publicKey, devices: rows.map((row) => ({ id: row.id, endpoint: row.endpoint, label: row.label, createdAt: row.createdAt })) }
})

export const savePushSubscription = createServerFn({ method: 'POST' })
  .inputValidator((data: { endpoint: string; p256dh: string; auth: string; label: string }) => data)
  .handler(async ({ data }) => {
    await requireAdmin()
    const endpoint = String(data.endpoint || '')
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000) throw new Error('La suscripción del navegador no es válida.')
    if (!data.p256dh || !data.auth) throw new Error('Faltan las claves de la suscripción.')
    const values = { endpoint, p256dh: String(data.p256dh).slice(0, 200), auth: String(data.auth).slice(0, 100), label: String(data.label || '').slice(0, 80) }
    await db.insert(pushSubscriptions).values(values).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: values.p256dh, auth: values.auth, label: values.label } })
    return true
  })

export const removePushSubscription = createServerFn({ method: 'POST' }).inputValidator((endpoint: string) => endpoint).handler(async ({ data }) => {
  await requireAdmin()
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, String(data || '')))
  return true
})

/** Manda un aviso de prueba (a este aparato o, sin endpoint, a todos). */
export const sendTestPush = createServerFn({ method: 'POST' }).inputValidator((endpoint: string) => endpoint).handler(async ({ data }) => {
  await requireAdmin()
  const rows = data
    ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, String(data)))
    : await db.select().from(pushSubscriptions)
  if (!rows.length) throw new Error('Este aparato todavía no tiene las notificaciones activadas.')
  const result = await sendToSubscriptions(rows, { title: '🔔 Notificaciones activadas', body: 'Así te va a llegar cada pedido nuevo de la tienda.', url: '/admin?tab=pedidos', tag: 'prueba' })
  if (!result.sent) throw new Error(`No se pudo entregar la prueba: ${result.problem}. Toca «Activar notificaciones» otra vez.`)
  return result
})
