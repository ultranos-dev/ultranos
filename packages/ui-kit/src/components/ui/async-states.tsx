'use client'

import * as React from 'react'
import type { AsyncStatus } from '../../hooks/use-async-data.js'
import { EmptyState } from './empty-state.js'
import { Skeleton } from './skeleton.js'
import { AlertTriangle } from '../../icons.js'

export interface AsyncStatesProps<T> {
  state: {
    status: AsyncStatus
    data: T | undefined
    error?: unknown
    reload?: () => void
  }
  children: (data: T) => React.ReactNode
  isEmpty?: (data: T | undefined) => boolean
  loading?: React.ReactNode
  errorState?: React.ReactNode
  empty?: React.ReactNode
  labels?: {
    errorTitle?: string
    errorDescription?: string
    retry?: string
  }
  onRetry?: () => void
}

function defaultIsEmpty<T>(data: T | undefined): boolean {
  if (data == null) return true
  if (Array.isArray(data)) return data.length === 0
  return false
}

/**
 * Renders one of four states — loading, error, empty (ready+no data), or data (ready+data).
 * Consuming components pass `state` from `useAsyncData` and a render-prop `children`
 * that receives the confirmed-non-empty data. "Nothing here yet" is only shown in
 * the 'ready' state, so loading and errors can never accidentally look like empty.
 */
export function AsyncStates<T>({
  state,
  children,
  isEmpty = defaultIsEmpty,
  loading,
  errorState,
  empty,
  labels,
  onRetry,
}: AsyncStatesProps<T>) {
  if (state.status === 'loading') {
    if (loading !== undefined) return <>{loading}</>
    return (
      <div className="flex flex-col gap-2 p-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    )
  }

  if (state.status === 'error') {
    if (errorState !== undefined) return <>{errorState}</>
    const retryFn = onRetry ?? state.reload
    return (
      <EmptyState
        icon={AlertTriangle}
        title={labels?.errorTitle ?? 'Unable to load'}
        description={labels?.errorDescription ?? 'Something went wrong. Please try again.'}
        action={
          retryFn
            ? { label: labels?.retry ?? 'Retry', onClick: retryFn }
            : undefined
        }
      />
    )
  }

  // status === 'ready'
  if (isEmpty(state.data)) {
    if (empty !== undefined) return <>{empty}</>
    return <EmptyState title="Nothing here yet" />
  }

  // data is confirmed non-empty — T is guaranteed defined here because
  // isEmpty returned false, but we cast to satisfy TypeScript.
  return <>{children(state.data as T)}</>
}
