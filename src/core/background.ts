// Images made in editors that cannot save see-through pixels, such as MS
// Paint, or saved as JPEG, come with a solid background around the logo. The
// game builds a logo from squares of 8 by 8 pixels and keeps only those with
// something in them, so with a solid background every square is kept: the
// logo shows as a solid box, background and all, and the background's edges
// around the logo add squares and take room the logos share. These find that
// background and make it see-through.

export interface RgbaImage {
  rgba: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}

// How far each of red, green and blue may be from the background colour and
// still be background: enough for the speckle a JPEG adds.
const NEAR = 32

// Whether any pixel of the image is see-through (as the editor reads one).
export function hasSeeThrough(image: RgbaImage): boolean {
  for (let i = 3; i < image.rgba.length; i += 4) if (image.rgba[i] < 128) return true
  return false
}

// What to call the background colour in a message.
function colourName(rgb: number[]): string {
  if (rgb.every((c) => c >= 0xe0)) return 'white'
  if (rgb.every((c) => c <= 0x20)) return 'black'
  return 'solid colour'
}

// The image with the background around the logo made see-through: every pixel
// joined to the image's edge through pixels of the colour in its four corners.
// Null where the image has see-through pixels already, where its corners are
// not all one colour, or where nothing, or everything, would be cleared.
export function withSeeThroughBackground(image: RgbaImage): { image: RgbaImage; colour: string } | null {
  const { rgba, width, height } = image
  if (width === 0 || height === 0 || hasSeeThrough(image)) return null
  const rgbAt = (p: number) => [rgba[p * 4], rgba[p * 4 + 1], rgba[p * 4 + 2]]
  const background = rgbAt(0)
  const near = (p: number) => rgbAt(p).every((c, k) => Math.abs(c - background[k]) <= NEAR)
  const corners = [0, width - 1, (height - 1) * width, height * width - 1]
  if (!corners.every(near)) return null

  const cleared = new Uint8Array(width * height)
  const stack: number[] = []
  const visit = (p: number) => {
    if (!cleared[p] && near(p)) {
      cleared[p] = 1
      stack.push(p)
    }
  }
  for (let x = 0; x < width; x++) {
    visit(x)
    visit((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    visit(y * width)
    visit(y * width + width - 1)
  }
  while (stack.length > 0) {
    const p = stack.pop()!
    const [x, y] = [p % width, Math.floor(p / width)]
    if (x > 0) visit(p - 1)
    if (x < width - 1) visit(p + 1)
    if (y > 0) visit(p - width)
    if (y < height - 1) visit(p + width)
  }
  const count = cleared.reduce((sum, c) => sum + c, 0)
  if (count === 0 || count === width * height) return null

  const out = new Uint8ClampedArray(rgba)
  cleared.forEach((c, p) => {
    if (c) out[p * 4 + 3] = 0
  })
  return { image: { rgba: out, width, height }, colour: colourName(background) }
}

// What the editor says after an import, about the image's background:
// `colour` where it made the background see-through, or null where it did not.
export function backgroundNote(image: RgbaImage, colour: string | null): string {
  if (colour !== null) {
    return (
      ` The image had no see-through background, so the ${colour} around the logo was made see-through. ` +
      '(MS Paint can’t save a see-through background; Paint.NET, GIMP and photopea.com can.)'
    )
  }
  if (hasSeeThrough(image)) return ''
  return (
    ' The image has no see-through pixels, so the game will show the logo as a solid box, background and all. ' +
    'To have only the logo, erase the background to see-through (MS Paint can’t save one; Paint.NET, GIMP and photopea.com can) and import it again.'
  )
}
