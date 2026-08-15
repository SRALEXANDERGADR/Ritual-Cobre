import {
  boolean,
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const products = pgTable(
  'products',
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    slug: text().notNull(),
    category: text().notNull(),
    description: text().notNull().default(''),
    price: integer().notNull(),
    stock: integer().notNull().default(0),
    image: text().notNull().default(''),
    featured: boolean().notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('products_slug_idx').on(table.slug), index('products_category_idx').on(table.category)],
)

export const customers = pgTable(
  'customers',
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    email: text().notNull().default(''),
    phone: text().notNull().default(''),
    address: text().notNull().default(''),
    notes: text().notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('customers_email_idx').on(table.email), index('customers_name_idx').on(table.name)],
)

export const orders = pgTable(
  'orders',
  {
    id: serial().primaryKey(),
    orderNumber: text('order_number').notNull(),
    customerId: integer('customer_id').references(() => customers.id),
    customerName: text('customer_name').notNull(),
    email: text().notNull().default(''),
    phone: text().notNull().default(''),
    address: text().notNull().default(''),
    items: json().notNull().$type<Array<{ productId: number; name: string; price: number; quantity: number; image: string }>>(),
    total: integer().notNull(),
    status: text().notNull().default('Pendiente'),
    paymentStatus: text('payment_status').notNull().default('Pendiente'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('orders_number_idx').on(table.orderNumber), index('orders_customer_idx').on(table.customerId)],
)

export const content = pgTable('content', {
  key: text().primaryKey(),
  value: text().notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})
