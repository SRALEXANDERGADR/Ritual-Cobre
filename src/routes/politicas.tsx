import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Mail, MessageCircle } from 'lucide-react'
import { getStorefront } from '@/lib/store'
import { SITE_URL, whatsappLink } from '@/lib/format'
import { BrandLogo } from '@/components/BrandMark'

export const Route = createFileRoute('/politicas')({
  loader: () => getStorefront(),
  head: () => ({
    meta: [
      { title: 'Políticas de la tienda — Ritual Cobre' },
      { name: 'description', content: 'Privacidad, pedidos y pagos, envíos, cambios y devoluciones, y términos de compra de Ritual Cobre.' },
      { property: 'og:url', content: `${SITE_URL}/politicas` },
    ],
    links: [{ rel: 'canonical', href: `${SITE_URL}/politicas` }],
  }),
  component: Policies,
})

const SECTIONS = [
  { id: 'privacidad', key: 'policyPrivacy', title: 'Privacidad' },
  { id: 'pedidos', key: 'policyOrders', title: 'Pedidos y pagos' },
  { id: 'envios', key: 'policyShipping', title: 'Envíos y entregas' },
  { id: 'devoluciones', key: 'policyReturns', title: 'Cambios y devoluciones' },
  { id: 'terminos', key: 'policyTerms', title: 'Términos de compra' },
  { id: 'contacto', key: 'policyContact', title: 'Contacto' },
]

function Policies() {
  const { content: copy } = Route.useLoaderData()
  const brand = copy.brandName || 'Ritual Cobre'
  const whatsapp = whatsappLink(copy.whatsapp)
  return (
    <main className="policies-page">
      <div className="policies-top">
        <Link to="/" className="back-link"><ArrowLeft /> Volver a la tienda</Link>
        <Link to="/" aria-label={brand}><BrandLogo name={brand} /></Link>
      </div>
      <div className="policies-title">
        <span>{brand.toUpperCase()} · INFORMACIÓN LEGAL</span>
        <h1>Políticas claras,<br />relaciones tranquilas.</h1>
        <p>Última actualización: {copy.policiesUpdated}</p>
        <nav className="policy-index" aria-label="Secciones">
          {SECTIONS.map((section, index) => <a key={section.id} href={`#${section.id}`}>{String(index + 1).padStart(2, '0')} · {section.title}</a>)}
        </nav>
      </div>
      <div className="policy-grid">
        {SECTIONS.map((section, index) => (
          <article key={section.id} id={section.id}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h2>{section.title}</h2>
            {String(copy[section.key] ?? '').split(/\n{2,}/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
          </article>
        ))}
      </div>
      <section className="policy-help">
        <div>
          <span>¿TIENES DUDAS?</span>
          <h2>Estamos para ayudarte.</h2>
          <p>{copy.schedule}</p>
        </div>
        <div className="policy-help-actions">
          {whatsapp && <a className="primary-button" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> Escribir por WhatsApp</a>}
          {copy.contactEmail && <a className="ghost-button" href={`mailto:${copy.contactEmail}`}><Mail /> {copy.contactEmail}</a>}
          <Link to="/" className="ghost-button">Ir a la tienda <ArrowRight /></Link>
        </div>
      </section>
    </main>
  )
}
