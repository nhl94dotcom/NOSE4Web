import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU32 } from '../src/core/bytes'
import { colorRgb } from '../src/core/color'
import {
  banner,
  bannerColors,
  bannerPalette,
  menuLogo,
  menuLogoFromImage,
  menuLogoPalette,
  menuPalette,
  pictureFromImage,
  pictureToImage,
  rinkLogo,
  rinkLogoSharedWith,
  withBannerColors,
  withRinkLogo,
  type Picture,
} from '../src/core/graphics'
import { buildRom, openRom, type RomProject } from '../src/core/rom'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const load = (name: string) => (existsSync(path(name)) ? new Uint8Array(readFileSync(path(name))) : null)
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}

// A busy picture in which no two 8x8 tiles match, using the colours given.
function noise(width: number, height: number, colors: number[], seed: number): Picture {
  const pixels = new Uint8Array(width * height)
  let state = seed * 2654435761 + 1
  for (let i = 0; i < pixels.length; i++) {
    state = (state * 1103515245 + 12345) >>> 0
    pixels[i] = colors[(state >>> 16) % colors.length]
  }
  return { width, height, pixels }
}
const usedColors = (picture: Picture) => [...new Set(picture.pixels)].sort((a, b) => a - b)
const differingOffsets = (a: Uint8Array, b: Uint8Array) => {
  const offsets: number[] = []
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) offsets.push(i)
  return offsets
}
const allPictures = (project: RomProject) =>
  project.teams.map((_, team) => ({
    rink: rinkLogo(project, team),
    logo: menuLogo(project, team),
    palette: menuPalette(project, team),
    menu: banner(project, 'menu', team),
    game: banner(project, 'game', team),
  }))

describe('pictures from image files', () => {
  const palette = [0x0000, 0x000e, 0x00e0, 0x0e00, 0x0eee, ...new Array<number>(27).fill(0)]

  it('matches pixels to the nearest allowed colour and keeps see-through ones', () => {
    // Red, nearly green, see-through, white.
    const rgba = Uint8Array.from([255, 0, 0, 255, 10, 230, 20, 255, 9, 9, 9, 0, 250, 250, 250, 255])
    expect([...pictureFromImage(rgba, 4, 1, palette, [1, 2, 3, 4]).pixels]).toEqual([1, 2, 0, 4])
    // With green not allowed, the green pixel goes to whichever of red and blue is nearer.
    expect([...pictureFromImage(rgba, 4, 1, palette, [1, 3]).pixels]).toEqual([1, 3, 0, 1])
  })

  it('turns a picture back into image data', () => {
    const image = pictureToImage({ width: 2, height: 1, pixels: Uint8Array.from([0, 3]) }, palette)
    expect([...image]).toEqual([0, 0, 0, 0, ...colorRgb(0x0e00), 255])
  })

  it("builds a menu logo's colours from the image", () => {
    const rgba = new Uint8Array(48 * 48 * 4)
    for (let i = 0; i < 48 * 48; i++) rgba.set(i % 3 === 0 ? [255, 0, 0, 255] : i % 3 === 1 ? [0, 0, 255, 255] : [0, 0, 0, 0], i * 4)
    const start = new Array<number>(32).fill(0x0222)
    const { picture, palette: next, colorsFound } = menuLogoFromImage(rgba, 48, 48, start)
    expect(colorsFound).toBe(2)
    expect(usedColors(picture)).toEqual([0, 5, 6])
    expect([next[5], next[6]].sort()).toEqual([0x000e, 0x0e00])
    expect(next.slice(16 + 5, 16 + 7)).toEqual(next.slice(5, 7)) // both copies of the palette
    expect(next.slice(0, 5)).toEqual(start.slice(0, 5)) // the banner's colours are left alone
  })
})

const base = load('nhl94.bin')
describe.skipIf(!base)('team pictures in NHL 94', () => {
  const MONTREAL = 11
  const BOSTON = 1

  it('reads every kind of picture for every team', () => {
    const project = openRom(base!)
    expect(project.graphicsSupported).toBe(true)
    for (const pictures of allPictures(project)) {
      expect([pictures.rink.width, pictures.rink.height]).toEqual([48, 32])
      expect([pictures.logo.width, pictures.logo.height]).toEqual([48, 48])
      expect([pictures.menu.width, pictures.menu.height]).toEqual([88, 16])
      expect([pictures.game.width, pictures.game.height]).toEqual([88, 16])
      expect(usedColors(pictures.rink).length).toBeGreaterThan(2)
      // Logos keep clear of the colours the menu banner uses.
      expect(usedColors(pictures.logo).filter((c) => c >= 1 && c <= 4)).toEqual([])
      expect(usedColors(pictures.menu).length).toBeGreaterThan(2)
    }
    expect(rinkLogoSharedWith(project, 26)).toEqual([26, 27]) // the two All Stars teams
    expect(rinkLogoSharedWith(project, MONTREAL)).toEqual([MONTREAL])
    expect(bannerPalette(project, 'menu', MONTREAL).slice(1, 3)).toEqual(bannerColors(project, MONTREAL))
    expect(menuLogoPalette(project, MONTREAL)).toHaveLength(16)
  })

  it('replaces a centre-ice logo and nothing else', () => {
    const project = openRom(base!)
    const before = allPictures(project)
    const picture = noise(48, 32, [0, 3, 7, 12], 1)
    const edited = { ...project, graphics: withRinkLogo(project, MONTREAL, picture) }
    expect(rinkLogo(edited, MONTREAL)).toEqual(picture)

    const rom = buildRom(edited)
    const after = allPictures(openRom(rom))
    expect(after[MONTREAL].rink).toEqual(picture)
    expect(after.map((p, i) => (i === MONTREAL ? before[i] : p))).toEqual(before.map((p, i) => (i === MONTREAL ? before[i] : p)))
    // Only the 24 tiles of that logo differ from an unedited build.
    const changed = differingOffsets(buildRom(project), rom).filter((o) => o < 0x18e || o > 0x18f)
    expect(changed.length).toBeGreaterThan(0)
    expect(changed.at(-1)! - changed[0]).toBeLessThan(24 * 32)
  })

  it('replaces a shared centre-ice logo for every team that shows it', () => {
    const project = openRom(base!)
    const picture = noise(48, 32, [1, 2], 2)
    const reopened = openRom(buildRom({ ...project, graphics: withRinkLogo(project, 27, picture) }))
    expect(rinkLogo(reopened, 26)).toEqual(picture)
    expect(rinkLogo(reopened, 27)).toEqual(picture)
  })

  it('replaces a menu logo with a more detailed one by sharing room between logos', () => {
    const project = openRom(base!)
    const before = allPictures(project)
    // Boston's logo had 24 tiles, and the logos have 352 spare bytes between
    // them: room for 11 more. This one needs 35: 34 busy tiles and a blank.
    const picture = noise(48, 48, [0, 5, 9, 15], 3)
    for (let y = 0; y < 8; y++) picture.pixels.fill(0, y * 48, y * 48 + 16)
    const palette = menuPalette(project, BOSTON).map((word, i) => (i === 9 ? 0x0e0e : word))
    const graphics = { ...project.graphics, menuLogos: { [BOSTON]: picture }, menuPalettes: { [BOSTON]: palette } }
    const rom = buildRom({ ...project, graphics })

    const after = allPictures(openRom(rom))
    expect(after[BOSTON].logo).toEqual(picture)
    expect(after[BOSTON].palette).toEqual(palette)
    expect(after.map((p, i) => (i === BOSTON ? before[i] : p))).toEqual(before.map((p, i) => (i === BOSTON ? before[i] : p)))
    // The logos after Boston's moved along, within the space they had.
    const table = readU32(rom, 0xf8682)
    expect(readU32(rom, table + (BOSTON + 1) * 4)).toBeGreaterThan(readU32(base!, table + (BOSTON + 1) * 4))
    expect(readU32(rom, table + BOSTON * 4)).toBe(readU32(base!, table + BOSTON * 4))
  })

  it('refuses menu logos that cannot all fit', () => {
    const project = openRom(base!)
    const menuLogos = Object.fromEntries(project.teams.map((_, team) => [team, noise(48, 48, [5, 6, 7, 8], 10 + team)]))
    expect(() => buildRom({ ...project, graphics: { ...project.graphics, menuLogos } })).toThrow(/menu logos need \d+ more bytes/)
  })

  it('replaces banners, and refuses lettering there is no room for', () => {
    const project = openRom(base!)
    const before = allPictures(project)
    // Boston takes Montreal's banner: every tile it needs is already there.
    const graphics = {
      ...project.graphics,
      menuBanners: { [BOSTON]: before[MONTREAL].menu },
      gameBanners: { [BOSTON]: before[MONTREAL].game },
    }
    const after = allPictures(openRom(buildRom({ ...project, graphics })))
    expect(after[BOSTON].menu).toEqual(before[MONTREAL].menu)
    expect(after[BOSTON].game).toEqual(before[MONTREAL].game)
    expect(after.map((p, i) => (i === BOSTON ? before[i] : p))).toEqual(before.map((p, i) => (i === BOSTON ? before[i] : p)))

    const busy = Object.fromEntries([0, 1, 2, 3, 4, 5].map((team) => [team, noise(88, 16, [1, 2, 5, 6], 40 + team)]))
    expect(() => buildRom({ ...project, graphics: { ...project.graphics, menuBanners: busy } })).toThrow(
      /The menu banners need \d+ more tiles/,
    )
  })

  it("changes a team's banner colours in both copies of its palette", () => {
    const project = openRom(base!)
    const palette = withBannerColors(menuPalette(project, MONTREAL), [0x0e00, 0x000e])
    const reopened = openRom(buildRom({ ...project, graphics: { ...project.graphics, menuPalettes: { [MONTREAL]: palette } } }))
    expect(bannerColors(reopened, MONTREAL)).toEqual([0x0e00, 0x000e])
    expect(menuPalette(reopened, MONTREAL).slice(16 + 3, 16 + 5)).toEqual([0x0e00, 0x000e])
    expect(menuLogo(reopened, MONTREAL)).toEqual(menuLogo(project, MONTREAL))
  })
})

const league = local.league30Rom ? load(local.league30Rom) : null
describe.skipIf(!league)('team pictures in the 30-team league ROM', () => {
  it('reads and replaces them the same way', () => {
    const project = openRom(league!)
    expect(project.graphicsSupported).toBe(true)
    const before = allPictures(project)
    expect(before).toHaveLength(30)

    const graphics = {
      ...withRinkLogo(project, 4, noise(48, 32, [1, 2, 3], 5)),
      menuLogos: { 7: noise(48, 48, [5, 6, 7], 6) },
      gameBanners: { 9: noise(88, 16, [1, 5, 7], 7) },
    }
    const rom = buildRom({ ...project, graphics })
    const after = allPictures(openRom(rom))
    expect(after[4].rink).toEqual(graphics.rinkLogos[4])
    expect(after[7].logo).toEqual(graphics.menuLogos[7])
    expect(after[9].game).toEqual(graphics.gameBanners[9])
    const untouched = (list: typeof before) => list.filter((_, i) => ![4, 7, 9].includes(i))
    expect(untouched(after)).toEqual(untouched(before))
  })
})
