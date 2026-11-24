import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { findCodeAll, loRomOffset } from '../src/core/snes'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'
import { expectSameBytes } from './samebytes'
import { isSa1 } from './sneshelp'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
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

describe.skipIf(names.length === 0)("the SNES goalie's poke check in every build", () => {
  it.each(names)('%s: reads SPA where that build has it, and comes out again', (name) => {
    const project = open(name)
    expect(detectSnesHacks(project.bytes).unknown).not.toContain('goaliePoke')
    // The site after the height, and puckglue's ldy a2 / lda # / sta ,y / lda SPA,y: SPA's address is that lda's
    // operand (at +9).
    const [found, ...more] = findCodeAll(project.bytes, '9822......a5a589008' + '0f00449ffff1a85ad0aaabf......85b5a5a989008' + '0f00449ffff1a0aaabf......')
    expect(more).toEqual([])
    const [spa, ...others] = findCodeAll(project.bytes, 'a491a9....99....b9....c9....')
    expect(others).toEqual([])
    const site = found.at + 43
    expect(hex(project.bytes, site, 4)).toBe('85b1a6e4')
    const on = applySnesHacks(project, { goaliePoke: true })
    expect(on.bytes[site]).toBe(0x20)
    const code = loRomOffset(0x80 | (site >> 15), on.bytes[site + 1] | (on.bytes[site + 2] << 8))
    // sta d3 / ldx a2 / lda SPA,x with this build's own SPA.
    expect(hex(on.bytes, code, 5)).toBe('85b1a691bd')
    expect(hex(on.bytes, code + 5, 2)).toBe(hex(project.bytes, spa.at + 9, 2))
    // The SA-1 builds have SPA $6000 on.
    expect(on.bytes[code + 6] >= 0x60).toBe(isSa1(project.bytes))
    expect(detectSnesHacks(on.bytes).choices.goaliePoke).toBe(true)
    expectSameBytes(buildRom(applySnesHacks(openRom(buildRom(on)), { goaliePoke: false })), buildRom(project))
  })
})
