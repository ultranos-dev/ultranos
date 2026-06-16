import { supabase } from '@/lib/supabase'

const BUCKET = 'profile-photos'

/**
 * Upload a local image URI to the profile-photos bucket at {userId}/avatar.<ext>
 * (upsert) and return its public URL. The extension + content type are derived
 * from the fetched blob so HEIC/PNG/JPEG are all served correctly. Throws on error.
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
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}
