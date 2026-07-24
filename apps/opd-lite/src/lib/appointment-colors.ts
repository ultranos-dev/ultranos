/**
 * Shared color maps for appointment service types and statuses.
 * All values use semantic tokens — never hardcoded hex or raw oklch.
 */

/** Dot/badge background colors for service types (used in WeekScheduleView legends and cell badges) */
export const SERVICE_TYPE_COLORS: Record<string, string> = {
  'new-consult': 'bg-success',
  'follow-up': 'bg-primary',
  urgent: 'bg-destructive',
  'walk-in': 'bg-warning',
}

/** Slot border/background classes by appointment status (used in AppointmentSlot) */
export const STATUS_COLORS: Record<string, string> = {
  free: 'bg-success/10 border-success/20 hover:bg-success/20',
  proposed: 'bg-primary/10 border-primary/20 hover:bg-primary',
  pending: 'bg-primary/10 border-primary/20 hover:bg-primary',
  booked: 'bg-primary/10 border-primary/20 hover:bg-primary',
  arrived: 'bg-warning/10 border-warning/20 hover:bg-warning/20',
  fulfilled: 'bg-muted border-border',
  cancelled: 'bg-destructive/10 border-destructive/20',
  noshow: 'bg-destructive/10 border-destructive/20',
  'entered-in-error': 'bg-muted border-border',
}

/** Pill badge colors for appointment status labels (used in AppointmentSlot) */
export const STATUS_BADGE_COLORS: Record<string, string> = {
  booked: 'bg-primary text-primary',
  arrived: 'bg-warning/20 text-warning',
  fulfilled: 'bg-secondary text-foreground',
  cancelled: 'bg-destructive/20 text-destructive',
  noshow: 'bg-destructive/20 text-destructive',
}

/** Pill badge colors for service type labels (used in AppointmentSlot) */
export const SERVICE_TYPE_BADGE_COLORS: Record<string, string> = {
  'new-consult': 'bg-primary/10 text-primary',
  'follow-up': 'bg-secondary text-foreground',
  urgent: 'bg-warning/15 text-warning',
  'walk-in': 'bg-muted text-muted-foreground',
}
