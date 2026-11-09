import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openRom } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { otherRoms?: string[]; snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const credit = (name: string) => openRom(new Uint8Array(readFileSync(path(name)))).game.credit

describe("crediting a hack's maker", () => {
  const evo = local.otherRoms?.find((name) => / EVO /.test(name))
  it.skipIf(!evo || !existsSync(path(evo)))('names AdamCatalyst for EVO', () => {
    expect(credit(evo!)).toEqual({ rom: 'NHL 94 EVO', author: 'AdamCatalyst', url: 'https://forum.nhl94.com/index.php?/topic/40320-nhl-94-evo/' })
  })

  for (const name of ['nhl94_2026.sfc', 'nhl94snes_2026.sfc']) {
    it.skipIf(!existsSync(path(name)))(`names McMarkis for his 32-team build, ${name}`, () => {
      expect(credit(name)).toMatchObject({ rom: 'SNES NHL 94: 32 Team + 60 FPS + Fighting', author: 'McMarkis' })
    })
  }

  for (const name of ['nhl94.bin', 'NHL94.smc', 'SDL16.smc', 'NHL94_Classic.smc']) {
    it.skipIf(!existsSync(path(name)))(`credits no one for ${name}`, () => {
      expect(credit(name)).toBeUndefined()
    })
  }
})

describe('crediting McMarkis for a build with other teams', () => {
  const name = 'nhl94_SA1_Original.sfc'
  it.skipIf(!existsSync(path(name)))('names him for his 28-team build with the original rosters', () => {
    expect(credit(name)).toMatchObject({ rom: 'a 28-team build of SNES NHL 94: 32 Team + 60 FPS + Fighting', author: 'McMarkis' })
  })
})
