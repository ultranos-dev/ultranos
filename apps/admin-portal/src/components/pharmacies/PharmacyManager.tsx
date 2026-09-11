'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { trpc } from '@/lib/trpc'
import { SearchInput } from '@/components/ui/search-input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Building2, FileSearch } from '@ultranos/ui-kit/icons'

interface PharmacyEntry {
  id: string
  name: string
  province?: string
  district?: string
  address?: string
  facilityType: string
  isActive: boolean
  latitude: number
  longitude: number
}

export function PharmacyManager() {
  const t = useTranslations('pharmacies')

  const [pharmacies, setPharmacies] = useState<PharmacyEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)

  // Add form state
  const [formName, setFormName] = useState('')
  const [formProvince, setFormProvince] = useState('')
  const [formDistrict, setFormDistrict] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formLat, setFormLat] = useState('')
  const [formLng, setFormLng] = useState('')
  const [saving, setSaving] = useState(false)

  const fetchPharmacies = useCallback(async (q?: string) => {
    setLoading(true)
    try {
      const result = await trpc.pharmacy.listForAdmin.query({ cursor: 0, limit: 50, ...(q ? { q } : {}) })
      setPharmacies(result.pharmacies)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    trpc.pharmacy.listForAdmin.query({ cursor: 0, limit: 50 }).then((result) => {
      if (!cancelled) setPharmacies(result.pharmacies)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  function handleSearch(q: string) {
    setSearch(q)
    fetchPharmacies(q.trim() || undefined)
  }

  async function handleToggleActive(pharmacy: PharmacyEntry) {
    setToggleError(null)
    try {
      await trpc.pharmacy.setActive.mutate({ id: pharmacy.id, isActive: !pharmacy.isActive })
      fetchPharmacies(search.trim() || undefined)
    } catch {
      setToggleError(t('saveError'))
    }
  }

  function resetForm() {
    setFormName('')
    setFormProvince('')
    setFormDistrict('')
    setFormAddress('')
    setFormLat('')
    setFormLng('')
    setSaveError(null)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await trpc.pharmacy.create.mutate({
        name: formName,
        latitude: Number(formLat),
        longitude: Number(formLng),
        address: formAddress || undefined,
        province: formProvince || undefined,
        district: formDistrict || undefined,
      })
      setAddOpen(false)
      resetForm()
      fetchPharmacies(search.trim() || undefined)
    } catch {
      setSaveError(t('saveError'))
    } finally {
      setSaving(false)
    }
  }

  const q = search.trim().toLowerCase()
  const visible = q
    ? pharmacies.filter((p) => p.name.toLowerCase().includes(q))
    : pharmacies

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('title')}</h1>

      {/* Toolbar: search + add button — one row, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          dir="auto"
          placeholder={t('searchPlaceholder')}
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="min-w-[200px] flex-1"
          aria-label={t('searchPlaceholder')}
        />
        <Button onClick={() => setAddOpen(true)}>{t('add')}</Button>
      </div>

      {toggleError && (
        <p role="alert" className="text-sm text-destructive">{toggleError}</p>
      )}

      {/* Content box */}
      <div className="overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
        {loading ? (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex min-h-[16rem] items-center justify-center">
            <EmptyState
              icon={q ? FileSearch : Building2}
              title={t('empty')}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('name')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('province')} / {t('district')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('address')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide">{t('active')}</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground text-xs uppercase tracking-wide"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((pharmacy) => (
                  <tr key={pharmacy.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium">{pharmacy.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {[pharmacy.province, pharmacy.district].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{pharmacy.address ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={pharmacy.isActive ? 'success' : 'secondary'}>
                        {pharmacy.isActive ? t('active') : t('inactive')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleActive(pharmacy)}
                      >
                        {pharmacy.isActive ? t('inactive') : t('active')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add pharmacy dialog */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) resetForm() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('add')}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ph-name">{t('name')}</Label>
              <Input id="ph-name" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ph-province">{t('province')}</Label>
              <Input id="ph-province" value={formProvince} onChange={(e) => setFormProvince(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ph-district">{t('district')}</Label>
              <Input id="ph-district" value={formDistrict} onChange={(e) => setFormDistrict(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ph-address">{t('address')}</Label>
              <Input id="ph-address" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ph-lat">{t('latitude')}</Label>
              <Input id="ph-lat" type="number" value={formLat} onChange={(e) => setFormLat(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ph-lng">{t('longitude')}</Label>
              <Input id="ph-lng" type="number" value={formLng} onChange={(e) => setFormLng(e.target.value)} />
            </div>
          </div>

          {saveError && (
            <p role="alert" className="text-sm text-destructive">{saveError}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); resetForm() }}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
