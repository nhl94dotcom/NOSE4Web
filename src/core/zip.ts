// Just enough of the zip format to bundle a set of files and to open a zip
// made by this editor, by Windows, by macOS or by the usual tools.

// Unlike the game's data, a zip stores its numbers low byte first.
const readU16LE = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const readU32LE = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000

export interface ZipFile {
  name: string
  data: Uint8Array
}

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const END = 0x06054b50
const STORED = 0
const DEFLATED = 8
const UTF8_NAMES = 0x0800

let crcTable: Uint32Array | null = null
function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// Files are stored as they are. Pictures are compressed already.
export function createZip(files: ZipFile[]): Uint8Array {
  const encoder = new TextEncoder()
  const entries = files.map((file) => ({ name: encoder.encode(file.name), data: file.data, crc: crc32(file.data) }))
  const size =
    entries.reduce((sum, e) => sum + 30 + e.name.length + e.data.length + 46 + e.name.length, 0) + 22
  const zip = new Uint8Array(size)
  const view = new DataView(zip.buffer)
  // 1980-01-01, the earliest date the format can hold: the same bytes every time.
  const [time, date] = [0, 0x21]
  let at = 0
  const offsets: number[] = []

  for (const entry of entries) {
    offsets.push(at)
    view.setUint32(at, LOCAL, true)
    view.setUint16(at + 4, 20, true)
    view.setUint16(at + 6, UTF8_NAMES, true)
    view.setUint16(at + 8, STORED, true)
    view.setUint16(at + 10, time, true)
    view.setUint16(at + 12, date, true)
    view.setUint32(at + 14, entry.crc, true)
    view.setUint32(at + 18, entry.data.length, true)
    view.setUint32(at + 22, entry.data.length, true)
    view.setUint16(at + 26, entry.name.length, true)
    zip.set(entry.name, at + 30)
    zip.set(entry.data, at + 30 + entry.name.length)
    at += 30 + entry.name.length + entry.data.length
  }
  const directory = at
  entries.forEach((entry, i) => {
    view.setUint32(at, CENTRAL, true)
    view.setUint16(at + 4, 20, true)
    view.setUint16(at + 6, 20, true)
    view.setUint16(at + 8, UTF8_NAMES, true)
    view.setUint16(at + 10, STORED, true)
    view.setUint16(at + 12, time, true)
    view.setUint16(at + 14, date, true)
    view.setUint32(at + 16, entry.crc, true)
    view.setUint32(at + 20, entry.data.length, true)
    view.setUint32(at + 24, entry.data.length, true)
    view.setUint16(at + 28, entry.name.length, true)
    view.setUint32(at + 42, offsets[i], true)
    zip.set(entry.name, at + 46)
    at += 46 + entry.name.length
  })
  view.setUint32(at, END, true)
  view.setUint16(at + 8, entries.length, true)
  view.setUint16(at + 10, entries.length, true)
  view.setUint32(at + 12, at - directory, true)
  view.setUint32(at + 16, directory, true)
  return zip
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function isZip(data: Uint8Array): boolean {
  return data.length >= 22 && readU32LE(data, 0) === LOCAL
}

// The files in a zip, folders left out. Names keep any folder they are in.
export async function readZip(zip: Uint8Array): Promise<ZipFile[]> {
  // The end record is last, after at most a 64 KB comment.
  let end = -1
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at--) {
    if (readU32LE(zip, at) === END) {
      end = at
      break
    }
  }
  if (end < 0) throw new Error('This is not a zip file.')
  const count = readU16LE(zip, end + 10)
  let at = readU32LE(zip, end + 16)
  if (count === 0xffff || at === 0xffffffff) throw new Error('This zip file is too large to open here.')

  const decoder = new TextDecoder()
  const files: ZipFile[] = []
  for (let i = 0; i < count; i++) {
    if (at + 46 > zip.length || readU32LE(zip, at) !== CENTRAL) throw new Error('This zip file is damaged.')
    const flags = readU16LE(zip, at + 8)
    const method = readU16LE(zip, at + 10)
    const packed = readU32LE(zip, at + 20)
    const nameLength = readU16LE(zip, at + 28)
    const local = readU32LE(zip, at + 42)
    const name = decoder.decode(zip.subarray(at + 46, at + 46 + nameLength))
    at += 46 + nameLength + readU16LE(zip, at + 30) + readU16LE(zip, at + 32)

    if (name.endsWith('/')) continue
    if (flags & 1) throw new Error(`${name} is protected by a password, so it cannot be opened.`)
    if (local + 30 > zip.length || readU32LE(zip, local) !== LOCAL) throw new Error('This zip file is damaged.')
    const start = local + 30 + readU16LE(zip, local + 26) + readU16LE(zip, local + 28)
    const body = zip.subarray(start, start + packed)
    if (method === STORED) files.push({ name, data: body.slice() })
    else if (method === DEFLATED) files.push({ name, data: await inflate(body) })
    else throw new Error(`${name} is packed in a way that cannot be opened here.`)
  }
  return files
}
