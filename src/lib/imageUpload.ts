import { supabase } from './supabase'

const IMAGE_BUCKET = 'card-images'
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export async function uploadImageFile(file: File, folder: 'cards' | 'equipment') {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('只支援 PNG、JPG、JPEG、WEBP 圖片。')
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('圖片大小不能超過 5 MB。')
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() ?? 'png' : 'png'
  const timestamp = Date.now()
  const randomSuffix = Math.random().toString(36).slice(2, 10)
  const safeName = sanitizeFilename(file.name.replace(/\.[^.]+$/, '') || `${folder}-image`)
  const path = `${folder}/manual/${timestamp}-${randomSuffix}-${safeName}.${extension}`

  const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path)

  return {
    path,
    publicUrl: data.publicUrl,
  }
}
