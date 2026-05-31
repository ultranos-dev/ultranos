'use client'

interface HeatMapCell {
  labId: string
  labName: string
  reagentCategory: string
  quantity: number
  unit: string
  reportedAt: string
  stockLevel: 'GREEN' | 'AMBER' | 'RED'
}

interface HeatMapGridProps {
  labs: Array<{ id: string; name: string }>
  reagentCategories: string[]
  cells: HeatMapCell[]
}

const STOCK_COLORS: Record<string, string> = {
  GREEN: 'bg-success-subtle text-success',
  AMBER: 'bg-warning-subtle text-warning',
  RED: 'bg-danger-subtle text-danger',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HeatMapGrid({ labs, reagentCategories, cells }: HeatMapGridProps) {
  if (labs.length === 0 || reagentCategories.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border p-8 text-center">
        <p className="text-text-secondary">No inventory data available. Stock snapshots will appear here once labs report their reagent levels.</p>
      </div>
    )
  }

  // Build lookup map: `${labId}::${category}` -> cell
  const cellMap = new Map<string, HeatMapCell>()
  for (const cell of cells) {
    cellMap.set(`${cell.labId}::${cell.reagentCategory}`, cell)
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-black text-white">
            <th className="px-4 py-3 text-start font-medium text-xs uppercase tracking-wide sticky left-0 bg-black z-10">
              Lab
            </th>
            {reagentCategories.map((cat) => (
              <th key={cat} className="px-4 py-3 text-center font-medium text-xs uppercase tracking-wide whitespace-nowrap">
                {cat}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {labs.map((lab) => (
            <tr key={lab.id} className="bg-surface-raised">
              <td className="px-4 py-3 font-medium whitespace-nowrap sticky left-0 bg-surface-raised z-10">
                {lab.name}
              </td>
              {reagentCategories.map((cat) => {
                const cell = cellMap.get(`${lab.id}::${cat}`)
                if (!cell) {
                  return (
                    <td key={cat} className="px-4 py-3 text-center">
                      <span className="text-text-secondary text-xs">—</span>
                    </td>
                  )
                }

                return (
                  <td key={cat} className="px-4 py-3 text-center">
                    <div className="group relative inline-block">
                      <span
                        className={`inline-block rounded-xl px-3 py-1.5 text-xs font-semibold ${STOCK_COLORS[cell.stockLevel]}`}
                      >
                        {cell.quantity} {cell.unit}
                      </span>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl bg-surface-raised text-text-primary text-xs shadow-card border border-border opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                        <p className="font-medium">{cell.labName}</p>
                        <p className="text-text-secondary">{cell.reagentCategory}</p>
                        <p className="text-text-secondary">Reported: {formatDate(cell.reportedAt)}</p>
                      </div>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
