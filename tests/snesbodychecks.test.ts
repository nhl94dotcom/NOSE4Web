import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { applySnesHacks, detectSnesHacks, snesHacksCopiedFrom } from '../src/core/sneshacks'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const hex = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('hex')
const offset = (bank: number, address: number) => ((bank & 0x7f) << 15) | (address & 0x7fff)
const text = (bytes: Uint8Array, at: number, count: number) => Buffer.from(bytes.subarray(at, at + count)).toString('latin1')

// NHL94SNESVault's PlayerStat_BodyChecks code, as NHL94_Classic and SDL16 have it at $9E:FBD1.
const VAULT_COUNT = '48daa695bda312a689e00200d00418691a00aae220fe8e16c220a691bda312a689e00000d00418691a00aae220fec216c220fa68b9b61760'

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES bodycheck statistics', () => {
  let opened: ReturnType<typeof open> | undefined
  const retail = () => (opened ??= open('NHL94.smc'))
  // FallDown's lda tmchecks,y ($9E:9BCB); DrawStatsList_rows' lda ppenmin,x ($9C:8A60); ComparePlayerStats' .t1x.
  const COUNT = 0xf1bcb
  const DRAW = 0xe0a60

  it("counts as the Vault's code, shows and sorts by them, and comes out again", () => {
    const counted = applySnesHacks(retail(), { bodychecks: true })
    expect(counted.bytes[COUNT]).toBe(0x20)
    const code = offset(0x9e, counted.bytes[COUNT + 1] | (counted.bytes[COUNT + 2] << 8))
    expect(hex(counted.bytes, code, VAULT_COUNT.length / 2)).toBe(VAULT_COUNT)
    expect(detectSnesHacks(counted.bytes).choices).toMatchObject({ bodychecks: true, bodychecksShown: false })
    expect(hex(counted.bytes, DRAW, 3)).toBe('bd8a19')

    const shown = applySnesHacks(retail(), { bodychecks: true, bodychecksShown: true })
    expect(detectSnesHacks(shown.bytes).choices).toMatchObject({ bodychecks: true, bodychecksShown: true })
    expect(hex(shown.bytes, DRAW, 3)).toBe('bd8e16')
    const bytes = Buffer.from(shown.bytes)
    expect(bytes.indexOf(Buffer.from('e220b98e16dd8e16c220', 'hex'))).toBeGreaterThan(0)
    expect(bytes.indexOf(Buffer.from('e220b98a19dd8a19c220', 'hex'))).toBe(-1)
    expect(text(shown.bytes, 0xe7324, 8)).toBe('Pt Sh Cf')
    expect(text(shown.bytes, 0xe0c16, 12)).toBe('[  Checks   ')

    // The counts can't come out while they are shown.
    expect(() => applySnesHacks(shown, { bodychecks: false })).toThrow()
    const off = applySnesHacks(shown, { bodychecks: false, bodychecksShown: false })
    expect(Buffer.compare(buildRom(off), buildRom(retail()))).toBe(0)
  })

  it("finds the Vault's in NHL94_Classic (counts) and SDL16 (counts and shown), and updates SDL16's", () => {
    for (const name of ['NHL94_Classic.smc', 'SDL16.smc'].filter((n) => names.includes(n))) {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      expect(state.unknown).not.toContain('bodychecks')
      expect(state.choices.bodychecks).toBe(true)
      expect(state.choices.bodychecksShown).toBe(name === 'SDL16.smc')
      if (name !== 'SDL16.smc') continue
      expect(state.vaultVersions).toContain('bodychecksShown')
      const updated = applySnesHacks(rom, { bodychecksShown: true }, true)
      const after = detectSnesHacks(updated.bytes)
      expect(after.choices.bodychecksShown).toBe(true)
      expect(after.vaultVersions).not.toContain('bodychecksShown')
      expect(Buffer.from(updated.bytes).indexOf(Buffer.from('e220b98e16dd8e16c220', 'hex'))).toBeGreaterThan(0)
    }
  })

  it("goes into every 1 MB build; not offered where the build counts each player's checks itself", () => {
    for (const name of names) {
      const rom = open(name)
      const state = detectSnesHacks(rom.bytes)
      expect(state.unknown, name).not.toContain('bodychecks')
      expect(state.unknown, name).not.toContain('bodychecksShown')
      // The 2 MB builds' ClearPlayerChecks: their own checks for and against.
      const own = Buffer.from(rom.bytes).indexOf(Buffer.from('daa90000a232009f88e7', 'hex')) >= 0
      if (own) {
        expect(Object.keys(state.notOffered ?? {}), name).toEqual(['bodychecks', 'bodychecksShown'])
        expect(() => applySnesHacks(rom, { bodychecks: true }), name).toThrow(/counts each player's checks/)
        const other = detectSnesHacks(applySnesHacks(open('NHL94.smc'), { bodychecks: true }).bytes)
        const copied = snesHacksCopiedFrom(state, other)
        expect(copied.choices.bodychecks, name).toBe(false)
        expect(copied.notCopied.join(' '), name).toMatch(/counts each player's checks/)
        continue
      }
      expect(state.notOffered, name).toBeUndefined()
      if (state.choices.bodychecksShown) continue
      const shown = applySnesHacks(rom, { bodychecks: true, bodychecksShown: true })
      expect(detectSnesHacks(shown.bytes).choices, name).toMatchObject({ bodychecks: true, bodychecksShown: true })
      expect(Buffer.from(shown.bytes).indexOf(Buffer.from('e220b98e16dd8e16c220', 'hex')), name).toBeGreaterThan(0)
      const back = applySnesHacks(shown, { bodychecks: state.choices.bodychecks, bodychecksShown: false })
      expect(Buffer.compare(buildRom(back), buildRom(rom)), name).toBe(0)
    }
  })
})
