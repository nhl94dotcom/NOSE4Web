import { pictureToImage, type Picture } from './core/graphics'

// Turning image files into pixels and back, which only a browser can do.

export interface LoadedImage {
  rgba: Uint8ClampedArray
  width: number
  height: number
}

// Reads an image file into raw pixels, four bytes each.
export async function readImage(file: Blob): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  return { rgba: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height }
}

// A picture as a PNG file, with colour 0 see-through.
export async function pictureToPng(picture: Picture, palette: number[]): Promise<Uint8Array> {
  const canvas = document.createElement('canvas')
  canvas.width = picture.width
  canvas.height = picture.height
  const context = canvas.getContext('2d')!
  const data = context.createImageData(picture.width, picture.height)
  data.data.set(pictureToImage(picture, palette))
  context.putImageData(data, 0, 0)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The browser could not make a PNG file.')
  return new Uint8Array(await blob.arrayBuffer())
}
