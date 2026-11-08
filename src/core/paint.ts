import type { Picture } from './graphics'

// Drawing on a picture, for the logo editor: which pixels a tool touches, and
// the picture with them painted. A picture's pixels are colour numbers; 0 is
// see-through. Nothing here changes a picture in place.

export type Point = [number, number]

const inside = (picture: Picture, [x, y]: Point) => x >= 0 && y >= 0 && x < picture.width && y < picture.height

export function pixelAt(picture: Picture, [x, y]: Point): number {
  return inside(picture, [x, y]) ? picture.pixels[y * picture.width + x] : 0
}

// The points of a straight line from one pixel to another, both ends included.
export function linePoints([x0, y0]: Point, [x1, y1]: Point): Point[] {
  const points: Point[] = []
  const [dx, dy] = [Math.abs(x1 - x0), -Math.abs(y1 - y0)]
  const [sx, sy] = [x0 < x1 ? 1 : -1, y0 < y1 ? 1 : -1]
  let error = dx + dy
  let [x, y] = [x0, y0]
  for (;;) {
    points.push([x, y])
    if (x === x1 && y === y1) return points
    const twice = 2 * error
    if (twice >= dy) {
      error += dy
      x += sx
    }
    if (twice <= dx) {
      error += dx
      y += sy
    }
  }
}

// A rectangle with these two corners: its edge, or the whole of it.
export function rectanglePoints([x0, y0]: Point, [x1, y1]: Point, filled: boolean): Point[] {
  const [left, right, top, bottom] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)]
  const points: Point[] = []
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if (filled || y === top || y === bottom || x === left || x === right) points.push([x, y])
    }
  }
  return points
}

// The pixels joined to this one, side by side, that have its colour.
export function fillPoints(picture: Picture, start: Point): Point[] {
  if (!inside(picture, start)) return []
  const colour = pixelAt(picture, start)
  const seen = new Uint8Array(picture.width * picture.height)
  const points: Point[] = []
  const stack: Point[] = [start]
  while (stack.length > 0) {
    const [x, y] = stack.pop()!
    if (!inside(picture, [x, y]) || seen[y * picture.width + x] || pixelAt(picture, [x, y]) !== colour) continue
    seen[y * picture.width + x] = 1
    points.push([x, y])
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  return points
}

// The points with their mirror image across the middle, left to right.
export function mirrored(picture: Picture, points: Point[]): Point[] {
  return [...points, ...points.map(([x, y]): Point => [picture.width - 1 - x, y])]
}

// The picture with these points painted `colour`, those outside it left out.
export function paint(picture: Picture, points: Point[], colour: number): Picture {
  const pixels = picture.pixels.slice()
  for (const point of points) if (inside(picture, point)) pixels[point[1] * picture.width + point[0]] = colour
  return { ...picture, pixels }
}

export function flipped(picture: Picture, sideways: boolean): Picture {
  const { width, height } = picture
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = sideways ? picture.pixels[y * width + width - 1 - x] : picture.pixels[(height - 1 - y) * width + x]
    }
  }
  return { width, height, pixels }
}

// Moved by (dx, dy). What moves off the edge is lost, and what comes in is see-through.
export function shifted(picture: Picture, dx: number, dy: number): Picture {
  const { width, height } = picture
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from: Point = [x - dx, y - dy]
      if (inside(picture, from)) pixels[y * width + x] = pixelAt(picture, from)
    }
  }
  return { width, height, pixels }
}

export function samePicture(a: Picture, b: Picture): boolean {
  return a.width === b.width && a.height === b.height && a.pixels.every((pixel, i) => pixel === b.pixels[i])
}

// For pictures whose every 8 x 8 square is drawn in one row of 16 colours
// (the SNES centre ice logo, whose pixels are row * 16 + colour): the other
// pixels of each square these points touch are moved to the row painted, each
// keeping its colour number.
export function oneRowPerSquare(picture: Picture, points: Point[], colour: number): Picture {
  if (colour === 0) return picture
  const row = colour >> 4
  const pixels = picture.pixels.slice()
  const squares = new Set(points.filter((point) => inside(picture, point)).map(([x, y]) => `${x >> 3},${y >> 3}`))
  for (const key of squares) {
    const [sx, sy] = key.split(',').map(Number)
    for (let y = sy * 8; y < Math.min(picture.height, sy * 8 + 8); y++) {
      for (let x = sx * 8; x < Math.min(picture.width, sx * 8 + 8); x++) {
        const value = pixels[y * picture.width + x]
        if (value !== 0) pixels[y * picture.width + x] = row * 16 + (value & 15)
      }
    }
  }
  return { ...picture, pixels }
}
