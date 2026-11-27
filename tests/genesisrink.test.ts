import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { drawGenesisRink, readGenesisRink } from '../src/core/genesisrink'
import { openRom } from '../src/core/rom'

// The whole Genesis rink (Rinktilelist), drawn from the ROM's own tiles and map.

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

describe('the Genesis rink', () => {
  it.skipIf(!existsSync(path('nhl94.bin')))('is found on NHL 94 from setupIceRinkPal, 48 by 113 tiles, its palette the rink colours', () => {
    const project = open('nhl94.bin')
    const rink = readGenesisRink(project.bytes)!
    expect([rink.at, rink.tileCount, rink.width, rink.height]).toEqual([0x5605a, 454, 48, 113])
    expect(rink.palette).toEqual(project.rinkPalette)
    const home = project.teams[0].palette.slice(0, 16)
    const drawn = drawGenesisRink(project.bytes, home, project.teams[1].palette.slice(16, 32))!
    expect([drawn.picture.width, drawn.picture.height]).toEqual([384, 904])
    expect(drawn.palette.slice(32, 48)).toEqual(home)
    // Every palette line is used: the rink's two, and the teams' for the players on the benches.
    expect(new Set([...drawn.picture.pixels].filter((p) => p > 0).map((p) => p >> 4))).toEqual(new Set([0, 1, 2, 3]))
  })

  it.skipIf(!existsSync(path('CDL_Season_12.bin')))('reads a league ROM whose tile count runs past its palette, as the game does', () => {
    const rink = readGenesisRink(open('CDL_Season_12.bin').bytes)!
    expect(rink.tileCount).toBe(456)
    expect(drawGenesisRink(open('CDL_Season_12.bin').bytes)).not.toBeNull()
  })

  it.skipIf(!existsSync(path('NHL95/NHL_95.bin')))("is drawn for NHL '95 too", () => {
    const drawn = drawGenesisRink(open('NHL95/NHL_95.bin').bytes)!
    expect([drawn.picture.width, drawn.picture.height]).toEqual([384, 680])
  })

  it.skipIf(!existsSync(path('NHL94.smc')))('is not found in a SNES ROM', () => {
    expect(readGenesisRink(open('NHL94.smc').bytes)).toBeNull()
  })
})
