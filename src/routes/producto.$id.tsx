import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'
import { SITE_URL, formatMoney } from '@/lib/format'
import { priceRange } from '@/lib/variants'

// Enlace para recomendar UN producto: /producto/<id>. Abre la tienda con la
// ficha de ese producto ya abierta y, al pegarlo en WhatsApp o Facebook, sale
// con su foto, su nombre y su precio. (El botón «Recomendar» es del plan
// Completo; el enlace funciona en cualquier plan.)
export const Route = createFileRoute('/producto/$id')({
  loader: async ({ params }) => {
    const data = await getStorefront()
    const product = data.products.find((item) => item.id === Number(params.id)) ?? null
    return { data, product }
  },
  head: ({ loaderData, params }) => {
    const links = [{ rel: 'manifest', href: '/site.webmanifest' }, { rel: 'canonical', href: `${SITE_URL}/producto/${params.id}` }]
    const product = loaderData?.product
    if (!product || !loaderData) return { links }
    const brand = loaderData.data.content.brandName || 'Ritual Cobre'
    const range = priceRange(product)
    const price = `${range.min !== range.max ? 'Desde ' : ''}${formatMoney(range.min, loaderData.data.content.currency || 'DOP')}`
    const image = new URL(product.image || '/assets/portada.png', SITE_URL).toString()
    const title = `${product.name} · ${brand}`
    const description = `${price} · ${(product.description || `Pídelo en ${brand} y coordina la entrega por WhatsApp.`).replace(/\s+/g, ' ').trim()}`.slice(0, 200)
    return {
      links,
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:type', content: 'product' },
        { property: 'og:url', content: `${SITE_URL}/producto/${params.id}` },
        { property: 'og:image', content: image },
        { property: 'og:image:alt', content: product.name },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
      ],
    }
  },
  component: ProductLink,
})

function ProductLink() {
  const { data, product } = Route.useLoaderData()
  return <Storefront data={data} initialProductId={product?.id} />
}
