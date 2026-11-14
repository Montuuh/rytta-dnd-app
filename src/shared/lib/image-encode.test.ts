import { describe, expect, it } from 'vitest'
import { encodeWithin, halvingSteps, uploadBytes, uploadExtension } from './image-encode'

const blob = (size: number, type = 'image/webp') => ({ size, type }) as Blob

describe('halvingSteps', () => {
  it('halves a large photo until one last step of at most 2× is left', () => {
    expect(halvingSteps(4000, 1024)).toEqual([2000])
    expect(halvingSteps(6000, 1024)).toEqual([3000, 1500])
    expect(halvingSteps(3000, 512)).toEqual([1500, 750])
  })

  it('draws directly when the reduction is small or the image grows', () => {
    expect(halvingSteps(2048, 1024)).toEqual([])
    expect(halvingSteps(800, 1024)).toEqual([])
  })
})

describe('encodeWithin', () => {
  it('keeps the full size at the best quality that fits', async () => {
    const tried: string[] = []
    const result = await encodeWithin(
      (scale) => scale,
      async (scale, quality) => {
        tried.push(`${scale}@${quality}`)
        return blob(quality > 0.85 ? uploadBytes + 1 : 400_000)
      },
    )
    expect(result.size).toBe(400_000)
    expect(tried).toEqual(['1@0.9', '1@0.85'])
  })

  it('shrinks the picture rather than dropping below the lowest quality', async () => {
    const tried: string[] = []
    await encodeWithin(
      (scale) => scale,
      async (scale, quality) => {
        tried.push(`${scale}@${quality}`)
        return blob(scale === 1 ? uploadBytes + 1 : 300_000)
      },
    )
    expect(tried).toEqual(['1@0.9', '1@0.85', '1@0.8', '1@0.75', '0.75@0.9'])
  })

  it('accepts the JPEG or PNG a browser without a WebP encoder produces', async () => {
    const result = await encodeWithin(
      () => null,
      async () => blob(200_000, 'image/jpeg'),
    )
    expect(result.type).toBe('image/jpeg')
  })

  it('refuses types the buckets do not take and pictures that never fit', async () => {
    await expect(
      encodeWithin(
        () => null,
        async () => blob(10, 'image/bmp'),
      ),
    ).rejects.toThrow('invalid')
    await expect(
      encodeWithin(
        () => null,
        async () => blob(uploadBytes + 1),
      ),
    ).rejects.toThrow('invalid')
  })
})

describe('uploadExtension', () => {
  it('names the storage file after its type', () => {
    expect(uploadExtension('image/webp')).toBe('webp')
    expect(uploadExtension('image/jpeg')).toBe('jpg')
    expect(uploadExtension('image/png')).toBe('png')
  })
})
