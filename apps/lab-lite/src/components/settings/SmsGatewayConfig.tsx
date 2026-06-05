'use client'

/**
 * SmsGatewayConfig — Story 49.2 AC #9: SMS Gateway Configuration
 *
 * Settings panel for lab_manager to configure the SMS provider used for
 * critical result notifications. Supports Twilio, a local/regional HTTP
 * provider, and the native `sms:` URI fallback.
 *
 * Credentials are stored in Dexie (encrypted at rest per spec) — NEVER
 * in localStorage or console output (CLAUDE.md Rule #1).
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MessageSquare } from '@ultranos/ui-kit/icons'
import { getDb } from '@/lib/db'
import type { SmsProvider, SmsGatewayConfig as SmsGatewayConfigType } from '@/lib/sms/sms-gateway'
import { TwilioSmsAdapter } from '@/lib/sms/twilio-adapter'
import { NativeSmsAdapter } from '@/lib/sms/native-adapter'
import { Button } from '@/components/ui/Button'

interface SmsGatewayConfigProps {
  isManager: boolean
}

const PROVIDER_OPTIONS: SmsProvider[] = ['twilio', 'local', 'native']

const PROVIDER_LABEL_KEY: Record<SmsProvider, string> = {
  twilio: 'smsProviderTwilio',
  local: 'smsProviderLocal',
  native: 'smsProviderNative',
}

export function SmsGatewayConfig({ isManager }: SmsGatewayConfigProps) {
  const t = useTranslations('settings')

  const [provider, setProvider] = useState<SmsProvider>('native')
  const [accountSid, setAccountSid] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [senderNumber, setSenderNumber] = useState('')
  const [localProviderUrl, setLocalProviderUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  // Test SMS state
  const [showTestInput, setShowTestInput] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testSent, setTestSent] = useState(false)

  // Load existing config from Dexie
  useEffect(() => {
    async function load() {
      try {
        const db = getDb()
        const config = await db.smsGatewayConfig.get('sms-config')
        if (config) {
          setProvider(config.provider)
          setAccountSid(config.accountSid ?? '')
          setAuthToken(config.authToken ?? '')
          setSenderNumber(config.senderNumber ?? '')
          setLocalProviderUrl(config.localProviderUrl ?? '')
        }
      } catch {
        // Non-fatal — defaults are fine for first use
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  if (!isManager) return null

  async function handleSave() {
    const db = getDb()
    const entry: SmsGatewayConfigType = {
      id: 'sms-config',
      provider,
      accountSid: provider !== 'native' ? accountSid : undefined,
      authToken: provider !== 'native' ? authToken : undefined,
      senderNumber: senderNumber || undefined,
      localProviderUrl: provider === 'local' ? localProviderUrl : undefined,
      updatedBy: 'current-user', // replaced by caller context if needed
      updatedAt: new Date().toISOString(),
    }
    await db.smsGatewayConfig.put(entry)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function handleSendTest() {
    if (!testPhone.trim()) return
    try {
      let adapter
      if (provider === 'twilio' || provider === 'local') {
        adapter = new TwilioSmsAdapter({
          accountSid,
          authToken,
          senderNumber,
          ...(provider === 'local' ? { baseUrl: localProviderUrl } : {}),
        })
      } else {
        adapter = new NativeSmsAdapter()
      }
      await adapter.send({
        to: testPhone.trim(),
        body: 'Lab-Lite SMS test message',
        from: senderNumber || undefined,
      })
      setTestSent(true)
      setTimeout(() => setTestSent(false), 2500)
    } catch {
      // Non-fatal — adapter errors are logged internally
    }
  }

  const showCredentialFields = provider === 'twilio' || provider === 'local'

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t('title')}...</p>
  }

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="sms-gateway-config"
    >
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare size={16} className="text-muted-foreground shrink-0" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">{t('smsGateway')}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{t('smsGatewayDescription')}</p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Provider selection */}
        <div className="flex flex-col gap-1">
          <label htmlFor="sms-provider" className="text-sm text-muted-foreground">
            {t('smsProvider')}
          </label>
          <select
            id="sms-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as SmsProvider)}
            className="w-full rounded border border-border px-2 py-1.5 text-sm"
            data-testid="sms-provider-select"
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {t(PROVIDER_LABEL_KEY[p])}
              </option>
            ))}
          </select>
        </div>

        {/* API Credential fields — Twilio or Local */}
        {showCredentialFields && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="sms-account-sid" className="text-sm text-muted-foreground">
                {t('smsAccountSid')}
              </label>
              <input
                id="sms-account-sid"
                type="text"
                value={accountSid}
                onChange={(e) => setAccountSid(e.target.value)}
                className="w-full rounded border border-border px-2 py-1.5 text-sm font-mono"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                data-testid="sms-account-sid-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="sms-auth-token" className="text-sm text-muted-foreground">
                {t('smsAuthToken')}
              </label>
              <input
                id="sms-auth-token"
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="w-full rounded border border-border px-2 py-1.5 text-sm font-mono"
                data-testid="sms-auth-token-input"
              />
            </div>
          </>
        )}

        {/* Sender number — always shown */}
        <div className="flex flex-col gap-1">
          <label htmlFor="sms-sender-number" className="text-sm text-muted-foreground">
            {t('smsSenderNumber')}
          </label>
          <input
            id="sms-sender-number"
            type="tel"
            value={senderNumber}
            onChange={(e) => setSenderNumber(e.target.value)}
            className="w-full rounded border border-border px-2 py-1.5 text-sm font-mono"
            placeholder="+93701234567"
            data-testid="sms-sender-number-input"
          />
        </div>

        {/* Local provider URL — only for local provider */}
        {provider === 'local' && (
          <div className="flex flex-col gap-1">
            <label htmlFor="sms-local-url" className="text-sm text-muted-foreground">
              {t('smsLocalProviderUrl')}
            </label>
            <input
              id="sms-local-url"
              type="url"
              value={localProviderUrl}
              onChange={(e) => setLocalProviderUrl(e.target.value)}
              className="w-full rounded border border-border px-2 py-1.5 text-sm font-mono"
              placeholder="https://sms.local-provider.example/api/send"
              data-testid="sms-local-url-input"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleSave()}
            data-testid="sms-save-config"
          >
            {t('smsSaveConfig')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowTestInput((prev) => !prev)}
            data-testid="sms-send-test-toggle"
          >
            {t('smsSendTest')}
          </Button>
        </div>

        {/* Saved confirmation */}
        {saved && (
          <p className="text-xs text-green-600" data-testid="sms-config-saved">
            {t('smsConfigSaved')}
          </p>
        )}

        {/* Test SMS inline input */}
        {showTestInput && (
          <div className="flex items-center gap-2 pt-1">
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder={t('smsTestPhone')}
              className="flex-1 rounded border border-border px-2 py-1.5 text-sm font-mono"
              data-testid="sms-test-phone-input"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleSendTest()}
              disabled={!testPhone.trim()}
              data-testid="sms-send-test-button"
            >
              {t('smsSendTest')}
            </Button>
          </div>
        )}

        {/* Test sent confirmation */}
        {testSent && (
          <p className="text-xs text-green-600" data-testid="sms-test-sent">
            {t('smsTestSent')}
          </p>
        )}
      </div>
    </div>
  )
}
