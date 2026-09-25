import { useId } from 'react'

/** Isotipo de Ritual Cobre: arco de cobre con una gota. */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className={className} viewBox="0 0 240 280" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`cu-${id}`} x1="0" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#d98a63" />
          <stop offset="0.45" stopColor="#ba5b46" />
          <stop offset="1" stopColor="#8d3d31" />
        </linearGradient>
      </defs>
      <path d="M20 272V120a100 100 0 0 1 200 0v152z" fill={`url(#cu-${id})`} />
      <path d="M44 272V122a76 76 0 0 1 152 0v150" fill="none" stroke="#fffaf7" strokeOpacity=".42" strokeWidth="3" />
      <path d="M120 96c0 0-40 48-40 76a40 40 0 0 0 80 0c0-28-40-76-40-76z" fill="#fffaf7" />
      <path d="M100 174a21 21 0 0 0 17 20" fill="none" stroke="#ba5b46" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" />
      <path d="M168 84l3.6 9.4 9.4 3.6-9.4 3.6-3.6 9.4-3.6-9.4-9.4-3.6 9.4-3.6z" fill="#fffaf7" />
    </svg>
  )
}

/** Logo horizontal: isotipo + nombre. */
export function BrandLogo({ name = 'Ritual Cobre', className }: { name?: string; className?: string }) {
  return (
    <span className={`brand-logo ${className ?? ''}`}>
      <BrandMark className="brand-logo-mark" />
      <span className="brand-logo-name">{name}</span>
    </span>
  )
}
