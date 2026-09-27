import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, AtSign, Check, Clock, Mail, Menu, MessageCircle, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react'
import { createOrder, type CartLine } from '@/lib/store'
import { availableOptions, lineName, optionPrice, optionStock, parseOptions, priceRange, tracksOptionStock, variantFor } from '@/lib/variants'
import type { ProductVariant } from '@/lib/variants'
import { formatMoney, whatsappLink } from '@/lib/format'
import { BrandLogo, BrandMark } from '@/components/BrandMark'

type Product = { id: number; name: string; category: string; description: string; options: string; price: number; originalPrice: number; stock: number; image: string; variantImages: ProductVariant[] | null; optionStock: boolean; featured: boolean; isNew: boolean; bestSeller: boolean }
type OrderResult = { orderNumber: string; total: number; items: Array<{ name: string; quantity: number; price: number }> }
const lineKey = (line: { productId: number; option?: string }) => `${line.productId}::${line.option || ''}`
type Props = { data: { products: Product[]; content: Record<string, string> } }
type SortKey = 'destacados' | 'precio-asc' | 'precio-desc' | 'nombre'

const CART_KEY = 'ritual-cobre-cart'
const FALLBACK_IMAGE = '/placeholder.png'

function readStoredCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem(CART_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function storeCart(cart: CartLine[]) {
  try { window.localStorage.setItem(CART_KEY, JSON.stringify(cart)) } catch { /* almacenamiento no disponible */ }
}

const instagramUrl = (value: string) => {
  const handle = value.trim().replace(/^@/, '')
  if (!handle) return ''
  return /^https?:\/\//i.test(handle) ? handle : `https://instagram.com/${handle}`
}

export function Storefront({ data }: Props) {
  const { products, content: copy } = data
  const currency = copy.currency || 'DOP'
  const money = (value: number) => formatMoney(value, currency)
  const brand = copy.brandName || 'Ritual Cobre'
  const whatsapp = whatsappLink(copy.whatsapp)

  const [menuOpen, setMenuOpen] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [viewing, setViewing] = useState<Product | null>(null)
  const [viewQuantity, setViewQuantity] = useState(1)
  const [viewOption, setViewOption] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [cartReady, setCartReady] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todos')
  const [sort, setSort] = useState<SortKey>('destacados')
  const [confirmation, setConfirmation] = useState<OrderResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [toastCart, setToastCart] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Recupera la bolsa guardada y la ajusta a precios y existencias actuales.
  useEffect(() => {
    const stored = readStoredCart()
    const reconciled = stored.flatMap((line) => {
      const product = products.find((item) => item.id === line.productId)
      if (!product) return []
      const options = parseOptions(product.options)
      const option = line.option && options.includes(line.option) ? line.option : ''
      if (options.length && !option) return []
      const available = optionStock(product, option)
      if (available <= 0) return []
      const quantity = Math.min(Math.max(1, Math.floor(Number(line.quantity) || 1)), available)
      return [{ productId: product.id, option: option || undefined, name: lineName(product.name, option), price: optionPrice(product, option), image: variantFor(product, option)?.image || product.image, quantity }]
    })
    setCart(reconciled)
    setCartReady(true)
  }, [products])

  useEffect(() => { if (cartReady) storeCart(cart) }, [cart, cartReady])

  // Bloquea el scroll del fondo y permite cerrar con Escape.
  const anyOverlay = menuOpen || cartOpen || checkoutOpen || Boolean(viewing)
  useEffect(() => {
    document.body.classList.toggle('no-scroll', anyOverlay)
    if (!anyOverlay) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false); setCartOpen(false); setViewing(null)
      if (!submitting) { setCheckoutOpen(false); setConfirmation(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll') }
  }, [anyOverlay, submitting])

  const categories = useMemo(() => ['Todos', ...Array.from(new Set(products.map((product) => product.category)))], [products])
  const visibleProducts = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = products.filter((product) => (category === 'Todos' || product.category === category) && `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(q))
    const sorted = [...list]
    if (sort === 'precio-asc') sorted.sort((a, b) => a.price - b.price)
    if (sort === 'precio-desc') sorted.sort((a, b) => b.price - a.price)
    if (sort === 'nombre') sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'))
    // Los agotados siempre al final.
    return sorted.sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0))
  }, [products, category, query, sort])
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0)
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0)

  function notify(message: string, withCart = false) {
    setToast(message)
    setToastCart(withCart)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }

  // Agrega a la bolsa SIN abrirla (como en JB): sale un aviso con «Ver bolsa».
  const addToCart = (product: Product, amount = 1, option = '') => {
    const options = parseOptions(product.options)
    if (options.length && !option) { openProduct(product); return }
    const available = optionStock(product, option)
    const key = lineKey({ productId: product.id, option })
    const inCart = cart.find((line) => lineKey(line) === key)?.quantity ?? 0
    const label = lineName(product.name, option)
    if (inCart >= available) { notify(`Ya tienes todas las unidades disponibles de ${label}.`, true); return }
    const quantity = Math.min(inCart + amount, available)
    setCart((current) => {
      const existing = current.find((line) => lineKey(line) === key)
      if (existing) return current.map((line) => lineKey(line) === key ? { ...line, quantity } : line)
      return [...current, { productId: product.id, option: option || undefined, name: label, price: optionPrice(product, option), quantity, image: variantFor(product, option)?.image || product.image }]
    })
    setViewing(null)
    notify(`Agregado a la bolsa: ${label}`, true)
  }

  const stockFor = (line: CartLine) => {
    const product = products.find((item) => item.id === line.productId)
    return product ? optionStock(product, line.option || '') : line.quantity
  }

  // La cantidad nunca baja de 1 con «−» (para quitar está el botón de la
  // papelera) ni pasa de lo que hay disponible.
  const setQuantity = (key: string, value: number) => setCart((current) => current.map((line) => {
    if (lineKey(line) !== key) return line
    const quantity = Math.max(1, Math.min(Math.floor(value) || 1, stockFor(line)))
    return { ...line, quantity }
  }))

  function openProduct(product: Product) {
    const available = availableOptions(product)
    setViewQuantity(1)
    setViewOption(available[0] || '')
    setViewing(product)
  }

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError('')
    const form = new FormData(event.currentTarget)
    const field = (name: string) => String(form.get(name) ?? '')
    try {
      const notes = field('notes').trim()
      const address = notes ? `${field('address').trim()}\nNota: ${notes}` : field('address')
      const result = await createOrder({ data: { name: field('name'), phone: field('phone'), email: field('email'), address, website: field('website'), items: cart } })
      setConfirmation({ orderNumber: result.orderNumber, total: result.total, items: cart.map((line) => ({ name: line.name, quantity: line.quantity, price: line.price })) })
      setCart([])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos enviar el pedido. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  function closeCheckout() {
    if (submitting) return
    setCheckoutOpen(false)
    setConfirmation(null)
    setError('')
  }

  const confirmationMessage = confirmation ? [
    `Hola ${brand}, acabo de hacer el pedido *${confirmation.orderNumber}*:`,
    ...(confirmation.items ?? []).map((item) => `• ${item.quantity} × ${item.name} — ${money(item.price * item.quantity)}`),
    `*Total: ${money(confirmation.total)}*`,
    '¿Me ayudan a coordinar el pago y la entrega?',
  ].join('\n') : ''

  return <div className="site-shell">
    <a className="skip-link" href="#catalogo">Ir al catálogo</a>
    <header className="topbar">
      <button className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><Menu /></button>
      <a className="wordmark" href="#catalogo" aria-label={`${brand} — inicio`}><BrandLogo name={brand} /></a>
      <nav className="desktop-nav" aria-label="Principal"><a href="#catalogo">{copy.navCatalog}</a><a href="#historia">Nuestra historia</a><a href="#contacto">{copy.navContact}</a></nav>
      <button className="cart-button" onClick={() => setCartOpen(true)} aria-label={`Abrir bolsa, ${cartCount} productos`}><ShoppingBag size={19}/><span>Bolsa</span><b>{cartCount}</b></button>
    </header>

    <div className={`overlay ${menuOpen ? 'visible' : ''}`} onClick={() => setMenuOpen(false)} />
    <aside className={`side-menu ${menuOpen ? 'open' : ''}`} aria-hidden={!menuOpen} aria-label="Menú">
      <div className="drawer-head"><BrandLogo name={brand} className="drawer-logo" /><button className="icon-button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú"><X /></button></div>
      <p className="drawer-kicker">Explora {brand}</p>
      <a href="#catalogo" onClick={() => setMenuOpen(false)}>Catálogo <ArrowRight /></a>
      <a href="#historia" onClick={() => setMenuOpen(false)}>Nuestra historia <ArrowRight /></a>
      <a href="#contacto" onClick={() => setMenuOpen(false)}>Contacto <ArrowRight /></a>
      <Link to="/politicas" onClick={() => setMenuOpen(false)}>Políticas <ArrowRight /></Link>
      {whatsapp && <a className="drawer-whatsapp" href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle /> Escríbenos por WhatsApp</a>}
    </aside>

    <main>
      <section className="catalog" id="catalogo">
        <div className="catalog-layout">
          <aside className="filters">
            <label><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ritual..." aria-label="Buscar productos" type="search" /></label>
            <div className="category-list" role="tablist" aria-label="Categorías">{categories.map((item) => <button role="tab" aria-selected={category === item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)} key={item}>{item}<span>{item === 'Todos' ? products.length : products.filter((product) => product.category === item).length}</span></button>)}</div>
            <label className="sort-field"><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label="Ordenar productos"><option value="destacados">Destacados</option><option value="precio-asc">Precio: menor a mayor</option><option value="precio-desc">Precio: mayor a menor</option><option value="nombre">Nombre (A–Z)</option></select></label>
          </aside>
          <div className="product-list">{visibleProducts.map((product, index) => {
            const inCart = cart.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.quantity, 0)
            return <article className={`product-row ${product.stock === 0 ? 'sold-out' : ''}`} key={product.id}>
              <div className="product-number">{String(index + 1).padStart(2, '0')}</div>
              <button className="product-image" onClick={() => openProduct(product)} aria-label={`Ver detalles de ${product.name}`}><img src={product.image || FALLBACK_IMAGE} alt={product.name} loading="lazy" decoding="async"/>{product.stock === 0 ? <span>Agotado</span> : product.featured ? <em className="product-badge">Favorito</em> : product.isNew ? <em className="product-badge">Nuevo</em> : product.bestSeller ? <em className="product-badge">Más vendido</em> : null}</button>
              <div className="product-info"><p className="product-category">{product.category}</p><h3><button onClick={() => openProduct(product)}>{product.name}</button></h3><p>{product.description}</p>{parseOptions(product.options).length > 0 && <p className="product-options-hint">{parseOptions(product.options).length} opciones</p>}<div className="stock-line"><span className={product.stock === 0 ? 'empty' : product.stock <= 3 ? 'low' : ''}>{product.stock === 0 ? 'Sin existencias' : product.stock <= 3 ? `Últimas ${product.stock} unidades` : 'Disponible'}</span>{inCart > 0 && <small className="in-cart">· {inCart} en tu bolsa</small>}</div></div>
              <div className="product-action"><strong>{(() => { const range = priceRange(product); return range.min !== range.max ? <><small className="price-from">Desde</small> {money(range.min)}</> : money(range.min) })()}{product.originalPrice > product.price && !parseOptions(product.options).length && <s className="price-old">{money(product.originalPrice)}</s>}</strong><button disabled={product.stock === 0} onClick={() => addToCart(product)}>{product.stock ? (parseOptions(product.options).length ? 'Elegir' : 'Agregar') : 'Agotado'}<Plus /></button></div>
            </article>
          })}{visibleProducts.length === 0 && <div className="empty-state"><Search/><h3>No encontramos ese ritual</h3><p>Prueba otra palabra o categoría.</p><button className="ghost-button" onClick={() => { setQuery(''); setCategory('Todos') }}>Ver todo el catálogo</button></div>}</div>
        </div>
      </section>

      <section className="story" id="historia"><div className="story-art"><span>R</span><div style={{ backgroundImage: `url("${(copy.storyImage || FALLBACK_IMAGE).replace(/"/g, '%22')}")` }}></div></div><div className="story-copy"><span>NUESTRA HISTORIA</span><h2>{copy.storyTitle}</h2><p>{copy.storyText}</p><div className="signature">{brand}</div></div></section>
    </main>

    <footer id="contacto">
      <div className="footer-brand"><BrandMark className="footer-mark-svg" /><h2>{brand}</h2><p>{copy.footerText}</p></div>
      <div className="footer-col"><span>Conversemos</span>
        {whatsapp && <a className="whatsapp" href={whatsapp} target="_blank" rel="noreferrer">WhatsApp <ArrowRight/></a>}
        {copy.contactEmail && <a className="whatsapp" href={`mailto:${copy.contactEmail}`}>Correo <Mail/></a>}
        {copy.instagram && <a className="whatsapp" href={instagramUrl(copy.instagram)} target="_blank" rel="noreferrer">Instagram <AtSign/></a>}
        {!whatsapp && !copy.contactEmail && !copy.instagram && <p>Pronto publicaremos nuestros canales de contacto.</p>}
      </div>
      <div className="footer-col"><span>Horario</span><p className="footer-schedule"><Clock size={16}/>{copy.schedule}</p>{copy.contactEmail && <p className="footer-email"><Mail size={16}/>{copy.contactEmail}</p>}<Link to="/politicas" className="footer-link">Políticas de la tienda <ArrowRight/></Link></div>
      <div className="footer-bottom"><p>© {new Date().getFullYear()} {brand}. Todos los derechos reservados.</p><a className="gadr-credit" href="https://gadrnet.com" target="_blank" rel="noopener noreferrer"><span className="gadr-credit-text">Diseño y desarrollo de la tienda: GADR Net | gadrnet.com</span><span className="gadr-mark" aria-hidden="true"><span className="gadr-mark-icon">&lt;/&gt;<i></i></span><span className="gadr-mark-word">GADR<small>Net</small></span></span></a></div>
    </footer>

    {whatsapp && !anyOverlay && <a className="floating-whatsapp" href={whatsapp} target="_blank" rel="noreferrer" aria-label="Escríbenos por WhatsApp"><MessageCircle /></a>}
    {toast && <div className="toast" role="status"><span>{toast}</span>{toastCart && <button type="button" onClick={() => { setToast(''); setCartOpen(true) }}>Ver bolsa</button>}</div>}

    <div className={`overlay ${cartOpen ? 'visible' : ''}`} onClick={() => setCartOpen(false)} />
    <aside className={`cart-drawer ${cartOpen ? 'open' : ''}`} aria-hidden={!cartOpen} aria-label="Bolsa de compra"><div className="drawer-head"><div><span className="drawer-kicker">BOLSA · {cartCount} {cartCount === 1 ? 'PIEZA' : 'PIEZAS'}</span><h2>{copy.cartTitle}</h2></div><button className="icon-button" onClick={() => setCartOpen(false)} aria-label="Cerrar bolsa"><X/></button></div>
      <div className="cart-lines">{cart.map((line) => { const key = lineKey(line); const max = stockFor(line); return <div className="cart-line" key={key}><img src={line.image || FALLBACK_IMAGE} alt=""/><div><h4>{line.name}</h4><p>{money(line.price)}</p><div className="quantity"><button onClick={() => setQuantity(key, line.quantity - 1)} disabled={line.quantity <= 1} aria-label="Quitar una unidad"><Minus/></button><input type="number" inputMode="numeric" min={1} max={max} value={line.quantity} onChange={(event) => setQuantity(key, Number(event.target.value))} aria-label={`Cantidad de ${line.name}`}/><button onClick={() => setQuantity(key, line.quantity + 1)} disabled={line.quantity >= max} aria-label="Agregar una unidad"><Plus/></button></div>{line.quantity >= max && <small className="cart-max">Es todo lo disponible</small>}</div><div className="cart-line-end"><strong>{money(line.price * line.quantity)}</strong><button className="remove" onClick={() => setCart((current) => current.filter((item) => lineKey(item) !== key))} aria-label={`Eliminar ${line.name}`}><Trash2/></button></div></div> })}{!cart.length && <div className="empty-cart"><ShoppingBag/><h3>Tu bolsa está esperando</h3><p>Elige algo que haga más lento tu día.</p><a className="ghost-button" href="#catalogo" onClick={() => setCartOpen(false)}>Ver el catálogo</a></div>}</div>
      <div className="cart-summary"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><p>El envío y el método de pago se coordinan contigo después de confirmar el pedido.</p><button className="primary-button full" disabled={!cart.length} onClick={() => { setCartOpen(false); setCheckoutOpen(true) }}>Continuar con el pedido <ArrowRight/></button></div>
    </aside>

    {viewing && (() => {
      const options = parseOptions(viewing.options)
      const variant = variantFor(viewing, viewOption)
      const stock = options.length ? optionStock(viewing, viewOption) : viewing.stock
      const price = optionPrice(viewing, viewOption)
      const image = variant?.image || viewing.image || FALLBACK_IMAGE
      const tracked = tracksOptionStock(viewing)
      return <div className="modal-wrap" onClick={(event) => { if (event.target === event.currentTarget) setViewing(null) }}><div className="quick-view" role="dialog" aria-modal="true" aria-label={viewing.name}>
      <button className="modal-close icon-button" onClick={() => setViewing(null)} aria-label="Cerrar"><X/></button>
      <div className="quick-view-image"><img src={image} alt={lineName(viewing.name, viewOption)}/>{viewing.featured && viewing.stock > 0 && <em className="product-badge">Favorito</em>}</div>
      <div className="quick-view-copy">
        <p className="product-category">{viewing.category}</p>
        <h2>{viewing.name}</h2>
        <strong className="quick-view-price">{money(price)}{viewing.originalPrice > price && <s className="price-old">{money(viewing.originalPrice)}</s>}</strong>
        <p className="quick-view-description">{variant?.description || viewing.description}</p>
        {options.length > 0 && <div className="option-picker" role="radiogroup" aria-label="Elige una opción">
          {options.map((option) => { const out = tracked ? optionStock(viewing, option) === 0 : viewing.stock === 0; return <button key={option} type="button" role="radio" aria-checked={viewOption === option} className={`${viewOption === option ? 'active' : ''} ${out ? 'is-out' : ''}`} disabled={out} onClick={() => { setViewOption(option); setViewQuantity(1) }}>{option}</button> })}
        </div>}
        <p className={`quick-view-stock ${stock === 0 ? 'empty' : stock <= 3 ? 'low' : ''}`}>{options.length && !viewOption ? 'Elige una opción' : stock === 0 ? 'Sin existencias por ahora' : stock <= 3 ? `Últimas ${stock} unidades` : `${stock} disponibles`}</p>
        {stock > 0 ? <div className="quick-view-buy"><div className="quantity large"><button onClick={() => setViewQuantity((value) => Math.max(1, value - 1))} disabled={viewQuantity <= 1} aria-label="Menos"><Minus/></button><span>{viewQuantity}</span><button onClick={() => setViewQuantity((value) => Math.min(stock, value + 1))} disabled={viewQuantity >= stock} aria-label="Más"><Plus/></button></div><button className="primary-button" onClick={() => addToCart(viewing, viewQuantity, viewOption)}>Agregar a la bolsa <ArrowRight/></button></div>
          : whatsapp && <a className="ghost-button" href={whatsappLink(copy.whatsapp, `Hola ${brand}, ¿cuándo vuelve a estar disponible ${lineName(viewing.name, viewOption)}?`)} target="_blank" rel="noreferrer"><MessageCircle/> Avísame cuando vuelva</a>}
      </div>
    </div></div>
    })()}

    {checkoutOpen && <div className="modal-wrap" onClick={(event) => { if (event.target === event.currentTarget) closeCheckout() }}><div className="modal-card" role="dialog" aria-modal="true" aria-label={copy.checkoutTitle}><button className="modal-close icon-button" onClick={closeCheckout} aria-label="Cerrar"><X/></button>{confirmation ? <div className="confirmation"><div className="success-icon"><Check/></div><span>PEDIDO RECIBIDO</span><h2>Gracias por hacer espacio.</h2><p>Tu número de pedido es</p><strong>{confirmation.orderNumber}</strong><p>Total: {money(confirmation.total)}. Te contactaremos para coordinar el pago y la entrega.</p><div className="confirmation-actions">{whatsapp && <a className="primary-button" href={whatsappLink(copy.whatsapp, confirmationMessage)} target="_blank" rel="noreferrer"><MessageCircle/> Enviar pedido por WhatsApp</a>}<button className="ghost-button" onClick={closeCheckout}>Volver a la tienda</button></div></div> : <div className="checkout-grid"><div><span className="drawer-kicker">ÚLTIMO PASO</span><h2>{copy.checkoutTitle}</h2><p>Déjanos tus datos para coordinar pago y entrega. No se realiza ningún cobro en línea.</p><form id="checkout-form" onSubmit={submitOrder} noValidate={false}>
      <label className="field"><span>Nombre completo</span><input required name="name" autoComplete="name" minLength={2} maxLength={120} placeholder="Ej. María Pérez"/></label>
      <div className="field-row"><label className="field"><span>Teléfono / WhatsApp</span><input required name="phone" type="tel" inputMode="tel" autoComplete="tel" minLength={10} maxLength={40} placeholder="809 000 0000"/></label><label className="field"><span>Correo electrónico</span><input required name="email" type="email" autoComplete="email" maxLength={180} placeholder="tu@correo.com"/></label></div>
      <label className="field"><span>Dirección de entrega</span><textarea required name="address" autoComplete="street-address" minLength={5} maxLength={400} placeholder="Calle, número, sector y ciudad" rows={2}/></label>
      <label className="field"><span>Nota para el pedido <em>(opcional)</em></span><textarea name="notes" maxLength={500} placeholder="Referencia, horario preferido, regalo..." rows={2}/></label>
      <input className="hp-field" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"/>
      <p className="checkout-legal">Al enviar aceptas nuestras <Link to="/politicas" target="_blank">políticas de privacidad y compra</Link>.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form></div><div className="order-review"><h3>Resumen</h3>{cart.map((line) => <div key={lineKey(line)}><span>{line.quantity} × {line.name}</span><strong>{money(line.quantity * line.price)}</strong></div>)}<div className="checkout-total"><span>Total</span><strong>{money(subtotal)}</strong></div><p className="order-review-note">Envío por coordinar según tu zona.</p><button form="checkout-form" disabled={submitting || !cart.length} className="primary-button full">{submitting ? 'Enviando pedido...' : 'Enviar pedido'}<ArrowRight/></button></div></div>}</div></div>}
  </div>
}
