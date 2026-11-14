import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { snesFightState, withoutSnesFight } from '../src/core/snesfight'
import { SNES_FIGHT_EARLIER } from '../src/core/snesfightdata'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (b: Uint8Array, at: number, n: number) => Buffer.from(b.subarray(at, at + n)).toString('hex')
const decode = (text: string) => Uint8Array.from(Buffer.from(text, 'base64'))

// NOSE4Web's first version of the fights, put in at bank $A0 with the bonus 2, as it did.
function earlier(rom0: Uint8Array): Uint8Array {
  const rom = new Uint8Array(0x200000).fill(0xff)
  rom.set(rom0)
  const block = decode(SNES_FIGHT_EARLIER.block)
  rom.set(block, 0x100000)
  const mark = 0x100000 + block.length
  rom.set([0x4e, 0x34, 0x57, 0x46], mark)
  new DataView(rom.buffer).setUint32(mark + 4, rom0.length, true)
  rom[mark + 8] = rom0[0x7fd7]
  for (const c of SNES_FIGHT_EARLIER.changes) rom.set(decode(c.patched), c.at)
  return rom
}

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES fights: a player hurt in a fight stays out for the game', () => {
  it('hooks updatepentime and the game start, and marks the injured in fightinj', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, { fighting: true }).bytes
    // CODE_9EB188's jsl updatepentime and StartGame_go's lda.l $7E347A become jsl into the fight bank.
    expect(hex(rom.bytes, 0xf3188, 4)).toBe('2244bf9e')
    expect(hex(rom.bytes, 0xf8361, 4)).toBe('af7a347e')
    expect(on[0xf3188]).toBe(0x22)
    expect(on[0xf318b]).toBe(0xa0)
    expect(on[0xf8361]).toBe(0x22)
    expect(on[0xf8364]).toBe(0xa0)
    const all = Buffer.from(on).toString('hex')
    // F_penmgr: jsl updatepentime, then lda.l fightinjany / beq / phx / phy / ldx #$33 / lda.l fightinj,x.
    expect(all).toContain('2244bf9eafb4fe7ef0')
    expect(all).toContain('da5aa23300bf80fe7e')
    // F_markinj: tmpdst $FFFC and the fightinj byte.
    expect(all).toContain('a9fcff995218da984aaae220a9019f80fe7ec2208fb4fe7efa60')
    expect(snesFightState(on)).toEqual({ kind: 'in', bank: 0xa0, bonus: 2 })
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { fighting: false })), buildRom(rom))).toBe(0)
  })

  it('recognises the first version, takes it out, and replaces it when the fights are applied', () => {
    const rom = open('NHL94.smc')
    const old = earlier(rom.bytes)
    expect(snesFightState(old)).toEqual({ kind: 'in', bank: 0xa0, bonus: 2, earlier: true, version: 1 })
    expect(detectSnesHacks(old).choices.fighting).toBe(true)
    expect(Buffer.compare(withoutSnesFight(old), rom.bytes)).toBe(0)
    const project = openRom(buildRom({ ...rom, bytes: old }))
    const upgraded = applySnesHacks(project, { fighting: true }, false, { fighting: 2 })
    expect(snesFightState(upgraded.bytes)).toEqual({ kind: 'in', bank: 0xa0, bonus: 2 })
    // With the injury risk on too (it shares FallDown's count).
    const withRisk = applySnesHacks(openRom(buildRom({ ...rom, bytes: old })), { injuryBonus: true })
    const both = applySnesHacks(withRisk, { fighting: true }, false, { fighting: 2 })
    expect(snesFightState(both.bytes, [0xf1bd2])).toMatchObject({ kind: 'in', bank: 0xa0 })
    expect(detectSnesHacks(both.bytes).choices).toMatchObject({ fighting: true, injuryBonus: true })
  })

  it('the injured out of the shootout copies its fightinj', () => {
    const rom = open('NHL94.smc')
    const on = applySnesHacks(rom, { fighting: true, shootoutInjuries: true }).bytes
    expect(detectSnesHacks(on).choices).toMatchObject({ fighting: true, shootoutInjuries: true })
    // The copy: lda.l $7E:FE80,x / sta.l $7E:FE00,x.
    expect(Buffer.from(on).toString('hex')).toContain('bf80fe7e9f00fe7e')
    const off = applySnesHacks(openRom(buildRom({ ...rom, bytes: on })), { fighting: false })
    expect(detectSnesHacks(off.bytes).choices).toMatchObject({ fighting: false, shootoutInjuries: true })
    expect(Buffer.from(off.bytes).toString('hex')).not.toContain('bf80fe7e9f00fe7e')
  })
})
