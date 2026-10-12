import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { applyBulk, bulkAttributes, bulkValues, previewBulk, type BulkChange } from '../src/core/bulk'
import { banner, bannerColors, menuLogo, menuLogoPalette, pictureToImage, rinkLogo, expandPictureSpace } from '../src/core/graphics'
import { ALL_PARTS, importTeam } from '../src/core/importteam'
import { findPlayers, leagueAverages, leaguePlayers, teamSummaries } from '../src/core/league'
import { overallRating } from '../src/core/rating'
import { changeReport, reportIsEmpty, reportText } from '../src/core/report'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { transferPlayers } from '../src/core/roster'
import { expandTeamSpace } from '../src/core/expand'
import { goalieCount } from '../src/core/team'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const hasRom = existsSync(path('nhl94.bin'))
const setup = () => openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))
const localPath = fileURLToPath(new URL('./local.json', import.meta.url))
const local: { league30Rom?: string } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const hasLeague = !!local.league30Rom && existsSync(path(local.league30Rom))

const MONTREAL = 11
const BOSTON = 1
const everyone: BulkChange = { group: 'skaters', team: null, attribute: 2, action: 'raise', amount: 1, overallAtLeast: null, overallAtMost: null }
const withPlayer = (project: RomProject, team: number, index: number, change: (attributes: number[]) => number[]): RomProject => ({
  ...project,
  teams: project.teams.map((t, i) =>
    i === team ? { ...t, players: t.players.map((p, j) => (j === index ? { ...p, attributes: change(p.attributes) } : p)) } : t,
  ),
})

describe.skipIf(!hasRom)('looking across the league', () => {
  it('finds players on any team by part of their name', () => {
    const project = setup()
    const roy = findPlayers(project, 'roy')
    expect(roy.map((p) => p.player.name)).toContain('Patrick Roy')
    const exact = findPlayers(project, 'ROY patrick')
    // He is on Montreal and on an All Stars team.
    expect(exact.map((p) => p.player.name)).toEqual(['Patrick Roy', 'Patrick Roy'])
    expect(exact[0]).toMatchObject({ team: MONTREAL, role: 'G' })
    expect(exact[0].overall).toBe(overallRating(exact[0].player.attributes, true))
    expect(findPlayers(project, '  ')).toEqual([])
    expect(findPlayers(project, 'zzzzqq')).toEqual([])
    expect(leaguePlayers(project)).toHaveLength(project.teams.reduce((sum, t) => sum + t.players.length, 0))
  })

  it('summarises each team, rating the first line apart from the rest', () => {
    const project = setup()
    const summaries = teamSummaries(project)
    expect(summaries).toHaveLength(28)
    const team = project.teams[MONTREAL]
    const summary = summaries[MONTREAL]
    expect(summary.players).toBe(team.players.length)
    expect(summary.goalies).toBe(goalieCount(team))
    const overall = (position: number) => overallRating(team.players[position - 1].attributes, position <= goalieCount(team))
    const line = team.lines[0]
    expect(summary.startingGoalie).toBe(overall(line[0]))
    expect(summary.startingSkaters).toBeCloseTo([1, 2, 3, 4, 5].reduce((sum, slot) => sum + overall(line[slot]), 0) / 5)
    expect(summary.bestGoalie).toBeGreaterThanOrEqual(summary.startingGoalie!)
    for (const s of summaries) {
      expect(s.startingSkaters).toBeGreaterThan(40)
      expect(s.skaters).toBeLessThanOrEqual(100)
    }
    const averages = leagueAverages(summaries)
    expect(averages.players).toBeCloseTo(summaries.reduce((sum, s) => sum + s.players, 0) / 28)

    // Changing who is on the first line changes its rating and nothing else.
    const swapped = { ...team, lines: team.lines.map((l, i) => (i === 0 ? l.map((v, slot) => (slot === 4 ? team.players.length : v)) : l)) }
    const after = teamSummaries({ ...project, teams: project.teams.map((t, i) => (i === MONTREAL ? swapped : t)) })[MONTREAL]
    expect(after.startingSkaters).not.toBe(summary.startingSkaters)
    expect(after.skaters).toBe(summary.skaters)
  })
})

describe.skipIf(!hasRom)('bulk changes', () => {
  it('offers only attributes on a scale, with the values each can take', () => {
    const project = setup()
    const skater = bulkAttributes(project.game, 'skaters').map((a) => a.name)
    expect(skater).toContain('Speed')
    expect(skater).toContain('Weight')
    expect(skater).not.toContain('Handed/Fighting')
    const goalie = bulkAttributes(project.game, 'goalies').map((a) => a.name)
    expect(goalie).toContain('Glove Left')
    expect(goalie).not.toContain('Leave at Zero')
    expect(goalie).not.toContain('Glove Hand')
    expect(bulkValues('rating').map((v) => v.value)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(bulkValues('weight')).toHaveLength(16)
  })

  it('previews exactly what applying then does, stopping at the top of the range', () => {
    const project = setup()
    const effects = previewBulk(project, everyone)
    const skaters = leaguePlayers(project).filter((p) => p.role !== 'G')
    const atTop = skaters.filter((p) => p.player.attributes[2] === 6).length
    expect(atTop).toBeGreaterThan(0)
    expect(effects).toHaveLength(skaters.length - atTop)
    expect(effects.every((e) => e.to === e.from + 1 && e.role !== 'G')).toBe(true)

    const applied = applyBulk(project, everyone)
    for (const effect of effects.slice(0, 50)) {
      const player = applied.teams[effect.team].players[effect.index]
      expect(player.attributes[2]).toBe(effect.to)
      expect(overallRating(player.attributes, false)).toBe(effect.overallTo)
      // Nothing but that one attribute changes.
      const before = project.teams[effect.team].players[effect.index]
      expect(player.attributes.filter((v, i) => v !== before.attributes[i])).toHaveLength(1)
      expect(player.name).toBe(before.name)
    }
    const goalies = (p: RomProject) => leaguePlayers(p).filter((x) => x.role === 'G').map((x) => x.player)
    expect(goalies(applied)).toEqual(goalies(project))
    expect(openRom(buildRom(applied)).teams.map((t) => t.players)).toEqual(applied.teams.map((t) => t.players))
  })

  it('caps, floors, sets, and keeps to one team, one group and an overall range', () => {
    const project = setup()
    const capped = applyBulk(project, { ...everyone, action: 'atMost', amount: 3 })
    expect(Math.max(...leaguePlayers(capped).filter((p) => p.role !== 'G').map((p) => p.player.attributes[2]))).toBe(3)
    const low = leaguePlayers(project).filter((p) => p.role !== 'G' && p.player.attributes[2] < 3)
    for (const p of low) expect(capped.teams[p.team].players[p.index]).toBe(project.teams[p.team].players[p.index])

    const floored = applyBulk(project, { ...everyone, action: 'atLeast', amount: 4 })
    expect(Math.min(...leaguePlayers(floored).filter((p) => p.role !== 'G').map((p) => p.player.attributes[2]))).toBe(4)

    const oneTeam = previewBulk(project, { ...everyone, team: BOSTON, group: 'defence', action: 'set', amount: 0 })
    expect(oneTeam.length).toBeGreaterThan(0)
    expect(oneTeam.every((e) => e.team === BOSTON && e.role === 'D' && e.to === 0)).toBe(true)

    const stars = previewBulk(project, { ...everyone, action: 'lower', overallAtLeast: 90 })
    expect(stars.length).toBeGreaterThan(0)
    expect(stars.every((e) => e.overallFrom >= 90)).toBe(true)
    const others = previewBulk(project, { ...everyone, action: 'lower', overallAtMost: 89 })
    expect(stars.length + others.length).toBe(previewBulk(project, { ...everyone, action: 'lower' }).length)

    // A goalie attribute, lowered past the bottom, stops at the bottom.
    const glove = bulkAttributes(project.game, 'goalies').find((a) => a.name === 'Glove Left')!.index
    const none = applyBulk(project, { ...everyone, group: 'goalies', attribute: glove, action: 'lower', amount: 15 })
    expect(leaguePlayers(none).filter((p) => p.role === 'G').every((p) => p.player.attributes[glove] === 0)).toBe(true)
    expect(applyBulk(none, { ...everyone, group: 'goalies', attribute: glove, action: 'lower', amount: 1 })).toBe(none)
  })
})

describe.skipIf(!hasRom)('the change report', () => {
  it('reports nothing between a ROM and itself', () => {
    const project = setup()
    const report = changeReport(project, project)
    expect(reportIsEmpty(report)).toBe(true)
    expect(reportText(report, 'a', 'b')).toContain('Nothing changed.')
  })

  it('tells moves, arrivals, departures and re-ratings apart', () => {
    const before = setup()
    let after = expandTeamSpace(before)
    const boston = before.teams[BOSTON]
    const skater = goalieCount(boston)
    const moved = boston.players[skater].name
    after = { ...after, teams: transferPlayers(after.teams, BOSTON, [skater], MONTREAL) }
    // One player re-rated, one renamed out of all recognition with new ratings.
    after = withPlayer(after, 0, 3, (a) => a.map((v, i) => (i === 2 ? (v === 6 ? 5 : v + 1) : v)))
    const rerated = after.teams[0].players[3].name
    const gone = after.teams[5].players[6].name
    after = {
      ...after,
      teams: after.teams.map((t, i) =>
        i === 5 ? { ...t, players: t.players.map((p, j) => (j === 6 ? { ...p, name: 'Brand Newman', attributes: p.attributes.map((v) => (v + 1) % 7) } : p)) } : t,
      ),
    }

    const report = changeReport(before, after)
    expect(report.moves).toEqual([expect.objectContaining({ name: moved, from: 'Boston Bruins', to: 'Montreal Canadiens' })])
    expect(report.arrivals.map((a) => a.name)).toEqual(['Brand Newman'])
    expect(report.departures.map((d) => d.name)).toEqual([gone])
    expect(report.reratings.map((r) => r.name)).toEqual([rerated])
    expect(report.reratings[0].to).not.toBe(report.reratings[0].from)

    const text = reportText(report, 'Season_9', 'Season_10')
    expect(text).toContain('Changes from Season_9 to Season_10')
    expect(text).toContain('1 player changed teams, 1 new player, 1 player gone, 1 overall rating changed.')
    expect(text).toContain(`${moved}: Boston Bruins to Montreal Canadiens`)
    expect(text).toContain('EVERYTHING, TEAM BY TEAM')
    expect(text).not.toContain('undefined')
  })

  it('does not call a shared name on two teams a trade', () => {
    const before = setup()
    const rename = (project: RomProject, team: number, index: number, name: string): RomProject => ({
      ...project,
      teams: project.teams.map((t, i) => (i === team ? { ...t, players: t.players.map((p, j) => (j === index ? { ...p, name } : p)) } : t)),
    })
    const twins = rename(rename(before, 2, 4, 'John Smith'), 9, 4, 'John Smith')
    expect(changeReport(twins, twins).moves).toEqual([])
    // Listed in the other order, they are still the same two players staying put.
    const report = changeReport(twins, withPlayer(twins, 9, 4, (a) => a))
    expect(report.moves).toEqual([])
    expect(report.arrivals).toEqual([])
  })
})

describe.skipIf(!hasRom)('importing a team from another ROM', () => {
  it('brings a whole team across, pictures and all', () => {
    const project = setup()
    // The "other" ROM: the same game with Boston much altered.
    let other = setup()
    other = {
      ...other,
      teams: other.teams.map((t, i) =>
        i === BOSTON ? { ...t, names: ['Springfield', 'SPR', 'Atoms', 'The Dome'], palette: t.palette.map((w) => w ^ 0x0e0) } : t,
      ),
    }
    const result = importTeam(project, other, MONTREAL, BOSTON, ALL_PARTS)
    const reopened = openRom(buildRom(expandTeamSpace(expandPictureSpace(result.project))))
    const [got, want] = [reopened.teams[BOSTON], project.teams[MONTREAL]]
    expect(got.names).toEqual(want.names)
    expect(got.players).toEqual(want.players)
    expect(got.lines.map((l) => l.slice(0, 7))).toEqual(want.lines.map((l) => l.slice(0, 7)))
    expect(got.palette).toEqual(want.palette)
    expect([got.forwards, got.defense, got.goalieNibbles]).toEqual([want.forwards, want.defense, want.goalieNibbles])
    expect(rinkLogo(result.project, BOSTON)).toEqual(rinkLogo(project, MONTREAL))
    expect(pictureToImage(menuLogo(result.project, BOSTON), menuLogoPalette(result.project, BOSTON))).toEqual(
      pictureToImage(menuLogo(project, MONTREAL), menuLogoPalette(project, MONTREAL)),
    )
    expect(bannerColors(result.project, BOSTON)).toEqual(bannerColors(project, MONTREAL))
    expect(banner(result.project, 'game', BOSTON)).toEqual(banner(project, 'game', MONTREAL))
    // Other teams are untouched.
    expect(result.project.teams.filter((_, i) => i !== BOSTON)).toEqual(project.teams.filter((_, i) => i !== BOSTON))
    expect(menuLogo(result.project, MONTREAL)).toEqual(menuLogo(project, MONTREAL))
    expect(result.notes.join(' ')).not.toContain('undefined')
  })

  it('brings only the parts asked for', () => {
    const project = setup()
    const other = setup()
    const result = importTeam(project, other, MONTREAL, BOSTON, { names: false, roster: true, colours: false, pictures: false })
    expect(result.project.teams[BOSTON].players).toEqual(project.teams[MONTREAL].players)
    expect(result.project.teams[BOSTON].names).toEqual(project.teams[BOSTON].names)
    expect(result.project.teams[BOSTON].palette).toEqual(project.teams[BOSTON].palette)
    expect(result.project.graphics).toBe(project.graphics)
    expect(result.notes).toHaveLength(1)
    expect(() => importTeam(project, other, 99, BOSTON, ALL_PARTS)).toThrow('That team is not in the ROM.')
  })

  it('says which pictures did not fit and still brings the rest', () => {
    const project = setup()
    const other = setup()
    // Montreal's menu banner over Boston's needs tiles the packed ROM may not have;
    // whatever happens, each picture is reported once and the ROM still builds.
    const result = importTeam(project, other, MONTREAL, BOSTON, { names: false, roster: false, colours: false, pictures: true })
    for (const name of ['Centre-ice logo', 'Menu logo', 'Menu banner colours', 'Menu banner', 'In-game banner']) {
      expect(result.notes.filter((note) => /^(brought in.|left alone:)/.test(note.slice(name.length + 1)) && note.startsWith(name))).toHaveLength(1)
    }
    expect(() => buildRom(result.project)).not.toThrow()
    const roomy = importTeam(expandPictureSpace(project), other, MONTREAL, BOSTON, { names: false, roster: false, colours: false, pictures: true })
    expect(roomy.notes.every((note) => note.endsWith('brought in.'))).toBe(true)
    expect(banner(openRom(buildRom(roomy.project)), 'menu', BOSTON)).toEqual(banner(project, 'menu', MONTREAL))
  })
})

describe.skipIf(!hasRom || !hasLeague)('importing between the original game and the 30-team ROM', () => {
  it('brings a team from one into the other', () => {
    const stock = setup()
    const league = openRom(new Uint8Array(readFileSync(path(local.league30Rom!))))
    const into = importTeam(league, stock, MONTREAL, 29, ALL_PARTS)
    const reopened = openRom(buildRom(into.project))
    expect(reopened.teams[29].players).toEqual(stock.teams[MONTREAL].players)
    expect(reopened.teams[29].names).toEqual(stock.teams[MONTREAL].names)
    expect(rinkLogo(reopened, 29)).toEqual(rinkLogo(stock, MONTREAL))
    expect(pictureToImage(menuLogo(reopened, 29), menuLogoPalette(reopened, 29))).toEqual(
      pictureToImage(menuLogo(stock, MONTREAL), menuLogoPalette(stock, MONTREAL)),
    )
    // Its one-for-all menu banners are not replaced by one team's.
    expect(into.notes.filter((note) => note.includes('every team shows the same one'))).toHaveLength(2)
    expect(banner(reopened, 'menu', 0)).toEqual(banner(league, 'menu', 0))
    expect(reopened.teams.slice(0, 29).map((t) => t.players)).toEqual(league.teams.slice(0, 29).map((t) => t.players))

    const back = importTeam(expandPictureSpace(stock), league, 3, BOSTON, ALL_PARTS)
    const stockAgain = openRom(buildRom(expandTeamSpace(back.project)))
    expect(stockAgain.teams[BOSTON].players).toEqual(league.teams[3].players)
    expect(banner(stockAgain, 'game', BOSTON)).toEqual(banner(league, 'game', 3))
  })
})
