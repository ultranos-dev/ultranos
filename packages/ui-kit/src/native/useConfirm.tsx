import { useCallback, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel: string
  destructive?: boolean
  testID?: string
}

interface Pending extends ConfirmOptions {
  resolve: (confirmed: boolean) => void
}

/**
 * Imperative confirm dialog, themed like the rest of the app — the replacement
 * for `Alert.alert(...)` confirm/cancel prompts.
 *
 *   const { confirm, confirmDialog } = useConfirm()
 *   if (await confirm({ title, message, confirmLabel, cancelLabel })) doThing()
 *   // ...render {confirmDialog} once in the screen.
 *
 * `confirm` resolves `true` on confirm, `false` on cancel / backdrop / back.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null)

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  )

  const handleConfirm = useCallback(() => {
    pending?.resolve(true)
    setPending(null)
  }, [pending])

  const handleCancel = useCallback(() => {
    pending?.resolve(false)
    setPending(null)
  }, [pending])

  const confirmDialog = (
    <ConfirmDialog
      visible={pending !== null}
      title={pending?.title ?? ''}
      message={pending?.message}
      confirmLabel={pending?.confirmLabel ?? ''}
      cancelLabel={pending?.cancelLabel ?? ''}
      destructive={pending?.destructive}
      testID={pending?.testID}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  )

  return { confirm, confirmDialog }
}
