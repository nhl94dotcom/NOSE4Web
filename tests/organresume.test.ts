import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectHacks, hackRom, hacksSupported, NO_HACKS } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'
import { expectSameBytes } from './samebytes'

// The organ carrying on after a pause: NHL 94 at ../nhl94.bin, and the league ROMs named in local.json.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['nhl94.bin', ...(local.league30Rom ? [local.league30Rom] : []), ...(local.otherRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

describe.skipIf(!existsSync(path('nhl94.bin')))('the organ after a pause', () => {
  it('calls its two routines from the pause, and comes out byte for byte', () => {
    const project = open('nhl94.bin')
    expect(detectHacks(project.bytes).choices.organResume).toBe(false)
    const bytes = hackRom(project.bytes, { ...detectHacks(project.bytes).choices, organResume: true })
    expect(detectHacks(bytes).choices.organResume).toBe(true)
    // jsr to the code that keeps the song, which ends by going on to p_turnoff ...
    expect(hex(bytes, 0x7d0c, 2)).toBe('4eb9')
    const save = read32(bytes, 0x7d0e)
    expect(hex(bytes, save, 4)).toBe('4fefffb8')
    expect(hex(bytes, save + 100, 6)).toBe('4ef90001a264')
    // ... and to the code that puts it back, which ends with the move it replaces and rts.
    expect(hex(bytes, 0x7dc6, 2)).toBe('4eb9')
    const restore = read32(bytes, 0x7dc8)
    expect(hex(bytes, restore + 114, 8)).toBe('31f8b03eb0404e75')
    expect(hex(bytes, 0x7dcc, 2)).toBe('4e75')
    // Through a rebuild, and out again.
    const project2 = { ...project, bytes }
    expect(detectHacks(buildRom(project2)).choices.organResume).toBe(true)
    expectSameBytes(hackRom(bytes, { ...detectHacks(bytes).choices, organResume: false }), project.bytes)
  })

  it.each(names)('is offered on %s where its pause and music driver are the original game’s', (name) => {
    const project = open(name)
    if (!hacksSupported(project.game)) return
    const state = detectHacks(project.bytes)
    if (state.unknown.includes('organResume')) return
    const bytes = hackRom(project.bytes, { ...state.choices, organResume: true })
    expect(detectHacks(bytes).choices).toEqual({ ...state.choices, organResume: true })
  })

  it('is off in a ROM with no hacks', () => {
    expect(NO_HACKS.organResume).toBe(false)
  })
})
