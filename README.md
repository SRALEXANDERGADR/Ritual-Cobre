# Ritual Cobre

Tienda online completa de cuidado personal con catálogo filtrable, carrito lateral, checkout por pedido, página de políticas y panel administrativo protegido. El diseño usa una identidad editorial en terracota, rosa empolvado, lavanda y azul tinta, con una composición asimétrica propia.

## Tecnologías

- TanStack Start, React 19 y TypeScript
- Tailwind CSS 4 y CSS personalizado
- **Postgres en Neon** con Drizzle ORM para productos, clientes, pedidos y contenido
- **GitHub (API de Contents)** para alojar las imágenes subidas desde el panel — se sirven desde `raw.githubusercontent.com`, sin necesidad de crear buckets
- Sesión de administrador protegida con `ADMIN_PASSWORD` (Cloudflare Secret) + cookie firmada con `SESSION_SECRET`
- Aviso automático por correo (Resend) cada vez que un cliente completa un pedido
- Cloudflare Workers (vía `@cloudflare/vite-plugin`) para hosting y API

## Panel de administración

- **Resumen**: métricas de pedidos, saldos pendientes, productos y stock bajo, más actividad reciente.
- **Productos**: crear, editar, eliminar y subir imágenes (URL o archivo).
- **Clientes**: registrar, editar y eliminar clientes manualmente, además de los que se crean solos al hacer checkout.
- **Facturas / pedidos**: cambiar estado y estado de pago, buscar, descargar el pedido como PDF, compartir por WhatsApp y eliminar.
- **Editor de contenido**: todos los textos e imágenes del sitio, incluyendo el correo que recibe el aviso de nuevos pedidos.
- Búsqueda incluida en productos, clientes y pedidos.

## Novedades (v2)

- **Identidad**: isotipo propio (arco de cobre con gota) en tienda, panel, facturas y 404; favicon, ícono para iPhone/Android (`public/`), `site.webmanifest` y portada para redes (`public/assets/portada.png`, 1200×630).
- **Tienda**: cabecera fija, vista rápida de producto, orden por precio/nombre, etiquetas «Favorito» y «Últimas unidades», bolsa que se conserva al recargar, nota en el pedido, botón flotante y confirmación por WhatsApp, página 404.
- **Políticas**: seis secciones editables desde el panel (privacidad, pedidos, envíos, devoluciones, términos y contacto).
- **Panel**: resumen con cobrado / por cobrar / ticket promedio, stock bajo y más vendidos; detalle completo de cada pedido; filtros por estado y categoría; precios en unidades normales (no centavos); vista previa de imágenes; avisos de guardado; navegación inferior en móvil.
- **Moneda configurable** (USD, DOP, EUR, MXN, COP) desde **Editor de contenido → Tienda y contacto**.
- **Seguridad**: validación completa del pedido en el servidor (cantidades, stock, datos), reserva de stock sin sobreventa, la factura escapa el texto de los clientes, el correo de avisos ya no se expone en la tienda pública, comparación de contraseña en tiempo constante.
- **Inventario**: al cancelar un pedido las unidades vuelven al stock (y se descuentan otra vez si se reactiva). Al eliminar un pedido pendiente o en preparación, también.
- La URL pública usada en las etiquetas de redes está en `src/lib/format.ts` (`SITE_URL`).

## Desarrollo local

1. Instala dependencias con `pnpm install`.
2. Copia `.dev.vars.example` a `.dev.vars` y completa los valores (ver abajo).
3. Genera tipos de bindings: `pnpm cf-typegen`.
4. Inicia el entorno local: `pnpm dev`.
5. Abre `http://localhost:3000`.

## Configuración inicial (Cloudflare + Neon + GitHub)

1. Crea un proyecto en [Neon](https://neon.tech), copia la cadena de conexión y guárdala como secreto: `wrangler secret put DATABASE_URL`.
2. Genera y aplica las migraciones: `pnpm db:generate` y luego `pnpm db:migrate` (usa `DATABASE_URL` en tu entorno local para migrar).
3. Crea un token de GitHub con permiso de escritura sobre el repo donde se guardarán las imágenes, y define los secretos: `wrangler secret put GITHUB_TOKEN` y `wrangler secret put GITHUB_REPO` (formato `usuario/repositorio`). Opcionalmente `GITHUB_BRANCH` y `GITHUB_UPLOAD_PATH`.
4. Define los secretos de acceso: `wrangler secret put ADMIN_PASSWORD` y `wrangler secret put SESSION_SECRET`.
5. (Opcional) Para recibir el aviso por correo de cada pedido, crea una cuenta en [Resend](https://resend.com) y define `wrangler secret put RESEND_API_KEY` (y opcionalmente `RESEND_FROM_EMAIL`). Luego escribe el correo de destino en **Panel administrativo → Editor de contenido → Notificaciones**.
6. Despliega: `pnpm deploy`.
7. Actualiza el número de WhatsApp y todos los textos desde **Panel administrativo → Editor de contenido**.
