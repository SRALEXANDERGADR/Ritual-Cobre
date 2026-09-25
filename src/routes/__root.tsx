import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { SITE_URL } from '@/lib/format'

import '../styles.css'

const TITLE = 'Ritual Cobre — cuidado personal sensorial'
const DESCRIPTION = 'Fórmulas sensoriales para convertir lo cotidiano en un pequeño ritual de presencia. Aceites, bálsamos, brumas y jabones hechos en pequeños lotes.'
const IMAGE = `${SITE_URL}/assets/portada.png`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: TITLE },
      { name: 'description', content: DESCRIPTION },
      { name: 'theme-color', content: '#f4eee9' },
      { name: 'application-name', content: 'Ritual Cobre' },
      { name: 'apple-mobile-web-app-title', content: 'Ritual Cobre' },
      { property: 'og:site_name', content: 'Ritual Cobre' },
      { property: 'og:locale', content: 'es_DO' },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:image', content: IMAGE },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'Ritual Cobre — cuidado personal' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: SITE_URL },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: TITLE },
      { name: 'twitter:description', content: DESCRIPTION },
      { name: 'twitter:image', content: IMAGE },
    ],
    links: [
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <main className="not-found">
      <BrandMark className="not-found-mark" />
      <span>ERROR 404</span>
      <h1>Esta página se tomó una pausa.</h1>
      <p>El enlace que abriste no existe o fue movido. Vuelve a la tienda para seguir explorando.</p>
      <Link to="/" className="primary-button"><ArrowLeft /> Volver a la tienda</Link>
    </main>
  )
}
