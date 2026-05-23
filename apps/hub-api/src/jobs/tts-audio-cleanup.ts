/**
 * Story 24.2: TTS Audio Cleanup Job
 *
 * Purges expired TTS audio files from Supabase Storage.
 * Audio files in the 'tts-audio' bucket are PHI and must be deleted
 * after their 15-minute pre-signed URL expires (PRD Section 9).
 *
 * This cron replaces the unreliable in-process setTimeout approach
 * which cannot survive serverless function termination.
 *
 * Schedule: every 5 minutes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const TTS_BUCKET = 'tts-audio'
const MAX_AGE_MINUTES = 15

export async function runTTSAudioCleanup(
  supabase: SupabaseClient,
): Promise<{ deleted: number; errors: number }> {
  let deleted = 0
  let errors = 0

  // List all files in the tts/ prefix
  const { data: files, error: listError } = await supabase.storage
    .from(TTS_BUCKET)
    .list('tts', { limit: 500, sortBy: { column: 'created_at', order: 'asc' } })

  if (listError || !files) {
    return { deleted: 0, errors: 1 }
  }

  const cutoff = new Date(Date.now() - MAX_AGE_MINUTES * 60 * 1000)
  const expiredFiles: string[] = []

  for (const file of files) {
    if (file.created_at && new Date(file.created_at) < cutoff) {
      expiredFiles.push(`tts/${file.name}`)
    }
  }

  if (expiredFiles.length === 0) {
    return { deleted: 0, errors: 0 }
  }

  // Batch delete expired files
  const { error: removeError } = await supabase.storage
    .from(TTS_BUCKET)
    .remove(expiredFiles)

  if (removeError) {
    errors = expiredFiles.length
  } else {
    deleted = expiredFiles.length
  }

  return { deleted, errors }
}
