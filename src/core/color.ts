// Genesis colours are stored as a word 0x0BGR. Each channel uses only its top
// three bits, giving eight levels (0-7) per channel and 512 colours in all.
// SNES colours are stored as a word 0bbbbbgggggrrrrr: 32 levels per channel.

export type Levels = [red: number, green: number, blue: number]

export interface ColorFormat {
  // The highest level of a channel.
  top: number
  levels(word: number): Levels
  word(levels: Levels): number
  // The bits the console uses; any others it ignores.
  visible: number
}

export const GENESIS_COLORS: ColorFormat = {
  top: 7,
  levels: (word) => [(word & 0xf) >> 1, ((word >> 4) & 0xf) >> 1, ((word >> 8) & 0xf) >> 1],
  word: ([red, green, blue]) => (blue << 9) | (green << 5) | (red << 1),
  visible: 0x0eee,
}

export const SNES_COLORS: ColorFormat = {
  top: 31,
  levels: (word) => [word & 0x1f, (word >> 5) & 0x1f, (word >> 10) & 0x1f],
  word: ([red, green, blue]) => (blue << 10) | (green << 5) | red,
  visible: 0x7fff,
}

export const colorFormat = (platform: 'genesis' | 'snes'): ColorFormat => (platform === 'snes' ? SNES_COLORS : GENESIS_COLORS)

export function colorLevels(word: number, format = GENESIS_COLORS): Levels {
  return format.levels(word)
}

export function colorWord(levels: Levels, format = GENESIS_COLORS): number {
  return format.word(levels)
}

export function colorRgb(word: number, format = GENESIS_COLORS): Levels {
  const scale = (level: number) => Math.round((level * 255) / format.top)
  const [r, g, b] = format.levels(word)
  return [scale(r), scale(g), scale(b)]
}

export function cssColor(word: number, format = GENESIS_COLORS): string {
  return `rgb(${colorRgb(word, format).join(', ')})`
}

export function cssHex(word: number, format = GENESIS_COLORS): string {
  return '#' + colorRgb(word, format).map((v) => v.toString(16).padStart(2, '0')).join('')
}

// Some ROMs set bits in a colour word that the console ignores. This returns
// `current` unchanged when `next` is the same visible colour, so those bits
// survive an import that did not really change the colour.
export function keepIfSameColor(current: number, next: number, format = GENESIS_COLORS): number {
  return (current & format.visible) === next ? current : next
}

// The nearest colour the console can show to a "#rrggbb" value.
export function nearestColorWord(cssHexValue: string, format = GENESIS_COLORS): number {
  const value = parseInt(cssHexValue.slice(1), 16)
  const level = (v: number) => Math.round((v * format.top) / 255)
  return format.word([level((value >> 16) & 0xff), level((value >> 8) & 0xff), level(value & 0xff)])
}
