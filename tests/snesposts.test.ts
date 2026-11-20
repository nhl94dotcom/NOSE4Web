import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

// McMarkis's 2 MB builds' PostCount (tmposts): ldx lastplayer / cpx #$0018 becomes a jsl to code that doubles the
// player's number into his offset first (Match Viewer, 2026-11-21).
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex')
const POST_COUNT = /ad....d020daaef3(..)e01800b016bd....f005a20200/

describe.skipIf(names.length === 0)('the SNES posts fix', () => {
  it.each(names)('%s: in the 2 MB builds, the right team; elsewhere not offered', (name) => {
    const rom = open(name)
    const text = hex(rom.bytes)
    const found = POST_COUNT.exec(text)
    const state = detectSnesHacks(rom.bytes)
    expect(state.unknown).not.toContain('postsFix')
    expect(state.choices.postsFix).toBe(false)
    if (!found || found.index % 2 !== 0) {
      expect(state.notOffered?.postsFix).toMatch(/2 MB/)
      expect(() => applySnesHacks(rom, { postsFix: true })).toThrow(/2 MB/)
      return
    }
    expect(state.notOffered?.postsFix).toBeUndefined()
    const site = found.index / 2 + 6
    const on = applySnesHacks(rom, { postsFix: true })
    expect(detectSnesHacks(on.bytes).choices.postsFix).toBe(true)
    expect(detectSnesHacks(on.bytes).unknown).toEqual(state.unknown)
    expect(on.bytes[site]).toBe(0x22)
    expect(hex(on.bytes.subarray(site + 4, site + 6))).toBe('eaea')
    const code = loRomOffset(on.bytes[site + 3], on.bytes[site + 1] | (on.bytes[site + 2] << 8))
    expect(hex(on.bytes.subarray(code, code + 9))).toBe(`adf3${found[1]}0aaae018006b`)
    const off = applySnesHacks(openRom(buildRom(on)), { postsFix: false })
    expect(Buffer.compare(buildRom(off), buildRom(rom))).toBe(0)
  })
})
