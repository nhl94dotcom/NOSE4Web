// Converts NOSE's false-colour preview bitmaps into small files of palette
// indexes for the colour previews. Run with: node scripts/convert-templates.mjs
// Output format: width (2 bytes), height (2 bytes), then one byte per pixel,
// row by row from the top. 255 marks a pixel that is not part of the palette.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const source = process.argv[2] ?? join(root, '..', 'NOSE_source_1.2b_wboy')
const output = join(root, 'public', 'templates')

const TEMPLATES = [
  { folder: 'strips', file: '92 Strip', palette: 'Palette 0EE8', name: 'strip' },
  { folder: 'strips', file: '92 Sprites', palette: 'Palette 0EE8', name: 'sprites' },
  { folder: 'rinks', file: '94 Top Right', palette: 'Palette Rink', name: 'rink-top' },
  { folder: 'rinks', file: '94 Center Right', palette: 'Palette Rink', name: 'rink-center' },
  { folder: 'rinks', file: '94 Bottom Right', palette: 'Palette Rink', name: 'rink-bottom' },
  { folder: 'rinks', file: '94 Pause Menu', palette: 'Palette Rink', name: 'rink-pause' },
]

// Reads an uncompressed 24-bit BMP into rows of 0xRRGGBB values, top row first.
function readBmp(path) {
  const data = readFileSync(path)
  const start = data.readUInt32LE(10)
  const width = data.readInt32LE(18)
  const height = data.readInt32LE(22)
  if (data.readUInt16LE(28) !== 24 || height < 0) throw new Error(`${path}: expected a 24-bit bottom-up bitmap`)
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixels = []
  for (let y = 0; y < height; y++) {
    const row = start + (height - 1 - y) * rowSize
    for (let x = 0; x < width; x++) {
      const o = row + x * 3
      pixels.push((data[o + 2] << 16) | (data[o + 1] << 8) | data[o])
    }
  }
  return { width, height, pixels }
}

mkdirSync(output, { recursive: true })
for (const template of TEMPLATES) {
  const palette = readBmp(join(source, template.folder, `${template.palette}.bmp`)).pixels
  const image = readBmp(join(source, template.folder, `${template.file}.bmp`))
  const out = Buffer.alloc(4 + image.pixels.length)
  out.writeUInt16LE(image.width, 0)
  out.writeUInt16LE(image.height, 2)
  let unmatched = 0
  image.pixels.forEach((colour, i) => {
    const index = palette.indexOf(colour)
    if (index < 0) unmatched++
    out[4 + i] = index < 0 ? 255 : index
  })
  writeFileSync(join(output, `${template.name}.idx`), out)
  console.log(`${template.name}: ${image.width}x${image.height}, ${unmatched} pixels outside the palette`)
}
