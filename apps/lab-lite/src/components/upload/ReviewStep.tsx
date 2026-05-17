'use client'

interface ReviewStepProps {
  patientFirstName: string
  patientAge: number
  loincDisplay: string
  fileName: string
  fileSize: number
  collectionDate: string
  onSubmit: () => void
  submitting: boolean
  error: string | null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ReviewStep({
  patientFirstName,
  patientAge,
  loincDisplay,
  fileName,
  fileSize,
  collectionDate,
  onSubmit,
  submitting,
  error,
}: ReviewStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-neutral-900">Review & Confirm</h2>

      <dl className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">Patient</dt>
          <dd className="text-sm text-neutral-900">{patientFirstName}, {patientAge} years</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">Test Category</dt>
          <dd className="text-sm text-neutral-900">{loincDisplay}</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">File</dt>
          <dd className="text-sm text-neutral-900">{fileName} ({formatFileSize(fileSize)})</dd>
        </div>
        <div className="flex justify-between px-4 py-3">
          <dt className="text-sm font-medium text-neutral-500">Collection Date</dt>
          <dd className="text-sm text-neutral-900">{collectionDate}</dd>
        </div>
      </dl>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitting}
        className="rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Confirm & Submit'}
      </button>
    </div>
  )
}
