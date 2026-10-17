import { readAscii, readU16LE, writeU16LE } from './bytes'

// NHL '94 on the SNES. What the editor knows of it comes from the community's
// disassembly of the game, NHL94SNESVault (github.com/Mhopkinsinc/NHL94SNESVault).
//
// The ROM is "LoROM": the game sees it in 32 KB banks, bank $80 at its start,
// each at addresses $8000 to $FFFF. Some copies start with a 512-byte header
// added by old copier devices, which the editor keeps but leaves out of
// every place it names in the ROM.

const COPIER_HEADER = 512
// The game's own header, at the end of the first bank.
const HEADER_AT = 0x7fc0
const TITLE = "NHL '94"
const MAP_MODE_AT = HEADER_AT + 0x15
const LOROM_FAST = 0x30
const INVERSE_CHECKSUM_AT = HEADER_AT + 0x1c
const CHECKSUM_AT = HEADER_AT + 0x1e
const BANK_SIZE = 0x8000

function hasTitle(file: Uint8Array, start: number): boolean {
  return (
    file.length >= start + HEADER_AT + 0x20 &&
    readAscii(file, start + HEADER_AT, TITLE.length) === TITLE &&
    file[start + MAP_MODE_AT] === LOROM_FAST
  )
}

// The ROM without its copier header, and the header, if the file is the SNES
// game. Null for any other file.
export function splitSnesFile(file: Uint8Array): { rom: Uint8Array; copierHeader: Uint8Array | null } | null {
  if (hasTitle(file, 0)) return { rom: file.slice(), copierHeader: null }
  if (hasTitle(file, COPIER_HEADER)) return { rom: file.slice(COPIER_HEADER), copierHeader: file.slice(0, COPIER_HEADER) }
  return null
}

// Where in the ROM the game's address `bank:address` is.
export function loRomOffset(bank: number, address: number): number {
  return (bank & 0x7f) * BANK_SIZE + (address - 0x8000)
}

// The game's address for a place in the ROM, in the given bank's numbering.
export function loRomAddress(offset: number): number {
  return 0x8000 + (offset % BANK_SIZE)
}

export function loRomBank(offset: number, like: number): number {
  return (like & 0x80) | Math.floor(offset / BANK_SIZE)
}

// The game does not check its checksum, but emulators report a wrong one, so
// it is put right. It is the sum of every byte, with the checksum taken as
// 0 and its inverse as $FFFF. That is clear only for a ROM of a power-of-two
// size; any other is left as it is.
export function fixSnesChecksum(rom: Uint8Array): void {
  if (rom.length < BANK_SIZE || (rom.length & (rom.length - 1)) !== 0) return
  writeU16LE(rom, INVERSE_CHECKSUM_AT, 0xffff)
  writeU16LE(rom, CHECKSUM_AT, 0)
  let sum = 0
  for (const byte of rom) sum += byte
  writeU16LE(rom, CHECKSUM_AT, sum & 0xffff)
  writeU16LE(rom, INVERSE_CHECKSUM_AT, ~sum & 0xffff)
}

export function snesChecksum(rom: Uint8Array): number {
  return readU16LE(rom, CHECKSUM_AT)
}
