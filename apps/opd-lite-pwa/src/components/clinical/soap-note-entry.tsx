'use client'

interface SOAPNoteEntryProps {
  subjective: string
  objective: string
  onSubjectiveChange: (value: string) => void
  onObjectiveChange: (value: string) => void
}

export function SOAPNoteEntry({
  subjective,
  objective,
  onSubjectiveChange,
  onObjectiveChange,
}: SOAPNoteEntryProps) {
  return (
    <div className="space-y-6">
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
          onChange={(e) => onSubjectiveChange(e.target.value)}
          placeholder="Patient's chief complaint, history of present illness, symptoms..."
          rows={5}
          maxLength={10000}
          dir="auto"
          className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3
            text-base text-neutral-900 placeholder:text-neutral-400
            focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200
            transition-colors"
        />
      </div>

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
          onChange={(e) => onObjectiveChange(e.target.value)}
          placeholder="Physical examination findings, vital signs, lab results..."
          rows={5}
          maxLength={10000}
          dir="auto"
          className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3
            text-base text-neutral-900 placeholder:text-neutral-400
            focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200
            transition-colors"
        />
      </div>
    </div>
  )
}
