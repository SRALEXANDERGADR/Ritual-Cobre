import { createFileRoute } from '@tanstack/react-router'
import { Storefront } from '@/components/Storefront'
import { getStorefront } from '@/lib/store'
import { SITE_URL } from '@/lib/format'

export const Route = createFileRoute('/')({
  loader: () => getStorefront(),
  head: () => ({ links: [{ rel: 'canonical', href: `${SITE_URL}/` }] }),
  component: Home,
})

function Home() {
  return <Storefront data={Route.useLoaderData()} />
}
