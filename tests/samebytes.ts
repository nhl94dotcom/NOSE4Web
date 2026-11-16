import { expect } from 'vitest'

// Whether two ROMs (or any byte arrays) hold the same bytes. expect(...).toEqual on a 2 MB array compares it entry
// by entry through Vitest's deep equality, about 3 seconds each; this takes a millisecond, and on a difference says
// where the first one is and how many there are.
export function expectSameBytes(actual: Uint8Array, expected: Uint8Array, label = ''): void {
  const a = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength)
  const b = Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength)
  if (a.length === b.length && a.compare(b) === 0) return
  let first = -1
  let count = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue
    if (first < 0) first = i
    count++
  }
  const where = first < 0 ? '' : `, ${count} byte${count === 1 ? '' : 's'} differ, the first at $${first.toString(16).toUpperCase()} ($${a[first].toString(16)} for $${b[first].toString(16)})`
  expect.fail(`${label ? `${label}: ` : ''}the bytes differ: ${a.length} bytes against ${b.length}${where}`)
}
