import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  banner,
  bannerColors,
  menuLogo,
  menuLogoFromImage,
  menuLogoPalette,
  menuLogoStart,
  menuPalette,
  rinkLogo,
  withBanner,
  withBannerColors,
  withRinkLogo,
  type Picture,
} from '../src/core/graphics'
import {
  pictureChanged,
  resetPicture,
  resetSettingsPart,
  resetTeam,
  resetTeamPart,
  settingsPartChanged,
  teamChanged,
  teamPartChanged,
  type TeamPart,
} from '../src/core/reset'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { deletePlayer } from '../src/core/roster'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const setup = () => openRom(new Uint8Array(readFileSync(romPath)))

const BOSTON = 1
const ALL_STARS_EAST = 26
const plain = (width: number, height: number, color: number): Picture => ({ width, height, pixels: new Uint8Array(width * height).fill(color) })
const withTeam = (project: RomProject, index: number, team: RomProject['teams'][number]): RomProject => ({
  ...project,
  teams: project.teams.map((t, i) => (i === index ? team : t)),
})

describe.skipIf(!hasRom)('resetting parts of the work', () => {
  it('puts back one part of a team and leaves the others as edited', () => {
    const original = setup()
    const before = original.teams[BOSTON]
    let team = deletePlayer(before, 5)
    team = {
      ...team,
      names: ['Somewhere', 'SMW', 'Somethings', 'Some Arena'],
      lines: team.lines.map((line, i) => (i === 0 ? [1, 3, 4, 5, 6, 7, 8, line[7]] : line)),
      palette: team.palette.map((word, i) => (i === 2 ? 0x0e00 : i === 20 ? 0x000e : word)),
    }
    const parts: TeamPart[] = ['names', 'roster', 'lines', 'home', 'away']
    for (const part of parts) expect(teamPartChanged(team, before, part)).toBe(true)

    for (const part of parts) {
      const reset = resetTeamPart(team, before, part)
      expect(teamPartChanged(reset, before, part)).toBe(false)
      for (const other of parts.filter((p) => p !== part)) expect(teamPartChanged(reset, before, other)).toBe(true)
    }
    // With every part reset the ROM is rebuilt exactly as it was opened.
    const all = parts.reduce((t, part) => resetTeamPart(t, before, part), team)
    expect(buildRom(withTeam(original, BOSTON, all))).toEqual(buildRom(original))
  })

  it('puts back one picture, for every team that shares it', () => {
    const original = setup()
    let project: RomProject = { ...original, graphics: withRinkLogo(original, ALL_STARS_EAST, plain(48, 32, 3)) }
    project = { ...project, graphics: withBanner(project, 'menu', BOSTON, plain(88, 16, 5)) }
    project = { ...project, graphics: withBanner(project, 'game', BOSTON, plain(88, 16, 6)) }
    expect(pictureChanged(project, ALL_STARS_EAST + 1, 'rinkLogo')).toBe(true)
    expect(pictureChanged(project, BOSTON, 'rinkLogo')).toBe(false)

    const logoBack = { ...project, graphics: resetPicture(project, ALL_STARS_EAST + 1, 'rinkLogo') }
    expect(rinkLogo(logoBack, ALL_STARS_EAST)).toEqual(rinkLogo(original, ALL_STARS_EAST))
    expect(pictureChanged(logoBack, BOSTON, 'menuBanner')).toBe(true)

    const bannerBack = { ...logoBack, graphics: resetPicture(logoBack, BOSTON, 'menuBanner') }
    expect(banner(bannerBack, 'menu', BOSTON)).toEqual(banner(original, 'menu', BOSTON))
    expect(banner(bannerBack, 'game', BOSTON)).toEqual(plain(88, 16, 6))
    expect(pictureChanged(bannerBack, BOSTON, 'visitorBanner')).toBe(false)
  })

  it('keeps a menu logo and the banner colours apart though they share a palette', () => {
    const original = setup()
    const rgba = new Uint8Array(48 * 48 * 4).fill(255)
    for (let i = 0; i < 48 * 20; i++) rgba.set([255, 0, 0], i * 4)
    const logo = menuLogoFromImage(rgba, 48, 48, menuLogoStart(original, BOSTON))
    const stripes = [0x0e00, 0x00e0]
    const project: RomProject = {
      ...original,
      graphics: {
        ...original.graphics,
        menuLogos: { [BOSTON]: logo.picture },
        menuPalettes: { [BOSTON]: withBannerColors(logo.palette, stripes) },
      },
    }
    expect(pictureChanged(project, BOSTON, 'menuLogo')).toBe(true)
    expect(pictureChanged(project, BOSTON, 'bannerColors')).toBe(true)

    // The logo goes back; the banner colours stay as chosen.
    const logoBack = openRom(buildRom({ ...project, graphics: resetPicture(project, BOSTON, 'menuLogo') }))
    expect(menuLogo(logoBack, BOSTON)).toEqual(menuLogo(original, BOSTON))
    expect(menuLogoPalette(logoBack, BOSTON)).toEqual(menuLogoPalette(original, BOSTON))
    expect(bannerColors(logoBack, BOSTON)).toEqual(stripes)

    // The banner colours go back; the logo stays as imported.
    const coloursBack = openRom(buildRom({ ...project, graphics: resetPicture(project, BOSTON, 'bannerColors') }))
    expect(bannerColors(coloursBack, BOSTON)).toEqual(bannerColors(original, BOSTON))
    expect(menuLogo(coloursBack, BOSTON)).toEqual(logo.picture)
    expect(menuLogoPalette(coloursBack, BOSTON).slice(5)).toEqual(logo.palette.slice(5, 16))

    // Both back leaves nothing recorded for the team at all.
    const both = { ...project, graphics: resetPicture(project, BOSTON, 'menuLogo') }
    const none = resetPicture(both, BOSTON, 'bannerColors')
    expect(none.menuPalettes).toEqual({})
    expect(menuPalette({ ...original, graphics: none }, BOSTON)).toEqual(menuPalette(original, BOSTON))
  })

  it('resets a whole team and nothing else', () => {
    const original = setup()
    let project = withTeam(original, BOSTON, { ...deletePlayer(original.teams[BOSTON], 5), names: ['A', 'B', 'C', 'D'] })
    project = withTeam(project, 0, { ...project.teams[0], names: ['Kept', 'KPT', 'Keepers', 'Kept Arena'] })
    project = { ...project, graphics: withBanner(project, 'game', BOSTON, plain(88, 16, 6)) }
    project = { ...project, graphics: withBanner(project, 'game', 0, plain(88, 16, 7)) }
    project = { ...project, graphics: { ...project.graphics, menuPalettes: { [BOSTON]: withBannerColors(menuPalette(project, BOSTON), [1, 2]) } } }
    expect(teamChanged(project, original, BOSTON)).toBe(true)
    expect(teamChanged(project, original, 5)).toBe(false)

    const reset = resetTeam(project, original, BOSTON)
    expect(teamChanged(reset, original, BOSTON)).toBe(false)
    expect(teamChanged(reset, original, 0)).toBe(true)
    expect(reset.teams[0].names[0]).toBe('Kept')
    expect(banner(reset, 'game', 0)).toEqual(plain(88, 16, 7))
    // Putting the other team back as well leaves the ROM exactly as opened.
    expect(buildRom(resetTeam(reset, original, 0))).toEqual(buildRom(original))
  })

  it('resets game settings a section at a time', () => {
    const original = setup().settings
    const edited = {
      ...original,
      overtimeSeconds: original.overtimeSeconds + 60,
      playoffDraws: original.playoffDraws.map((draw, i) => (i === 0 ? draw.slice().reverse() : draw)),
    }
    expect(settingsPartChanged(edited, original, 'clock')).toBe(true)
    expect(settingsPartChanged(edited, original, 'playoffDraws')).toBe(true)
    expect(settingsPartChanged(edited, original, 'rules')).toBe(false)
    const reset = resetSettingsPart(edited, original, 'clock')
    expect(reset.overtimeSeconds).toBe(original.overtimeSeconds)
    expect(settingsPartChanged(reset, original, 'playoffDraws')).toBe(true)
    expect(resetSettingsPart(reset, original, 'playoffDraws')).toEqual(original)
  })
})
