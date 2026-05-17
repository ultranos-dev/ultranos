import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabase'
import { runTTSAudioCleanup } from '@/jobs/tts-audio-cleanup'

/**
 * Cron endpoint for TTS audio file cleanup — Story 24.2.
 *
 * Purges expired PHI audio files from Supabase Storage every 5 minutes.
 * Secured via CRON_SECRET header to prevent unauthorized invocations.
 * Configure in vercel.json or equivalent:
 *   { "path": "/api/cron/tts-cleanup", "schedule": "*/5 * * * *" }
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseClient()
    const result = await runTTSAudioCleanup(supabase)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (err) {
    console.error('[CRON] TTS audio cleanup failed:', (err as Error).message)
    return NextResponse.json(
      { error: 'Job execution failed' },
      { status: 500 },
    )
  }
}
