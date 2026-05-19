import { Linking } from 'react-native'
import { buildReportMailtoUrl, openReportIssue } from '@/utils/report-issue'
import type { SafeError } from '@/utils/error-sanitizer'

// Mock Linking methods on the existing RN module
jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true)
jest.spyOn(Linking, 'openURL').mockResolvedValue()

describe('report-issue', () => {
  const safeError: SafeError = { category: 'RENDER', type: 'TypeError' }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(Linking.canOpenURL as jest.Mock).mockResolvedValue(true)
    ;(Linking.openURL as jest.Mock).mockResolvedValue(undefined)
  })

  describe('buildReportMailtoUrl', () => {
    it('builds mailto URL with support email', () => {
      const url = buildReportMailtoUrl(safeError)
      expect(url).toContain('mailto:support@ultranos.com')
    })

    it('includes error category in body', () => {
      const url = buildReportMailtoUrl(safeError)
      expect(url).toContain('RENDER')
    })

    it('includes error type in body', () => {
      const url = buildReportMailtoUrl(safeError)
      expect(url).toContain('TypeError')
    })

    it('includes app version from config in body', () => {
      const url = buildReportMailtoUrl(safeError)
      // Should contain the version from app.json, not hardcoded
      expect(url).toContain('App+Version')
    })

    it('includes subject line', () => {
      const url = buildReportMailtoUrl(safeError)
      expect(url).toContain('Patient+App+Issue+Report')
    })

    it('NEVER includes PHI fields', () => {
      const url = buildReportMailtoUrl(safeError)
      expect(url).not.toContain('patient_id')
      expect(url).not.toContain('diagnosis')
      expect(url).not.toContain('medication')
    })

    it('uses CRLF line breaks in body', () => {
      const url = buildReportMailtoUrl(safeError)
      expect(url).toContain('%0D%0A')
    })
  })

  describe('openReportIssue', () => {
    it('opens mailto URL via Linking and returns true', async () => {
      const result = await openReportIssue(safeError)
      expect(Linking.canOpenURL).toHaveBeenCalled()
      expect(Linking.openURL).toHaveBeenCalledWith(expect.stringContaining('mailto:'))
      expect(result).toBe(true)
    })

    it('returns false if canOpenURL returns false', async () => {
      ;(Linking.canOpenURL as jest.Mock).mockResolvedValueOnce(false)
      const result = await openReportIssue(safeError)
      expect(Linking.openURL).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })
  })
})
