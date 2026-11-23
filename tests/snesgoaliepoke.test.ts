import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')

describe.skipIf(!existsSync(path('NHL94.smc')))("the SNES goalie's poke check", () => {
  it('reaches a puck on the ice within 6 units of the stick tip, the height down to the ice, only in the poke', () => {
    const project = open('NHL94.smc')
    // checkpuckcoll_ccx .9 at $9E:9987: tya / jsl GetFrameHot / |x| to the reach d2 and two thirds of it to d4 /
    // two thirds of |y| to the height d3, then sta d3 / ldx curobj.
    const site = 0xf1987 + 43
    expect(hex(project.bytes, site, 4)).toBe('85b1a6e4')
    const on = applySnesHacks(project, { goaliePoke: true })
    expect(on.bytes[site]).toBe(0x20)
    expect(on.bytes[site + 3]).toBe(0xea)
    const code = loRomOffset(0x9e, on.bytes[site + 1] | (on.bytes[site + 2] << 8))
    // sta d3; ldx a2; lda SPA,x ($11A3); cmp #SPAgpoke ($E528); bne out; reach = max(reach, 6);
    // d4 = d3 + d4 (the top kept), d3 = 0 (the bottom at the ice); ldx curobj; rts.
    expect(hex(on.bytes, code, 33)).toBe('85b1a691bda311c928e5d012a90600c5ad900285ada5b11865b585b564b1a6e460')
    // assgoalie .22's sta pfalock,x ($14E3) before lda #SPAgpoke becomes a jsr to code after it storing $80, so a
    // poke straight up the ice (direction 0) locks their facing too.
    const lockAt = 0xf5599 - 3
    expect(hex(project.bytes, lockAt, 6)).toBe('9de314a928e5')
    expect(on.bytes[lockAt]).toBe(0x20)
    expect(loRomOffset(0x9e, on.bytes[lockAt + 1] | (on.bytes[lockAt + 2] << 8))).toBe(code + 33)
    expect(hex(on.bytes, code + 33, 7)).toBe('a980009de31460')
    expect(detectSnesHacks(on.bytes).choices.goaliePoke).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom(on)), { goaliePoke: false })), buildRom(project))).toBe(0)
  })
})
