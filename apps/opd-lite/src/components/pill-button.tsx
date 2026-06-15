'use client'

import { Button } from '@/components/ui/Button'

interface PillButtonProps {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}

export function PillButton({ children, onClick, disabled = false }: PillButtonProps) {
  return (
    <Button variant="primary" onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  )
}
