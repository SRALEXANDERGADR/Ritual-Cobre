import { createFileRoute } from '@tanstack/react-router'
import { AdminPanel } from '@/components/AdminPanel'

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'Panel de administración — Ritual Cobre' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AdminPanel,
})
