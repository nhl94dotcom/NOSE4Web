// Big-endian helpers. The Genesis CPU (68000) stores multi-byte values high byte first.
// The SNES helpers are at the end.

export function readU16(b: Uint8Array, o: number): number {
  return (b[o] << 8) | b[o + 1]
}

export function readU32(b: Uint8Array, o: number): number {
  return b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3])
}

export function writeU16(b: Uint8Array, o: number, v: number): void {
  b[o] = (v >> 8) & 0xff
  b[o + 1] = v & 0xff
}

export function writeU32(b: Uint8Array, o: number, v: number): void {
  b[o] = Math.floor(v / 0x1000000) & 0xff
  b[o + 1] = (v >> 16) & 0xff
  b[o + 2] = (v >> 8) & 0xff
  b[o + 3] = v & 0xff
}

export function readAscii(b: Uint8Array, o: number, length: number): string {
  let s = ''
  for (let i = 0; i < length; i++) s += String.fromCharCode(b[o + i])
  return s
}

export function writeAscii(b: Uint8Array, o: number, text: string): void {
  for (let i = 0; i < text.length; i++) b[o + i] = text.charCodeAt(i) & 0xff
}

// The games store text as a length word followed by the characters, padded
// with a zero byte to an even size. The length counts its own two bytes.

export function textSize(text: string): number {
  return 2 + text.length + (text.length % 2)
}

export function readText(b: Uint8Array, o: number): { text: string; size: number } {
  const size = readU16(b, o)
  let end = o + size
  while (end > o + 2 && b[end - 1] === 0) end--
  return { text: readAscii(b, o + 2, end - (o + 2)), size }
}

export function writeText(b: Uint8Array, o: number, text: string): number {
  const size = textSize(text)
  writeU16(b, o, size)
  writeAscii(b, o + 2, text)
  if (text.length % 2) b[o + 2 + text.length] = 0
  return size
}

export function hex(v: number, digits = 2): string {
  return v.toString(16).toUpperCase().padStart(digits, '0')
}

// The SNES CPU (65816) stores values low byte first, and the SNES game keeps
// its text as a length word and the characters, with no padding.

export function readU16LE(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8)
}

export function writeU16LE(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff
  b[o + 1] = (v >> 8) & 0xff
}

export function snesTextSize(text: string): number {
  return 2 + text.length
}

export function readSnesText(b: Uint8Array, o: number): { text: string; size: number } {
  const size = readU16LE(b, o)
  return { text: readAscii(b, o + 2, size - 2), size }
}

export function writeSnesText(b: Uint8Array, o: number, text: string): number {
  const size = snesTextSize(text)
  writeU16LE(b, o, size)
  writeAscii(b, o + 2, text)
  return size
}
