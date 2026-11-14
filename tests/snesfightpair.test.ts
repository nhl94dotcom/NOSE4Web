import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { snesFightState, withoutSnesFight } from '../src/core/snesfight'
import { SNES_FIGHT_UNPAIRED } from '../src/core/snesfightdata'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const decode = (text: string) => Uint8Array.from(Buffer.from(text, 'base64'))

// NOSE4Web's second version of the fights (no pairing), put in at bank $A0 with the bonus 2, as it did.
function unpaired(rom0: Uint8Array): Uint8Array {
  const rom = new Uint8Array(0x200000).fill(0xff)
  rom.set(rom0)
  const block = decode(SNES_FIGHT_UNPAIRED.block)
  rom.set(block, 0x100000)
  const mark = 0x100000 + block.length
  rom.set([0x4e, 0x34, 0x57, 0x46], mark)
  new DataView(rom.buffer).setUint32(mark + 4, rom0.length, true)
  rom[mark + 8] = rom0[0x7fd7]
  for (const c of SNES_FIGHT_UNPAIRED.changes) rom.set(decode(c.patched), c.at)
  return rom
}
// The pairing's two box times: lda d2 / cmp #time|$2000 ..., and #$07FF / cmp #time.
function pairing(rom: Uint8Array): [number, number] {
  const all = Buffer.from(rom).toString('hex')
  const m1 = /a5adc9(....)d02eda84cba23400/.exec(all)!
  const m2 = /29ff07c9(....)f006888810e5/.exec(all)!
  const word = (h: string) => parseInt(h.slice(2, 4) + h.slice(0, 2), 16)
  return [word(m1[1]), word(m2[1])]
}

describe.skipIf(!existsSync(path('NHL94.smc')))("SNES fights: the fighters' majors offset", () => {
  it("InProgress's lda #$1000 / trb d2 calls the pairing, at 5:00", () => {
    const rom = open('NHL94.smc')
    expect(hex(rom.bytes, 0xf3636, 10)).toBe('a5ad995218a9001014ad')
    const on = applySnesHacks(rom, { fighting: true }).bytes
    // jsl into the fight bank, nop.
    expect(on[0xf363b]).toBe(0x22)
    expect(on[0xf363e]).toBe(0xa0)
    expect(on[0xf363f]).toBe(0xea)
    // F_coin: lda #$1000 / trb d2, then FightCoincidental.
    expect(Buffer.from(on).toString('hex')).toContain('a9001014ada5adc92c21d02eda84cba23400a591f003a20000')
    expect(pairing(on)).toEqual([0x212c, 0x12c])
    expect(snesFightState(on)).toEqual({ kind: 'in', bank: 0xa0, bonus: 2 })
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { fighting: false })), buildRom(rom))).toBe(0)
  })

  it('pairs at the fight time, or 5 minutes at the penalty time', () => {
    const rom = open('NHL94.smc')
    const timed = applySnesHacks(rom, { fighting: true }, false, { fightTime: 120 })
    expect(pairing(timed.bytes)).toEqual([0x2078, 0x78])
    expect(snesFightState(timed.bytes)).toMatchObject({ kind: 'in', bank: 0xa0 })
    expect(detectSnesHacks(timed.bytes).amounts).toMatchObject({ fightTime: 120 })
    const halved = applySnesHacks(openRom(buildRom(timed)), {}, false, { fightTime: 0, penaltyTime: 30 })
    expect(pairing(halved.bytes)).toEqual([0x2096, 0x96])
    expect(detectSnesHacks(halved.bytes).choices.fighting).toBe(true)
    // The bonus changed: the pairing kept.
    const bonus = applySnesHacks(halved, { fighting: true }, false, { fighting: 5 })
    expect(pairing(bonus.bytes)).toEqual([0x2096, 0x96])
    expect(snesFightState(bonus.bytes)).toMatchObject({ kind: 'in', bonus: 5 })
  })

  it('recognises the version without the pairing, takes it out, and replaces it when the fights are applied', () => {
    const rom = open('NHL94.smc')
    const old = unpaired(rom.bytes)
    expect(snesFightState(old)).toEqual({ kind: 'in', bank: 0xa0, bonus: 2, earlier: true, version: 0 })
    expect(detectSnesHacks(old).choices.fighting).toBe(true)
    expect(Buffer.compare(withoutSnesFight(old), rom.bytes)).toBe(0)
    const upgraded = applySnesHacks(openRom(buildRom({ ...rom, bytes: old })), { fighting: true }, false, { fighting: 2, fightTime: 90 })
    expect(snesFightState(upgraded.bytes)).toEqual({ kind: 'in', bank: 0xa0, bonus: 2 })
    expect(pairing(upgraded.bytes)).toEqual([0x205a, 0x5a])
  })
})
