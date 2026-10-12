// Genesis colours are stored as a word 0x0BGR. Each channel uses only its top
// three bits, giving eight levels (0-7) per channel and 512 colours in all.

export type Levels = [red: number, green: number, blue: number]

export function colorLevels(word: number): Levels {
  return [(word & 0xf) >> 1, ((word >> 4) & 0xf) >> 1, ((word >> 8) & 0xf) >> 1]
}

export function colorWord([red, green, blue]: Levels): number {
  return (blue << 9) | (green << 5) | (red << 1)
}

export function colorRgb(word: number): Levels {
  const [r, g, b] = colorLevels(word)
  const scale = (level: number) => Math.round((level * 255) / 7)
  return [scale(r), scale(g), scale(b)]
}

export function cssColor(word: number): string {
  return `rgb(${colorRgb(word).join(', ')})`
}

export function cssHex(word: number): string {
  return '#' + colorRgb(word).map((v) => v.toString(16).padStart(2, '0')).join('')
}

// Some ROMs set bits in a colour word that the console ignores. This returns
// `current` unchanged when `next` is the same visible colour, so those bits
// survive an import that did not really change the colour.
export function keepIfSameColor(current: number, next: number): number {
  return (current & 0x0eee) === next ? current : next
}

// The nearest Genesis colour to a "#rrggbb" value.
export function nearestColorWord(cssHexValue: string): number {
  const value = parseInt(cssHexValue.slice(1), 16)
  const level = (v: number) => Math.round((v * 7) / 255)
  return colorWord([level((value >> 16) & 0xff), level((value >> 8) & 0xff), level(value & 0xff)])
}
