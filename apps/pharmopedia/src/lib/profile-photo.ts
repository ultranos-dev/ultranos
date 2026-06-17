import { supabase } from '@/lib/supabase'

const BUCKET = 'profile-photos'

/**
 * Upload a local image URI to the profile-photos bucket at {userId}/avatar.<ext>
 * (upsert) and return the storage object path (e.g. "u1/avatar.jpeg").
 * The bucket is private — callers must obtain a signed URL from the Hub API.
 * The extension + content type are derived from the fetched blob so
 * HEIC/PNG/JPEG are all handled correctly. Throws on error.
 */
export async function uploadProfilePhoto(uri: string, userId: string): Promise<string> {
  const res = await fetch(uri)
  const blob = await res.blob()
  const contentType = blob.type || 'image/jpeg'
  const ext = contentType.includes('/') ? contentType.split('/')[1] : 'jpg'
  const path = `${userId}/avatar.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  })
  if (error) throw error
  return path
}
