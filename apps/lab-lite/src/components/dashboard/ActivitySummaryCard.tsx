'use client'

interface ActivitySummaryCardProps {
  uploadsCompleted: number
  resultsPending: number
}

export function ActivitySummaryCard({ uploadsCompleted, resultsPending }: ActivitySummaryCardProps) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-sm font-medium text-neutral-500">Today&apos;s Activity</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-green-50 px-3 py-2 text-center">
          <p className="text-2xl font-bold text-green-700">{uploadsCompleted}</p>
          <p className="text-xs font-medium text-green-700">Completed</p>
        </div>
        <div className="rounded-md bg-amber-50 px-3 py-2 text-center">
          <p className="text-2xl font-bold text-amber-700">{resultsPending}</p>
          <p className="text-xs font-medium text-amber-700">Pending Review</p>
        </div>
      </div>
    </div>
  )
}
