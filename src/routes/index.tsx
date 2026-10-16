import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'
import { SITE_URL } from '@/lib/format'

export const Route = createFileRoute('/')({
  loader: () => getStorefront(),
  // La tienda y el panel admin son 2 "apps" distintas al instalarlas: cada
  // página trae su propio manifest (el del panel se agrega en /admin al entrar).
  // El tamaño de la portada va aquí (no en __root) para no aplicárselo a las
  // fotos de los productos en los enlaces de «Recomendar».
  head: () => ({
    meta: [{ property: 'og:image:width', content: '1200' }, { property: 'og:image:height', content: '630' }],
    links: [{ rel: 'canonical', href: `${SITE_URL}/` }, { rel: 'manifest', href: '/site.webmanifest' }],
  }),
  component: Home,
})

function Home() {
  return <Storefront data={Route.useLoaderData()} />
}
