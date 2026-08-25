import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Ritual Cobre — cuidado personal sensorial',
      },
      {
        name: 'description',
        content: 'Fórmulas sensoriales para convertir lo cotidiano en un pequeño ritual de presencia.',
      },
      {
        property: 'og:title',
        content: 'Ritual Cobre — cuidado personal sensorial',
      },
      {
        property: 'og:description',
        content: 'Fórmulas sensoriales para convertir lo cotidiano en un pequeño ritual de presencia.',
      },
      {
        property: 'og:image',
        content: 'https://ritualcobre.gadrnet.workers.dev/assets/portada.png',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:url',
        content: 'https://ritualcobre.gadrnet.workers.dev',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'Ritual Cobre — cuidado personal sensorial',
      },
      {
        name: 'twitter:description',
        content: 'Fórmulas sensoriales para convertir lo cotidiano en un pequeño ritual de presencia.',
      },
      {
        name: 'twitter:image',
        content: 'https://ritualcobre.gadrnet.workers.dev/assets/portada.png',
      },
    ],
  }),
  shellComponent: RootDocument,
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

