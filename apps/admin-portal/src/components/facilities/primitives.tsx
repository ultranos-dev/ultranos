'use client'
import type { ReactNode } from 'react'
import { Star, MapPin } from '@ultranos/ui-kit/icons'

export function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-[0.65px] ring-border/50">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="mt-3 flex flex-col gap-2 text-sm">{children}</div>
    </div>
  )
}

export function ProfileField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <dl className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium text-foreground">{value ?? '—'}</dd>
    </dl>
  )
}

export function StarRating({ rating, reviewCount }: { rating: number | null; reviewCount: number | null }) {
  if (rating == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-1 text-foreground">
      <Star size={16} className="fill-warning text-warning" />
      <span className="font-medium">{rating.toFixed(1)}</span>
      {reviewCount != null && <span className="text-muted-foreground">({reviewCount})</span>}
    </span>
  )
}

export function MapLink({ url, latitude, longitude, label = 'View on Google Maps' }: { url: string | null; latitude: number | null; longitude: number | null; label?: string }) {
  const href = url ?? (latitude != null && longitude != null ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` : null)
  if (!href) return null
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      <MapPin size={16} /> {label}
    </a>
  )
}

export function HoursTable({ hours, is247, closedLabel = 'Closed' }: { hours: unknown | null; is247: boolean; closedLabel?: string }) {
  if (is247) return <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">24 / 7</span>
  if (!hours || typeof hours !== 'object') return <span className="text-muted-foreground">—</span>
  const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const h = hours as Record<string, { open?: string; close?: string } | undefined>
  return (
    <dl className="flex flex-col gap-1">
      {days.map((d) => (
        <div key={d} className="flex justify-between">
          <dt className="uppercase text-muted-foreground">{d}</dt>
          <dd className="text-foreground">{h[d]?.open ? `${h[d]!.open}–${h[d]!.close ?? ''}` : closedLabel}</dd>
        </div>
      ))}
    </dl>
  )
}

export function TagList({ items }: { items: string[] | null | undefined }) {
  if (!items?.length) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{t}</span>
      ))}
    </div>
  )
}

export function LogoAvatar({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase()
  return url
    ? <img src={url} alt={name} width={size} height={size} className="rounded-xl object-cover" style={{ width: size, height: size }} />
    : <span className="inline-flex items-center justify-center rounded-xl bg-muted font-semibold text-muted-foreground" style={{ width: size, height: size }}>{initials}</span>
}
