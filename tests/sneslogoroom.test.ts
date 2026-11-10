import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRom, openRom } from '../src/core/rom'
import { LOGO_SIZE, snesLogo, snesLogosThatSpill, snesLogoTiles } from '../src/core/snespictures'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { snesRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const names = ['NHL94.smc', ...(local.snesRoms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

// A logo of two filled 16 x 16 squares and loose 8 x 8 ones, each different, more
// tiles than fit in one row of its room in the game's sprite tile cache.
// Laid out with the singles along the first row, as NOSE4Web did, it ran past
// its room, onto other sprites' tiles.
function scattered(): { width: number; height: number; pixels: Uint8Array } {
  const pixels = new Uint8Array(LOGO_SIZE * LOGO_SIZE)
  const fill = (x0: number, y0: number, size: number, colour: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) pixels[(y0 + y) * LOGO_SIZE + x0 + x] = ((colour + x * 3 + y * 5) % 15) + 1
  }
  fill(4, 4, 16, 1)
  fill(20, 4, 16, 7)
  for (let i = 0; i < 10; i++) fill(4 + (i % 5) * 8 + (i < 5 ? 0 : 4), 28 + Math.floor(i / 5) * 12, 8, i * 2)
  return { width: LOGO_SIZE, height: LOGO_SIZE, pixels }
}

describe.skipIf(!existsSync(path('NHL94.smc')))("SNES logos in the sprite tile cache's room", () => {
  it('none of the original logos, in any build, spills out of its room', () => {
    for (const name of names) {
      const project = open(name)
      expect(snesLogosThatSpill(project.bytes, project.teams.length), name).toEqual([])
    }
  })

  it('a logo NOSE4Web lays out stays in its room, and looks the same when read back', () => {
    const project = open('NHL94.smc')
    const picture = scattered()
    expect(snesLogoTiles(picture)!.tiles).toBeGreaterThan(16)
    const palette = snesLogo(project.bytes, project.teams.length, { logos: {}, centreIce: {} }, 1).palette
    const edited = { ...project, snesPictures: { logos: { 1: { picture, palette } }, centreIce: {} } }
    const reopened = openRom(buildRom(edited))
    expect(snesLogosThatSpill(reopened.bytes, reopened.teams.length)).toEqual([])
    expect(Buffer.compare(snesLogo(reopened.bytes, reopened.teams.length, { logos: {}, centreIce: {} }, 1).picture.pixels, picture.pixels)).toBe(0)
  })

  it.skipIf(!existsSync(path('nhl94_2026_classic.sfc')))('logos an earlier NOSE4Web laid out are laid out again on saving, looking the same', () => {
    const project = open('nhl94_2026_classic.sfc')
    const spilling = snesLogosThatSpill(project.bytes, project.teams.length)
    expect(spilling.length).toBeGreaterThan(0)
    const before = spilling.map((team) => snesLogo(project.bytes, project.teams.length, { logos: {}, centreIce: {} }, team).picture.pixels)
    const saved = openRom(buildRom(project))
    expect(snesLogosThatSpill(saved.bytes, saved.teams.length)).toEqual([])
    spilling.forEach((team, i) => expect(Buffer.compare(snesLogo(saved.bytes, saved.teams.length, { logos: {}, centreIce: {} }, team).picture.pixels, before[i]), String(team)).toBe(0))
  })
})
