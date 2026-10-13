// Finding unused room at the end of a ROM for data the editor moves there.
//
// Other tools use that room too. Hack programs add their own code to it, at
// the start of whatever is still unused, and the game then depends on that
// code staying exactly where it was put. So room is only ever taken from
// beyond the last thing in the ROM, and nothing already there is moved.

const UNUSED = 0xff
// Left between what is already in the ROM and what is added, so that the two
// are easy to tell apart and a last unused-looking byte of the one is not
// taken for room by the other.
const GAP = 4

// Room for `size` bytes at the end of the ROM: a copy of the ROM, made larger
// if it has to be, and where in it the room starts. Null if there is no room
// and the file cannot grow. Code a hack adds goes after the end mark, which
// stays where it is, as the hack program smozROM leaves it: `keepMark`.
export function claimSpace(rom: Uint8Array, size: number, keepMark = false): { rom: Uint8Array; at: number } | null {
  let last = rom.length - 1
  while (last >= 0 && rom[last] === UNUSED) last--
  // NOSE marks the end of the used part of a ROM it has edited. Where that
  // mark is the very last thing in the ROM, it is moved to follow the new
  // data, as NOSE would move it. Where something follows the mark, that is
  // another tool's work, and the mark is left where it is.
  const marked = !keepMark && last >= 1 && rom[last - 1] === 0x60 && rom[last] === 0xfe
  const at = marked ? last - 1 : last + 1 + ((last + 1) % 2) + GAP
  const needed = at + size + (marked ? 2 : 0)
  let length = rom.length
  if (needed > length) length = length === 0x80000 || length === 0x100000 ? length * 2 : length === 0x200000 ? 0x300000 : 0
  if (needed > length) return null
  const grown = new Uint8Array(length).fill(UNUSED)
  grown.set(rom)
  if (marked) grown.set([0x60, 0xfe], at + size)
  return { rom: grown, at }
}
