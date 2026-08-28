import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, ChevronDown, Menu, Minus, Plus, Search, ShoppingBag, Sparkles, Trash2, X } from 'lucide-react'
import { createOrder, type CartLine } from '@/lib/store'

type Product = { id: number; name: string; category: string; description: string; price: number; stock: number; image: string; featured: boolean }
type Props = { data: { products: Product[]; content: Record<string, string> } }

const money = (value: number) => new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(value / 100)

export function Storefront({ data }: Props) {
  const { products, content: copy } = data
  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [confirmation, setConfirmation] = useState<{ orderNumber: string; total: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const categories = ['Todos', ...Array.from(new Set(products.map((product) => product.category)))]
  const visibleProducts = useMemo(() => products.filter((product) => (category === 'Todos' || product.category === category) && `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase())), [products, category, query])
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) return current.map((line) => line.productId === product.id ? { ...line, quantity: Math.min(line.quantity + 1, product.stock) } : line)
      return [...current, { productId: product.id, name: product.name, price: product.price, quantity: 1, image: product.image }]
    })
    setCartOpen(true)
  }

  const changeQuantity = (id: number, delta: number) => setCart((current) => current.flatMap((line) => {
    if (line.productId !== id) return [line]
    const product = products.find((item) => item.id === id)
    const quantity = Math.min(line.quantity + delta, product?.stock ?? line.quantity)
    return quantity > 0 ? [{ ...line, quantity }] : []
  }))

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await createOrder({ data: { name: String(form.get('name')), phone: String(form.get('phone')), email: String(form.get('email')), address: String(form.get('address')), items: cart } })
      setConfirmation(result)
      setCart([])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos enviar el pedido.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="site-shell">
    <header className="topbar">
      <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button>
      <a className="wordmark" href="#inicio"><span>RC</span>{copy.brandName}</a>
      <nav className="desktop-nav"><a href="#catalogo">{copy.navCatalog}</a><a href="#beneficios">{copy.navBenefits}</a><a href="#contacto">{copy.navContact}</a></nav>
      <button className="cart-button" onClick={() => setCartOpen(true)}><ShoppingBag size={19}/><span>Bolsa</span><b>{cartCount}</b></button>
    </header>

    <div className={`overlay ${menuOpen ? 'visible' : ''}`} onClick={() => setMenuOpen(false)} />
    <aside className={`side-menu ${menuOpen ? 'open' : ''}`}>
      <div className="drawer-head"><span className="mini-mark">RC</span><button className="icon-button" onClick={() => setMenuOpen(false)}><X /></button></div>
      <p className="drawer-kicker">Explora Ritual Cobre</p>
      <a href="#catalogo" onClick={() => setMenuOpen(false)}>Catálogo <ArrowRight /></a>
      <a href="#beneficios" onClick={() => setMenuOpen(false)}>Beneficios <ArrowRight /></a>
      <a href="#historia" onClick={() => setMenuOpen(false)}>Nuestra historia <ArrowRight /></a>
      <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto <ArrowRight /></a>
      <Link to="/politicas" onClick={() => setMenuOpen(false)}>Políticas <ArrowRight /></Link>
      <div className="drawer-admin"><span>Área privada</span><Link to="/admin">Entrar al panel administrativo</Link></div>
    </aside>

    <main>
      <section className="hero" id="inicio">
        <div className="hero-copy reveal"><p className="eyebrow"><Sparkles size={15}/>{copy.eyebrow}</p><h1>{copy.heroTitle}</h1><p className="hero-lede">{copy.heroDescription}</p><a className="primary-button" href="#catalogo">{copy.heroCta}<ArrowRight /></a></div>
        <div className="hero-visual reveal delay-1"><div className="image-frame"><img src={copy.heroImage} alt="Productos de cuidado personal Ritual Cobre" loading="eager" decoding="async" fetchPriority="high" /></div><div className="orbit-note">Fórmulas sensoriales<br/>para días reales</div><span className="vertical-caption">RITUAL · PAUSA · PRESENCIA</span></div>
      </section>

      <section className="benefits" id="beneficios">
        <div className="section-intro"><span>01 — MANIFIESTO</span><h2>{copy.benefitsTitle}</h2></div>
        <div className="benefit-list">{[1,2,3].map((number) => <article key={number}><span>0{number}</span><h3>{copy[`benefit${number}Title`]}</h3><p>{copy[`benefit${number}Text`]}</p></article>)}</div>
      </section>

      <section className="catalog" id="catalogo">
        <div className="catalog-heading"><div><span>02 — COLECCIÓN</span><h2>{copy.catalogTitle}</h2></div><p>{copy.catalogDescription}</p></div>
        <div className="catalog-layout">
          <aside className="filters"><label><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ritual..." /></label><div className="category-list">{categories.map((item) => <button className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === 'Todos' ? products.length : products.filter((product) => product.category === item).length}</span></button>)}</div></aside>
          <div className="product-list">{visibleProducts.map((product, index) => <article className="product-row" key={product.id}>
            <div className="product-number">{String(index + 1).padStart(2, '0')}</div>
            <div className="product-image"><img src={product.image} alt={product.name} loading="lazy" decoding="async"/>{product.stock === 0 && <span>Agotado</span>}</div>
            <div className="product-info"><p className="product-category">{product.category}</p><h3>{product.name}</h3><p>{product.description}</p><div className="stock-line"><span className={product.stock ? '' : 'empty'}>{product.stock ? `${product.stock} disponibles` : 'Sin existencias'}</span></div></div>
            <div className="product-action"><strong>{money(product.price)}</strong><button disabled={product.stock === 0} onClick={() => addToCart(product)}>{product.stock ? 'Agregar' : 'Agotado'}<Plus /></button></div>
          </article>)}{visibleProducts.length === 0 && <div className="empty-state"><Search/><h3>No encontramos ese ritual</h3><p>Prueba otra palabra o categoría.</p></div>}</div>
        </div>
      </section>

      <section className="story" id="historia"><div className="story-art"><span>R</span><div></div></div><div className="story-copy"><span>03 — NUESTRA HISTORIA</span><h2>{copy.storyTitle}</h2><p>{copy.storyText}</p><div className="signature">Ritual Cobre</div></div></section>
    </main>

    <footer id="contacto"><div className="footer-brand"><div className="footer-mark">RC</div><h2>{copy.brandName}</h2><p>{copy.footerText}</p></div><div><span>Conversemos</span><a className="whatsapp" href={`https://wa.me/${copy.whatsapp}`} target="_blank" rel="noreferrer">Abrir WhatsApp <ArrowRight/></a></div><div><span>Horario</span><p>{copy.schedule}</p></div><div className="footer-bottom"><p>{copy.developerCredit}</p><p>© {new Date().getFullYear()} {copy.brandName} · <Link to="/politicas">Políticas</Link></p></div></footer>

    <div className={`overlay ${cartOpen ? 'visible' : ''}`} onClick={() => setCartOpen(false)} />
    <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`}><div className="drawer-head"><div><span className="drawer-kicker">BOLSA · {cartCount} PIEZAS</span><h2>{copy.cartTitle}</h2></div><button className="icon-button" onClick={() => setCartOpen(false)}><X/></button></div>
      <div className="cart-lines">{cart.map((line) => <div className="cart-line" key={line.productId}><img src={line.image} alt=""/><div><h4>{line.name}</h4><p>{money(line.price)}</p><div className="quantity"><button onClick={() => changeQuantity(line.productId, -1)}><Minus/></button><span>{line.quantity}</span><button onClick={() => changeQuantity(line.productId, 1)}><Plus/></button></div></div><button className="remove" onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))}><Trash2/></button></div>)}{!cart.length && <div className="empty-cart"><ShoppingBag/><h3>Tu bolsa está esperando</h3><p>Elige algo que haga más lento tu día.</p></div>}</div>
      <div className="cart-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><p>El envío se coordina después de confirmar el pedido.</p><button className="primary-button full" disabled={!cart.length} onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}>Continuar al checkout <ArrowRight/></button></div>
    </aside>

    {checkoutOpen && <div className="modal-wrap"><div className="modal-card"><button className="modal-close icon-button" onClick={() => { setCheckoutOpen(false); setConfirmation(null) }}><X/></button>{confirmation ? <div className="confirmation"><div className="success-icon"><Check/></div><span>PEDIDO RECIBIDO</span><h2>Gracias por hacer espacio.</h2><p>Tu número de pedido es</p><strong>{confirmation.orderNumber}</strong><p>Total: {money(confirmation.total)}. Te contactaremos para coordinar pago y envío.</p><button className="primary-button" onClick={() => { setCheckoutOpen(false); setConfirmation(null) }}>Volver a la tienda</button></div> : <div className="checkout-grid"><div><span className="drawer-kicker">ÚLTIMO PASO</span><h2>{copy.checkoutTitle}</h2><p>Déjanos tus datos para coordinar pago y entrega.</p><form id="checkout-form" onSubmit={submitOrder}><input required name="name" placeholder="Nombre completo"/><input required name="phone" placeholder="Teléfono"/><input required name="email" type="email" placeholder="Correo electrónico"/><textarea required name="address" placeholder="Dirección de entrega" rows={3}/>{error && <p className="form-error">{error}</p>}</form></div><div className="order-review"><h3>Resumen</h3>{cart.map((line) => <div key={line.productId}><span>{line.quantity} × {line.name}</span><strong>{money(line.quantity * line.price)}</strong></div>)}<div className="checkout-total"><span>Total</span><strong>{money(subtotal)}</strong></div><button form="checkout-form" disabled={submitting} className="primary-button full">{submitting ? 'Enviando...' : 'Enviar pedido'}<ArrowRight/></button></div></div>}</div></div>}
  </div>
}
