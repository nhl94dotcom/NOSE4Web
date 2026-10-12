import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { banner, bannerColors, expandPictureSpace, menuLogo, pictureToImage, rinkLogo, withBannerColors, menuPalette } from '../src/core/graphics'
import { importTeam } from '../src/core/importteam'
import { letterBanner, measureLettering } from '../src/core/lettering'
import {
  currentPicture,
  identifyPictureFile,
  importPictureSet,
  pictureFileName,
  pictureKinds,
  pictureSet,
  withPictureFromImage,
} from '../src/core/pictureset'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { createZip, isZip, readZip } from '../src/core/zip'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hasRom = existsSync(path('nhl94.bin'))
const setup = () => openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const hasLeague = !!local.league30Rom && existsSync(path(local.league30Rom))

const BOSTON = 1
const MONTREAL = 11
const text = (s: string) => new TextEncoder().encode(s)

describe('zip files', () => {
  const files = [
    { name: '01_Team_menu_logo.png', data: Uint8Array.from({ length: 300 }, (_, i) => (i * 7) % 256) },
    { name: 'notes/été.txt', data: text('hello') },
    { name: 'empty.bin', data: new Uint8Array() },
  ]

  it('come back as they went in', async () => {
    const zip = createZip(files)
    expect(isZip(zip)).toBe(true)
    expect(await readZip(zip)).toEqual(files)
    expect(createZip(files)).toEqual(zip) // the same bytes every time
    expect(await readZip(createZip([]))).toEqual([])
  })

  it('opens a zip whose files are compressed, as other programs make them', async () => {
    // Built by hand the way Windows or macOS would, with a folder and a comment.
    const body = text('compress me '.repeat(50))
    const packed = deflateRawSync(body)
    const name = text('pictures/a.txt')
    const folder = text('pictures/')
    const parts: number[] = []
    const u16 = (v: number) => parts.push(v & 0xff, v >> 8)
    const u32 = (v: number) => parts.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24)
    const local = (n: Uint8Array, method: number, data: Uint8Array, size: number) => {
      const at = parts.length
      u32(0x04034b50); u16(20); u16(0); u16(method); u16(0); u16(0x21); u32(0); u32(data.length); u32(size); u16(n.length); u16(4)
      parts.push(...n, 1, 2, 3, 4, ...data) // with an extra field to skip
      return at
    }
    const entries = [
      { n: folder, method: 0, data: new Uint8Array(), size: 0 },
      { n: name, method: 8, data: new Uint8Array(packed), size: body.length },
    ].map((e) => ({ ...e, at: local(e.n, e.method, e.data, e.size) }))
    const directory = parts.length
    for (const e of entries) {
      u32(0x02014b50); u16(20); u16(20); u16(0); u16(e.method); u16(0); u16(0x21); u32(0); u32(e.data.length); u32(e.size)
      u16(e.n.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(e.at)
      parts.push(...e.n)
    }
    const size = parts.length - directory
    u32(0x06054b50); u16(0); u16(0); u16(2); u16(2); u32(size); u32(directory); u16(3)
    parts.push(...text('hi!'))

    expect(await readZip(Uint8Array.from(parts))).toEqual([{ name: 'pictures/a.txt', data: body }])
  })

  it('says so when a file is not a zip', async () => {
    expect(isZip(text('not a zip at all, just some text here'))).toBe(false)
    await expect(readZip(text('not a zip at all, just some text here'))).rejects.toThrow('This is not a zip file.')
  })
})

describe('banner lettering', () => {
  it('measures text, capitalises it, and leaves out what it has no shape for', () => {
    expect(measureLettering('Boston')).toMatchObject({ text: 'BOSTON', dropped: '', width: 44, tooWide: 0 })
    expect(measureLettering('  new   york ').text).toBe('NEW YORK')
    expect(measureLettering('Zürich #9')).toMatchObject({ text: 'ZRICH 9', dropped: 'Ü#' })
    expect(measureLettering('').width).toBe(0)
    expect(measureLettering('Mighty Ducks of Anaheim').tooWide).toBeGreaterThan(0)
    // Every character it can draw is nine rows of one width.
    for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-\'!&/') {
      expect(measureLettering(char), char).toMatchObject({ text: char, dropped: '' })
      expect(measureLettering(char).width, char).toBeGreaterThan(1)
    }
  })

  it.skipIf(!hasRom)('draws the frame and stripes the game\'s banners have, around lettering of its own', () => {
    const project = setup()
    for (const kind of ['menu', 'game'] as const) {
      for (const team of [BOSTON, MONTREAL, 9]) {
        const made = letterBanner(project, kind, team, project.teams[team].names[0])
        const theirs = banner(project, kind, team)
        const differing: number[] = []
        made.pixels.forEach((v, i) => {
          const [x, y] = [i % 88, Math.floor(i / 88)]
          // The frame, and the stripes to either side of where the names sit.
          const outside = x < 2 || x > 85 || y < 2 || y > 13 || x < 10 || x > 80
          if (outside && v !== theirs.pixels[i]) differing.push(i)
        })
        expect(differing, `${kind} banner of team ${team}`).toEqual([])
        // The lettering itself is this project's, not the game's.
        expect(made).not.toEqual(theirs)
      }
    }
    // Letters are white with a black shadow below and to the right, on the menus.
    const made = letterBanner(project, 'menu', BOSTON, 'I')
    const white = [...made.pixels].flatMap((v, i) => (v === 5 && i % 88 > 1 && i % 88 < 86 && i > 2 * 88 && i < 14 * 88 ? [i] : []))
    expect(white.length).toBeGreaterThan(10)
    for (const i of white) expect([5, 6]).toContain(made.pixels[i + 89])
    // And centred.
    const columns = white.map((i) => i % 88)
    expect(Math.min(...columns) - 2).toBe(85 - Math.max(...columns))
  })

  it('has a shape of nine rows and one width for every character it draws', () => {
    for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      const alone = measureLettering(char).width
      expect(alone, char).toBeGreaterThanOrEqual(4)
      expect(alone, char).toBeLessThanOrEqual(8)
      // Two of a character are twice its width and the gap between.
      expect(measureLettering(char + char).width, char).toBe(alone * 2 + 1)
    }
    // No two letters share a shape.
    const project = hasRom ? setup() : null
    if (!project) return
    const shapes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789'].map((char) => letterBanner(project, 'menu', 0, char).pixels.join(''))
    expect(new Set(shapes).size).toBe(shapes.length)
  })

  it.skipIf(!hasRom)('follows the team\'s banner colours, and refuses text that does not fit', () => {
    const project = setup()
    const made = letterBanner(project, 'menu', MONTREAL, 'Habs 93')
    expect([made.width, made.height]).toEqual([88, 16])
    expect([...new Set(made.pixels)].sort()).toEqual([1, 2, 5, 6]) // stripes, white, black
    // Recoloured stripes show in the banner without redrawing it.
    const graphics = { ...project.graphics, menuBanners: { [MONTREAL]: made }, menuPalettes: { [MONTREAL]: withBannerColors(menuPalette(project, MONTREAL), [0x000e, 0x00e0]) } }
    const reopened = openRom(buildRom(expandPictureSpace({ ...project, graphics })))
    expect(banner(reopened, 'menu', MONTREAL)).toEqual(made)
    expect(bannerColors(reopened, MONTREAL)).toEqual([0x000e, 0x00e0])
    expect(() => letterBanner(project, 'menu', MONTREAL, 'Montreal Canadiens Hockey Club')).toThrow(/pixels too wide for a banner/)
    expect(() => letterBanner(project, 'menu', MONTREAL, ' ~ ')).toThrow('There is nothing to put on the banner.')
  })
})

describe.skipIf(!hasRom)('picture files', () => {
  const asFiles = (project: RomProject) =>
    pictureSet(project).map((entry) => ({ name: entry.name, rgba: pictureToImage(entry.picture, entry.palette), width: entry.picture.width, height: entry.picture.height }))
  const blank = (width: number, height: number, rgb: number[]) => {
    const rgba = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) rgba.set([...rgb, 255], i * 4)
    return { rgba, width, height }
  }

  it('names each picture for its team and kind, and reads the name back', () => {
    const project = setup()
    expect(pictureKinds(project)).toEqual(['rinkLogo', 'menuLogo', 'menuBanner', 'gameBanner'])
    expect(pictureFileName(project, BOSTON, 'menuLogo')).toBe('02_Boston_Bruins_menu_logo.png')
    expect(pictureFileName(project, 20, 'gameBanner')).toBe('21_St_Louis_Blues_game_banner.png')
    expect(identifyPictureFile('02_Boston_Bruins_menu_logo.png')).toEqual({ team: BOSTON, kind: 'menuLogo' })
    // The middle is only for the reader, and a folder in front does not matter.
    expect(identifyPictureFile('My_League_pictures/2_anything at all_RINK_LOGO.PNG')).toEqual({ team: BOSTON, kind: 'rinkLogo' })
    expect(identifyPictureFile('28_visitor_banner.png')).toEqual({ team: 27, kind: 'visitorBanner' })
    expect(identifyPictureFile('Boston_menu_logo.png')).toBeNull()
    expect(identifyPictureFile('02_Boston_logo.png')).toBeNull()
    const names = pictureSet(project).map((entry) => entry.name)
    // The two All Stars teams share a centre-ice logo, which is in the set once.
    expect(names).toHaveLength(28 * 4 - 1)
    expect(names).toContain('27_All_Stars_East_rink_logo.png')
    expect(names).not.toContain('28_All_Stars_West_rink_logo.png')
    expect(new Set(names).size).toBe(names.length)
    for (const name of names) expect(identifyPictureFile(name)).not.toBeNull()
  })

  it('brings an untouched set back without changing anything', () => {
    const project = setup()
    const result = importPictureSet(project, asFiles(project))
    expect(result).toMatchObject({ replaced: [], unchanged: 28 * 4 - 1, problems: [] })
    expect(result.project).toBe(project)
  })

  it('replaces only the pictures that were changed', () => {
    const project = expandPictureSpace(setup())
    const files = asFiles(project)
    const change = (name: string, rgb: number[]) => {
      const file = files.find((f) => f.name === name)!
      Object.assign(file, blank(file.width, file.height, rgb))
    }
    change('02_Boston_Bruins_menu_logo.png', [255, 0, 0])
    change('12_Montreal_Canadiens_game_banner.png', [0, 0, 0])
    change('27_All_Stars_East_rink_logo.png', [255, 255, 255])

    const result = importPictureSet(project, files)
    expect(result.replaced).toEqual(['Boston Bruins: Menu logo', 'Montreal Canadiens: In-game banner', 'All Stars East: Centre-ice logo'])
    expect(result.unchanged).toBe(28 * 4 - 1 - 3)
    expect(result.problems).toEqual([])
    const reopened = openRom(buildRom(result.project))
    expect(new Set(menuLogo(reopened, BOSTON).pixels).size).toBe(1)
    expect(new Set(banner(reopened, 'game', MONTREAL).pixels).size).toBe(1)
    expect(rinkLogo(reopened, 27)).toEqual(rinkLogo(reopened, 26))
    expect(new Set(rinkLogo(reopened, 27).pixels).size).toBe(1)
    expect(menuLogo(reopened, MONTREAL)).toEqual(menuLogo(project, MONTREAL))
    // Bringing the same files in again changes nothing more.
    expect(importPictureSet(result.project, files)).toMatchObject({ replaced: [], unchanged: 28 * 4 - 1 })
  })

  it('explains each file it cannot use and still uses the rest', () => {
    const project = setup()
    const logo = blank(48, 48, [0, 0, 255])
    const result = importPictureSet(project, [
      { name: '02_Boston_Bruins_menu_logo.png', ...logo },
      { name: '02_again_menu_logo.png', ...logo },
      { name: '03_Buffalo_menu_logo.png', ...blank(40, 40, [0, 0, 0]) },
      { name: '31_Nobody_menu_logo.png', ...logo },
      { name: '04_Calgary_visitor_banner.png', ...blank(88, 16, [0, 0, 0]) },
      { name: 'holiday.png', ...logo },
    ])
    expect(result.replaced).toEqual(['Boston Bruins: Menu logo'])
    expect(result.problems).toHaveLength(5)
    expect(result.problems[0]).toContain('more than one file for this picture')
    expect(result.problems[1]).toContain('The image is 40 by 40 pixels. This picture has to be 48 by 48.')
    expect(result.problems[2]).toContain('this ROM has no team 31')
    expect(result.problems[3]).toContain('no separate banner for the visiting team')
    expect(result.problems[4]).toContain('does not say which team and picture it is')
  })

  it('keeps what fits when the ROM has no room for all of it', () => {
    const project = setup() // packed tight: little room for new banner lettering
    const noisy = (seed: number) => {
      const image = blank(88, 16, [255, 255, 255])
      let state = seed
      for (let i = 0; i < 88 * 16; i++) {
        state = (state * 1103515245 + 12345) >>> 0
        if ((state >>> 16) % 2) image.rgba.set([0, 0, 0], i * 4)
      }
      return image
    }
    const files = [
      { name: '02_Boston_Bruins_menu_logo.png', ...blank(48, 48, [255, 0, 0]) },
      ...[3, 4, 5, 6].map((team) => ({ name: `0${team}_x_menu_banner.png`, ...noisy(team) })),
    ]
    const result = importPictureSet(project, files)
    expect(result.replaced).toContain('Boston Bruins: Menu logo')
    expect(result.problems.length).toBeGreaterThan(0)
    expect(result.problems[0]).toContain('Give the logos and banners more room')
    expect(result.replaced.length + result.problems.length).toBe(5)
    expect(() => buildRom(result.project)).not.toThrow()
    // With room, all of it goes in.
    expect(importPictureSet(expandPictureSpace(project), files)).toMatchObject({ problems: [] })
  })

  it('keeps an untouched part of a banner on the colour it had', () => {
    // Boston's top stripe is black, the same as the frame's inner line. An
    // exported and re-imported banner must not move the frame onto the stripe's
    // colour, or recolouring the stripe would recolour the frame.
    const project = expandPictureSpace(setup())
    const { picture, palette } = currentPicture(project, BOSTON, 'menuBanner')
    expect(palette[1]).toBe(palette[6])
    const rgba = pictureToImage(picture, palette)
    rgba.set([255, 255, 255, 255], (8 * 88 + 5) * 4) // one pixel edited
    const made = withPictureFromImage(project, BOSTON, 'menuBanner', { rgba, width: 88, height: 16 })
    const after = made.graphics.menuBanners[BOSTON]
    expect([...after.pixels].filter((v, i) => v !== picture.pixels[i])).toHaveLength(1)
  })

  it('copies colours and pictures from one team to another', () => {
    const project = expandPictureSpace(setup())
    const result = importTeam(project, project, MONTREAL, BOSTON, { names: false, roster: false, colours: true, pictures: true })
    const reopened = openRom(buildRom(result.project))
    expect(reopened.teams[BOSTON].palette).toEqual(project.teams[MONTREAL].palette)
    expect(reopened.teams[BOSTON].players).toEqual(project.teams[BOSTON].players)
    expect(reopened.teams[BOSTON].names).toEqual(project.teams[BOSTON].names)
    for (const kind of pictureKinds(project)) {
      const [got, want] = [currentPicture(reopened, BOSTON, kind), currentPicture(project, MONTREAL, kind)]
      expect(pictureToImage(got.picture, got.palette), kind).toEqual(pictureToImage(want.picture, want.palette))
    }
    expect(result.notes.every((line) => line.endsWith('brought in.'))).toBe(true)
  })
})

describe.skipIf(!hasLeague)('picture files in the 30-team league ROM', () => {
  const open = () => openRom(new Uint8Array(readFileSync(path(local.league30Rom!))))
  const asFiles = (project: RomProject) =>
    pictureSet(project).map((entry) => ({ name: entry.name, rgba: pictureToImage(entry.picture, entry.palette), width: entry.picture.width, height: entry.picture.height }))

  it('has five pictures a team, and brings an untouched set back unchanged', () => {
    const project = open()
    expect(pictureKinds(project)).toEqual(['rinkLogo', 'menuLogo', 'menuBanner', 'visitorBanner', 'gameBanner'])
    // Its home and visitor menu banners are one each for all 30 teams.
    const files = asFiles(project)
    expect(files).toHaveLength(30 * 3 + 2)
    expect(importPictureSet(project, files)).toMatchObject({ replaced: [], unchanged: 92, problems: [] })
  })

  it('replaces a banner every team shares when one team\'s file for it is changed', () => {
    const project = open()
    const files = asFiles(project)
    const file = files.find((f) => f.name.endsWith('_visitor_banner.png'))!
    expect(file.name.startsWith('01_')).toBe(true)
    for (let i = 0; i < 88 * 16; i++) file.rgba.set([255, 255, 255, 255], i * 4)
    const result = importPictureSet(project, files)
    expect(result.replaced).toHaveLength(1)
    expect(result.problems).toEqual([])
    const reopened = openRom(buildRom(result.project))
    expect(banner(reopened, 'visitor', 0)).toEqual(banner(reopened, 'visitor', 29))
    expect(new Set(banner(reopened, 'visitor', 17).pixels).size).toBe(1)
    expect(banner(reopened, 'menu', 17)).toEqual(banner(project, 'menu', 17))
  })

  it('letters a banner for each team once the banners have room', () => {
    const project = expandPictureSpace(open())
    const made = letterBanner(project, 'visitor', 3, 'Away Team')
    expect([...new Set(made.pixels)].sort()).toEqual([1, 2, 5, 6])
    const game = letterBanner(project, 'game', 3, 'Away Team')
    expect(new Set(game.pixels).size).toBeGreaterThanOrEqual(4)
  })
})
