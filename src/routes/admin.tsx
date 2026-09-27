import { createFileRoute } from '@tanstack/react-router'
import { AdminPanel } from '@/components/AdminPanel'
import '../admin.css'

// El panel se puede instalar como app ("RC Admin") con su propio ícono y
// recibe las notificaciones de pedidos nuevos (ver public/admin-sw.js).
export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [
      { title: 'RC Admin — Ritual Cobre' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'theme-color', content: '#182431' },
      { name: 'apple-mobile-web-app-title', content: 'RC Admin' },
    ],
    // El manifest (lo que hace que Chrome ofrezca "Instalar app") NO va
    // aquí: lo agrega el panel solo DESPUÉS de entrar con la contraseña, así
    // nadie más ve la oferta de instalar el panel.
    links: [{ rel: 'apple-touch-icon', href: '/admin-192.png' }],
  }),
  component: AdminPanel,
})
