import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'
import { expectSameBytes } from './samebytes'

// The organ carrying on after a pause, SNES: NHL94.smc and the league ROMs named in local.json's snesRoms.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')

describe.skipIf(names.length === 0)('the organ after a pause, SNES', () => {
  it.each(names)('calls its code from the pause in %s, keeps the calls’ own targets, and comes out byte for byte', (name) => {
    const project = open(name)
    expect(detectSnesHacks(project.bytes).choices.organResume).toBe(false)
    const on = applySnesHacks(project, { organResume: true })
    expect(detectSnesHacks(on.bytes).choices).toEqual({ ...detectSnesHacks(project.bytes).choices, organResume: true })
    const changed = on.bytes.reduce<number[]>((list, byte, i) => (byte !== project.bytes[i] ? [...list, i] : list), [])
    // Only the two jsl's targets, and a block of 171 bytes in free room.
    const sites = changed.filter((i) => project.bytes[i] !== 0xff)
    expect(sites.length).toBe(6)
    const [save, restore] = [sites[0] - 1, sites[3] - 1]
    expect([on.bytes[save], on.bytes[restore]]).toEqual([0x22, 0x22])
    const block = changed.filter((i) => project.bytes[i] === 0xff)[0]
    // The save ends with jml to the original FadeOutSound call's target, the restore starts by calling SoundInit's.
    expect(hex(on.bytes, block + 72, 4)).toBe('5c' + hex(project.bytes, save + 1, 3))
    expect(hex(on.bytes, block + 76, 4)).toBe('22' + hex(project.bytes, restore + 1, 3))
    expect(hex(on.bytes, block + 169, 2)).toBe('286b')
    // Through a rebuild (with a copier header where the ROM has one), and out again.
    expect(detectSnesHacks(openRom(buildRom(on)).bytes).choices.organResume).toBe(true)
    expectSameBytes(applySnesHacks(on, { organResume: false }).bytes, project.bytes)
  })
})
