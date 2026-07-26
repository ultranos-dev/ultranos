'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/Button'
import { useSoapNoteStore } from '@/stores/soap-note-store'
import { parseSOAPWithAI, commitAISOAPNote, isAISOAPError } from '@/services/ai-scribe-service'
import { searchSOAPMacros, type SOAPTemplate } from '@/lib/soap-macros'
import { hlc, serializeHlc } from '@/lib/hlc'
import { Brain, ClipboardList } from '@ultranos/ui-kit/icons'
import { Alert } from '@ultranos/ui-kit/components/ui/alert'

interface SOAPNoteEntryProps {
  subjective: string
  objective: string
  assessment: string
  plan: string
  onSubjectiveChange: (value: string) => void
  onObjectiveChange: (value: string) => void
  onAssessmentChange: (value: string) => void
  onPlanChange: (value: string) => void
  encounterId: string
  patientId: string
  /** Whether AI_PROCESSING consent is granted */
  aiConsentGranted: boolean
  /** Whether the device is online */
  isOnline: boolean
}

export function SOAPNoteEntry({
  subjective,
  objective,
  assessment,
  plan,
  onSubjectiveChange,
  onObjectiveChange,
  onAssessmentChange,
  onPlanChange,
  encounterId,
  patientId: _patientId,
  aiConsentGranted,
  isOnline,
}: SOAPNoteEntryProps) {
  const t = useTranslations('soap')
  const aiDiff = useSoapNoteStore((s) => s.aiDiff)
  const setAIDiffLoading = useSoapNoteStore((s) => s.setAIDiffLoading)
  const setAIDiffResult = useSoapNoteStore((s) => s.setAIDiffResult)
  const setAIDiffError = useSoapNoteStore((s) => s.setAIDiffError)
  const updateAIDiffField = useSoapNoteStore((s) => s.updateAIDiffField)
  const confirmAIDiff = useSoapNoteStore((s) => s.confirmAIDiff)
  const discardAIDiff = useSoapNoteStore((s) => s.discardAIDiff)

  // Offline macro state
  const [macroMatches, setMacroMatches] = useState<SOAPTemplate[]>([])
  const [_macroQuery, setMacroQuery] = useState('')
  const macroTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track text changes for macro search when offline
  const handleTextChangeWithMacro = useCallback((text: string) => {
    if (!isOnline) {
      if (macroTimeoutRef.current) clearTimeout(macroTimeoutRef.current)
      macroTimeoutRef.current = setTimeout(() => {
        // Extract the last word for macro matching
        const words = text.trim().split(/\s+/)
        const lastWord = words[words.length - 1] ?? ''
        setMacroQuery(lastWord)
        setMacroMatches(searchSOAPMacros(lastWord))
      }, 100) // Well within 300ms requirement
    }
  }, [isOnline])

  const applyMacro = useCallback((template: SOAPTemplate) => {
    // Only fill empty fields — never overwrite content the user already typed
    if (!subjective.trim()) onSubjectiveChange(template.subjective)
    if (!objective.trim()) onObjectiveChange(template.objective)
    if (!assessment.trim()) onAssessmentChange(template.assessment)
    if (!plan.trim()) onPlanChange(template.plan)
    setMacroMatches([])
    setMacroQuery('')
  }, [subjective, objective, assessment, plan, onSubjectiveChange, onObjectiveChange, onAssessmentChange, onPlanChange])

  // AI Assist trigger
  const handleAIAssist = useCallback(async () => {
    if (!aiConsentGranted || !isOnline) return
    if (aiDiff.isLoading) return

    // Collect all text from S/O/A/P fields
    const freeformText = [subjective, objective, assessment, plan].filter(Boolean).join('\n\n')
    if (!freeformText.trim()) return

    setAIDiffLoading(true)

    const result = await parseSOAPWithAI(encounterId, freeformText)

    if (isAISOAPError(result)) {
      setAIDiffError(result.message ?? result.reason ?? 'AI unavailable')
      return
    }

    setAIDiffResult({
      originalText: freeformText,
      subjective: result.subjective,
      objective: result.objective,
      assessment: result.assessment,
      plan: result.plan,
      modelVersion: result.modelVersion,
    })
  }, [aiConsentGranted, isOnline, aiDiff.isLoading, subjective, objective, assessment, plan, encounterId, setAIDiffLoading, setAIDiffResult, setAIDiffError])

  // Confirm & Save: commit to Hub API ledger
  const handleConfirmSave = useCallback(async () => {
    if (!aiDiff.isActive || aiDiff.isLoading) return

    const ts = hlc.now()
    const result = await commitAISOAPNote({
      encounterId,
      originalFreeformText: aiDiff.originalText,
      // Original AI output (immutable snapshot from when AI returned)
      aiSubjective: aiDiff.originalAiSubjective,
      aiObjective: aiDiff.originalAiObjective,
      aiAssessment: aiDiff.originalAiAssessment,
      aiPlan: aiDiff.originalAiPlan,
      // Physician-confirmed version (may include edits from diff view)
      confirmedSubjective: aiDiff.aiSubjective,
      confirmedObjective: aiDiff.aiObjective,
      confirmedAssessment: aiDiff.aiAssessment,
      confirmedPlan: aiDiff.aiPlan,
      aiModelVersion: aiDiff.aiModelVersion,
      hlcTimestamp: serializeHlc(ts),
    })

    if ('error' in result) {
      setAIDiffError(String(result.error))
      return
    }

    confirmAIDiff()
  }, [aiDiff, encounterId, confirmAIDiff, setAIDiffError])

  // Keyboard shortcuts: Ctrl+K for AI, Ctrl+Enter for Confirm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (aiDiff.isActive) return // Don't re-trigger while diff is showing
        handleAIAssist()
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && aiDiff.isActive && !aiDiff.isLoading) {
        e.preventDefault()
        handleConfirmSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleAIAssist, handleConfirmSave, aiDiff.isActive, aiDiff.isLoading])

  const textareaClass = `w-full rounded-xl border border-border bg-background px-4 py-3
    text-base text-foreground placeholder:text-muted-foreground
    focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring
    transition-colors`

  // === AI Diff View ===
  if (aiDiff.isActive) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {aiDiff.isLoading ? t('aiParsing') : t('aiReviewTitle')}
          </h3>
          {!aiDiff.isLoading && (
            <span className="text-xs text-muted-foreground" title={t('aiModel', { version: aiDiff.aiModelVersion })}>
              {t('aiModel', { version: aiDiff.aiModelVersion })}
            </span>
          )}
        </div>

        {aiDiff.isLoading && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm font-semibold text-primary">{t('aiParsing')}</span>
          </div>
        )}

        {aiDiff.error && (
          <Alert variant="warning" role="alert">
            <p className="text-sm font-semibold">{t('aiUnavailable', { error: aiDiff.error })}</p>
            <Button
              variant="ghost"
              onClick={discardAIDiff}
              className="mt-2 text-sm underline"
            >
              {t('aiReturnManual')}
            </Button>
          </Alert>
        )}

        {!aiDiff.isLoading && !aiDiff.error && (
          <>
            {/* Side-by-side diff */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left: Original */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{t('aiOriginal')}</h4>
                <div className="rounded-xl ring-[0.65px] ring-border/50 bg-muted p-3 text-sm text-foreground whitespace-pre-wrap">
                  {aiDiff.originalText || <span className="italic text-muted-foreground">{t('aiNoOriginal')}</span>}
                </div>
              </div>

              {/* Right: AI-parsed (editable) */}
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase text-success">{t('aiParsed')}</h4>
                <div className="space-y-3">
                  {(['subjective', 'objective', 'assessment', 'plan'] as const).map((section) => {
                    const field = `ai${section.charAt(0).toUpperCase()}${section.slice(1)}` as 'aiSubjective' | 'aiObjective' | 'aiAssessment' | 'aiPlan'
                    return (
                      <div key={section}>
                        <label className="mb-1 block text-xs font-semibold text-success">{t(section)}</label>
                        <textarea
                          value={aiDiff[field]}
                          onChange={(e) => updateAIDiffField(field, e.target.value)}
                          rows={3}
                          dir="auto"
                          className="w-full rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm text-foreground focus:border-success focus:outline-none focus:ring-2 focus:ring-success/20"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                type="button"
                onClick={handleConfirmSave}
              >
                {t('aiConfirmSave')}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={discardAIDiff}
              >
                {t('aiDiscard')}
              </Button>
            </div>
          </>
        )}
      </div>
    )
  }

  // === Normal SOAP Entry View ===
  return (
    <div className="space-y-4">
      {/* AI Assist / Template Assist button */}
      <div className="flex items-center gap-3">
        {isOnline ? (
          <Button
            variant="outline"
            type="button"
            onClick={handleAIAssist}
            disabled={!aiConsentGranted}
            title={
              !aiConsentGranted
                ? t('aiNoConsentTitle')
                : t('aiParseTitle')
            }
            className="gap-2"
          >
            <Brain className="h-4 w-4" aria-hidden="true" />
            {t('aiAssist')}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold text-muted-foreground">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            {t('templateAssist')}
          </span>
        )}

        {!aiConsentGranted && isOnline && (
          <span className="text-xs text-muted-foreground">
            {t('aiNoConsent')}
          </span>
        )}

        {!isOnline && (
          <span className="text-xs text-warning font-semibold">
            {t('aiUnavailableOffline')}
          </span>
        )}
      </div>

      {/* Offline macro suggestions */}
      {!isOnline && macroMatches.length > 0 && (
        <div className="rounded-xl ring-[0.65px] ring-border/50 bg-background p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{t('templateSuggestions')}</p>
          <div className="space-y-1">
            {macroMatches.map((template) => (
              <Button
                key={template.keyword}
                variant="ghost"
                onClick={() => applyMacro(template)}
                className="w-full justify-start px-3 py-2 text-sm text-foreground"
              >
                {template.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Subjective */}
      <div>
        <label
          htmlFor="soap-subjective"
          className="mb-2 block text-sm font-semibold text-foreground"
        >
          {t('subjective')}
        </label>
        <textarea
          id="soap-subjective"
          value={subjective}
          onChange={(e) => {
            onSubjectiveChange(e.target.value)
            handleTextChangeWithMacro(e.target.value)
          }}
          placeholder={t('subjectivePlaceholder')}
          rows={5}
          maxLength={10000}
          dir="auto"
          className={textareaClass}
        />
      </div>

      {/* Objective */}
      <div>
        <label
          htmlFor="soap-objective"
          className="mb-2 block text-sm font-semibold text-foreground"
        >
          {t('objective')}
        </label>
        <textarea
          id="soap-objective"
          value={objective}
          onChange={(e) => {
            onObjectiveChange(e.target.value)
            handleTextChangeWithMacro(e.target.value)
          }}
          placeholder={t('objectivePlaceholder')}
          rows={5}
          maxLength={10000}
          dir="auto"
          className={textareaClass}
        />
      </div>

      {/* Assessment */}
      <div>
        <label
          htmlFor="soap-assessment"
          className="mb-2 block text-sm font-semibold text-foreground"
        >
          {t('assessment')}
        </label>
        <textarea
          id="soap-assessment"
          value={assessment}
          onChange={(e) => {
            onAssessmentChange(e.target.value)
            handleTextChangeWithMacro(e.target.value)
          }}
          placeholder={t('assessmentPlaceholder')}
          rows={4}
          maxLength={10000}
          dir="auto"
          className={textareaClass}
        />
      </div>

      {/* Plan */}
      <div>
        <label
          htmlFor="soap-plan"
          className="mb-2 block text-sm font-semibold text-foreground"
        >
          {t('plan')}
        </label>
        <textarea
          id="soap-plan"
          value={plan}
          onChange={(e) => {
            onPlanChange(e.target.value)
            handleTextChangeWithMacro(e.target.value)
          }}
          placeholder={t('planPlaceholder')}
          rows={4}
          maxLength={10000}
          dir="auto"
          className={textareaClass}
        />
      </div>
    </div>
  )
}
