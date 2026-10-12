import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { expandTeamSpace } from '../src/core/expand'
import { banner, bannerColors, expandPictureSpace, menuLogo, menuPalette, pictureSpace, withBanner, withBannerColors } from '../src/core/graphics'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { addPlayer } from '../src/core/roster'
import { goalieCount } from '../src/core/team'
import { FREE_AGENTS, linePositionsLost, trade, tradeSummary } from '../src/core/trade'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const hasRom = existsSync(romPath)
const setup = () => openRom(new Uint8Array(readFileSync(romPath)))
// With room for rosters to grow.
const roomy = () => expandTeamSpace(setup())

const ANAHEIM = 0 // 18 players, 2 goalies
const BOSTON = 1 // 25 players
const MONTREAL = 11
const names = (project: RomProject, team: number) => project.teams[team].players.map((p) => p.name)
const lineNames = (project: RomProject, team: number) =>
  project.teams[team].lines.map((line) => line.slice(0, 7).map((position) => project.teams[team].players[position - 1]?.name))

describe.skipIf(!hasRom)('trading players', () => {
  it('swaps skaters between two teams, each keeping the role he had', () => {
    const project = roomy()
    const [g, f] = [goalieCount(project.teams[BOSTON]), project.teams[BOSTON].forwards]
    const forward = g // Boston's first forward
    const defender = g + f // and first defenceman
    const theirs = goalieCount(project.teams[ANAHEIM]) + 1
    const [a, b, c] = [names(project, BOSTON)[forward], names(project, BOSTON)[defender], names(project, ANAHEIM)[theirs]]

    const after = trade(project, { team: BOSTON, picks: [forward, defender] }, { team: ANAHEIM, picks: [theirs] })
    expect(names(after, BOSTON)).toContain(c)
    expect(names(after, BOSTON)).not.toContain(a)
    expect(names(after, ANAHEIM)).toEqual(expect.arrayContaining([a, b]))
    expect(after.teams[BOSTON].players).toHaveLength(24)
    expect(after.teams[ANAHEIM].players).toHaveLength(19)
    // A forward arrives among the forwards, a defenceman among the defence.
    const mighty = after.teams[ANAHEIM]
    const forwards = mighty.players.slice(goalieCount(mighty), goalieCount(mighty) + mighty.forwards).map((p) => p.name)
    expect(forwards).toContain(a)
    expect(forwards).not.toContain(b)
    expect(mighty.forwards + mighty.defense + goalieCount(mighty)).toBe(19)
    // Nobody else moved, and the ROM is sound.
    expect(after.teams[MONTREAL]).toBe(project.teams[MONTREAL])
    expect(checkProject(after).filter((x) => x.level === 'problem')).toEqual([])
    expect(openRom(buildRom(after)).teams.map((t) => t.players)).toEqual(after.teams.map((t) => t.players))
    expect(tradeSummary(project, { team: BOSTON, picks: [forward] }, { team: ANAHEIM, picks: [] })).toBe(`Boston Bruins give ${a}; Anaheim Mighty Ducks give nobody.`)
  })

  it('keeps lines pointing at the players who stay', () => {
    const project = roomy()
    const last = project.teams[BOSTON].players.length - 1
    const kept = lineNames(project, MONTREAL)
    const after = trade(project, { team: BOSTON, picks: [last] }, { team: MONTREAL, picks: [goalieCount(project.teams[MONTREAL])] })
    const gone = project.teams[MONTREAL].players[goalieCount(project.teams[MONTREAL])].name
    lineNames(after, MONTREAL).forEach((line, l) => line.forEach((name, slot) => kept[l][slot] !== gone && expect(name).toBe(kept[l][slot])))
    expect(linePositionsLost(project, { team: MONTREAL, picks: [goalieCount(project.teams[MONTREAL])] })).toBeGreaterThan(0)
    expect(linePositionsLost(project, { team: BOSTON, picks: [] })).toBe(0)
  })

  it('trades one for one between two full rosters', () => {
    let project = roomy()
    for (const team of [BOSTON, MONTREAL]) {
      let full = project.teams[team]
      while (full.players.length < 26) full = addPlayer(full)
      project = { ...project, teams: project.teams.map((t, i) => (i === team ? full : t)) }
    }
    const [x, y] = [names(project, BOSTON)[5], names(project, MONTREAL)[6]]
    const after = trade(project, { team: BOSTON, picks: [5] }, { team: MONTREAL, picks: [6] })
    expect(after.teams[BOSTON].players).toHaveLength(26)
    expect(names(after, BOSTON)).toContain(y)
    expect(names(after, MONTREAL)).toContain(x)
    // Two for one would put a 27th player on a team.
    expect(() => trade(project, { team: BOSTON, picks: [5, 6] }, { team: MONTREAL, picks: [6] })).toThrow('Montreal Canadiens would have 27 players, and a team can hold 26.')
  })

  it('swaps goalies one for one, in place, and refuses any other goalie move', () => {
    const project = roomy()
    const [mine, theirs] = [names(project, BOSTON)[0], names(project, MONTREAL)[1]]
    const after = trade(project, { team: BOSTON, picks: [0] }, { team: MONTREAL, picks: [1] })
    expect(names(after, BOSTON)[0]).toBe(theirs)
    expect(names(after, MONTREAL)[1]).toBe(mine)
    expect(after.teams[BOSTON].goalieNibbles).toEqual(project.teams[BOSTON].goalieNibbles)
    expect(after.teams[BOSTON].lines).toEqual(project.teams[BOSTON].lines)
    expect(() => trade(project, { team: BOSTON, picks: [0] }, { team: MONTREAL, picks: [5] })).toThrow(/Goalies change places one for one/)
    expect(() => trade(project, { team: BOSTON, picks: [0] }, { team: MONTREAL, picks: [] })).toThrow(/Goalies change places one for one/)
  })

  it('says why a trade cannot be made', () => {
    const project = roomy()
    expect(() => trade(project, { team: BOSTON, picks: [5] }, { team: BOSTON, picks: [6] })).toThrow('Choose two different sides')
    expect(() => trade(project, { team: BOSTON, picks: [] }, { team: MONTREAL, picks: [] })).toThrow('Tick the players to trade first.')
    const skaters = project.teams[ANAHEIM].players.map((_, i) => i).slice(2)
    expect(() => trade(project, { team: ANAHEIM, picks: skaters.slice(0, 14) }, { team: BOSTON, picks: [] })).toThrow(/would have \d+ players, and a team needs at least 5/)
  })
})

describe.skipIf(!hasRom)('free agents', () => {
  it('holds released players off every team, and signs them again', () => {
    const project = roomy()
    const [released, other] = [names(project, BOSTON)[4], names(project, BOSTON)[20]]
    const without = trade(project, { team: BOSTON, picks: [4, 20] }, { team: FREE_AGENTS, picks: [] })
    expect(without.teams[BOSTON].players).toHaveLength(23)
    expect(without.freeAgents.map((agent) => [agent.player.name, agent.role])).toEqual([[released, 'F'], [other, 'D']])
    // They are not in the ROM, which the checker mentions, without calling it a problem.
    const findings = checkProject(without).filter((x) => x.where === 'Free agents')
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ level: 'note' })
    expect(findings[0].message).toContain('2 free agents are not on any team')
    expect(openRom(buildRom(without)).teams[BOSTON].players).toHaveLength(23)

    const signed = trade(without, { team: FREE_AGENTS, picks: [1] }, { team: ANAHEIM, picks: [] })
    expect(names(signed, ANAHEIM)).toContain(other)
    expect(signed.freeAgents.map((agent) => agent.player.name)).toEqual([released])
    const ducks = signed.teams[ANAHEIM]
    expect(ducks.players[ducks.players.length - 1].name).toBe(other) // a defenceman, so at the end
  })

  it('swaps a goalie with one of the free agents', () => {
    const project = roomy()
    const starter = names(project, BOSTON)[0]
    // Nobody to swap with yet.
    expect(() => trade(project, { team: BOSTON, picks: [0] }, { team: FREE_AGENTS, picks: [] })).toThrow(/Goalies change places one for one/)
    const pool: RomProject = { ...project, freeAgents: [{ player: { name: 'Spare Goalie', jersey: 0x35, attributes: new Array<number>(14).fill(3) }, role: 'G' }] }
    const after = trade(pool, { team: BOSTON, picks: [0] }, { team: FREE_AGENTS, picks: [0] })
    expect(names(after, BOSTON)[0]).toBe('Spare Goalie')
    expect(after.freeAgents).toEqual([{ player: project.teams[BOSTON].players[0], role: 'G' }])
    expect(after.freeAgents[0].player.name).toBe(starter)
  })
})

describe.skipIf(!hasRom)('project files', () => {
  const edited = (): RomProject => {
    let project = expandPictureSpace(roomy())
    project = trade(project, { team: BOSTON, picks: [4] }, { team: FREE_AGENTS, picks: [] })
    const teams = project.teams.map((team, i) =>
      i === MONTREAL ? { ...team, names: ['Laval', 'LAV', 'Rocket', 'Place Bell'], palette: team.palette.map((w, c) => (c === 3 ? 0x0e00 : w)) } : team,
    )
    project = { ...project, teams, rinkPalette: project.rinkPalette.map((w, i) => (i === 2 ? 0x00e0 : w)) }
    project = { ...project, settings: { ...project.settings, overtimeSeconds: 240, playoffDraws: project.settings.playoffDraws.map((d, i) => (i === 0 ? d.slice().reverse() : d)) } }
    const flat = { width: 88, height: 16, pixels: new Uint8Array(88 * 16).fill(5) }
    project = { ...project, graphics: withBanner(project, 'menu', BOSTON, flat) }
    return { ...project, graphics: { ...project.graphics, menuPalettes: { [BOSTON]: withBannerColors(menuPalette(project, BOSTON), [0x000e, 0x0e00]) } } }
  }
  const state = (p: RomProject) => ({ teams: p.teams, rink: p.rinkPalette, settings: p.settings, graphics: p.graphics, freeAgents: p.freeAgents })

  it('puts everything back on the same ROM, exactly', () => {
    const project = edited()
    const text = saveProjectFile(project, setup(), 'Season_10')
    expect(text).not.toContain('SEGA') // none of the ROM is in it
    expect(text.length).toBeLessThan(400_000)

    const opened = openProjectFile(setup(), text)
    expect(opened.name).toBe('Season_10')
    expect(opened.notes).toEqual([])
    expect(state(opened.project)).toEqual(state(project))
    expect(buildRom(opened.project)).toEqual(buildRom(project))
    // The room that had been made is made again.
    expect(pictureSpace(opened.project)).toBeNull()
    expect(opened.project.bytes.length).toBe(project.bytes.length)
    expect(opened.project.freeAgents).toHaveLength(1)
  })

  it('saves and opens a project with no changes at all', () => {
    const project = setup()
    const opened = openProjectFile(setup(), saveProjectFile(project, setup(), 'plain'))
    expect(opened.notes).toEqual([])
    expect(buildRom(opened.project)).toEqual(buildRom(project))
    expect(opened.project.bytes.length).toBe(0x100000)
  })

  it('carries the work to another copy of the game', () => {
    // The other copy: the same game with different rosters and colours.
    const other = (() => {
      const base = roomy()
      const teams = base.teams.map((team) => ({ ...team, players: team.players.map((p) => ({ ...p, name: p.name.replace(/^./, "X") })) }))
      return openRom(buildRom({ ...base, teams }))
    })()
    const project = edited()
    const opened = openProjectFile(other, saveProjectFile(project, setup(), 'Season_10'))
    expect(opened.notes).toEqual([])
    expect(opened.project.teams.map((t) => t.players)).toEqual(project.teams.map((t) => t.players))
    expect(opened.project.teams[MONTREAL].names).toEqual(['Laval', 'LAV', 'Rocket', 'Place Bell'])
    const reopened = openRom(buildRom(opened.project))
    expect(banner(reopened, 'menu', BOSTON)).toEqual(banner(project, 'menu', BOSTON))
    expect(bannerColors(reopened, BOSTON)).toEqual([0x000e, 0x0e00])
    expect(menuLogo(reopened, MONTREAL)).toEqual(menuLogo(other, MONTREAL))
    expect(reopened.settings.overtimeSeconds).toBe(240)
  })

  it('refuses files that are not projects, or are for another kind of ROM', () => {
    const base = setup()
    expect(() => openProjectFile(base, 'hello')).toThrow('This is not a project file.')
    expect(() => openProjectFile(base, '{"teams":[]}')).toThrow('This is not a project file.')
    const file = JSON.parse(saveProjectFile(base, base, 'x'))
    expect(() => openProjectFile(base, JSON.stringify({ ...file, productCode: 'GM T-50656 -30', game: 'NHL 94 (30 teams)' }))).toThrow(
      'This project is for NHL 94 (30 teams), and the ROM in the editor is NHL 94.',
    )
    expect(() => openProjectFile(base, JSON.stringify({ ...file, teams: file.teams.slice(1) }))).toThrow('This project has 27 teams and the ROM has 28.')
    const broken = { ...file, teams: file.teams.map((t: { players: unknown[] }, i: number) => (i === 2 ? { ...t, players: [{ name: 5 }] } : t)) }
    expect(() => openProjectFile(base, JSON.stringify(broken))).toThrow('The project file is damaged: team 3 cannot be read.')
    expect(() => openProjectFile(base, JSON.stringify({ ...file, format: 99 }))).toThrow(/newer version of the editor/)
  })

  it('leaves out what does not fit and says so', () => {
    const base = setup()
    const file = JSON.parse(saveProjectFile(edited(), base, 'x'))
    // A picture of the wrong size, and settings of the wrong shape.
    file.pictures.menuLogos = { 3: { width: 8, height: 8, pixels: btoa('abc') } }
    file.settings.rules = []
    const opened = openProjectFile(base, JSON.stringify(file))
    expect(opened.notes).toHaveLength(2)
    expect(opened.notes[0]).toContain('game settings in the file do not match this ROM')
    expect(opened.notes[1]).toContain("1 of the project's pictures")
    expect(opened.project.settings).toEqual(base.settings)
    expect(opened.project.graphics.menuLogos).toEqual({})
    expect(Object.keys(opened.project.graphics.menuBanners)).toEqual([String(BOSTON)])
    expect(() => buildRom(opened.project)).not.toThrow()
  })
})
