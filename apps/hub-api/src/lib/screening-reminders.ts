/**
 * Screening reminder logic for employee health records.
 * TB screening is due every 12 months; "DUE_SOON" within 30 days of due date.
 */

export interface TbScreeningReminder {
  status: 'OVERDUE' | 'DUE_SOON' | 'UP_TO_DATE' | 'NOT_RECORDED'
  daysUntilDue?: number
  daysOverdue?: number
  message: string
}

export interface ScreeningReminders {
  tbScreening: TbScreeningReminder
}

const TB_INTERVAL_MONTHS = 12
const DUE_SOON_THRESHOLD_DAYS = 30

export function computeScreeningReminders(record: {
  tb_screening_date: string | Date | null
}): ScreeningReminders {
  if (!record.tb_screening_date) {
    return {
      tbScreening: {
        status: 'NOT_RECORDED',
        message: 'No TB screening recorded',
      },
    }
  }

  const lastScreening = new Date(record.tb_screening_date)

  // P6: guard against invalid date strings producing NaN comparisons
  if (isNaN(lastScreening.getTime())) {
    return {
      tbScreening: {
        status: 'NOT_RECORDED',
        message: 'No TB screening recorded',
      },
    }
  }

  const dueDate = new Date(lastScreening)
  dueDate.setMonth(dueDate.getMonth() + TB_INTERVAL_MONTHS)

  const now = new Date()
  const diffMs = dueDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return {
      tbScreening: {
        status: 'OVERDUE',
        daysOverdue: Math.abs(diffDays),
        message: `TB screening overdue by ${Math.abs(diffDays)} days`,
      },
    }
  }

  if (diffDays <= DUE_SOON_THRESHOLD_DAYS) {
    return {
      tbScreening: {
        status: 'DUE_SOON',
        daysUntilDue: diffDays,
        message: `TB screening due in ${diffDays} days`,
      },
    }
  }

  return {
    tbScreening: {
      status: 'UP_TO_DATE',
      daysUntilDue: diffDays,
      message: `TB screening up to date`,
    },
  }
}
