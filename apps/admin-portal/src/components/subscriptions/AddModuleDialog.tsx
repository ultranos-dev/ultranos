'use client'

import { useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

interface AvailableModule {
  id: string
  code: string
  displayName: string
  description: string | null
  basePriceUsd: number
}

interface AddModuleDialogProps {
  onClose: () => void
  onModuleAdded: () => void
}

export function AddModuleDialog({ onClose, onModuleAdded }: AddModuleDialogProps) {
  const [modules, setModules] = useState<AvailableModule[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const result = await trpc.subscription.getAvailableModules.query()
        setModules(result.modules)
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load available modules')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleAdd(moduleCode: string) {
    if (adding) return // P10: Prevent double-submit
    try {
      setAdding(moduleCode)
      setError(null)
      await trpc.subscription.addModule.mutate({ moduleCode })
      onModuleAdded()
      onClose()
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err?.message ?? 'Failed to add module')
      }
    } finally {
      if (mountedRef.current) {
        setAdding(null)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-popover p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Add Module</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-muted-foreground" aria-label="Close">&times;</Button>
        </div>

        {error && (
          <div className="mt-3 rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
        )}

        {loading ? (
          <p className="mt-4 text-muted-foreground">Loading available modules...</p>
        ) : modules.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <p className="text-muted-foreground">You&apos;re subscribed to all available modules.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {modules.map((mod) => (
              <div key={mod.id} className="rounded-2xl border border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-foreground">{mod.displayName}</h3>
                    {mod.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{mod.description}</p>
                    )}
                    <p className="mt-1 text-sm font-medium text-muted-foreground">
                      ${mod.basePriceUsd.toFixed(2)} / month
                    </p>
                  </div>
                  <Button
                    onClick={() => handleAdd(mod.code)}
                    disabled={adding !== null}
                  >
                    {adding === mod.code ? 'Adding...' : 'Add'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
