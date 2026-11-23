import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { expandTeamSpace } from '../src/core/expand'
import { banner, bannerColors, expandPictureSpace, menuLogo, menuPalette, pictureSpace, withBanner, withBannerColors } from '../src/core/graphics'
import { openProjectFile, saveProjectFile } from '../src/core/projectfile'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { addPlayer, deleteGoalie, transferPlayers } from '../src/core/roster'
import { goalieCount } from '../src/core/team'
import { FREE_AGENTS, linePositionsLost, trade, tradeSummary } from '../src/core/trade'
import { expectSameBytes } from './samebytes'

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
  it('swaps skaters between two teams, each keeping the role they had', () => {
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

  it('swaps goalies one for one, in place', () => {
    const project = roomy()
    const [mine, theirs] = [names(project, BOSTON)[0], names(project, MONTREAL)[1]]
    const after = trade(project, { team: BOSTON, picks: [0] }, { team: MONTREAL, picks: [1] })
    expect(names(after, BOSTON)[0]).toBe(theirs)
    expect(names(after, MONTREAL)[1]).toBe(mine)
    expect(after.teams[BOSTON].goalieNibbles).toEqual(project.teams[BOSTON].goalieNibbles)
    expect(after.teams[BOSTON].lines).toEqual(project.teams[BOSTON].lines)
  })

  it('trades a goalie for a skater: one team a goalie fewer, the other one more, lines kept on the same people', () => {
    const project = roomy()
    const [boston, montreal] = [project.teams[BOSTON], project.teams[MONTREAL]]
    const [starter, backup] = [boston.players[0].name, boston.players[1].name]
    const skater = montreal.players[goalieCount(montreal)].name
    const after = trade(project, { team: BOSTON, picks: [0] }, { team: MONTREAL, picks: [goalieCount(montreal)] })
    const [b, m] = [after.teams[BOSTON], after.teams[MONTREAL]]
    expect(goalieCount(b)).toBe(goalieCount(boston) - 1)
    expect(goalieCount(m)).toBe(goalieCount(montreal) + 1)
    expect(b.players[0].name).toBe(backup)
    expect(names(after, BOSTON)).toContain(skater)
    // The new goalie goes after Montreal's; the skater who left is gone.
    expect(m.players[goalieCount(montreal)].name).toBe(starter)
    expect(names(after, MONTREAL)).not.toContain(skater)
    // Boston's lines: where the starter was, the backup; everyone else as they were.
    const before = lineNames(project, BOSTON)
    lineNames(after, BOSTON).forEach((line, l) =>
      line.forEach((name, slot) => {
        if (slot === 0) expect(name).toBe(before[l][0] === starter ? backup : before[l][0])
        else if (before[l][slot] !== undefined && names(after, BOSTON).includes(before[l][slot]!)) expect(name).toBe(before[l][slot])
      }),
    )
    // Montreal's lines keep their goalies and every skater still there.
    const mBefore = lineNames(project, MONTREAL)
    lineNames(after, MONTREAL).forEach((line, l) =>
      line.forEach((name, slot) => {
        if (mBefore[l][slot] !== undefined && mBefore[l][slot] !== skater) expect(name).toBe(mBefore[l][slot])
      }),
    )
    // The ROM keeps it all.
    const again = openRom(buildRom(after))
    expect(goalieCount(again.teams[BOSTON])).toBe(goalieCount(b))
    expect(goalieCount(again.teams[MONTREAL])).toBe(goalieCount(m))
    expect(again.teams[MONTREAL].players[goalieCount(montreal)].name).toBe(starter)
    expect(checkProject(after).filter((f) => f.level === 'problem')).toEqual([])
  })

  it('moves a goalie to another team with Move selected to, within the goalie limits', () => {
    const project = roomy()
    const [boston, ducks] = [project.teams[BOSTON], project.teams[ANAHEIM]]
    const [starter, backup] = [boston.players[0].name, boston.players[1].name]
    const skater = boston.players[goalieCount(boston)].name
    const teams = transferPlayers(project.teams, BOSTON, [0, goalieCount(boston)], ANAHEIM)
    const [b, m] = [teams[BOSTON], teams[ANAHEIM]]
    expect(goalieCount(b)).toBe(goalieCount(boston) - 1)
    expect(b.players[0].name).toBe(backup)
    expect(goalieCount(m)).toBe(goalieCount(ducks) + 1)
    expect(m.players[goalieCount(ducks)].name).toBe(starter)
    expect(m.players.map((p) => p.name)).toContain(skater)
    expect(m.players).toHaveLength(ducks.players.length + 2)
    // Boston's lines: the backup where the starter was.
    const before = lineNames(project, BOSTON)
    lineNames({ ...project, teams }, BOSTON).forEach((line, l) => expect(line[0]).toBe(before[l][0] === starter ? backup : before[l][0]))
    expect(goalieCount(openRom(buildRom({ ...project, teams })).teams[ANAHEIM])).toBe(goalieCount(m))
    // Not the last goalie, nor a fifth.
    expect(() => transferPlayers(teams, BOSTON, [0], ANAHEIM)).toThrow('A team needs at least one goalie, so that many cannot leave.')
    const four = transferPlayers(teams, MONTREAL, [0], ANAHEIM)
    expect(goalieCount(four[ANAHEIM])).toBe(4)
    expect(() => transferPlayers(four, 2, [0], ANAHEIM)).toThrow('The other team would have more than 4 goalies.')
  })

  it("counts a goalie's line positions as lost when no goalie comes back, and leaves a roster alone for a goalie not on it", () => {
    const project = roomy()
    const boston = project.teams[BOSTON]
    const starts = boston.lines.filter((line) => line[0] === 1).length
    expect(starts).toBeGreaterThan(0)
    const skater = { team: MONTREAL, picks: [goalieCount(project.teams[MONTREAL])] }
    expect(linePositionsLost(project, { team: BOSTON, picks: [0] }, skater)).toBe(starts)
    // Goalie for goalie: the one who arrives takes the lines.
    expect(linePositionsLost(project, { team: BOSTON, picks: [0] }, { team: MONTREAL, picks: [0] })).toBe(0)
    expect(deleteGoalie(boston, -1)).toBe(boston)
  })

  it('keeps every team 1 to 4 goalies', () => {
    const project = roomy()
    const ducks = project.teams[ANAHEIM]
    expect(goalieCount(ducks)).toBe(2)
    // Anaheim's two goalies both leave, and nobody comes back in goal.
    expect(() => trade(project, { team: ANAHEIM, picks: [0, 1] }, { team: BOSTON, picks: [] })).toThrow(
      /Anaheim Mighty Ducks would have no goalie, and a team needs at least one/,
    )
    // One goalie at a time for a skater: three, four, and not five.
    const three = trade(project, { team: BOSTON, picks: [0] }, { team: ANAHEIM, picks: [2] })
    const four = trade(three, { team: MONTREAL, picks: [0] }, { team: ANAHEIM, picks: [3] })
    expect(goalieCount(four.teams[ANAHEIM])).toBe(4)
    expect(() => trade(four, { team: 2, picks: [0] }, { team: ANAHEIM, picks: [4] })).toThrow(/Anaheim Mighty Ducks would have 5 goalies, and a team can have 4/)
  })

  it('says why a trade cannot be made', () => {
    const project = roomy()
    expect(() => trade(project, { team: BOSTON, picks: [5] }, { team: BOSTON, picks: [6] })).toThrow('Choose two different sides')
    expect(() => trade(project, { team: BOSTON, picks: [] }, { team: MONTREAL, picks: [] })).toThrow('Select the players to trade first.')
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
    // Released on their own, the team keeps its other goalie.
    const released = trade(project, { team: BOSTON, picks: [0] }, { team: FREE_AGENTS, picks: [] })
    expect(goalieCount(released.teams[BOSTON])).toBe(goalieCount(project.teams[BOSTON]) - 1)
    expect(released.freeAgents).toEqual([{ player: project.teams[BOSTON].players[0], role: 'G' }])
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
    expectSameBytes(buildRom(opened.project), buildRom(project))
    // The room that had been made is made again.
    expect(pictureSpace(opened.project)).toBeNull()
    expect(opened.project.bytes.length).toBe(project.bytes.length)
    expect(opened.project.freeAgents).toHaveLength(1)
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
