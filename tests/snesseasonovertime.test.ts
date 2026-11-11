import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES overtime until a goal in the regular season', () => {
  it("changes PeriodOver's play-mode branch and clockcont_0's game over, and comes out again", () => {
    const project = open('NHL94.smc')
    // PeriodOver: lda.l OptPlayMode / bne .2 at $9F:8D69; clockcont_0 .8: lda.l OptPlayMode / beq .7 at $9F:8CA2.
    expect(hex(project.bytes, 0xf8d51 + 23, 2)).toBe('d006')
    expect(hex(project.bytes, 0xf8c96 + 12, 2)).toBe('f09f')
    const on = applySnesHacks(project, { seasonOvertime: true })
    expect(hex(on.bytes, 0xf8d51 + 23, 2)).toBe('8006')
    expect(hex(on.bytes, 0xf8c96 + 12, 2)).toBe('eaea')
    expect(detectSnesHacks(on.bytes).choices.seasonOvertime).toBe(true)
    expect(Buffer.compare(buildRom(applySnesHacks(openRom(buildRom(on)), { seasonOvertime: false })), buildRom(project))).toBe(0)
    // In every build.
    for (const name of names) expect(detectSnesHacks(open(name).bytes).unknown, name).not.toContain('seasonOvertime')
  })
})
