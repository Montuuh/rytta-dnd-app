import { mediaLimit } from '../data/repository'

/**
 * Prepares a picked image for upload: images larger than `max` pixels on a side (or the size limit)
 * are downscaled and encoded as WebP; smaller WebP, PNG and JPEG files are kept as they are.
 */
export async function prepareImage(file: Blob, max = 4096) {
  if (!/^image\/(webp|png|jpeg)$/.test(file.type)) throw new Error('invalid')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && file.size <= mediaLimit)
    return { blob: file, width: bitmap.width, height: bitmap.height }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.86),
  )
  if (!blob || blob.size > mediaLimit) throw new Error('invalid')
  return { blob, width: canvas.width, height: canvas.height }
}
