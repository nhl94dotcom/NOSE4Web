// IPS is the usual format for sharing ROM changes without sharing the ROM: a
// list of "write these bytes at this address" records. A patch made here turns
// the file that was opened into the file that would be downloaded.

const HEADER = [0x50, 0x41, 0x54, 0x43, 0x48] // "PATCH"
const FOOTER = [0x45, 0x4f, 0x46] // "EOF"
// A record at this address would read as the footer. Genesis ROMs handled
// here are far smaller, so larger files are simply refused.
const EOF_ADDRESS = 0x454f46
const MAX_RECORD = 0xffff
// Unchanged gaps shorter than this are cheaper to include than to split around.
const MERGE_GAP = 6
// A run of one repeated byte at least this long is stored as a count.
const MIN_RUN = 12

function runLength(data: Uint8Array, start: number, end: number): number {
  let length = 1
  while (start + length < end && data[start + length] === data[start] && length < MAX_RECORD) length++
  return length
}

export function createIps(original: Uint8Array, modified: Uint8Array): Uint8Array {
  if (modified.length < original.length) throw new Error('A patch cannot make the ROM smaller.')
  if (modified.length > EOF_ADDRESS) throw new Error('The ROM is too large for an IPS patch.')
  const differs = (o: number) => o >= original.length || original[o] !== modified[o]
  const out: number[] = [...HEADER]
  const address = (o: number) => out.push((o >> 16) & 0xff, (o >> 8) & 0xff, o & 0xff)

  let o = 0
  while (o < modified.length) {
    if (!differs(o)) {
      o++
      continue
    }
    // Find the end of this stretch of changes, bridging short unchanged gaps.
    const start = o
    let end = o + 1
    for (let gap = 0, p = end; p < modified.length && gap < MERGE_GAP; p++) {
      if (differs(p)) {
        end = p + 1
        gap = 0
      } else gap++
    }
    o = end

    let p = start
    while (p < end) {
      const run = runLength(modified, p, end)
      if (run >= MIN_RUN) {
        address(p)
        out.push(0, 0, run >> 8, run & 0xff, modified[p])
        p += run
        continue
      }
      // Literal bytes, up to the next long run or the record size limit.
      let stop = p + 1
      while (stop < end && stop - p < MAX_RECORD && runLength(modified, stop, end) < MIN_RUN) stop++
      address(p)
      out.push((stop - p) >> 8, (stop - p) & 0xff, ...modified.subarray(p, stop))
      p = stop
    }
  }
  out.push(...FOOTER)
  return Uint8Array.from(out)
}

export function applyIps(original: Uint8Array, patch: Uint8Array): Uint8Array {
  if (HEADER.some((byte, i) => patch[i] !== byte)) throw new Error('This is not an IPS patch.')
  let out = original.slice()
  const reach = (size: number) => {
    if (size <= out.length) return
    const grown = new Uint8Array(size)
    grown.set(out)
    out = grown
  }
  let p = HEADER.length
  while (p + 3 <= patch.length) {
    const offset = (patch[p] << 16) | (patch[p + 1] << 8) | patch[p + 2]
    if (offset === EOF_ADDRESS) return out
    const size = (patch[p + 3] << 8) | patch[p + 4]
    p += 5
    if (size === 0) {
      const run = (patch[p] << 8) | patch[p + 1]
      reach(offset + run)
      out.fill(patch[p + 2], offset, offset + run)
      p += 3
    } else {
      reach(offset + size)
      out.set(patch.subarray(p, p + size), offset)
      p += size
    }
  }
  throw new Error('The IPS patch ends unexpectedly.')
}
