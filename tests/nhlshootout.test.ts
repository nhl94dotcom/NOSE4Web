import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const snesNames = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const far = (b: Uint8Array, at: number) => ((b[at + 3] & 0x7f) << 15) | ((b[at + 1] | (b[at + 2] << 8)) & 0x7fff)

describe.skipIf(!existsSync(path('nhl94.bin')))('three-round shootout (Genesis)', () => {
  it("NextShooter's test calls the rule, then beq.w .switch, the game's EndShootout kept", () => {
    const rom = open('nhl94.bin')
    expect(hex(rom.bytes, 0xfc51a, 32)).toBe('08380000d59567000028' + '0c780005d5786d00001e3038d574b078d57667000012')
    const on = applyHacks(rom, { ...NO_HACKS, nhlShootout: true })
    expect(u16(on.bytes, 0xfc51a)).toBe(0x4eb9)
    expect(hex(on.bytes, 0xfc520, 4)).toBe('67000028')
    expect(hex(on.bytes, 0xfc524, 22)).toBe('4e71'.repeat(11))
    // Over: bset / jsr EndShootout as before.
    expect(hex(on.bytes, 0xfc53a, 6)).toBe('08f80003c2fa')
    const code = (u16(on.bytes, 0xfc51c) << 16) | u16(on.bytes, 0xfc51e)
    // 3 - round, home minus away goals, who shot; Z set for not over (cmp.w d0,d0), clear for over (moveq #1).
    expect(hex(on.bytes, code, 16)).toBe('3238d578740394413038d5749078d576')
    expect(hex(on.bytes, code + 62, 8)).toBe('b0404e7572014e75')
    expect(detectHacks(on.bytes).choices).toEqual({ ...NO_HACKS, nhlShootout: true })
    expect(Buffer.compare(buildRom(applyHacks(on, NO_HACKS)), buildRom(rom))).toBe(0)
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('three-round shootout (SNES)', () => {
  it("PlayShootout's loop and ShootoutWonBy's test call the rule", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0x4851, 3)).toBe('9c891d')
    const on = applySnesHacks(rom, { nhlShootout: true }).bytes
    // inc decider; the visitors' turn: jsl rule+10 / bcs end / nops; the round's end: jsl rule+12 / bcs / bra .loop / nops.
    expect(hex(on, 0x4851, 3)).toBe('ee891d')
    expect(hex(on, 0x4851 + 18, 10)).toBe('b02a' + 'ea'.repeat(8))
    expect(hex(on, 0x4851 + 50, 12)).toBe('b00a80ca' + 'ea'.repeat(8))
    const room = far(on, 0x4851 + 14) - 10
    expect(far(on, 0x4851 + 46)).toBe(room + 12)
    // ShootoutWonBy: jsl rule+0 / nops, then its bne .t1x.
    expect(far(on, 0x4958)).toBe(room)
    expect(hex(on, 0x495c, 5)).toBe('eaeaead003')
    // +0: lda BA_Team / bne away / lda round / bra full; +10: bra away; +12: lda round / dec / bra full.
    expect(hex(on, room, 3)).toBe('add415')
    expect(hex(on, room + 12, 4)).toBe('ad851d3a')
    expect(detectSnesHacks(on).choices.nhlShootout).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { nhlShootout: false })), buildRom(rom))).toBe(0)
  })

  snesNames.forEach((name) => {
    it(`${name}: goes in and comes out`, () => {
      const rom = open(name)
      expect(detectSnesHacks(rom.bytes).unknown).not.toContain('nhlShootout')
      const on = openRom(buildRom(applySnesHacks(rom, { nhlShootout: true })))
      expect(detectSnesHacks(on.bytes).choices.nhlShootout).toBe(true)
      expect(Buffer.compare(buildRom(applySnesHacks(on, { nhlShootout: false })), buildRom(rom))).toBe(0)
    })
  })
})
