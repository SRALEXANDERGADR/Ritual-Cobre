import { jsPDF } from 'jspdf'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Boxes, Download, FileText, ImagePlus, LayoutDashboard, LoaderCircle, LogOut, PackagePlus, Pencil, ReceiptText, Save, Search, Share2, Trash2, UserPlus, Users } from 'lucide-react'
import { checkSession, deleteCustomer, deleteOrder, deleteProduct, getAdminData, login, logout, saveContent, saveCustomer, saveProduct, updateOrderStatus } from '@/lib/store'

type Product = { id: number; name: string; category: string; description: string; price: number; stock: number; image: string; featured: boolean }
type Order = { id: number; orderNumber: string; customerName: string; email: string; phone: string; address: string; total: number; status: string; paymentStatus: string; items: Array<{ name: string; price: number; quantity: number }>; createdAt: string | Date }
type Customer = { id: number; name: string; email: string; phone: string; address: string; notes: string; createdAt: string | Date }
type AdminData = { products: Product[]; orders: Order[]; customers: Customer[]; content: Record<string, string> }
type Tab = 'resumen' | 'productos' | 'clientes' | 'pedidos' | 'contenido'
type CustomerDraft = { id?: number; name: string; email: string; phone: string; address: string; notes: string }

const money = (value: number) => new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(value / 100)
const shortDate = (value: string | Date) => new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
const blankProduct = { name: '', category: 'Rostro', description: '', price: 0, stock: 0, image: '', featured: false }
const blankCustomer: CustomerDraft = { name: '', email: '', phone: '', address: '', notes: '' }
const authErrorMessage = (error: unknown) => error instanceof Error ? error.message : 'No pudimos completar el acceso.'

export function AdminPanel() {
  const initialized = useRef(false)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [data, setData] = useState<AdminData | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<(typeof blankProduct & { id?: number }) | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<CustomerDraft | null>(null)
  const [contentDraft, setContentDraft] = useState<Record<string, string>>({})

  async function refresh() {
    const result = await getAdminData()
    setData(result as AdminData)
    setContentDraft(result.content)
  }

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function initializeAuth() {
      try {
        const ok = await checkSession()
        setAuthenticated(Boolean(ok))
        if (ok) await refresh()
      } catch (caught) {
        setError(authErrorMessage(caught))
        setAuthenticated(false)
      }
    }

    initializeAuth().catch(() => setAuthenticated(false))
  }, [])

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try { await login({ data: { password: String(form.get('password')) } }); setAuthenticated(true); await refresh() }
    catch (caught) { setError(authErrorMessage(caught)) }
    finally { setBusy(false) }
  }

  async function handleProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return; setBusy(true); setError('')
    try { await saveProduct({ data: { ...editing, price: Number(editing.price), stock: Number(editing.stock) } }); setEditing(null); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos guardar el producto.') }
    finally { setBusy(false) }
  }

  async function handleCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingCustomer) return; setBusy(true); setError('')
    try { await saveCustomer({ data: editingCustomer }); setEditingCustomer(null); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos guardar el cliente.') }
    finally { setBusy(false) }
  }

  async function uploadImage(file: File, target: 'product' | 'hero') {
    setBusy(true); setError('')
    try {
      const body = new FormData(); body.append('file', file)
      const response = await fetch('/api/upload', { method: 'POST', body })
      const result = await response.json() as { url?: string; error?: string }
      if (!response.ok || !result.url) throw new Error(result.error || 'No pudimos subir la imagen.')
      if (target === 'product') setEditing((current) => current ? { ...current, image: result.url! } : current)
      else setContentDraft((current) => ({ ...current, heroImage: result.url! }))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos subir la imagen.') }
    finally { setBusy(false) }
  }

  const filteredProducts = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.products
    return data.products.filter((product) => product.name.toLowerCase().includes(q) || product.category.toLowerCase().includes(q))
  }, [data, query])

  const filteredCustomers = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.customers
    return data.customers.filter((customer) => customer.name.toLowerCase().includes(q) || customer.email.toLowerCase().includes(q) || customer.phone.toLowerCase().includes(q))
  }, [data, query])

  const filteredOrders = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    if (!q) return data.orders
    return data.orders.filter((order) => order.orderNumber.toLowerCase().includes(q) || order.customerName.toLowerCase().includes(q) || order.email.toLowerCase().includes(q))
  }, [data, query])

  if (authenticated === null) return <div className="admin-loading"><LoaderCircle/><p>Preparando tu espacio...</p></div>
  if (!authenticated) return <div className="admin-login"><div className="login-art"><Link to="/"><ArrowLeft/> Volver a la tienda</Link><div className="login-monogram">RC</div><p>El detrás de escena de cada ritual.</p></div><div className="login-form-wrap"><div><span>ACCESO PRIVADO</span><h1>Panel de<br/>administración</h1><p>Ingresa la contraseña de administración.</p><form onSubmit={handleLogin}><label>Contraseña<input required type="password" name="password" placeholder="••••••••" autoFocus/></label>{error && <p className="form-error">{error}</p>}<button className="primary-button full" disabled={busy}>{busy ? 'Ingresando...' : 'Entrar al panel'}</button></form></div></div></div>

  if (!data) return <div className="admin-loading"><LoaderCircle/><p>Cargando información...</p></div>
  const pending = data.orders.filter((order) => order.paymentStatus === 'Pendiente').reduce((sum, order) => sum + order.total, 0)
  const lowStock = data.products.filter((product) => product.stock <= 5).length
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'resumen', label: 'Resumen', icon: <LayoutDashboard/> }, { id: 'productos', label: 'Productos', icon: <Boxes/> }, { id: 'clientes', label: 'Clientes', icon: <Users/> }, { id: 'pedidos', label: 'Facturas / pedidos', icon: <ReceiptText/> }, { id: 'contenido', label: 'Editor de contenido', icon: <FileText/> },
  ]

  return <div className="admin-shell"><aside className="admin-sidebar"><Link to="/" className="admin-brand"><span>RC</span><div>Ritual Cobre<small>Administración</small></div></Link><nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { setTab(item.id); setQuery('') }}>{item.icon}{item.label}</button>)}</nav><button className="logout" onClick={async () => { await logout(); setAuthenticated(false) }}><LogOut/>Cerrar sesión</button></aside>
    <main className="admin-main"><header><div><span>ESPACIO DE GESTIÓN</span><h1>{tabs.find((item) => item.id === tab)?.label}</h1></div><Link to="/">Ver tienda <ArrowLeft/></Link></header>{error && <div className="admin-alert">{error}</div>}
      {tab === 'resumen' && <div className="dashboard"><div className="metric-grid"><article><span>Pedidos totales</span><strong>{data.orders.length}</strong><small>Registro histórico</small></article><article><span>Saldos pendientes</span><strong>{money(pending)}</strong><small>Por confirmar</small></article><article><span>Productos activos</span><strong>{data.products.length}</strong><small>{data.products.filter((product) => product.stock === 0).length} agotados</small></article><article><span>Clientes</span><strong>{data.customers.length}</strong><small>Base de contactos</small></article><article><span>Stock bajo</span><strong>{lowStock}</strong><small>5 unidades o menos</small></article></div><section className="admin-card"><div className="card-title"><div><span>ACTIVIDAD RECIENTE</span><h2>Últimos pedidos</h2></div><button onClick={() => setTab('pedidos')}>Ver todos</button></div><OrderTable orders={data.orders.slice(0, 5)} onRefresh={refresh} onView={downloadOrder} onShare={shareOrder} onDelete={async (order) => { if (confirm(`¿Eliminar el pedido ${order.orderNumber}?`)) { await deleteOrder({ data: order.id }); await refresh() } }}/></section></div>}
      {tab === 'productos' && <section className="admin-card"><div className="card-title"><div><span>CATÁLOGO</span><h2>{filteredProducts.length} productos</h2></div><button className="admin-action" onClick={() => setEditing(blankProduct)}><PackagePlus/>Nuevo producto</button></div><label className="search-field"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o categoría…"/></label><div className="admin-product-list">{filteredProducts.map((product) => <article key={product.id}><img src={product.image} alt="" loading="lazy" decoding="async"/><div><span>{product.category}</span><h3>{product.name}</h3><p>{product.stock} unidades · {money(product.price)}</p></div><div className="row-actions"><button onClick={() => setEditing(product)}><Pencil/></button><button onClick={async () => { if (confirm('¿Eliminar este producto?')) { await deleteProduct({ data: product.id }); await refresh() } }}><Trash2/></button></div></article>)}{!filteredProducts.length && <div className="empty-admin">No hay productos que mostrar.</div>}</div></section>}
      {tab === 'clientes' && <section className="admin-card"><div className="card-title"><div><span>COMUNIDAD</span><h2>{filteredCustomers.length} clientes</h2></div><button className="admin-action" onClick={() => setEditingCustomer(blankCustomer)}><UserPlus/>Nuevo cliente</button></div><label className="search-field"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, correo o teléfono…"/></label><div className="customer-grid">{filteredCustomers.map((customer) => <article key={customer.id}><div className="customer-card-top"><div className="avatar">{customer.name.slice(0,2).toUpperCase()}</div><div className="row-actions"><button onClick={() => setEditingCustomer(customer)}><Pencil/></button><button onClick={async () => { if (confirm(`¿Eliminar a ${customer.name}?`)) { await deleteCustomer({ data: customer.id }); await refresh() } }}><Trash2/></button></div></div><h3>{customer.name}</h3>{customer.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>}<p>{customer.phone}</p><p>{customer.address}</p>{customer.notes && <small className="customer-notes">{customer.notes}</small>}<small>{data.orders.filter((order) => order.email && order.email === customer.email).length} pedidos</small></article>)}{!filteredCustomers.length && <div className="empty-admin">No hay clientes que mostrar.</div>}</div></section>}
      {tab === 'pedidos' && <section className="admin-card"><div className="card-title"><div><span>HISTORIAL</span><h2>Facturas y pedidos</h2></div></div><label className="search-field"><Search/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por número, cliente o correo…"/></label><OrderTable orders={filteredOrders} onRefresh={refresh} onView={downloadOrder} onShare={shareOrder} onDelete={async (order) => { if (confirm(`¿Eliminar el pedido ${order.orderNumber}?`)) { await deleteOrder({ data: order.id }); await refresh() } }}/></section>}
      {tab === 'contenido' && <ContentEditor values={contentDraft} onChange={setContentDraft} onUpload={(file) => uploadImage(file, 'hero')} onSave={async () => { setBusy(true); await saveContent({ data: contentDraft }); await refresh(); setBusy(false) }} busy={busy}/>}
    </main>
    {editing && <div className="modal-wrap"><form className="product-modal" onSubmit={handleProduct}><button type="button" className="modal-close" onClick={() => setEditing(null)}>×</button><span>CATÁLOGO</span><h2>{editing.id ? 'Editar producto' : 'Nuevo producto'}</h2><div className="form-grid"><label>Nombre<input required value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })}/></label><label>Categoría<input required value={editing.category} onChange={(event) => setEditing({ ...editing, category: event.target.value })}/></label><label className="wide">Descripción<textarea required rows={3} value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })}/></label><label>Precio en centavos<input required type="number" min="0" value={editing.price} onChange={(event) => setEditing({ ...editing, price: Number(event.target.value) })}/></label><label>Existencias<input required type="number" min="0" value={editing.stock} onChange={(event) => setEditing({ ...editing, stock: Number(event.target.value) })}/></label><label className="wide">URL de imagen<input required value={editing.image} onChange={(event) => setEditing({ ...editing, image: event.target.value })}/></label><label className="upload-zone wide"><ImagePlus/>Subir imagen desde el dispositivo<input hidden type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0], 'product')}/></label><label className="check-field wide"><input type="checkbox" checked={editing.featured} onChange={(event) => setEditing({ ...editing, featured: event.target.checked })}/>Producto destacado</label></div><button className="primary-button full" disabled={busy}><Save/>{busy ? 'Guardando...' : 'Guardar producto'}</button></form></div>}
    {editingCustomer && <div className="modal-wrap"><form className="product-modal" onSubmit={handleCustomer}><button type="button" className="modal-close" onClick={() => setEditingCustomer(null)}>×</button><span>COMUNIDAD</span><h2>{editingCustomer.id ? 'Editar cliente' : 'Registrar cliente'}</h2><div className="form-grid"><label>Nombre completo<input required value={editingCustomer.name} onChange={(event) => setEditingCustomer({ ...editingCustomer, name: event.target.value })}/></label><label>Teléfono<input required value={editingCustomer.phone} onChange={(event) => setEditingCustomer({ ...editingCustomer, phone: event.target.value })}/></label><label>Correo<input type="email" value={editingCustomer.email} onChange={(event) => setEditingCustomer({ ...editingCustomer, email: event.target.value })}/></label><label>Dirección<input value={editingCustomer.address} onChange={(event) => setEditingCustomer({ ...editingCustomer, address: event.target.value })}/></label><label className="wide">Notas<textarea rows={3} value={editingCustomer.notes} onChange={(event) => setEditingCustomer({ ...editingCustomer, notes: event.target.value })}/></label></div><button className="primary-button full" disabled={busy}><Save/>{busy ? 'Guardando...' : 'Guardar cliente'}</button></form></div>}
  </div>
}

function buildOrderText(order: Order) {
  const lines = order.items.map((item) => `• ${item.quantity}x ${item.name} — ${money(item.price * item.quantity)}`).join('\n')
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
    'Ritual Cobre',
  ].filter(Boolean).join('\n')
}

// Folio corto y estable, derivado del número de pedido, para mostrar en la factura.
function orderFolio(order: Order) {
  return `RC-${order.orderNumber.replace(/[^0-9]/g, '').slice(-8) || order.id}`
}

const statusBadge = (status: string) => {
  const key = status.toLowerCase()
  if (key === 'entregado' || key === 'pagado') return { texto: status.toUpperCase(), estilo: 'background:#dcece1;color:#2f6b4b' }
  if (key === 'cancelado' || key === 'reembolsado') return { texto: status.toUpperCase(), estilo: 'background:#f2d9d4;color:#8c3025' }
  return { texto: status.toUpperCase(), estilo: 'background:#f4e6cf;color:#8a5a1f' }
}

// HTML de la factura con la identidad visual de Ritual Cobre (tinta, arcilla y
// papel — mismas variables que usa el sitio). Se renderiza a un canvas con
// html2canvas y de ahí sale tanto el PDF (imagen embebida) como la imagen
// que se comparte, para que ambos documentos luzcan exactamente igual a la
// vista previa, con color y tipografía incluidos.
function buildOrderHtml(order: Order) {
  const ink = '#182431'; const clay = '#ba5b46'; const paper = '#f4eee9'; const line = 'rgba(24,36,49,.14)'; const muted = '#6d6e70'
  const rows = order.items.map((item) => `<tr>
      <td style="padding:13px 10px;border-bottom:1px solid ${line};font-size:14px">${item.name}</td>
      <td style="padding:13px 10px;border-bottom:1px solid ${line};font-size:14px;text-align:center">${item.quantity}</td>
      <td style="padding:13px 10px;border-bottom:1px solid ${line};font-size:14px;text-align:right">${money(item.price)}</td>
      <td style="padding:13px 10px;border-bottom:1px solid ${line};font-size:14px;text-align:right;font-weight:700">${money(item.price * item.quantity)}</td>
    </tr>`).join('')
  const th = `text-align:left;text-transform:uppercase;font-size:10px;letter-spacing:.08em;color:${clay};padding:9px 10px;border-bottom:2px solid ${clay}`
  const estado = statusBadge(order.status)
  const pago = statusBadge(order.paymentStatus)

  return `<div id="rc-factura" style="width:720px;background:${paper};color:${ink};font-family:'Manrope',system-ui,sans-serif;padding:48px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid ${ink};padding-bottom:22px;margin-bottom:28px">
      <div>
        <div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:700;letter-spacing:-.02em">Ritual Cobre</div>
        <div style="font-size:12px;color:${muted};margin-top:6px">Cuidado personal · hecho con intención</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:800;color:${clay};letter-spacing:.04em">PEDIDO</div>
        <div style="font-size:12px;color:${muted};margin-top:4px">Folio: <strong style="color:${ink}">${orderFolio(order)}</strong></div>
        <div style="font-size:12px;color:${muted}">Fecha: ${shortDate(order.createdAt)}</div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:26px">
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${muted};margin-bottom:6px">Cliente</div>
        <div style="font-size:16px;font-weight:700">${order.customerName}</div>
        <div style="font-size:13px;color:${muted};margin-top:2px">${order.phone || ''}${order.email ? ' · ' + order.email : ''}</div>
        ${order.address ? `<div style="font-size:13px;color:${muted};margin-top:2px;max-width:320px">${order.address}</div>` : ''}
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;gap:8px;align-items:flex-end">
        <span style="display:inline-block;font-size:11px;font-weight:700;padding:5px 14px;border-radius:999px;${estado.estilo}">${estado.texto}</span>
        <span style="display:inline-block;font-size:11px;font-weight:700;padding:5px 14px;border-radius:999px;${pago.estilo}">PAGO ${pago.texto}</span>
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

    <div style="border-top:1px solid ${line};margin-top:28px;padding-top:16px;font-size:11px;color:${muted};text-align:center">
      Gracias por hacer espacio para este ritual. Documento generado automáticamente.
    </div>
  </div>`
}

// Renderiza la factura en un iframe aislado (sin las hojas de estilo del
// sitio) para que html2canvas capture únicamente los estilos inline de
// arriba, y devuelve el canvas resultante. El iframe se retira siempre,
// incluso si algo falla, para no dejar contenido ancho suelto en la página
// (eso es lo que causaba que el sitio se viera "corrido" hacia un lado).
async function renderOrderCanvas(order: Order) {
  const { default: html2canvas } = await import('html2canvas')
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '0'
  iframe.style.left = '-99999px'
  iframe.style.width = '720px'
  iframe.style.height = '10px'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  try {
    const idoc = iframe.contentDocument
    if (!idoc) throw new Error('No se pudo preparar la factura.')
    idoc.open()
    idoc.write('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@600;700&family=Manrope:wght@400;600;700;800&display=swap"></head><body style="margin:0;padding:0"></body></html>')
    idoc.close()
    idoc.body.innerHTML = buildOrderHtml(order)
    if (idoc.fonts?.ready) await Promise.race([idoc.fonts.ready, new Promise((r) => setTimeout(r, 300))])
    return await html2canvas(idoc.body.firstElementChild as HTMLElement, { scale: 2, backgroundColor: '#f4eee9', windowWidth: 720 })
  } finally {
    document.body.removeChild(iframe)
  }
}

async function downloadOrder(order: Order) {
  const canvas = await renderOrderCanvas(order)
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const imgWidth = pageWidth - 40
  const imgHeight = imgWidth * (canvas.height / canvas.width)
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 20, 20, imgWidth, imgHeight)
  pdf.save(`Pedido-${order.orderNumber}.pdf`)
}

async function shareOrder(order: Order) {
  const text = buildOrderText(order)
  // Si el dispositivo no tiene Web Share API, vamos a terminar en el
  // fallback de WhatsApp (window.open). Abrimos esa ventana AQUÍ, de
  // inmediato y de forma síncrona dentro del gesto del usuario (el click),
  // antes de cualquier await — así el navegador no la trata como un pop-up
  // no solicitado y no la bloquea. Si terminamos usando Web Share en vez
  // de WhatsApp, simplemente la cerramos sin usarla.
  const canShareNatively = typeof navigator.share === 'function'
  const popup = canShareNatively ? null : window.open('', '_blank')
  try {
    const canvas = await renderOrderCanvas(order)
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
    if (caught instanceof Error && caught.name === 'AbortError') { popup?.close(); return } // el usuario canceló
    // si falla la imagen, seguimos abajo con el texto plano
  }
  if (navigator.share) {
    try { popup?.close(); await navigator.share({ title: `Pedido ${order.orderNumber}`, text }); return } catch { /* usuario canceló */ }
  }
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
  if (popup) popup.location.href = waUrl
  else window.open(waUrl, '_blank')
}

function OrderTable({ orders, onRefresh, onView, onShare, onDelete }: { orders: Order[]; onRefresh: () => Promise<void>; onView: (order: Order) => void; onShare: (order: Order) => void; onDelete: (order: Order) => void }) {
  return <div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Pago</th><th>Total</th><th className="col-actions"/></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td data-label="Pedido"><strong>{order.orderNumber}</strong></td><td data-label="Cliente">{order.customerName}<small>{order.email}</small></td><td data-label="Fecha">{shortDate(order.createdAt)}</td><td data-label="Estado"><select value={order.status} onChange={async (event) => { await updateOrderStatus({ data: { id: order.id, status: event.target.value, paymentStatus: order.paymentStatus } }); await onRefresh() }}><option>Pendiente</option><option>Preparando</option><option>Enviado</option><option>Entregado</option><option>Cancelado</option></select></td><td data-label="Pago"><select value={order.paymentStatus} onChange={async (event) => { await updateOrderStatus({ data: { id: order.id, status: order.status, paymentStatus: event.target.value } }); await onRefresh() }}><option>Pendiente</option><option>Pagado</option><option>Reembolsado</option></select></td><td data-label="Total"><strong>{money(order.total)}</strong></td><td className="col-actions" data-label="Acciones"><div className="row-actions"><button onClick={() => onView(order)}><Download/></button><button onClick={() => onShare(order)}><Share2/></button><button onClick={() => onDelete(order)}><Trash2/></button></div></td></tr>)}</tbody></table>{!orders.length && <div className="empty-admin">Todavía no hay pedidos.</div>}</div>
}

function ContentEditor({ values, onChange, onUpload, onSave, busy }: { values: Record<string, string>; onChange: (value: Record<string, string>) => void; onUpload: (file: File) => void; onSave: () => Promise<void>; busy: boolean }) {
  const groups = useMemo(() => [
    ['Marca y navegación', ['brandName','navCatalog','navBenefits','navContact']], ['Hero principal', ['eyebrow','heroTitle','heroDescription','heroCta','heroImage']], ['Beneficios', ['benefitsTitle','benefit1Title','benefit1Text','benefit2Title','benefit2Text','benefit3Title','benefit3Text']], ['Catálogo e historia', ['catalogTitle','catalogDescription','storyTitle','storyText']], ['Footer, carrito y checkout', ['footerText','whatsapp','schedule','developerCredit','cartTitle','checkoutTitle']], ['Notificaciones', ['notificationEmail']],
  ], [])
  const labels: Record<string,string> = { brandName:'Nombre de marca', navCatalog:'Navegación: catálogo', navBenefits:'Navegación: beneficios', navContact:'Navegación: contacto', eyebrow:'Texto superior', heroTitle:'Título principal', heroDescription:'Descripción principal', heroCta:'Botón principal', heroImage:'Imagen principal (URL)', benefitsTitle:'Título de beneficios', benefit1Title:'Beneficio 1 — título', benefit1Text:'Beneficio 1 — texto', benefit2Title:'Beneficio 2 — título', benefit2Text:'Beneficio 2 — texto', benefit3Title:'Beneficio 3 — título', benefit3Text:'Beneficio 3 — texto', catalogTitle:'Título del catálogo', catalogDescription:'Descripción del catálogo', storyTitle:'Título de historia', storyText:'Historia de marca', footerText:'Descripción del footer', whatsapp:'Número de WhatsApp', schedule:'Horario', developerCredit:'Crédito del desarrollador', cartTitle:'Título del carrito', checkoutTitle:'Título del checkout', notificationEmail:'Correo para avisos de nuevos pedidos' }
  const hints: Record<string,string> = { notificationEmail: 'Cada vez que alguien complete un pedido en la tienda, se enviará un correo automático con los detalles a esta dirección.' }
  return <section className="content-editor"><div className="editor-top"><div><span>TEXTOS E IMÁGENES</span><h2>Editor de la tienda</h2><p>Cambia la voz de la marca sin tocar el código.</p></div><button className="admin-action" disabled={busy} onClick={onSave}><Save/>{busy ? 'Guardando...' : 'Guardar cambios'}</button></div>{groups.map(([title, keys]) => <div className="editor-group" key={title as string}><h3>{title}</h3><div className="editor-fields">{(keys as string[]).map((key) => <label className={['heroTitle','heroDescription','storyText','catalogDescription'].includes(key) ? 'wide' : ''} key={key}>{labels[key]}{['heroDescription','storyText','catalogDescription'].includes(key) ? <textarea rows={3} value={values[key] ?? ''} onChange={(event) => onChange({ ...values, [key]: event.target.value })}/> : <input type={key === 'notificationEmail' ? 'email' : 'text'} placeholder={key === 'notificationEmail' ? 'pedidos@tudominio.com' : undefined} value={values[key] ?? ''} onChange={(event) => onChange({ ...values, [key]: event.target.value })}/>} {hints[key] && <small className="field-hint">{hints[key]}</small>} {key === 'heroImage' && <span className="inline-upload"><ImagePlus/>Subir desde dispositivo<input hidden type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && onUpload(event.target.files[0])}/></span>}</label>)}</div></div>)}</section>
}
