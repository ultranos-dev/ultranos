import type { LucideIcon } from '@ultranos/ui-kit/icons'

export interface LabNavItem {
  title: string
  url: string
  /** Present on parent items; absent on sub-items. */
  icon?: LucideIcon
  /** Live badge count — shown when > 0. */
  badge?: number | null
}

export interface LabNavGroup {
  /** Empty string for the unlabelled dashboard singleton. */
  title: string
  items: LabNavItem[]
}
