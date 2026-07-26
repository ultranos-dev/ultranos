'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Info } from '@ultranos/ui-kit/icons'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ultranos/ui-kit/components/ui/dialog'
import { Button } from '@/components/ui/Button'
import { PhotoCropper, type PhotoCropperHandle } from '@/components/patient/PhotoCropper'

interface PhotoCropModalProps {
  open: boolean
  rawDataUrl: string | null
  onConfirm: (croppedDataUrl: string) => void
  onCancel: () => void
}

export function PhotoCropModal({ open, rawDataUrl, onConfirm, onCancel }: PhotoCropModalProps) {
  const t = useTranslations('registration')
  const cropperRef = useRef<PhotoCropperHandle>(null)

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onCancel() }}>
      <DialogContent className="max-w-sm w-full gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>{t('photoCropTitle')}</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3">
          <div className="flex gap-2.5 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5">
            <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">{t('photoCropGuidelinesTitle')}</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                <li className="flex gap-1.5"><span className="mt-px opacity-50">•</span>{t('photoCropGuide1')}</li>
                <li className="flex gap-1.5"><span className="mt-px opacity-50">•</span>{t('photoCropGuide2')}</li>
                <li className="flex gap-1.5"><span className="mt-px opacity-50">•</span>{t('photoCropGuide3')}</li>
              </ul>
              <p className="text-xs text-muted-foreground/70 mt-1.5 font-medium">{t('photoCropSizeLimit')}</p>
            </div>
          </div>
        </div>

        <div className="flex justify-center px-5">
          <PhotoCropper ref={cropperRef} rawDataUrl={rawDataUrl} onCropped={onConfirm} />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4">
          <Button variant="outline" type="button" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button variant="primary" type="button" onClick={() => cropperRef.current?.crop()}>
            {t('photoCropConfirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
