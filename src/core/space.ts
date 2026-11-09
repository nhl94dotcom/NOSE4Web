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

// The largest a ROM may grow to. The game keeps its save memory (records,
// settings) at $200001, just past 2 MB, and reads and writes it there
// directly; in a larger ROM the console reads the ROM there instead, so saves
// stop working, unless the game is changed to switch the save memory in
// through the cartridge's mapper ($A130F1) around each use, as EVO does. (The
// disassembly's docs/EXPANDING_THE_ROM.md.) Until NOSE4Web can make that
// change, a ROM grows to 2 MB and no further.
export const LARGEST_ROM = 0x200000

// Said where a ROM has no room left because it is as large as it may be.
export function fullRomReason(rom: Uint8Array): string {
  return rom.length >= LARGEST_ROM
    ? ' It is 2 MB, the largest a ROM can be while the game can still save its records, which it keeps just past 2 MB.'
    : ''
}

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
  if (needed > length) length = (length === 0x80000 || length === 0x100000) && length * 2 <= LARGEST_ROM ? length * 2 : 0
  if (needed > length) return null
  const grown = new Uint8Array(length).fill(UNUSED)
  grown.set(rom)
  if (marked) grown.set([0x60, 0xfe], at + size)
  return { rom: grown, at }
}

// Where room freed in the middle of the ROM, with something added after it,
// ends: 'NOSEFREE' and where the room starts. So that, when what follows it is
// taken out too, the room is known to be NOSE4Web's to take back, and not a
// run of $FF in what was there before.
const FREED = [0x4e, 0x4f, 0x53, 0x45, 0x46, 0x52, 0x45, 0x45]
const TAG = FREED.length + 4

const allUnused = (rom: Uint8Array, from: number, to: number) => {
  for (let i = from; i < to; i++) if (rom[i] !== UNUSED) return false
  return true
}

function freedBefore(rom: Uint8Array, end: number): number | null {
  if (end < TAG || !FREED.every((b, i) => rom[end - TAG + i] === b)) return null
  const start = ((rom[end - 4] << 24) | (rom[end - 3] << 16) | (rom[end - 2] << 8) | rom[end - 1]) >>> 0
  return start < end - TAG && allUnused(rom, start, end - TAG) ? start : null
}

// Gives back the room claimSpace gave, from `start` up to `end` for each
// part (in place). Where it is the last thing in the ROM, NOSE's end mark, if
// it follows with nothing after it, moves back to where the room started, as
// it was before the room was taken; room freed earlier just before that is
// taken back with it. Room with something after it is left marked as freed.
export function releaseSpace(rom: Uint8Array, parts: { start: number; end: number }[]): void {
  for (const { start, end } of parts) rom.fill(UNUSED, start, end)
  let last = rom.length - 1
  while (last >= 0 && rom[last] === UNUSED) last--
  const marked = last >= 1 && rom[last - 1] === 0x60 && rom[last] === 0xfe
  // The end of what is used, and how far back it can go.
  const top = marked ? last - 1 : last + 1
  let end = top
  for (;;) {
    const back = parts.filter((p) => p.start < end && allUnused(rom, p.start, end)).reduce((low, p) => Math.min(low, p.start), end)
    const freed = freedBefore(rom, back)
    if (freed !== null) {
      rom.fill(UNUSED, back - TAG, back)
      end = freed
    } else if (back < end) end = back
    else break
  }
  if (marked && end < top) {
    rom[top] = rom[top + 1] = UNUSED
    rom[end] = 0x60
    rom[end + 1] = 0xfe
  }
  // What is left between other things is marked, where it is long enough to be.
  for (const { start, end: stop } of parts) {
    if (start < end && stop - start > TAG && allUnused(rom, start, stop)) {
      rom.set([...FREED, (start >>> 24) & 0xff, (start >>> 16) & 0xff, (start >>> 8) & 0xff, start & 0xff], stop - TAG)
    }
  }
}
