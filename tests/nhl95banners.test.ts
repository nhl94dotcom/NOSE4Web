import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { NHL95 } from '../src/core/games'
import { banner, bannerKindSupported, bannerPalette, bannersEditable, expandPictureSpace, menuLogo, rinkLogo, withBanner } from '../src/core/graphics'
import { paintableColours } from '../src/core/pictureset'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom } from '../src/core/rom'

// NHL '95 (USA) at ../NHL95/NHL_95.bin, and any NHL '95 league ROMs named in local.json's nhl95Roms.
const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { nhl95Roms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const RETAIL = 'NHL95/NHL_95.bin'
const names = [RETAIL, ...(local.nhl95Roms ?? [])].filter((name) => existsSync(path(name)))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const read32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
const read16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1]

describe.skipIf(names.length === 0)("NHL '95 banners", () => {
  it.each(names)('reads every team’s banners in %s, 11 by 2 tiles, the menu banners only where the ROM keeps them', (name) => {
    const project = open(name)
    // The WN95HL's ROMs point their menu banners at a 1 x 1 dummy.
    expect(bannerKindSupported(project, 'menu')).toBe(name === RETAIL)
    expect(bannerKindSupported(project, 'game')).toBe(true)
    expect(bannerKindSupported(project, 'visitor')).toBe(false)
    expect(bannerKindSupported(project, 'pause')).toBe(true)
    expect(bannersEditable(project, 'pause')).toBe(true)
    project.teams.forEach((_, team) => {
      const picture = banner(project, 'pause', team)
      expect([picture.width, picture.height]).toEqual([96, 16])
    })
    // The pause banners are in the pause screen's colours, the same for all, no stripes put in.
    expect(bannerPalette(project, 'pause', 0)).toEqual(bannerPalette(project, 'pause', 1))
    expect(bannerPalette(project, 'pause', 0).slice(1, 4)).toEqual([0xeee, 0xeec, 0xccc])
    expect(bannersEditable(project, 'game')).toBe(true)
    for (const kind of name === RETAIL ? (['menu', 'game'] as const) : (['game'] as const)) {
      project.teams.forEach((_, team) => {
        const picture = banner(project, kind, team)
        expect([picture.width, picture.height]).toEqual([88, 16])
      })
    }
    // The in-game banners' colours are one set for all, the block's own line 1 (white lettering at 1).
    expect(bannerPalette(project, 'game', 0)).toEqual(bannerPalette(project, 'game', 1))
    expect(bannerPalette(project, 'game', 0)[1]).toBe(0xccc)
    if (name === RETAIL) {
      // The menu banners take the team's stripe colours at 1 and 2, with white at 5 and black at 6.
      const palette = bannerPalette(project, 'menu', 1)
      expect(palette.slice(5, 7)).toEqual([0xeee, 0])
      expect(paintableColours('menuBanner', project)).toEqual([1, 2, 5, 6])
    }
  })

  it.each(names)('replaces one team’s in-game and pause banners in %s in place, the others as they were', (name) => {
    const project = open(name)
    // Another team's banner uses only tiles the set has already.
    let graphics = withBanner(project, 'game', 1, banner(project, 'game', 2))
    graphics = withBanner({ ...project, graphics }, 'pause', 1, banner(project, 'pause', 2))
    const reopened = openRom(buildRom({ ...project, graphics }))
    expect(banner(reopened, 'game', 1)).toEqual(banner(project, 'game', 2))
    expect(banner(reopened, 'pause', 1)).toEqual(banner(project, 'pause', 2))
    project.teams.forEach((_, team) => {
      if (team !== 1) expect(banner(reopened, 'game', team)).toEqual(banner(project, 'game', team))
      if (team !== 1) expect(banner(reopened, 'pause', team)).toEqual(banner(project, 'pause', team))
      expect(rinkLogo(reopened, team)).toEqual(rinkLogo(project, team))
      expect(menuLogo(reopened, team)).toEqual(menuLogo(project, team))
    })
    // A project file carries it.
    const edited = { ...project, graphics }
    const text = JSON.stringify({ ...JSON.parse(saveProjectFile(edited, project, 'P')), rom: undefined })
    expect(banner(openProjectFile(project, text).project, 'game', 1)).toEqual(banner(project, 'game', 2))
  })

  it('gives the original game’s banners room of their own, every place that reads them following', () => {
    const project = open(RETAIL)
    const roomy = expandPictureSpace(project)
    const refs = NHL95.graphics.bannerReferences
    for (const kind of ['menu', 'game', 'pause'] as const) {
      const first = (refs[kind] ?? [])[0]
      const blockAt = read32(roomy.bytes, first.at) - first.offset
      // In the unused space from the self-check NOSE4Web takes out ($1A72C0) on.
      expect(blockAt).toBeGreaterThanOrEqual(0x1a72c0)
      for (const ref of refs[kind] ?? []) {
        expect(read32(roomy.bytes, ref.at)).toBe(blockAt + ref.offset)
        expect(read16(roomy.bytes, ref.at - 2)).toBe(ref.opcode)
      }
      project.teams.forEach((_, team) => expect(banner(roomy, kind, team)).toEqual(banner(project, kind, team)))
    }
    // With room, a banner with all-new detail fits: every tile of Boston's different.
    const pixels = new Uint8Array(88 * 16)
    for (let y = 0; y < 16; y++) for (let x = 0; x < 88; x++) pixels[y * 88 + x] = [1, 2, 5, 6][(x * 3 + y * 5 + ((x * y) >> 2)) % 4]
    const picture = { width: 88, height: 16, pixels }
    const reopened = openRom(buildRom({ ...roomy, graphics: withBanner(roomy, 'menu', 1, picture) }))
    expect(banner(reopened, 'menu', 1)).toEqual(picture)
  })
})
