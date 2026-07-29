'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { Bookmark } from '@ultranos/ui-kit/icons'
import { Badge } from '@/components/ui/badge'

export interface RecentDispenseItem {
  id: string
  patientRef: string
  patientName?: string
  medicationName: string
  whenHandedOver: string
  syncStatus: 'synced' | 'pending' | 'failed'
}

interface RecentDispensingListProps {
  items: RecentDispenseItem[]
}

function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '--:--'
  }
}

const syncBadgeClasses: Record<RecentDispenseItem['syncStatus'], string> = {
  synced: 'bg-success/10 text-success border-success/20',
  pending: 'bg-warning/10 text-warning border-warning/20',
  failed: 'bg-destructive/10 text-destructive border-destructive/20',
}

export function RecentDispensingList({ items }: RecentDispensingListProps) {
  const router = useRouter()
  const t = useTranslations('dispensing')
  const tCommon = useTranslations('common')

  const syncLabels: Record<RecentDispenseItem['syncStatus'], string> = {
    synced: tCommon('synced'),
    pending: tCommon('pending'),
    failed: tCommon('failed'),
  }

  return (
    <div data-testid="recent-dispensing-list" className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">
        {t('recentDispensing')}
      </h3>
      {items.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={t('noActivityToday')}
          description={t('noActivityDescription')}
          action={{ label: t('startScanning'), onClick: () => router.push('/scan') }}
          size="sm"
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-card ring-[0.65px] ring-border/50">
          {items.map((item) => (
            <li
              key={item.id}
              data-testid={`dispense-row-${item.id}`}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground truncate">
                  {item.medicationName}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {item.patientName ?? item.patientRef} &middot; {formatTime(item.whenHandedOver)}
                </div>
              </div>
              <Badge
                variant="outline"
                data-testid={`sync-badge-${item.id}`}
                className={`ms-2 ${syncBadgeClasses[item.syncStatus]}`}
              >
                {syncLabels[item.syncStatus]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
