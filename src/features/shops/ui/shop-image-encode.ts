import {
  canvasToUpload,
  drawSmooth,
  encodeWithin,
  hasTransparency,
  uploadSide,
} from '@/shared/lib/image-encode'

/**
 * Decode and re-encode, as item pictures (ADR 017): never upload arbitrary bytes. The long side
 * shrinks to 1024 px and the file to at most 1 MB; the banner crops with CSS, never the file.
 */
export async function toShopImage(file: File) {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error('invalid')
  // A file that does not decode is not an image we can use.
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('invalid')
  })
  try {
    const fit = Math.min(1, uploadSide / Math.max(bitmap.width, bitmap.height))
    const alpha = file.type !== 'image/jpeg' && hasTransparency(bitmap)
    return await encodeWithin(
      (scale) => {
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(bitmap.width * fit * scale))
        canvas.height = Math.max(1, Math.round(bitmap.height * fit * scale))
        drawSmooth(
          canvas.getContext('2d')!,
          bitmap,
          0,
          0,
          bitmap.width,
          bitmap.height,
          0,
          0,
          canvas.width,
          canvas.height,
        )
        return canvas
      },
      (canvas, quality) => canvasToUpload(canvas, quality, alpha),
    )
  } finally {
    bitmap.close()
  }
}
