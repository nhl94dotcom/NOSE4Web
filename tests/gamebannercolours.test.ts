import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import {
  colourName,
  gameBannerColoursShown,
  inGameColour,
  SPARE_ARENA_COLOURS,
  spareArenaColour,
  teamsShowingArenaColour,
  withArenaColour,
} from '../src/core/gamebannercolours'
import { find } from '../src/core/genesisscorelogos'
import { bannerPalette, menuPalette, withBannerColors } from '../src/core/graphics'
import { letterBanner } from '../src/core/lettering'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const load = (name: string) => (existsSync(path(name)) ? new Uint8Array(readFileSync(path(name))) : null)
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string; nhl95Roms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

// The arena colours start at 16 of the rink's 32, at $59924 in NHL 94.
const ARENA_AT = 0x59924 + 16 * 2
const TEAL = 0x0aa0
const SAN_JOSE = 19

const withStripes = (project: RomProject, team: number, colours: number[]): RomProject => ({
  ...project,
  graphics: { ...project.graphics, menuPalettes: { ...project.graphics.menuPalettes, [team]: withBannerColors(menuPalette(project, team), colours) } },
})
// The colours a lettered in-game banner's two stripes are drawn in: a pixel of each, clear of the frame and the name.
const stripePixels = (project: RomProject, team: number) => {
  const picture = letterBanner(project, 'game', team, 'SJ')
  return [picture.pixels[3 * picture.width + 4], picture.pixels[12 * picture.width + 4]]
}
const differing = (a: Uint8Array, b: Uint8Array) => {
  const out: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i)
  return out
}

describe('colour names', () => {
  it('names colours plainly', () => {
    const names = [0x0000, 0x0444, 0x0888, 0x0eee, 0x0020, 0x0aa0, 0x000e, 0x0e00, 0x00ee, 0x0e0e]
    expect(names.map(colourName)).toEqual(['black', 'dark grey', 'grey', 'white', 'dark green', 'teal', 'red', 'blue', 'yellow', 'purple'])
  })
})

const base = load('nhl94.bin')
describe.skipIf(!base)('in-game banner colours in NHL 94', () => {
  it('draws the in-game banners in the arena colours, as the game does during play', () => {
    const project = openRom(base!)
    expect(gameBannerColoursShown(project)).toBe(true)
    // The banner block keeps a copy of them, which the game never loads.
    const block = readU32(base!, 0x11f24) - 8
    const copy = Array.from({ length: 16 }, (_, i) => readU16(base!, block + readU32(base!, block) + (16 + i) * 2))
    expect(bannerPalette(project, 'game', 0).slice(1)).toEqual(copy.slice(1))
    expect(bannerPalette(project, 'game', 0).slice(1)).toEqual(project.rinkPalette.slice(17))
    // A change to the arena colours shows on the banners.
    const changed = { ...project, rinkPalette: project.rinkPalette.map((word, i) => (i === 16 + 9 ? 0x0e0e : word)) }
    expect(bannerPalette(changed, 'game', 3)[9]).toBe(0x0e0e)
  })

  it('shows each stripe colour as the in-game banner draws it', () => {
    const project = openRom(base!)
    // A teal has nothing near it in the arena colours: the lettering takes grey.
    const teal = inGameColour(project, TEAL)
    expect(teal).toEqual({ slot: 2, word: 0x0888, far: true })
    expect(colourName(teal.word)).toBe('grey')
    // Black is there exactly.
    expect(inGameColour(project, 0x0000)).toEqual({ slot: 7, word: 0x0000, far: false })
    for (const colours of [[TEAL, 0x0000], [0x000e, 0x0e00], [0x0eee, 0x0444]]) {
      const striped = withStripes(project, SAN_JOSE, colours)
      expect(stripePixels(striped, SAN_JOSE)).toEqual(colours.map((word) => inGameColour(striped, word).slot))
    }
  })

  it('gives the in-game banners a colour by changing the spare arena colour, and nothing else', () => {
    const project = openRom(base!)
    expect(SPARE_ARENA_COLOURS).toEqual([11])
    expect(spareArenaColour(project)).toBe(11)
    expect(project.rinkPalette[16 + 11]).toBe(0x0020)
    const changed = withArenaColour(project, 11, TEAL)
    expect(project.rinkPalette[16 + 11]).toBe(0x0020) // the work before is left as it was, for Undo
    expect(inGameColour(changed, TEAL)).toEqual({ slot: 11, word: TEAL, far: false })
    expect(stripePixels(withStripes(changed, SAN_JOSE, [TEAL, 0x0000]), SAN_JOSE)).toEqual([11, 7])
    // Arena colour 11 in the rink's colours, and the header's checksum.
    const before = buildRom(project)
    const after = buildRom(changed)
    expect(differing(before, after)).toEqual([0x18e, 0x18f, ARENA_AT + 22, ARENA_AT + 23])
    expect(readU16(after, ARENA_AT + 22)).toBe(TEAL)
    expect(() => withArenaColour(project, 8, TEAL)).toThrow()
  })

  it('keeps the change in a project file', () => {
    const project = openRom(base!)
    const changed = withArenaColour(project, 11, TEAL)
    const text = saveProjectFile(changed, openRom(base!), 'Work')
    const { project: opened } = openProjectFile(openRom(base!), text)
    expect(opened.rinkPalette).toEqual(changed.rinkPalette)
    expect(buildRom(opened)).toEqual(buildRom(changed))
  })

  it('names the teams whose in-game banners show the colour', () => {
    const project = openRom(base!)
    // New Jersey's green.
    expect(teamsShowingArenaColour(project, 11)).toEqual([12])
  })

  // What else is drawn in palette line 1 during play: none of the sprite pieces in it use colour 11.
  it('leaves colour 11 to the crowd and the banners among the sprites', () => {
    const [frames] = find(base!, '382b.... 024407ff 247c(........) d5ea0004 d844 b86a0002')
    const sprites = frames.groups[0]
    const table = sprites + readU32(base!, sprites + 4)
    const signed = (v: number) => (v << 16) >> 16
    const used = new Set<number>()
    for (let frame = 1; frame < readU16(base!, table + 2) / 2 - 1; frame++) {
      const end = table + signed(readU16(base!, table + frame * 2 + 2))
      for (let at = table + signed(readU16(base!, table + frame * 2)); at < end; at += 8) {
        const attribute = readU16(base!, at + 6)
        if (((attribute >> 13) & 3) !== 1) continue
        const tiles = (((attribute >> 2) & 3) + 1) * ((attribute & 3) + 1)
        const first = sprites + 10 + signed(readU16(base!, at + 4)) * 32
        for (const byte of base!.subarray(first, first + tiles * 32)) used.add(byte >> 4).add(byte & 15)
      }
    }
    expect(used.has(11)).toBe(false)
    for (const busy of [9, 10, 12, 14, 15]) expect(used.has(busy)).toBe(true)
  })
})

const league = local.league30Rom ? load(local.league30Rom) : null
describe.skipIf(!league)('in-game banner colours in a league ROM', () => {
  it('reads the arena colours there too', () => {
    const project = openRom(league!)
    expect(gameBannerColoursShown(project)).toBe(true)
    expect(bannerPalette(project, 'game', 0).slice(1)).toEqual(project.rinkPalette.slice(17))
    const changed = withArenaColour(project, spareArenaColour(project), TEAL)
    expect(inGameColour(changed, TEAL).far).toBe(false)
  })
})

const others = ['NHL94.smc', ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
describe.skipIf(others.length === 0)('in-game banner colours elsewhere', () => {
  it.each(others)('are not offered in %s, whose in-game banners take no stripe colours', (name) => {
    const project = openRom(load(name)!)
    expect(gameBannerColoursShown(project)).toBe(false)
  })

  it.each(others.filter((name) => name !== 'NHL94.smc'))("leave NHL '95's in-game banners in their own colours (%s)", (name) => {
    const project = openRom(load(name)!)
    expect(bannerPalette(project, 'game', 0)[1]).toBe(0x0ccc)
    expect(bannerPalette(project, 'game', 0).slice(1)).not.toEqual(project.rinkPalette.slice(17))
  })
})
