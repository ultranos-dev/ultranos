'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSoapNoteStore } from '@/stores/soap-note-store'
import { parseSOAPWithAI, commitAISOAPNote, isAISOAPError } from '@/services/ai-scribe-service'
import { searchSOAPMacros, type SOAPTemplate } from '@/lib/soap-macros'
import { hlc, serializeHlc } from '@/lib/hlc'

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
  patientId,
  aiConsentGranted,
  isOnline,
}: SOAPNoteEntryProps) {
  const aiDiff = useSoapNoteStore((s) => s.aiDiff)
  const setAIDiffLoading = useSoapNoteStore((s) => s.setAIDiffLoading)
  const setAIDiffResult = useSoapNoteStore((s) => s.setAIDiffResult)
  const setAIDiffError = useSoapNoteStore((s) => s.setAIDiffError)
  const updateAIDiffField = useSoapNoteStore((s) => s.updateAIDiffField)
  const confirmAIDiff = useSoapNoteStore((s) => s.confirmAIDiff)
  const discardAIDiff = useSoapNoteStore((s) => s.discardAIDiff)

  // Offline macro state
  const [macroMatches, setMacroMatches] = useState<SOAPTemplate[]>([])
  const [macroQuery, setMacroQuery] = useState('')
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

  const textareaClass = `w-full rounded-lg border border-neutral-200 bg-white px-4 py-3
    text-base text-neutral-900 placeholder:text-neutral-400
    focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200
    transition-colors`

  // === AI Diff View ===
  if (aiDiff.isActive) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-neutral-700">
            {aiDiff.isLoading ? 'AI is parsing your notes...' : 'AI Parsed SOAP — Review & Confirm'}
          </h3>
          {!aiDiff.isLoading && (
            <span className="text-xs text-neutral-400" title={`Model: ${aiDiff.aiModelVersion}`}>
              Model: {aiDiff.aiModelVersion}
            </span>
          )}
        </div>

        {aiDiff.isLoading && (
          <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm font-semibold text-blue-700">AI is parsing your notes...</span>
          </div>
        )}

        {aiDiff.error && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3" role="alert">
            <p className="text-sm font-semibold text-amber-800">AI unavailable: {aiDiff.error}</p>
            <button
              type="button"
              onClick={discardAIDiff}
              className="mt-2 text-sm font-semibold text-amber-700 underline"
            >
              Return to manual editing
            </button>
          </div>
        )}

        {!aiDiff.isLoading && !aiDiff.error && (
          <>
            {/* Side-by-side diff */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left: Original */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase text-neutral-500">Original</h4>
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700 whitespace-pre-wrap">
                  {aiDiff.originalText || <span className="italic text-neutral-400">No original text</span>}
                </div>
              </div>

              {/* Right: AI-parsed (editable) */}
              <div>
                <h4 className="mb-2 text-xs font-bold uppercase text-green-700">AI Parsed (Editable)</h4>
                <div className="space-y-3">
                  {(['Subjective', 'Objective', 'Assessment', 'Plan'] as const).map((section) => {
                    const field = `ai${section}` as 'aiSubjective' | 'aiObjective' | 'aiAssessment' | 'aiPlan'
                    return (
                      <div key={section}>
                        <label className="mb-1 block text-xs font-semibold text-green-800">{section}</label>
                        <textarea
                          value={aiDiff[field]}
                          onChange={(e) => updateAIDiffField(field, e.target.value)}
                          rows={3}
                          dir="auto"
                          className="w-full rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-neutral-900 focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-200"
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleConfirmSave}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-700"
              >
                Confirm &amp; Save (Ctrl+Enter)
              </button>
              <button
                type="button"
                onClick={discardAIDiff}
                className="rounded-md bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-300"
              >
                Discard AI
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // === Normal SOAP Entry View ===
  return (
    <div className="space-y-6">
      {/* AI Assist / Template Assist button */}
      <div className="flex items-center gap-3">
        {isOnline ? (
          <button
            type="button"
            onClick={handleAIAssist}
            disabled={!aiConsentGranted}
            title={
              !aiConsentGranted
                ? 'Patient has not consented to AI processing'
                : 'Parse notes with AI (Ctrl+K)'
            }
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true">✦</span>
            AI Assist
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-md bg-neutral-200 px-3 py-1.5 text-sm font-semibold text-neutral-600">
            <span aria-hidden="true">📋</span>
            Template Assist
          </span>
        )}

        {!aiConsentGranted && isOnline && (
          <span className="text-xs text-neutral-400">
            Patient has not consented to AI processing
          </span>
        )}

        {!isOnline && (
          <span className="text-xs text-amber-600 font-semibold">
            AI unavailable offline — use template macros
          </span>
        )}
      </div>

      {/* Offline macro suggestions */}
      {!isOnline && macroMatches.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <p className="mb-2 text-xs font-bold text-neutral-500 uppercase">Template Suggestions</p>
          <div className="space-y-1">
            {macroMatches.map((template) => (
              <button
                key={template.keyword}
                type="button"
                onClick={() => applyMacro(template)}
                className="block w-full rounded-md px-3 py-2 text-start text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-100"
              >
                {template.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subjective */}
      <div>
        <label
          htmlFor="soap-subjective"
          className="mb-2 block text-sm font-semibold text-neutral-700"
        >
          Subjective
        </label>
        <textarea
          id="soap-subjective"
          value={subjective}
          onChange={(e) => {
            onSubjectiveChange(e.target.value)
            handleTextChangeWithMacro(e.target.value)
          }}
          placeholder="Patient's chief complaint, history of present illness, symptoms..."
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
          className="mb-2 block text-sm font-semibold text-neutral-700"
        >
          Objective
        </label>
        <textarea
          id="soap-objective"
          value={objective}
          onChange={(e) => {
            onObjectiveChange(e.target.value)
            handleTextChangeWithMacro(e.target.value)
          }}
          placeholder="Physical examination findings, vital signs, lab results..."
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
          className="mb-2 block text-sm font-semibold text-neutral-700"
        >
          Assessment
        </label>
        <textarea
          id="soap-assessment"
          value={assessment}
          onChange={(e) => {
            onAssessmentChange(e.target.value)
            handleTextChangeWithMacro(e.target.value)
          }}
          placeholder="Clinical impression, diagnosis or differential..."
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
          className="mb-2 block text-sm font-semibold text-neutral-700"
        >
          Plan
        </label>
        <textarea
          id="soap-plan"
          value={plan}
          onChange={(e) => {
            onPlanChange(e.target.value)
            handleTextChangeWithMacro(e.target.value)
          }}
          placeholder="Treatment plan, medications, follow-up instructions..."
          rows={4}
          maxLength={10000}
          dir="auto"
          className={textareaClass}
        />
      </div>
    </div>
  )
}
