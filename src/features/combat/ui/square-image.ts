import { canvasToUpload, drawSmooth, encodeWithin, uploadSide } from '@/shared/lib/image-encode'

/** Center-crops an image to a square of at most 1024px before upload: small tokens stay uniform
 * and the stat block plate and full-screen viewer stay sharp (RYT-099). */
export async function toSquareWebp(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    return await encodeWithin((scale) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = Math.round(Math.min(uploadSide, side) * scale)
      drawSmooth(
        canvas.getContext('2d')!,
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        canvas.width,
        canvas.height,
      )
      return canvas
    }, canvasToUpload)
  } finally {
    bitmap.close()
  }
}
