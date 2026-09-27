import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'
import { SITE_URL } from '@/lib/format'

export const Route = createFileRoute('/')({
  loader: () => getStorefront(),
  // La tienda y el panel admin son 2 "apps" distintas al instalarlas: cada
  // página trae su propio manifest (el del panel se agrega en /admin al entrar).
  head: () => ({ links: [{ rel: 'canonical', href: `${SITE_URL}/` }, { rel: 'manifest', href: '/site.webmanifest' }] }),
  component: Home,
})

function Home() {
  return <Storefront data={Route.useLoaderData()} />
}
