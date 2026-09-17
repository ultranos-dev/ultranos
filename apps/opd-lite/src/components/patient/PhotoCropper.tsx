'use client'

import { forwardRef } from 'react'
import { useTranslations } from 'next-intl'
import { PhotoCropper as SharedPhotoCropper, type PhotoCropperHandle } from '@ultranos/ui-kit/components/photo/photo-cropper'

export type { PhotoCropperHandle }

interface PhotoCropperProps {
  rawDataUrl: string | null
  onCropped: (dataUrl: string) => void
  shape?: 'square' | 'circle'
}

/**
 * Thin adapter over the shared ui-kit PhotoCropper, injecting the `registration`
 * i18n strings. Used by the registration photo flow (and, via the shared upload
 * modal, by patient photos). Behaviour/output (512² square) is unchanged.
 */
export const PhotoCropper = forwardRef<PhotoCropperHandle, PhotoCropperProps>(
  function PhotoCropper(props, ref) {
    const t = useTranslations('registration')
    return (
      <SharedPhotoCropper
        ref={ref}
        {...props}
        zoomLabel={t('photoCropZoom')}
        sizeErrorLabel={t('photoCropSizeError')}
      />
    )
  },
)
