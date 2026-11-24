import { readFileSync } from 'node:fs'
import type { RomProject } from '../src/core/rom'
import { splitSnesFile } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks, SNES_HACKS, withSnesHackChoice, type SnesHack } from '../src/core/sneshacks'

// Whether a SNES ROM (without its copier header) is an SA-1 build: its header's map mode is $23 (LoROM builds: $30).
export const isSa1 = (rom: Uint8Array) => rom[0x7fd5] === 0x23

// The same for a file, read but not opened, so that it is quick when the tests are collected.
export function isSa1File(file: string): boolean {
  const split = splitSnesFile(new Uint8Array(readFileSync(file)))
  return split !== null && isSa1(split.rom)
}

// The hacks to pair with others in `rom`: all but `leave`, those with other code in their place and those not
// offered on this build.
export function otherSnesHacks(rom: RomProject, leave: SnesHack[]): SnesHack[] {
  const state = detectSnesHacks(rom.bytes)
  return SNES_HACKS.filter((hack) => !leave.includes(hack) && !state.unknown.includes(hack) && !state.notOffered?.[hack])
}

// `rom` with `hack` on and what it needs, as the Hacks page turns them on. Fight momentum and one fight a game hook
// NOSE4Web's fights, so they get fighting on too.
export function snesHackBase(rom: RomProject, hack: SnesHack): RomProject {
  let choices = detectSnesHacks(rom.bytes).choices
  if (hack === 'fightMomentum' || hack === 'fightOnce') choices = withSnesHackChoice(choices, 'fighting', true)
  return applySnesHacks(rom, withSnesHackChoice(choices, hack, true))
}

