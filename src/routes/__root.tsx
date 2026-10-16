import { HeadContent, Link, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { GadrDemo } from '@/components/GadrDemo'
import { SITE_URL } from '@/lib/format'
import { getPlanInfo } from '@/lib/store'

import '../styles.css'
import '../gadr-demo.css'

const TITLE = 'Ritual Cobre — cuidado personal sensorial'
const DESCRIPTION = 'Fórmulas sensoriales para convertir lo cotidiano en un pequeño ritual de presencia. Aceites, bálsamos, brumas y jabones hechos en pequeños lotes.'
const IMAGE = `${SITE_URL}/assets/portada.png`

// En la demo, cualquier dirección acepta ?plan=basico|profesional|completo.
// Este mini-script lo guarda en la cookie «gadr_plan» (30 días) ANTES de que
// cargue la página, para que todo lo que se pida después ya vaya con ese plan.
// En la web de un cliente (plan fijo) la cookie no se usa para nada.
const PLAN_SCRIPT = "(function(){try{var m=location.search.match(/[?&]plan=(basico|profesional|completo)(?:&|$)/);if(m){document.cookie='gadr_plan='+m[1]+';max-age=2592000;path=/;samesite=lax'}}catch(e){}})()"

export const Route = createRootRoute({
  // Plan de la visita: lo usa la barrita de la demo. Se pide una sola vez por
  // sesión; para cambiar de plan en la demo se recarga la página.
  loader: () => getPlanInfo(),
  staleTime: Infinity,
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
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootComponent,
  notFoundComponent: NotFound,
})

function RootComponent() {
  const { plan, demo } = Route.useLoaderData()
  return (
    <>
      {/* Barra de la demo de GADR (solo con PLAN = "demo"). Va antes de la
          página para guardar la cookie del plan antes de pedir datos. */}
      <GadrDemo plan={plan} demo={demo} web="Ritual Cobre" />
      <Outlet />
    </>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: PLAN_SCRIPT }} />
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
