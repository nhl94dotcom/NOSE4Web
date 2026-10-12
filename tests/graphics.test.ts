import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { readU16, readU32 } from '../src/core/bytes'
import { colorRgb } from '../src/core/color'
import {
  banner,
  bannerColors,
  bannerPalette,
  bannersEditable,
  bannerSharedWith,
  expandPictureSpace,
  menuLogo,
  menuLogoFromImage,
  menuLogoPalette,
  menuLogoStart,
  menuPalette,
  pictureFromImage,
  pictureSpace,
  pictureToImage,
  rinkLogo,
  rinkLogoSharedWith,
  visitorBannersApart,
  withBanner,
  withBannerColors,
  withRinkLogo,
  type Picture,
} from '../src/core/graphics'
import { expandTeamSpace, nextExpansion } from '../src/core/expand'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { addPlayer } from '../src/core/roster'

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
    expect(usedColors(picture)).toEqual([0, 7, 8])
    expect([next[7], next[8]].sort()).toEqual([0x000e, 0x0e00])
    expect(next.slice(16 + 7, 16 + 9)).toEqual(next.slice(7, 9)) // both copies of the palette
    expect(next.slice(0, 5)).toEqual(start.slice(0, 5)) // the banner's stripe colours are left alone
    // White and black belong to the banner's lettering too, and are always these.
    expect([next[5], next[6], next[21], next[22]]).toEqual([0x0eee, 0x0000, 0x0eee, 0x0000])
  })

  it('gives white and black their fixed places and never redefines them', () => {
    const rgba = new Uint8Array(48 * 48 * 4)
    // Mostly white and black, with a little green: the common colours must not take the green's place.
    for (let i = 0; i < 48 * 48; i++) rgba.set(i % 50 === 0 ? [0, 255, 0, 255] : i % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255], i * 4)
    const { picture, palette: next, colorsFound } = menuLogoFromImage(rgba, 48, 48, new Array<number>(32).fill(0x0222))
    expect(colorsFound).toBe(1)
    expect(usedColors(picture)).toEqual([5, 6, 7])
    expect([next[5], next[6], next[7]]).toEqual([0x0eee, 0x0000, 0x00e0])
    expect(picture.pixels[1]).toBe(5) // white
    expect(picture.pixels[2]).toBe(6) // black
    expect(next.slice(8, 16)).toEqual(new Array<number>(8).fill(0x0222)) // unused places are left as they were
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
    // White and black sit in the same two places in every team's menu colours.
    for (let team = 0; team < project.teams.length; team++) {
      expect(menuPalette(project, team).slice(5, 7)).toEqual([0x0eee, 0x0000])
    }
    expect(menuLogoPalette(project, MONTREAL)).toHaveLength(16)
    expect(visitorBannersApart(project)).toBe(false)
    expect(bannerSharedWith(project, 'menu', MONTREAL)).toEqual([MONTREAL])
  })

  it('puts an imported menu logo\'s colours where the game draws the logo from', () => {
    const project = openRom(base!)
    // Red, green and blue stripes on white.
    const rgba = new Uint8Array(48 * 48 * 4).fill(255)
    for (let i = 0; i < 48 * 48; i++) {
      const stripe = Math.floor(i / 48 / 12)
      if (stripe < 3) rgba.set([stripe === 0 ? 255 : 0, stripe === 1 ? 255 : 0, stripe === 2 ? 255 : 0], i * 4)
    }
    const logo = menuLogoFromImage(rgba, 48, 48, menuLogoStart(project, BOSTON))
    const graphics = {
      ...project.graphics,
      menuLogos: { [BOSTON]: logo.picture },
      menuPalettes: { [BOSTON]: logo.palette },
    }
    expect(menuLogoPalette({ ...project, graphics }, BOSTON)).toEqual(logo.palette.slice(0, 16))

    const rom = buildRom({ ...project, graphics })
    const colorsAt = readU32(rom, project.game.graphics.menuLogoColorsPointer) + BOSTON * 0x20
    const written = Array.from({ length: 16 }, (_, i) => readU16(rom, colorsAt + i * 2))
    expect(written.slice(5, 10).sort()).toEqual([0x0000, 0x000e, 0x00e0, 0x0e00, 0x0eee].sort())
    // Its banner stripe places in that table are not the logo's to change.
    expect(written.slice(0, 5)).toEqual(menuLogoPalette(project, BOSTON).slice(0, 5))
    const reopened = openRom(rom)
    expect(menuLogoPalette(reopened, BOSTON).slice(5)).toEqual(logo.palette.slice(5, 16))
    expect(pictureToImage(menuLogo(reopened, BOSTON), menuLogoPalette(reopened, BOSTON))).toEqual(
      pictureToImage(logo.picture, logo.palette),
    )
    // Changing only the banner colours leaves the logo's colours alone.
    const stripes = withBannerColors(menuPalette(project, MONTREAL), [0x0e00, 0x000e])
    const striped = buildRom({ ...project, graphics: { ...project.graphics, menuPalettes: { [MONTREAL]: stripes } } })
    expect(menuLogoPalette(openRom(striped), MONTREAL)).toEqual(menuLogoPalette(project, MONTREAL))
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

  it('gives the pictures room for any replacement by moving them to the end of the ROM', () => {
    const project = openRom(base!)
    expect(pictureSpace(project)).toEqual({ romSize: 0x200000, grows: true })
    const roomy = expandPictureSpace(project)
    expect(roomy.bytes.length).toBe(0x200000)
    expect(pictureSpace(roomy)).toBeNull()
    // Nothing looks different, and nothing in the first megabyte changed but addresses.
    expect(allPictures(roomy)).toEqual(allPictures(project))
    const changed = differingOffsets(project.bytes, roomy.bytes.subarray(0, project.bytes.length))
    const addresses = [0x17b7e, 0xf84d4, 0xf84e4, 0x16d26, 0x17672, 0x17b9e, 0x11f24]
    const table = readU32(project.bytes, 0xf8682)
    const expected = (o: number) =>
      addresses.some((a) => o >= a && o < a + 4) || (o >= table && o < table + 28 * 4) || o >= 0xffac0 // the end mark moved
    expect(changed.filter((o) => !expected(o))).toEqual([])
    expect(readU32(roomy.bytes, 0xf84d4)).toBe(readU32(roomy.bytes, 0x17b7e) + 8)
    expect(readU32(roomy.bytes, 0x11f24)).toBe(readU32(roomy.bytes, 0x16d26) + 8)

    // Now the busiest pictures fit, for every team at once.
    const all = (width: number, height: number, colors: number[], seed: number) =>
      Object.fromEntries(project.teams.map((_, team) => [team, noise(width, height, colors, seed + team)]))
    const graphics = {
      ...roomy.graphics,
      menuLogos: all(48, 48, [5, 6, 7, 8], 100),
      menuBanners: all(88, 16, [1, 2, 5, 6], 200),
      gameBanners: all(88, 16, [1, 5, 7, 9], 300),
    }
    const rom = buildRom({ ...roomy, graphics })
    const reopened = openRom(rom)
    expect(pictureSpace(reopened)).toBeNull()
    const after = allPictures(reopened)
    project.teams.forEach((_, team) => {
      expect(after[team].logo).toEqual(graphics.menuLogos[team])
      expect(after[team].menu).toEqual(graphics.menuBanners[team])
      expect(after[team].game).toEqual(graphics.gameBanners[team])
    })
    expect(after.map((p) => p.rink)).toEqual(allPictures(project).map((p) => p.rink))
    expect(reopened.teams).toEqual(project.teams)
    expect(reopened.settings).toEqual(project.settings)
  })

  it('keeps roster space and picture space working together, in either order', () => {
    const noisy = (project: RomProject) => ({ ...project.graphics, menuBanners: { 3: noise(88, 16, [1, 2, 5, 6], 9) } })
    for (const picturesFirst of [true, false]) {
      let project = openRom(base!)
      const pictures = allPictures(project)
      if (picturesFirst) project = expandPictureSpace(project)
      project = expandTeamSpace(project)
      project = expandTeamSpace(openRom(buildRom(project)))
      expect(nextExpansion(project)).toBeNull()
      if (!picturesFirst) project = expandPictureSpace(project)
      project = { ...project, graphics: noisy(project) }
      project.teams[0] = addPlayer(project.teams[0])

      const reopened = openRom(buildRom(project))
      expect(reopened.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
      expect(reopened.settings).toEqual(project.settings)
      expect(banner(reopened, 'menu', 3)).toEqual(project.graphics.menuBanners[3])
      expect(allPictures(reopened).map((p) => p.logo)).toEqual(pictures.map((p) => p.logo))
      expect(pictureSpace(reopened)).toBeNull()
      expect(nextExpansion(reopened)).toBeNull()
    }
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

  it('draws its menu logos in their own colours and replaces them with new ones', () => {
    const project = openRom(league!)
    for (let team = 0; team < 30; team++) {
      const palette = menuLogoPalette(project, team)
      expect(palette.slice(5, 7)).toEqual([0x0eee, 0x0000])
      expect(new Set(palette.slice(7)).size).toBeGreaterThan(3)
    }
    const rgba = new Uint8Array(48 * 48 * 4).fill(255)
    for (let i = 0; i < 48 * 24; i++) rgba.set([255, 0, 0], i * 4)
    const logo = menuLogoFromImage(rgba, 48, 48, menuLogoStart(project, 12))
    const graphics = { ...project.graphics, menuLogos: { 12: logo.picture }, menuPalettes: { 12: logo.palette } }
    const reopened = openRom(buildRom({ ...project, graphics }))
    expect(pictureToImage(menuLogo(reopened, 12), menuLogoPalette(reopened, 12))).toEqual(
      pictureToImage(logo.picture, logo.palette),
    )
    expect(bannerColors(reopened, 12)).toEqual(bannerColors(project, 12))
    expect(menuLogoPalette(reopened, 11)).toEqual(menuLogoPalette(project, 11))
  })

  it('has one home and one visitor menu banner for every team, and replaces each for all', () => {
    const project = openRom(league!)
    expect(visitorBannersApart(project)).toBe(true)
    expect(bannersEditable(project, 'menu')).toBe(true)
    expect(bannersEditable(project, 'visitor')).toBe(true)
    expect(bannersEditable(project, 'game')).toBe(true)
    expect(banner(project, 'menu', 0)).not.toEqual(banner(project, 'visitor', 0))
    expect(banner(project, 'menu', 17)).toEqual(banner(project, 'menu', 0))
    expect(bannerSharedWith(project, 'visitor', 4)).toHaveLength(30)
    expect(bannerSharedWith(project, 'game', 4)).toEqual([4])

    const home = noise(88, 16, [1, 2, 5, 6], 8)
    const away = noise(88, 16, [1, 2, 5, 6], 9)
    let edited = { ...project, graphics: withBanner(project, 'menu', 2, home) }
    edited = { ...edited, graphics: withBanner(edited, 'visitor', 20, away) }
    const rom = buildRom(edited)
    expect(rom.length).toBe(league!.length)
    const reopened = openRom(rom)
    for (const team of [0, 2, 29]) {
      expect(banner(reopened, 'menu', team)).toEqual(home)
      expect(banner(reopened, 'visitor', team)).toEqual(away)
    }
    expect(allPictures(reopened).map((p) => [p.rink, p.logo, p.game])).toEqual(
      allPictures(project).map((p) => [p.rink, p.logo, p.game]),
    )
    expect(reopened.teams).toEqual(project.teams)
    // One team alone cannot have a different banner while there is room for only one.
    expect(() =>
      buildRom({ ...project, graphics: { ...project.graphics, visitorBanners: { 3: away } } }),
    ).toThrow('more tiles than the ROM has room for')
  })

  // The game draws the visitor's menu banner from the visitor's tiles, but
  // by the home banner's map. This reads a ROM the way the game does, from
  // the places in its code that say where each is, to check what it would show.
  function asTheGameDraws(rom: Uint8Array, team: number): { home: Picture; visitor: Picture } {
    const refs = openRom(rom).game.graphics.bannerReferences
    const homeAt = readU32(rom, refs.menu[0].at)
    const visitorTilesAt = readU32(rom, refs.visitor[0].at) + 2 // past the count of tiles
    const mapAt = homeAt + readU32(rom, homeAt + 4)
    const width = readU16(rom, mapAt)
    const draw = (tilesAt: number): Picture => {
      const pixels = new Uint8Array(width * 8 * 16)
      for (let i = 0; i < width * 2; i++) {
        const entry = readU16(rom, mapAt + 4 + (team * 2 * width + i) * 2)
        const tileAt = tilesAt + (entry & 0x7ff) * 32
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 8; x++) {
            const [sx, sy] = [entry & 0x800 ? 7 - x : x, entry & 0x1000 ? 7 - y : y]
            const byte = rom[tileAt + sy * 4 + (sx >> 1)]
            pixels[(Math.floor(i / width) * 8 + y) * width * 8 + (i % width) * 8 + x] = sx & 1 ? byte & 15 : byte >> 4
          }
        }
      }
      return { width: width * 8, height: 16, pixels }
    }
    return { home: draw(homeAt + 10), visitor: draw(visitorTilesAt) }
  }

  it('shows the banners as the game draws them', () => {
    const project = openRom(league!)
    for (const team of [0, 13, 29]) {
      const drawn = asTheGameDraws(buildRom(project), team)
      expect(drawn.home).toEqual(banner(project, 'menu', team))
      expect(drawn.visitor).toEqual(banner(project, 'visitor', team))
    }
  })

  it('keeps the visitor banners right when either set is replaced, as the game draws them', () => {
    const project = openRom(league!)
    // Plain pictures, which pack down to very few tiles: the case that once
    // left the visitor's tiles out of step with the map the game reads.
    const flat = (color: number): Picture => ({ width: 88, height: 16, pixels: new Uint8Array(88 * 16).fill(color) })
    const striped: Picture = { width: 88, height: 16, pixels: Uint8Array.from({ length: 88 * 16 }, (_, i) => (i % 88 < 44 ? 1 : 2)) }

    const cases: [string, RomProject['graphics']][] = [
      ['visitor only', withBanner(project, 'visitor', 4, flat(5))],
      ['home only', withBanner(project, 'menu', 4, striped)],
      ['both', withBanner({ ...project, graphics: withBanner(project, 'menu', 4, flat(6)) }, 'visitor', 9, striped)],
    ]
    for (const [name, graphics] of cases) {
      const edited = { ...project, graphics }
      const rom = buildRom(edited)
      const reopened = openRom(rom)
      for (const team of [0, 4, 29]) {
        const drawn = asTheGameDraws(rom, team)
        expect(drawn.home, `${name}: home banner of team ${team}`).toEqual(banner(edited, 'menu', team))
        expect(drawn.visitor, `${name}: visitor banner of team ${team}`).toEqual(banner(edited, 'visitor', team))
        expect(banner(reopened, 'visitor', team)).toEqual(banner(edited, 'visitor', team))
      }
    }
  })

  it('keeps every team\'s visitor banner right when one team\'s home banner changes, given room', () => {
    const roomy = expandPictureSpace(openRom(league!))
    const edited = { ...roomy, graphics: withBanner(roomy, 'menu', 7, noise(88, 16, [1, 2, 5, 6], 3)) }
    const rom = buildRom({ ...edited, graphics: withBanner(edited, 'visitor', 21, noise(88, 16, [1, 2, 5, 6], 4)) })
    for (const team of [0, 7, 8, 21, 29]) {
      const drawn = asTheGameDraws(rom, team)
      expect(drawn.home, `home banner of team ${team}`).toEqual(team === 7 ? noise(88, 16, [1, 2, 5, 6], 3) : banner(roomy, 'menu', team))
      expect(drawn.visitor, `visitor banner of team ${team}`).toEqual(team === 21 ? noise(88, 16, [1, 2, 5, 6], 4) : banner(roomy, 'visitor', team))
    }
  })

  it('gives every team home and visitor banners of its own once they have room', () => {
    const project = openRom(league!)
    expect(pictureSpace(project)).toEqual({ romSize: league!.length, grows: false })
    const roomy = expandPictureSpace(project)
    expect(pictureSpace(roomy)).toBeNull()
    expect(allPictures(roomy)).toEqual(allPictures(project))
    expect(bannerSharedWith(roomy, 'menu', 2)).toEqual([2])

    const home = noise(88, 16, [1, 2, 5, 6], 8)
    const away = noise(88, 16, [1, 2, 5, 6], 9)
    let edited = { ...roomy, graphics: withBanner(roomy, 'menu', 2, home) }
    edited = { ...edited, graphics: withBanner(edited, 'visitor', 20, away) }
    edited.teams[0] = { ...edited.teams[0], players: edited.teams[0].players.map((p, i) => (i === 0 ? { ...p, name: 'New Name' } : p)) }
    const reopened = openRom(buildRom(edited))
    expect(banner(reopened, 'menu', 2)).toEqual(home)
    expect(banner(reopened, 'visitor', 20)).toEqual(away)
    expect(banner(reopened, 'menu', 3)).toEqual(banner(project, 'menu', 3))
    expect(banner(reopened, 'visitor', 2)).toEqual(banner(project, 'visitor', 2))
    expect(reopened.teams[0].players[0].name).toBe('New Name')
    expect(reopened.teams.slice(1).map((t) => t.players)).toEqual(project.teams.slice(1).map((t) => t.players))
    // Unedited, a ROM given room is rebuilt exactly as it is.
    expect(buildRom(openRom(buildRom(roomy)))).toEqual(buildRom(roomy))
  })
})
