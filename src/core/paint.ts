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
// (the SNES centre ice logo, whose pixels are row * 16 + colour). Where a
// square holds colours of more than one row, as a stroke or a move can leave
// it, it is put in whichever of `rows` shows it best: the row whose colours
// are nearest its pixels, all told, and each pixel then takes the nearest
// colour in that row, keeping its own where it is already in it. A tie goes
// to `prefer`, the row painted with. `rgb` gives each colour number's red,
// green and blue. With `only`, just the squares those points are in.
export function squaresInBestRow(picture: Picture, rgb: number[][], rows: number[], only?: Point[], prefer?: number): Picture {
  const distance = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const nearest = (value: number, row: number) => {
    if (value >> 4 === row) return value
    let best = row * 16 + 1
    for (let c = 2; c < 16; c++) if (distance(rgb[row * 16 + c], rgb[value]) < distance(rgb[best], rgb[value])) best = row * 16 + c
    return best
  }
  const squares =
    only === undefined
      ? null
      : new Set(only.filter((point) => inside(picture, point)).map(([x, y]) => `${x >> 3},${y >> 3}`))
  const pixels = picture.pixels.slice()
  for (let sy = 0; sy < picture.height; sy += 8) {
    for (let sx = 0; sx < picture.width; sx += 8) {
      if (squares && !squares.has(`${sx >> 3},${sy >> 3}`)) continue
      const square: number[] = []
      for (let y = sy; y < Math.min(picture.height, sy + 8); y++) {
        for (let x = sx; x < Math.min(picture.width, sx + 8); x++) if (pixels[y * picture.width + x] !== 0) square.push(y * picture.width + x)
      }
      if (new Set(square.map((i) => pixels[i] >> 4)).size < 2) continue
      let bestRow = rows[0]
      let bestCost = Infinity
      for (const row of rows) {
        const cost = square.reduce((sum, i) => sum + distance(rgb[nearest(pixels[i], row)], rgb[pixels[i]]), 0)
        if (cost < bestCost || (cost === bestCost && row === prefer)) [bestRow, bestCost] = [row, cost]
      }
      for (const i of square) pixels[i] = nearest(pixels[i], bestRow)
    }
  }
  return { ...picture, pixels }
}
