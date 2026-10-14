# Project Guide

## Architecture

Ritual Cobre is a TanStack Start ecommerce application deployed on Cloudflare Workers. Public storefront data and admin operations use TanStack server functions. Structured records persist in Postgres on Neon (via Drizzle's `neon-http` driver), uploaded images are committed to a GitHub repo via the Contents API and served from `raw.githubusercontent.com`, admin authentication is a single shared ADMIN_PASSWORD secret with a signed session cookie, and new orders optionally trigger an email notification via Resend.

## Key Directories

- `src/routes/`: File-based routes for the storefront, policies, admin panel, and the `/api/upload` server route.
- `src/components/`: Main interactive storefront and admin interfaces.
- `src/lib/store.ts`: Server functions, initial seed content, and database operations.
- `src/lib/auth.ts`: ADMIN_PASSWORD check and signed session cookie helpers.
- `src/lib/github.ts` / `src/lib/fotos.ts`: Upload and delete images (GitHub Contents API; `fotos.ts` would use an R2 binding `FOTOS` if one is ever added).
- `src/lib/variants.ts`: Per-option price and stock (options like scent or size), shared by store, admin and server.
- `src/lib/push.ts`: Web Push (hand-rolled WebCrypto) for the installable admin app «RC Admin» (`public/admin-sw.js`, `public/admin.webmanifest`).
- `src/admin.css`: Admin styles, all scoped under `.rc-admin` (ported from JB Tech Store's panel with Ritual Cobre colors).
- `src/lib/email.ts`: Sends the "new order" notification email via Resend.
- `db/`: Drizzle Postgres schema and Neon client.
- `db/migrations/`: Generated via `pnpm db:generate`, applied via `pnpm db:migrate` (needs `DATABASE_URL` in the environment).
- `wrangler.jsonc`: Cloudflare Worker config. No bindings are needed — DB and image storage are reached over HTTP using secrets (`DATABASE_URL`, `GITHUB_TOKEN`, `GITHUB_REPO`, `RESEND_API_KEY`).

## Conventions

- Use TypeScript and functional React components.
- Keep prices as integer cents in the database and application state.
- Keep user-facing copy in Spanish.
- Use Neon Postgres for queryable records and GitHub (Contents API) for uploaded files.
- Protect every administrative server mutation with `requireAdmin()` / `verifySession()`.
- Generate a migration after every schema change with `pnpm db:generate`.
- Preserve the terracotta, dusty rose, lavender, and ink visual direction unless the product owner requests a redesign.

## Admin panel (ported from JB Tech Store, Sept 2026)

- Tabs: Inicio, Productos, Pedidos, Finanzas, Clientes, Textos, Papelera. Includes FIFO purchase lots («Reponer»), manual sales, order editing with discounts, 30-day trash (products, orders, customers, images), per-option price/stock, Finanzas (business money / money to reinvest / owner's withdrawable), and push notifications for new orders.
- New tables/columns are created automatically by `ensureSchema()` in `store.ts` (ALTER ... IF NOT EXISTS); no manual migration is needed. The old `products.slug` column is kept but no longer required.
- Money is stored in cents; the currency comes from the `currency` content key (default DOP).

## Non-obvious Decisions

- Checkout creates an internal order instead of processing card payments. Payment and delivery are coordinated after submission, matching the requested order workflow.
- Default products and editable content are inserted lazily on first data access, keeping a fresh deployment immediately usable.
- Admin login is a single shared password stored as the `ADMIN_PASSWORD` Worker secret, verified server-side, backed by an HMAC-signed session cookie (`SESSION_SECRET` secret). There is no per-user account system.
- Uploaded images are limited to image MIME types and 8 MB, and are committed straight to the app's GitHub repo (`GITHUB_UPLOAD_PATH`, default `public/uploads`) rather than an object store — no bucket to provision.
- Customers can be created automatically at checkout, or added/edited manually from the admin panel (unlike checkout, manual entries don't require an email).
- The order notification email is only sent if `RESEND_API_KEY` is set AND a destination address is saved in the content editor's "Notificaciones" group (`notificationEmail`). Missing configuration never blocks order creation.

## Planes (Básico · Profesional · Completo)

Es el MISMO código para los tres planes; el plan lo decide la variable `PLAN` de `wrangler.jsonc` (`vars`):

- `"demo"` → la web de muestra en venta (valor actual). El plan se escoge con `?plan=basico|profesional|completo` en cualquier dirección; se recuerda 30 días en la cookie `gadr_plan`. Sin `?plan` y sin cookie = completo. Abajo sale la barrita «Demo · Plan X · Cambiar plan · Ver precios» (`src/components/PlanBar.tsx`), solo en modo demo.
- `"basico"`, `"profesional"` o `"completo"` → web ya vendida a un cliente: el plan queda fijo, la dirección no lo cambia y no sale la barrita.
- Sin `PLAN` (o con un valor raro) → se comporta como `completo`.

**Dónde se cambia qué lleva cada plan:** `src/lib/plan.ts` (`FUNCIONES`: cada función y su plan mínimo; `puede(plan, función)`). Nada de `if (plan === …)` regado por el código: todo pregunta ahí. `src/lib/plan-server.ts` decide el plan de cada visita (`planActual()`) y rechaza lo no incluido (`requierePlan()`, mensaje «Esta función no está incluida en tu plan»).

| Función | Básico | Profesional | Completo |
|---|---|---|---|
| Catálogo, fotos, precios, categorías, buscador, textos, políticas, existencias | sí | sí | sí |
| «Pedir por WhatsApp» en cada producto (en lugar de la bolsa) | sí | — | — |
| Carrito y pedido desde la web (`carrito`) | — | sí | sí |
| Opciones por producto con precio, foto y cantidad (`opciones`) | — | sí | sí |
| Pedidos en el panel, estados, factura PDF, descuentos, venta por fuera (`pedidos`) | — | sí | sí |
| Clientes (`clientes`) y métodos de pago en la tienda (`metodosPago`) | — | sí | sí |
| Compras por lotes «Reponer» (`lotes`) | — | — | sí |
| Finanzas y gastos (`finanzas`) | — | — | sí |
| App «RC Admin» con avisos al teléfono (`app`) | — | — | sí |
| Aviso por correo de cada pedido (`avisosCorreo`) | — | — | sí |
| Papelera de 30 días (`papelera`) | — | — | sí |

Cómo se aplica:

- **Tienda pública:** lo que el plan no incluye no sale (sin botones muertos). En Básico, en vez de «Agregar» sale «Pedir por WhatsApp»; sin bolsa ni pedido. `getStorefront` también quita las opciones y los métodos de pago de lo que manda a la tienda.
- **Panel, web de un cliente:** las pestañas y botones del plan que no se tiene no salen. **Panel, modo demo:** salen con candado y «Disponible en el plan …».
- **Servidor:** cada función de `store.ts` llama a `requierePlan()`. `getAdminData` solo lee y manda lo que el plan incluye. `saveContent` ignora los textos de funciones no incluidas (no los borra).
- **Cambiar de plan NUNCA borra datos.** Al bajar, lo que sobra se esconde (los pedidos, compras, gastos, opciones y papelera siguen guardados); al subir, vuelve a salir. `saveProduct` conserva las opciones de un producto aunque el plan no las muestre.
- **Existencias sin lotes (Básico y Profesional):** la cantidad se escribe directo en el producto (nuevo o existente) y, en Profesional, al vender sigue bajando sola. Solo con lotes (Completo) un producto nuevo empieza en 0 y se llena con «Reponer». Si luego se sube a Completo, esas unidades salen como «Sin costo registrado» hasta registrar sus compras.
- **Lo que esta web NO tiene** (así que no está en ningún plan): «Mis pedidos» para el cliente, compartir artículo, socios y garantía.

**`public/gadr-planes.json`** lo lee gadrnet.com (formato fijo; precios en pesos enteros; `demo` es relativo a la web). `public/_headers` le pone CORS abierto para poder leerlo desde otro sitio. Si cambia el reparto de arriba, actualiza también ese archivo.

**Probar:** abrir `/?plan=basico`, `/?plan=profesional` y `/?plan=completo` (y `/admin` en cada uno) en tamaño de teléfono. En Completo todo debe funcionar igual que antes.

