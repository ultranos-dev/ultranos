import { describe, it, expect } from 'vitest'
import { FlaskConical, Pill, Bell, Shield, Stethoscope } from '../icons'
import { sourceAppIcon, sourceAppNameKey, deriveSourceApp } from '../notification-presentation'

describe('notification-presentation', () => {
  it('maps each source app to its icon', () => {
    expect(sourceAppIcon('LAB_LITE')).toBe(FlaskConical)
    expect(sourceAppIcon('PHARMACY_LITE')).toBe(Pill)
    expect(sourceAppIcon('OPD_LITE')).toBe(Stethoscope)
    expect(sourceAppIcon('ADMIN')).toBe(Shield)
    expect(sourceAppIcon('SYSTEM')).toBe(Bell)
  })
  it('defaults unknown/null source app to the bell icon', () => {
    expect(sourceAppIcon(null)).toBe(Bell)
    expect(sourceAppIcon('NEW_APP')).toBe(Bell)
  })
  it('derives source app from type when descriptor missing', () => {
    expect(deriveSourceApp('ORDER_RECEIVED')).toBe('LAB_LITE')
    expect(deriveSourceApp('PRESCRIPTION_DISPENSED')).toBe('PHARMACY_LITE')
    expect(deriveSourceApp('UNKNOWN')).toBe('SYSTEM')
  })
  it('builds the source-app i18n name key', () => {
    expect(sourceAppNameKey('LAB_LITE')).toBe('sourceApp.LAB_LITE')
    expect(sourceAppNameKey(null)).toBe('sourceApp.SYSTEM')
  })
})
