import { jsPDF } from 'jspdf'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { TriangleAlert, ArrowLeft, ArrowUpRight, Boxes, CircleCheck, Download, Eye, EyeOff, FileText, ImagePlus, LayoutDashboard, LoaderCircle, LogOut, Mail, MessageCircle, PackagePlus, Pencil, Phone, ReceiptText, Save, Search, Share2, Star, Store, Trash2, TrendingUp, UserPlus, Users, X } from 'lucide-react'
import { checkSession, deleteCustomer, deleteOrder, deleteProduct, getAdminData, login, logout, saveContent, saveCustomer, saveProduct, updateOrderStatus } from '@/lib/store'
import { CURRENCIES, dateTime, escapeHtml, formatMoney, shortDate, toCents, whatsappLink } from '@/lib/format'
import { BrandLogo, BrandMark } from '@/components/BrandMark'

type Product = { id: number; name: string; category: string; description: string; price: number; stock: number; image: string; featured: boolean }
type OrderItem = { productId?: number; name: string; price: number; quantity: number; image?: string }
type Order = { id: number; orderNumber: string; customerId: number | null; customerName: string; email: string; phone: string; address: string; total: number; status: string; paymentStatus: string; items: OrderItem[]; createdAt: string | Date }
type Customer = { id: number; name: string; email: string; phone: string; address: string; notes: string; createdAt: string | Date }
type AdminData = { products: Product[]; orders: Order[]; customers: Customer[]; content: Record<string, string> }
type Tab = 'resumen' | 'productos' | 'clientes' | 'pedidos' | 'contenido'
type ProductDraft = { id?: number; name: string; category: string; description: string; price: string; stock: string; image: string; featured: boolean }
type CustomerDraft = { id?: number; name: string; email: string; phone: string; address: string; notes: string }
type Toast = { kind: 'ok' | 'error'; message: string } | null

const ORDER_STATUSES = ['Pendiente', 'Preparando', 'Enviado', 'Entregado', 'Cancelado']
const PAYMENT_STATUSES = ['Pendiente', 'Pagado', 'Reembolsado']
const LOW_STOCK = 5
const blankProduct: ProductDraft = { name: '', category: '', description: '', price: '', stock: '0', image: '', featured: false }
const blankCustomer: CustomerDraft = { name: '', email: '', phone: '', address: '', notes: '' }
const errorText = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback
const statusClass = (status: string) => `status-pill status-${status.toLowerCase()}`

export function AdminPanel() {
  const initialized = useRef(false)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [data, setData] = useState<AdminData | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('Todos')
  const [categoryFilter, setCategoryFilter] = useState('Todas')
  const [loginError, setLoginError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  const [editing, setEditing] = useState<ProductDraft | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<CustomerDraft | null>(null)
  const [viewingOrderId, setViewingOrderId] = useState<number | null>(null)
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({})
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const currency = data?.content.currency || 'USD'
  const money = (value: number) => formatMoney(value, currency)

  function notify(kind: 'ok' | 'error', message: string) {
    setToast({ kind, message })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), kind === 'ok' ? 2800 : 6000)
  }

  async function refresh() {
    const result = await getAdminData()
    setData(result as unknown as AdminData)
    setContentDraft(result.content)
  }

  // Ejecuta una acción del panel con manejo uniforme de errores y avisos.
  async function run(action: () => Promise<unknown>, success?: string, fallback = 'No pudimos completar la acción.') {
    setBusy(true)
    try {
      await action()
      await refresh()
      if (success) notify('ok', success)
      return true
    } catch (caught) {
      const message = errorText(caught, fallback)
      if (/sesión/i.test(message)) setAuthenticated(false)
      notify('error', message)
      return false
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    ;(async () => {
      try {
        const ok = await checkSession()
        setAuthenticated(Boolean(ok))
        if (ok) await refresh()
      } catch (caught) {
        setLoginError(errorText(caught, 'No pudimos verificar tu sesión.'))
        setAuthenticated(false)
      }
    })()
  }, [])

  // Cierra ventanas con Escape.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      setEditing(null); setEditingCustomer(null); setViewingOrderId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setLoginError('')
    const form = new FormData(event.currentTarget)
    try { await login({ data: { password: String(form.get('password')) } }); setAuthenticated(true); await refresh() }
    catch (caught) { setLoginError(errorText(caught, 'No pudimos completar el acceso.')) }
    finally { setBusy(false) }
  }

  async function handleLogout() {
    try { await logout() } finally { setAuthenticated(false); setData(null) }
  }

  async function handleProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return
    const draft = editing
    const ok = await run(() => saveProduct({ data: { id: draft.id, name: draft.name, category: draft.category, description: draft.description, image: draft.image, featured: draft.featured, price: toCents(draft.price), stock: Math.max(0, Math.floor(Number(draft.stock) || 0)) } }), draft.id ? 'Producto actualizado.' : 'Producto creado.', 'No pudimos guardar el producto.')
    if (ok) setEditing(null)
  }

  async function handleCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingCustomer) return
    const draft = editingCustomer
    const ok = await run(() => saveCustomer({ data: draft }), draft.id ? 'Cliente actualizado.' : 'Cliente registrado.', 'No pudimos guardar el cliente.')
    if (ok) setEditingCustomer(null)
  }

  async function uploadImage(file: File, target: string) {
    setUploading(target)
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch('/api/upload', { method: 'POST', body })
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string }
      if (!response.ok || !result.url) throw new Error(result.error || 'No pudimos subir la imagen.')
      if (target === 'product') setEditing((current) => current ? { ...current, image: result.url! } : current)
      else setContentDraft((current) => ({ ...current, [target]: result.url! }))
      notify('ok', target === 'product' ? 'Imagen lista. Guarda el producto para aplicarla.' : 'Imagen lista. Pulsa «Guardar cambios» para publicarla.')
    } catch (caught) { notify('error', errorText(caught, 'No pudimos subir la imagen.')) }
    finally { setUploading(null) }
  }

  const q = query.trim().toLowerCase()
  const categories = useMemo(() => Array.from(new Set((data?.products ?? []).map((product) => product.category))).sort((a, b) => a.localeCompare(b, 'es')), [data])
  const filteredProducts = useMemo(() => (data?.products ?? []).filter((product) => (categoryFilter === 'Todas' || product.category === categoryFilter) && (!q || product.name.toLowerCase().includes(q) || product.category.toLowerCase().includes(q))), [data, q, categoryFilter])
  const filteredCustomers = useMemo(() => (data?.customers ?? []).filter((customer) => !q || customer.name.toLowerCase().includes(q) || customer.email.toLowerCase().includes(q) || customer.phone.toLowerCase().includes(q)), [data, q])
  const filteredOrders = useMemo(() => (data?.orders ?? []).filter((order) => (statusFilter === 'Todos' || order.status === statusFilter || (statusFilter === 'Por cobrar' && order.paymentStatus === 'Pendiente' && order.status !== 'Cancelado')) && (!q || order.orderNumber.toLowerCase().includes(q) || order.customerName.toLowerCase().includes(q) || order.email.toLowerCase().includes(q) || order.phone.includes(q))), [data, q, statusFilter])

  if (authenticated === null) return <div className="admin-loading"><LoaderCircle/><p>Preparando tu espacio...</p></div>
  if (!authenticated) return <div className="admin-login"><div className="login-art"><Link to="/"><ArrowLeft/> Volver a la tienda</Link><BrandMark className="login-mark"/><p>El detrás de escena de cada ritual.</p></div><div className="login-form-wrap"><div><BrandLogo className="login-logo"/><span>ACCESO PRIVADO</span><h1>Panel de<br/>administración</h1><p>Ingresa la contraseña de administración para gestionar pedidos, productos y contenido.</p><form onSubmit={handleLogin}><label>Contraseña<div className="password-field"><input required type={showPassword ? 'text' : 'password'} name="password" placeholder="••••••••" autoComplete="current-password" autoFocus/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></label>{loginError && <p className="form-error" role="alert">{loginError}</p>}<button className="primary-button full" disabled={busy}>{busy ? 'Ingresando...' : 'Entrar al panel'}</button></form></div></div></div>

  if (!data) return <div className="admin-loading"><LoaderCircle/><p>Cargando información...</p></div>

  const activeOrders = data.orders.filter((order) => order.status !== 'Cancelado')
  const collected = activeOrders.filter((order) => order.paymentStatus === 'Pagado').reduce((sum, order) => sum + order.total, 0)
  const pending = activeOrders.filter((order) => order.paymentStatus === 'Pendiente').reduce((sum, order) => sum + order.total, 0)
  const openOrders = data.orders.filter((order) => ['Pendiente', 'Preparando', 'Enviado'].includes(order.status))
  const newOrders = data.orders.filter((order) => order.status === 'Pendiente').length
  const averageTicket = activeOrders.length ? Math.round(activeOrders.reduce((sum, order) => sum + order.total, 0) / activeOrders.length) : 0
  const lowStockProducts = data.products.filter((product) => product.stock <= LOW_STOCK).sort((a, b) => a.stock - b.stock)
  const bestSellers = Object.values(activeOrders.flatMap((order) => order.items).reduce<Record<string, { name: string; units: number; revenue: number }>>((acc, item) => {
    const key = item.name
    acc[key] = acc[key] ?? { name: item.name, units: 0, revenue: 0 }
    acc[key].units += item.quantity; acc[key].revenue += item.price * item.quantity
    return acc
  }, {})).sort((a, b) => b.units - a.units).slice(0, 5)
  const viewingOrder = viewingOrderId ? data.orders.find((order) => order.id === viewingOrderId) ?? null : null
  const ordersFor = (customer: Customer) => data.orders.filter((order) => order.customerId === customer.id || (!order.customerId && order.email && order.email.toLowerCase() === customer.email.toLowerCase()))
  const contentDirty = Object.keys(contentDraft).some((key) => (contentDraft[key] ?? '') !== (data.content[key] ?? ''))

  const tabs: { id: Tab; label: string; short: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'resumen', label: 'Resumen', short: 'Inicio', icon: <LayoutDashboard/> },
    { id: 'pedidos', label: 'Pedidos y facturas', short: 'Pedidos', icon: <ReceiptText/>, badge: newOrders },
    { id: 'productos', label: 'Productos', short: 'Productos', icon: <Boxes/>, badge: data.products.filter((product) => product.stock === 0).length },
    { id: 'clientes', label: 'Clientes', short: 'Clientes', icon: <Users/> },
    { id: 'contenido', label: 'Editor de contenido', short: 'Contenido', icon: <FileText/> },
  ]

  const changeTab = (next: Tab) => {
    if (tab === 'contenido' && next !== 'contenido' && contentDirty && !confirm('Tienes cambios sin guardar en el contenido. ¿Salir sin guardar?')) return
    if (tab === 'contenido' && next !== 'contenido' && contentDirty) setContentDraft(data.content)
    setTab(next); setQuery(''); setStatusFilter('Todos'); setCategoryFilter('Todas')
    window.scrollTo({ top: 0 })
  }

  const setOrderStatus = (order: Order, patch: Partial<Pick<Order, 'status' | 'paymentStatus'>>) => {
    const next = { status: patch.status ?? order.status, paymentStatus: patch.paymentStatus ?? order.paymentStatus }
    if (patch.status === 'Cancelado' && !confirm(`¿Cancelar el pedido ${order.orderNumber}? Las unidades vuelven al inventario.`)) return
    return run(() => updateOrderStatus({ data: { id: order.id, ...next } }), `Pedido ${order.orderNumber} actualizado.`)
  }

  const removeOrder = async (order: Order) => {
    const restock = order.status === 'Pendiente' || order.status === 'Preparando'
    if (!confirm(`¿Eliminar el pedido ${order.orderNumber}? Esta acción no se puede deshacer.${restock ? ' Las unidades vuelven al inventario.' : ''}`)) return
    const ok = await run(() => deleteOrder({ data: order.id }), 'Pedido eliminado.')
    if (ok) setViewingOrderId(null)
  }

  const invoiceContext = { brand: data.content.brandName || 'Ritual Cobre', currency, whatsapp: data.content.whatsapp || '', email: data.content.contactEmail || '' }
  const download = (order: Order) => downloadOrder(order, invoiceContext).catch((caught) => notify('error', errorText(caught, 'No pudimos generar el PDF.')))
  const share = (order: Order) => shareOrder(order, invoiceContext).catch((caught) => notify('error', errorText(caught, 'No pudimos compartir el pedido.')))

  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link to="/" className="admin-brand"><BrandMark className="admin-brand-mark"/><div>{invoiceContext.brand}<small>Administración</small></div></Link>
      <nav aria-label="Secciones del panel">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)} aria-current={tab === item.id ? 'page' : undefined}>{item.icon}<span className="nav-label">{item.label}</span><span className="nav-short">{item.short}</span>{Boolean(item.badge) && <b className="nav-badge">{item.badge}</b>}</button>)}</nav>
      <a className="sidebar-link" href="/" target="_blank" rel="noreferrer"><Store/>Ver tienda</a>
      <button className="logout" onClick={handleLogout}><LogOut/>Cerrar sesión</button>
    </aside>
    <main className="admin-main">
      <header className="admin-header"><div><span>ESPACIO DE GESTIÓN</span><h1>{tabs.find((item) => item.id === tab)?.label}</h1></div><div className="admin-header-actions"><a href="/" target="_blank" rel="noreferrer" className="header-chip"><Store/><span>Ver tienda</span></a><button className="header-chip mobile-only" onClick={handleLogout} aria-label="Cerrar sesión"><LogOut/></button></div></header>

      {tab === 'resumen' && <div className="dashboard">
        <div className="metric-grid">
          <article><span>Cobrado</span><strong>{money(collected)}</strong><small>Pedidos marcados como pagados</small></article>
          <article className={pending ? 'attention' : ''}><span>Por cobrar</span><strong>{money(pending)}</strong><small>{activeOrders.filter((order) => order.paymentStatus === 'Pendiente').length} pedidos con pago pendiente</small></article>
          <article><span>Pedidos abiertos</span><strong>{openOrders.length}</strong><small>{newOrders} nuevos por confirmar</small></article>
          <article><span>Ticket promedio</span><strong>{money(averageTicket)}</strong><small>{activeOrders.length} pedidos · {data.customers.length} clientes</small></article>
        </div>
        <div className="dashboard-grid">
          <section className="admin-card span-2"><div className="card-title"><div><span>ACTIVIDAD RECIENTE</span><h2>Últimos pedidos</h2></div><button className="text-button" onClick={() => changeTab('pedidos')}>Ver todos</button></div><OrderTable orders={data.orders.slice(0, 6)} money={money} onOpen={(order) => setViewingOrderId(order.id)} onStatus={setOrderStatus} busy={busy}/></section>
          <section className="admin-card"><div className="card-title"><div><span>INVENTARIO</span><h2>Stock bajo</h2></div><TriangleAlert className="card-icon warn"/></div>{lowStockProducts.length ? <ul className="mini-list">{lowStockProducts.slice(0, 6).map((product) => <li key={product.id}><img src={product.image || '/placeholder.png'} alt=""/><div><strong>{product.name}</strong><small>{product.category}</small></div><button className={`stock-pill ${product.stock === 0 ? 'out' : 'low'}`} onClick={() => setEditing(toDraft(product))}>{product.stock === 0 ? 'Agotado' : `${product.stock} uds.`}</button></li>)}</ul> : <p className="empty-admin compact"><CircleCheck/> Todo el inventario está en buen nivel.</p>}</section>
          <section className="admin-card"><div className="card-title"><div><span>VENTAS</span><h2>Más vendidos</h2></div><TrendingUp className="card-icon"/></div>{bestSellers.length ? <ol className="rank-list">{bestSellers.map((item, index) => <li key={item.name}><b>{index + 1}</b><div><strong>{item.name}</strong><small>{item.units} unidades</small></div><span>{money(item.revenue)}</span></li>)}</ol> : <p className="empty-admin compact">Aún no hay ventas registradas.</p>}</section>
        </div>
      </div>}

      {tab === 'pedidos' && <section className="admin-card"><div className="card-title"><div><span>HISTORIAL</span><h2>{filteredOrders.length} {filteredOrders.length === 1 ? 'pedido' : 'pedidos'}</h2></div></div>
        <div className="toolbar"><label className="search-field"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, cliente, correo o teléfono…" type="search"/></label></div>
        <div className="chip-row">{['Todos', ...ORDER_STATUSES, 'Por cobrar'].map((item) => <button key={item} className={statusFilter === item ? 'active' : ''} onClick={() => setStatusFilter(item)}>{item}<span>{item === 'Todos' ? data.orders.length : item === 'Por cobrar' ? activeOrders.filter((order) => order.paymentStatus === 'Pendiente').length : data.orders.filter((order) => order.status === item).length}</span></button>)}</div>
        <OrderTable orders={filteredOrders} money={money} onOpen={(order) => setViewingOrderId(order.id)} onStatus={setOrderStatus} busy={busy} emptyText={data.orders.length ? 'Ningún pedido coincide con el filtro.' : 'Todavía no hay pedidos. Cuando un cliente compre en la tienda aparecerá aquí.'}/>
      </section>}

      {tab === 'productos' && <section className="admin-card"><div className="card-title"><div><span>CATÁLOGO</span><h2>{filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'}</h2></div><button className="admin-action" onClick={() => setEditing(blankProduct)}><PackagePlus/>Nuevo producto</button></div>
        <div className="toolbar"><label className="search-field"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o categoría…" type="search"/></label></div>
        <div className="chip-row">{['Todas', ...categories].map((item) => <button key={item} className={categoryFilter === item ? 'active' : ''} onClick={() => setCategoryFilter(item)}>{item}<span>{item === 'Todas' ? data.products.length : data.products.filter((product) => product.category === item).length}</span></button>)}</div>
        <div className="admin-product-list">{filteredProducts.map((product) => <article key={product.id}><img src={product.image || '/placeholder.png'} alt="" loading="lazy" decoding="async"/><div><span>{product.category}{product.featured && <em className="featured-tag"><Star/> Destacado</em>}</span><h3>{product.name}</h3><p><strong>{money(product.price)}</strong> · <em className={`stock-pill ${product.stock === 0 ? 'out' : product.stock <= LOW_STOCK ? 'low' : 'ok'}`}>{product.stock === 0 ? 'Agotado' : `${product.stock} en stock`}</em></p></div><div className="row-actions"><button onClick={() => setEditing(toDraft(product))} aria-label={`Editar ${product.name}`} title="Editar"><Pencil/></button><button onClick={() => { if (confirm(`¿Eliminar «${product.name}»? Los pedidos anteriores conservan su información.`)) run(() => deleteProduct({ data: product.id }), 'Producto eliminado.') }} aria-label={`Eliminar ${product.name}`} title="Eliminar"><Trash2/></button></div></article>)}{!filteredProducts.length && <div className="empty-admin">No hay productos que mostrar.</div>}</div>
      </section>}

      {tab === 'clientes' && <section className="admin-card"><div className="card-title"><div><span>COMUNIDAD</span><h2>{filteredCustomers.length} {filteredCustomers.length === 1 ? 'cliente' : 'clientes'}</h2></div><button className="admin-action" onClick={() => setEditingCustomer(blankCustomer)}><UserPlus/>Nuevo cliente</button></div>
        <div className="toolbar"><label className="search-field"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, correo o teléfono…" type="search"/></label></div>
        <div className="customer-grid">{filteredCustomers.map((customer) => { const history = ordersFor(customer); const spent = history.filter((order) => order.status !== 'Cancelado').reduce((sum, order) => sum + order.total, 0); const wa = whatsappLink(customer.phone); return <article key={customer.id}><div className="customer-card-top"><div className="avatar">{customer.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div className="row-actions"><button onClick={() => setEditingCustomer({ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, address: customer.address, notes: customer.notes })} aria-label="Editar cliente" title="Editar"><Pencil/></button><button onClick={() => { if (confirm(`¿Eliminar a ${customer.name}? Sus pedidos se conservan en el historial.`)) run(() => deleteCustomer({ data: customer.id }), 'Cliente eliminado.') }} aria-label="Eliminar cliente" title="Eliminar"><Trash2/></button></div></div><h3>{customer.name}</h3>{customer.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>}{customer.phone && <p>{customer.phone}</p>}{customer.address && <p>{customer.address}</p>}{customer.notes && <small className="customer-notes">{customer.notes}</small>}<div className="customer-stats"><span><b>{history.length}</b> {history.length === 1 ? 'pedido' : 'pedidos'}</span><span><b>{money(spent)}</b> en compras</span></div><div className="customer-contact">{wa && <a href={wa} target="_blank" rel="noreferrer"><MessageCircle/>WhatsApp</a>}{customer.phone && <a href={`tel:${customer.phone.replace(/[^\d+]/g, '')}`}><Phone/>Llamar</a>}</div></article> })}{!filteredCustomers.length && <div className="empty-admin">No hay clientes que mostrar.</div>}</div>
      </section>}

      {tab === 'contenido' && <ContentEditor values={contentDraft} saved={data.content} dirty={contentDirty} uploading={uploading} onChange={setContentDraft} onUpload={uploadImage} onDiscard={() => setContentDraft(data.content)} onSave={() => run(() => saveContent({ data: contentDraft }), 'Cambios publicados en la tienda.', 'No pudimos guardar el contenido.')} busy={busy}/>}
    </main>

    <nav className="admin-bottom-nav" aria-label="Secciones">{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}>{item.icon}<span>{item.short}</span>{Boolean(item.badge) && <b className="nav-badge">{item.badge}</b>}</button>)}</nav>

    {toast && <div className={`admin-toast ${toast.kind}`} role="status">{toast.kind === 'ok' ? <CircleCheck/> : <TriangleAlert/>}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Cerrar aviso"><X/></button></div>}

    {viewingOrder && <OrderDetail order={viewingOrder} money={money} busy={busy} brand={invoiceContext.brand} onClose={() => setViewingOrderId(null)} onStatus={setOrderStatus} onDownload={download} onShare={share} onDelete={removeOrder}/>}

    {editing && <div className="modal-wrap" onClick={(event) => { if (event.target === event.currentTarget && !busy) setEditing(null) }}><form className="product-modal" onSubmit={handleProduct}><button type="button" className="modal-close" onClick={() => setEditing(null)} aria-label="Cerrar"><X/></button><span>CATÁLOGO</span><h2>{editing.id ? 'Editar producto' : 'Nuevo producto'}</h2>
      <div className="product-editor">
        <div className="image-editor"><div className="image-preview">{editing.image ? <img src={editing.image} alt="Vista previa"/> : <div className="image-empty"><ImagePlus/><p>Sin imagen</p></div>}{uploading === 'product' && <div className="image-loading"><LoaderCircle/>Subiendo...</div>}</div><label className="upload-zone"><ImagePlus/>{editing.image ? 'Cambiar imagen' : 'Subir imagen'}<input hidden type="file" accept="image/*" disabled={uploading !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadImage(file, 'product') }}/></label><label className="small-label">o pega una URL<input value={editing.image} onChange={(event) => setEditing({ ...editing, image: event.target.value })} placeholder="https://..."/></label></div>
        <div className="form-grid">
          <label className="wide">Nombre<input required value={editing.name} maxLength={120} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="Ej. Aceite Luz Lenta"/></label>
          <label className="wide">Categoría<input required list="category-options" value={editing.category} maxLength={60} onChange={(event) => setEditing({ ...editing, category: event.target.value })} placeholder="Rostro, Cuerpo, Aromas..."/><datalist id="category-options">{categories.map((item) => <option key={item} value={item}/>)}</datalist></label>
          <label>Precio ({currency})<input required inputMode="decimal" value={editing.price} onChange={(event) => setEditing({ ...editing, price: event.target.value.replace(/[^\d.,]/g, '') })} placeholder="0.00"/><small className="field-hint">Vista en tienda: {money(toCents(editing.price))}</small></label>
          <label>Existencias<input required type="number" min="0" step="1" inputMode="numeric" value={editing.stock} onChange={(event) => setEditing({ ...editing, stock: event.target.value })}/></label>
          <label className="wide">Descripción<textarea required rows={4} maxLength={2000} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} placeholder="Qué es, para qué sirve y qué la hace especial."/></label>
          <label className="check-field wide"><input type="checkbox" checked={editing.featured} onChange={(event) => setEditing({ ...editing, featured: event.target.checked })}/>Producto destacado <small>(aparece primero con la etiqueta «Favorito»)</small></label>
        </div>
      </div>
      <div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setEditing(null)}>Cancelar</button><button className="primary-button" disabled={busy || uploading !== null}><Save/>{busy ? 'Guardando...' : 'Guardar producto'}</button></div></form></div>}

    {editingCustomer && <div className="modal-wrap" onClick={(event) => { if (event.target === event.currentTarget && !busy) setEditingCustomer(null) }}><form className="product-modal narrow" onSubmit={handleCustomer}><button type="button" className="modal-close" onClick={() => setEditingCustomer(null)} aria-label="Cerrar"><X/></button><span>COMUNIDAD</span><h2>{editingCustomer.id ? 'Editar cliente' : 'Registrar cliente'}</h2><div className="form-grid"><label className="wide">Nombre completo<input required value={editingCustomer.name} onChange={(event) => setEditingCustomer({ ...editingCustomer, name: event.target.value })}/></label><label>Teléfono<input type="tel" value={editingCustomer.phone} onChange={(event) => setEditingCustomer({ ...editingCustomer, phone: event.target.value })}/></label><label>Correo<input type="email" value={editingCustomer.email} onChange={(event) => setEditingCustomer({ ...editingCustomer, email: event.target.value })}/></label><label className="wide">Dirección<input value={editingCustomer.address} onChange={(event) => setEditingCustomer({ ...editingCustomer, address: event.target.value })}/></label><label className="wide">Notas internas<textarea rows={3} value={editingCustomer.notes} onChange={(event) => setEditingCustomer({ ...editingCustomer, notes: event.target.value })} placeholder="Preferencias, alergias a ingredientes, fechas especiales..."/></label></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setEditingCustomer(null)}>Cancelar</button><button className="primary-button" disabled={busy}><Save/>{busy ? 'Guardando...' : 'Guardar cliente'}</button></div></form></div>}
  </div>
}

function toDraft(product: Product): ProductDraft {
  return { id: product.id, name: product.name, category: product.category, description: product.description, image: product.image, featured: product.featured, price: (product.price / 100).toFixed(2), stock: String(product.stock) }
}

function OrderTable({ orders, money, onOpen, onStatus, busy, emptyText = 'Todavía no hay pedidos.' }: { orders: Order[]; money: (value: number) => string; onOpen: (order: Order) => void; onStatus: (order: Order, patch: Partial<Pick<Order, 'status' | 'paymentStatus'>>) => void; busy: boolean; emptyText?: string }) {
  return <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Pago</th><th>Total</th><th className="col-actions"><span className="sr-only">Acciones</span></th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}>
    <td data-label="Pedido"><button className="order-link" onClick={() => onOpen(order)}>{order.orderNumber}</button><small>{order.items.reduce((sum, item) => sum + item.quantity, 0)} artículos</small></td>
    <td data-label="Cliente">{order.customerName}<small>{order.phone || order.email}</small></td>
    <td data-label="Fecha">{shortDate(order.createdAt)}</td>
    <td data-label="Estado"><select className={statusClass(order.status)} disabled={busy} value={order.status} onChange={(event) => onStatus(order, { status: event.target.value })} aria-label="Estado del pedido">{ORDER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td>
    <td data-label="Pago"><select className={statusClass(order.paymentStatus)} disabled={busy} value={order.paymentStatus} onChange={(event) => onStatus(order, { paymentStatus: event.target.value })} aria-label="Estado del pago">{PAYMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td>
    <td data-label="Total"><strong>{money(order.total)}</strong></td>
    <td className="col-actions" data-label="Acciones"><button className="view-button" onClick={() => onOpen(order)}>Ver detalle <ArrowUpRight/></button></td>
  </tr>)}</tbody></table>{!orders.length && <div className="empty-admin">{emptyText}</div>}</div>
}

function OrderDetail({ order, money, busy, brand, onClose, onStatus, onDownload, onShare, onDelete }: { order: Order; money: (value: number) => string; busy: boolean; brand: string; onClose: () => void; onStatus: (order: Order, patch: Partial<Pick<Order, 'status' | 'paymentStatus'>>) => void; onDownload: (order: Order) => void; onShare: (order: Order) => void; onDelete: (order: Order) => void }) {
  const [working, setWorking] = useState<'pdf' | 'share' | null>(null)
  const wa = whatsappLink(order.phone, `Hola ${order.customerName.split(' ')[0]}, te escribimos de ${brand} sobre tu pedido ${order.orderNumber} (${money(order.total)}).`)
  const act = async (kind: 'pdf' | 'share') => { setWorking(kind); try { await (kind === 'pdf' ? onDownload(order) : onShare(order)) } finally { setWorking(null) } }
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0)
  return <div className="modal-wrap" onClick={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="order-detail" role="dialog" aria-modal="true" aria-label={`Pedido ${order.orderNumber}`}>
    <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar"><X/></button>
    <span>PEDIDO · {dateTime(order.createdAt)}</span>
    <h2>{order.orderNumber}</h2>
    <div className="detail-status">
      <label>Estado<select className={statusClass(order.status)} disabled={busy} value={order.status} onChange={(event) => onStatus(order, { status: event.target.value })}>{ORDER_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Pago<select className={statusClass(order.paymentStatus)} disabled={busy} value={order.paymentStatus} onChange={(event) => onStatus(order, { paymentStatus: event.target.value })}>{PAYMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
    </div>
    <div className="detail-grid">
      <section><h3>Cliente</h3><p className="detail-name">{order.customerName}</p>{order.phone && <p>{order.phone}</p>}{order.email && <p><a href={`mailto:${order.email}`}>{order.email}</a></p>}{order.address && <p className="detail-address">{order.address}</p>}<div className="customer-contact">{wa && <a href={wa} target="_blank" rel="noreferrer"><MessageCircle/>WhatsApp</a>}{order.phone && <a href={`tel:${order.phone.replace(/[^\d+]/g, '')}`}><Phone/>Llamar</a>}{order.email && <a href={`mailto:${order.email}?subject=${encodeURIComponent(`Tu pedido ${order.orderNumber} — ${brand}`)}`}><Mail/>Correo</a>}</div></section>
      <section><h3>Productos · {units} {units === 1 ? 'artículo' : 'artículos'}</h3><ul className="detail-items">{order.items.map((item, index) => <li key={index}>{item.image ? <img src={item.image} alt=""/> : <span className="thumb-empty"/>}<div><strong>{item.name}</strong><small>{item.quantity} × {money(item.price)}</small></div><b>{money(item.price * item.quantity)}</b></li>)}</ul><div className="detail-total"><span>Total</span><strong>{money(order.total)}</strong></div></section>
    </div>
    <div className="detail-actions">
      <button className="primary-button" onClick={() => act('pdf')} disabled={working !== null}>{working === 'pdf' ? <LoaderCircle className="spin"/> : <Download/>}Descargar factura PDF</button>
      <button className="ghost-button" onClick={() => act('share')} disabled={working !== null}>{working === 'share' ? <LoaderCircle className="spin"/> : <Share2/>}Compartir</button>
      <button className="danger-button" onClick={() => onDelete(order)} disabled={busy}><Trash2/>Eliminar</button>
    </div>
  </div></div>
}

type InvoiceContext = { brand: string; currency: string; whatsapp: string; email: string }

function buildOrderText(order: Order, ctx: InvoiceContext) {
  const money = (value: number) => formatMoney(value, ctx.currency)
  const lines = order.items.map((item) => `• ${item.quantity}× ${item.name} — ${money(item.price * item.quantity)}`).join('\n')
  return [
    `*Pedido ${order.orderNumber}*`,
    `Cliente: ${order.customerName}`,
    `Fecha: ${shortDate(order.createdAt)}`,
    '',
    lines,
    '',
    `*Total: ${money(order.total)}*`,
    `Estado: ${order.status} · Pago: ${order.paymentStatus}`,
    '',
    ctx.brand,
  ].join('\n')
}

const statusBadge = (status: string) => {
  const key = status.toLowerCase()
  if (key === 'entregado' || key === 'pagado') return 'background:#dcece1;color:#2f6b4b'
  if (key === 'cancelado' || key === 'reembolsado') return 'background:#f2d9d4;color:#8c3025'
  if (key === 'enviado' || key === 'preparando') return 'background:#e5e2f3;color:#4b4386'
  return 'background:#f4e6cf;color:#8a5a1f'
}

// Isotipo en SVG plano para la factura (html2canvas no resuelve bien los
// gradientes con id, así que aquí se usa un color sólido).
const INVOICE_MARK = '<svg width="34" height="40" viewBox="0 0 240 280" xmlns="http://www.w3.org/2000/svg"><path d="M20 272V120a100 100 0 0 1 200 0v152z" fill="#ba5b46"/><path d="M120 96c0 0-40 48-40 76a40 40 0 0 0 80 0c0-28-40-76-40-76z" fill="#fffaf7"/></svg>'

// Factura con la identidad de la marca. Todo texto que viene de clientes se
// escapa para que nadie pueda inyectar HTML o scripts en el panel.
function buildOrderHtml(order: Order, ctx: InvoiceContext) {
  const money = (value: number) => formatMoney(value, ctx.currency)
  const ink = '#182431'; const clay = '#ba5b46'; const paper = '#f4eee9'; const line = 'rgba(24,36,49,.14)'; const muted = '#6d6e70'
  const rows = order.items.map((item) => `<tr>
      <td style="padding:13px 10px;border-bottom:1px solid ${line};font-size:14px">${escapeHtml(item.name)}</td>
      <td style="padding:13px 10px;border-bottom:1px solid ${line};font-size:14px;text-align:center">${Number(item.quantity)}</td>
      <td style="padding:13px 10px;border-bottom:1px solid ${line};font-size:14px;text-align:right">${money(item.price)}</td>
      <td style="padding:13px 10px;border-bottom:1px solid ${line};font-size:14px;text-align:right;font-weight:700">${money(item.price * item.quantity)}</td>
    </tr>`).join('')
  const th = `text-align:left;text-transform:uppercase;font-size:10px;letter-spacing:.08em;color:${clay};padding:9px 10px;border-bottom:2px solid ${clay}`
  const badge = (label: string, status: string) => `<span style="display:inline-block;font-size:11px;font-weight:700;padding:5px 14px;border-radius:999px;${statusBadge(status)}">${escapeHtml(label)}</span>`
  const contact = [ctx.whatsapp && `WhatsApp ${escapeHtml(ctx.whatsapp)}`, ctx.email && escapeHtml(ctx.email)].filter(Boolean).join(' · ')

  return `<div id="rc-factura" style="width:720px;background:${paper};color:${ink};font-family:'Manrope',system-ui,sans-serif;padding:48px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${ink};padding-bottom:22px;margin-bottom:28px">
      <div style="display:flex;gap:14px;align-items:center">
        ${INVOICE_MARK}
        <div>
          <div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:700;letter-spacing:-.02em">${escapeHtml(ctx.brand)}</div>
          <div style="font-size:12px;color:${muted};margin-top:4px">Cuidado personal · hecho con intención</div>
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:800;color:${clay};letter-spacing:.04em">PEDIDO</div>
        <div style="font-size:12px;color:${muted};margin-top:4px">N.º <strong style="color:${ink}">${escapeHtml(order.orderNumber)}</strong></div>
        <div style="font-size:12px;color:${muted}">Fecha: ${shortDate(order.createdAt)}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:26px">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${muted};margin-bottom:6px">Cliente</div>
        <div style="font-size:16px;font-weight:700">${escapeHtml(order.customerName)}</div>
        <div style="font-size:13px;color:${muted};margin-top:2px">${escapeHtml(order.phone)}${order.email ? ' · ' + escapeHtml(order.email) : ''}</div>
        ${order.address ? `<div style="font-size:13px;color:${muted};margin-top:2px;max-width:340px;white-space:pre-line">${escapeHtml(order.address)}</div>` : ''}
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;gap:8px;align-items:flex-end">
        ${badge(order.status.toUpperCase(), order.status)}
        ${badge(`PAGO ${order.paymentStatus.toUpperCase()}`, order.paymentStatus)}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
      <thead><tr>
        <th style="${th}">Producto</th>
        <th style="${th};text-align:center">Cant.</th>
        <th style="${th};text-align:right">Precio</th>
        <th style="${th};text-align:right">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;margin-top:6px"><tr><td style="padding:16px 10px 4px;border-top:2px solid ${ink};font-weight:800;font-size:13px;color:${muted};text-transform:uppercase;letter-spacing:.05em">Total</td><td style="padding:16px 10px 4px;border-top:2px solid ${ink};font-weight:800;font-size:22px;text-align:right;font-family:'Syne',sans-serif">${money(order.total)}</td></tr></table>
    <div style="border-top:1px solid ${line};margin-top:28px;padding-top:16px;font-size:11px;color:${muted};text-align:center;line-height:1.7">
      Gracias por hacer espacio para este ritual.${contact ? `<br>${contact}` : ''}
    </div>
  </div>`
}

// Renderiza la factura en un iframe aislado (sin las hojas de estilo del
// sitio) para que html2canvas capture solo los estilos de arriba. El iframe
// se retira siempre, incluso si algo falla.
async function renderOrderCanvas(order: Order, ctx: InvoiceContext) {
  const { default: html2canvas } = await import('html2canvas')
  const iframe = document.createElement('iframe')
  Object.assign(iframe.style, { position: 'fixed', top: '0', left: '-99999px', width: '720px', height: '10px', border: '0' })
  document.body.appendChild(iframe)
  try {
    const idoc = iframe.contentDocument
    if (!idoc) throw new Error('No se pudo preparar la factura.')
    idoc.open()
    idoc.write('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=Manrope:wght@400;600;700;800&display=swap"></head><body style="margin:0;padding:0"></body></html>')
    idoc.close()
    idoc.body.innerHTML = buildOrderHtml(order, ctx)
    if (idoc.fonts?.ready) await Promise.race([idoc.fonts.ready, new Promise((resolve) => setTimeout(resolve, 600))])
    return await html2canvas(idoc.body.firstElementChild as HTMLElement, { scale: 2, backgroundColor: '#f4eee9', windowWidth: 720 })
  } finally {
    document.body.removeChild(iframe)
  }
}

async function downloadOrder(order: Order, ctx: InvoiceContext) {
  const canvas = await renderOrderCanvas(order, ctx)
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth - 40
  const imgHeight = imgWidth * (canvas.height / canvas.width)
  // Si la factura es más alta que una página (muchos productos), se reparte en varias.
  const image = canvas.toDataURL('image/png')
  let offset = 0
  while (offset < imgHeight) {
    if (offset > 0) pdf.addPage()
    pdf.addImage(image, 'PNG', 20, 20 - offset, imgWidth, imgHeight)
    offset += pageHeight - 40
  }
  pdf.save(`Pedido-${order.orderNumber}.pdf`)
}

async function shareOrder(order: Order, ctx: InvoiceContext) {
  const text = buildOrderText(order, ctx)
  // Sin Web Share API terminamos en WhatsApp: la ventana se abre ya, dentro
  // del clic, para que el navegador no la bloquee como pop-up.
  const canShareNatively = typeof navigator.share === 'function'
  const popup = canShareNatively ? null : window.open('', '_blank')
  try {
    const canvas = await renderOrderCanvas(order, ctx)
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (blob) {
      const file = new File([blob], `Pedido-${order.orderNumber}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        popup?.close()
        await navigator.share({ files: [file], title: `Pedido ${order.orderNumber}`, text })
        return
      }
    }
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') { popup?.close(); return }
  }
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
  if (navigator.share) {
    try { popup?.close(); await navigator.share({ title: `Pedido ${order.orderNumber}`, text }); return }
    catch (caught) { if (caught instanceof Error && caught.name === 'AbortError') return }
  }
  // Último recurso: WhatsApp con el texto del pedido.
  if (popup && !popup.closed) { popup.location.href = waUrl; return }
  if (!window.open(waUrl, '_blank')) throw new Error('Tu navegador bloqueó la ventana para compartir. Usa «Descargar factura PDF» y envíala manualmente.')
}

type FieldKind = 'text' | 'textarea' | 'image' | 'email' | 'tel' | 'currency'
type Field = { key: string; label: string; kind?: FieldKind; hint?: string; placeholder?: string; wide?: boolean }

const CONTENT_GROUPS: Array<{ title: string; description: string; fields: Field[] }> = [
  { title: 'Tienda y contacto', description: 'Datos que aparecen en el pie de página, los botones de WhatsApp y las facturas.', fields: [
    { key: 'brandName', label: 'Nombre de la marca' },
    { key: 'currency', label: 'Moneda de los precios', kind: 'currency', hint: 'Los precios guardados no cambian de valor, solo el símbolo con que se muestran.' },
    { key: 'whatsapp', label: 'Número de WhatsApp', kind: 'tel', placeholder: '1 809 000 0000', hint: 'Con código de país. Se usa en todos los botones de WhatsApp de la tienda.' },
    { key: 'contactEmail', label: 'Correo de contacto (público)', kind: 'email', placeholder: 'hola@tumarca.com' },
    { key: 'instagram', label: 'Instagram', placeholder: '@ritualcobre' },
    { key: 'schedule', label: 'Horario de atención' },
  ] },
  { title: 'Notificaciones', description: 'Correo privado: no se muestra en la tienda.', fields: [
    { key: 'notificationEmail', label: 'Correo para avisos de nuevos pedidos', kind: 'email', placeholder: 'pedidos@tudominio.com', hint: 'Cada pedido nuevo envía un correo automático con los detalles a esta dirección.', wide: true },
  ] },
  { title: 'Portada principal', description: 'Lo primero que ve el cliente al entrar.', fields: [
    { key: 'eyebrow', label: 'Texto superior' },
    { key: 'heroCta', label: 'Texto del botón principal' },
    { key: 'heroTitle', label: 'Título principal', wide: true },
    { key: 'heroDescription', label: 'Descripción', kind: 'textarea', wide: true },
    { key: 'heroBadge', label: 'Texto del círculo lavanda' },
    { key: 'heroImage', label: 'Imagen principal', kind: 'image', wide: true },
    { key: 'trust1', label: 'Garantía 1' },
    { key: 'trust2', label: 'Garantía 2' },
    { key: 'trust3', label: 'Garantía 3' },
  ] },
  { title: 'Navegación', description: 'Enlaces del menú superior en computadora.', fields: [
    { key: 'navCatalog', label: 'Enlace al catálogo' },
    { key: 'navBenefits', label: 'Enlace a beneficios' },
    { key: 'navContact', label: 'Enlace a contacto' },
  ] },
  { title: 'Beneficios', description: 'Sección «Manifiesto».', fields: [
    { key: 'benefitsTitle', label: 'Título de la sección', wide: true },
    { key: 'benefit1Title', label: 'Beneficio 1 — título' }, { key: 'benefit1Text', label: 'Beneficio 1 — texto' },
    { key: 'benefit2Title', label: 'Beneficio 2 — título' }, { key: 'benefit2Text', label: 'Beneficio 2 — texto' },
    { key: 'benefit3Title', label: 'Beneficio 3 — título' }, { key: 'benefit3Text', label: 'Beneficio 3 — texto' },
  ] },
  { title: 'Catálogo e historia', description: 'Encabezado del catálogo y sección «Nuestra historia».', fields: [
    { key: 'catalogTitle', label: 'Título del catálogo' },
    { key: 'storyTitle', label: 'Título de la historia' },
    { key: 'catalogDescription', label: 'Descripción del catálogo', kind: 'textarea', wide: true },
    { key: 'storyText', label: 'Texto de la historia', kind: 'textarea', wide: true },
    { key: 'storyImage', label: 'Imagen de la historia', kind: 'image', wide: true },
  ] },
  { title: 'Bolsa, pedido y pie de página', description: 'Textos del carrito, del formulario de pedido y del pie.', fields: [
    { key: 'cartTitle', label: 'Título de la bolsa' },
    { key: 'checkoutTitle', label: 'Título del formulario de pedido' },
    { key: 'footerText', label: 'Frase del pie de página', wide: true },
    { key: 'developerCredit', label: 'Crédito del desarrollador', wide: true },
  ] },
  { title: 'Políticas', description: 'Página /politicas. Deja una línea en blanco para separar párrafos.', fields: [
    { key: 'policiesUpdated', label: 'Fecha de última actualización', wide: true },
    { key: 'policyPrivacy', label: 'Privacidad', kind: 'textarea', wide: true },
    { key: 'policyOrders', label: 'Pedidos y pagos', kind: 'textarea', wide: true },
    { key: 'policyShipping', label: 'Envíos y entregas', kind: 'textarea', wide: true },
    { key: 'policyReturns', label: 'Cambios y devoluciones', kind: 'textarea', wide: true },
    { key: 'policyTerms', label: 'Términos de compra', kind: 'textarea', wide: true },
    { key: 'policyContact', label: 'Contacto', kind: 'textarea', wide: true },
  ] },
]

function ContentEditor({ values, saved, dirty, uploading, onChange, onUpload, onDiscard, onSave, busy }: { values: Record<string, string>; saved: Record<string, string>; dirty: boolean; uploading: string | null; onChange: (value: Record<string, string>) => void; onUpload: (file: File, key: string) => void; onDiscard: () => void; onSave: () => Promise<unknown>; busy: boolean }) {
  const set = (key: string, value: string) => onChange({ ...values, [key]: value })
  return <section className="content-editor">
    <div className="editor-top"><div><span>TEXTOS E IMÁGENES</span><h2>Editor de la tienda</h2><p>Cambia la voz de la marca sin tocar el código. Los cambios se publican al guardar.</p></div></div>
    <nav className="editor-index" aria-label="Secciones del editor">{CONTENT_GROUPS.map((group, index) => <a key={group.title} href={`#grupo-${index}`}>{group.title}</a>)}</nav>
    {CONTENT_GROUPS.map((group, index) => <div className="editor-group" id={`grupo-${index}`} key={group.title}><h3>{group.title}</h3><p className="editor-group-description">{group.description}</p><div className="editor-fields">{group.fields.map((field) => {
      const value = values[field.key] ?? ''
      const changed = value !== (saved[field.key] ?? '')
      const Wrapper = field.kind === 'image' ? 'div' : 'label'
      return <Wrapper className={`field-block ${field.wide || field.kind === 'textarea' || field.kind === 'image' ? 'wide' : ''} ${changed ? 'changed' : ''}`} key={field.key}>{field.label}{changed && <em className="changed-dot">sin guardar</em>}
        {field.kind === 'textarea' ? <textarea rows={field.key.startsWith('policy') ? 5 : 3} value={value} onChange={(event) => set(field.key, event.target.value)}/>
          : field.kind === 'currency' ? <select value={value || 'USD'} onChange={(event) => set(field.key, event.target.value)}>{CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select>
          : field.kind === 'image' ? <div className="content-image"><div className="content-image-preview">{value ? <img src={value} alt=""/> : <ImagePlus/>}{uploading === field.key && <div className="image-loading"><LoaderCircle/>Subiendo...</div>}</div><div className="content-image-fields"><input value={value} onChange={(event) => set(field.key, event.target.value)} placeholder="https://..."/><label className="inline-upload"><ImagePlus/>Subir desde el dispositivo<input hidden type="file" accept="image/*" disabled={uploading !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUpload(file, field.key) }}/></label></div></div>
          : <input type={field.kind === 'email' ? 'email' : field.kind === 'tel' ? 'tel' : 'text'} placeholder={field.placeholder} value={value} onChange={(event) => set(field.key, event.target.value)}/>}
        {field.hint && <small className="field-hint">{field.hint}</small>}
      </Wrapper>
    })}</div></div>)}
    <div className={`save-bar ${dirty ? 'visible' : ''}`}><p>{dirty ? 'Tienes cambios sin publicar.' : 'Todo está publicado.'}</p><div>{dirty && <button className="ghost-button" onClick={onDiscard} disabled={busy}>Descartar</button>}<button className="admin-action" disabled={busy || !dirty || uploading !== null} onClick={() => onSave()}><Save/>{busy ? 'Guardando...' : 'Guardar cambios'}</button></div></div>
  </section>
}
