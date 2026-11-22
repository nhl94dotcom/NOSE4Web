import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkProject } from '../src/core/check'
import { NHL94 } from '../src/core/games'
import { overallRating } from '../src/core/rating'
import { buildRom, openRom } from '../src/core/rom'
import {
  applySeason,
  buildSeasonRosters,
  DEFAULT_SEASON_OPTIONS,
  defaultPlacement,
  gameName,
  NAME_ROOM,
  parseSeason,
  rerateByName,
  seasonBuilderSupported,
  type Season,
  type SeasonGoalie,
  type SeasonSkater,
} from '../src/core/seasonbuilder'
import { projectTeamRatings } from '../src/core/ppfix'
import { goalieCount } from '../src/core/team'
import { teamRatings } from '../src/core/teamratings'

const romPath = fileURLToPath(new URL('../../nhl94.bin', import.meta.url))
const seasonsDir = new URL('../public/seasons/', import.meta.url)
const seasonOf = (id: string): Season => parseSeason(JSON.parse(readFileSync(new URL(`${id}.json`, seasonsDir), 'utf8')))

const skater = (first: string, last: string, pos: string, gp: number, g: number, a: number, pim = 20): SeasonSkater => ({
  first, last, pos, number: 10, shoots: 'L', inches: 72, pounds: 190, born: 1965, gp, g, a, pm: 0, pim, shots: g * 8 + 20, ppg: 0, shg: 0, stint: 0,
})
const goalie = (last: string, gp: number, ga: number, sa: number): SeasonGoalie => ({
  first: 'Gord', last, number: 30, catches: 'L', inches: 71, pounds: 180, born: 1963, gp, gs: gp, w: gp / 2, l: gp / 2, t: 0, ga, sa, so: 1, seconds: gp * 3600, stint: 0,
})

// Two small teams: a star and a grinder among them, and a skater traded from one to the other.
function smallSeason(): Season {
  const team = (code: string, n: number) => ({
    code,
    location: `Place ${code}`,
    name: `Team${code}`,
    franchise: null,
    record: [40, 30, 10, 0, 300 - n * 20, 250 + n * 20],
    special: null,
    skaters: [
      ...Array.from({ length: 14 }, (_, i) => skater(`F${code}`, `Forward${i}`, i % 3 === 0 ? 'C' : i % 3 === 1 ? 'L' : 'R', 80 - i, 30 - i * 2, 40 - i * 2)),
      ...Array.from({ length: 8 }, (_, i) => skater(`D${code}`, `Defence${i}`, 'D', 78 - i, 8 - i, 30 - i * 3, 60)),
    ],
    goalies: [goalie(`One${code}`, 60, 180, 1800), goalie(`Two${code}`, 25, 80, 700), goalie(`Three${code}`, 3, 12, 80)],
  })
  const a = team('AAA', 0)
  const b = team('BBB', 1)
  a.skaters.push(skater('Wayne', 'Star', 'C', 80, 70, 110, 10))
  a.skaters.push(skater('Tie', 'Domi', 'R', 75, 2, 3, 300))
  // Traded: more games for B, but ended the season with A.
  a.skaters.push({ ...skater('Moved', 'Man', 'L', 20, 5, 5), stint: 1 })
  b.skaters.push(skater('Moved', 'Man', 'L', 50, 15, 15))
  return { season: '1985-86', teams: [a, b] }
}

describe('a real season', () => {
  it('reads the season files', () => {
    const index: string[] = JSON.parse(readFileSync(new URL('index.json', seasonsDir), 'utf8'))
    expect(index[0]).toBe('19671968')
    expect(index).not.toContain('20042005')
    for (const id of index) {
      const season = seasonOf(id)
      expect(season.teams.length, id).toBeGreaterThanOrEqual(12)
      for (const team of season.teams) {
        expect(team.goalies.length, `${id} ${team.code}`).toBeGreaterThan(0)
        expect(team.skaters.length, `${id} ${team.code}`).toBeGreaterThanOrEqual(18)
        for (const p of [...team.skaters, ...team.goalies]) expect(`${p.first} ${p.last}`).toMatch(/^[\x20-\x7e]+$/)
      }
    }
  })

  it('makes names the game can show', () => {
    expect(gameName('Jean-Sebastien', 'Giguere')).toBe('J. Giguere')
    expect(gameName('Stéphane', 'Richer')).toBe('Stephane Richer')
    expect(gameName('Pierre-Luc', 'Dubois')).toBe('Pierre Luc Dubois')
    expect(gameName('Ryan', "O'Reilly")).toBe("Ryan O'Reilly")
    expect(gameName('Martin', 'St. Louis')).toBe('Martin St. Louis')
    expect(gameName('Alexander', 'Barabanov-Smithfield').length).toBeLessThanOrEqual(NAME_ROOM)
  })

  it('builds rosters: the most games for each team, goalies first, players rated against each other', () => {
    const built = buildSeasonRosters(NHL94, smallSeason())
    const [a, b] = built
    expect(a.players.filter((p) => p.isGoalie).map((p) => p.player.name)).toEqual(['Gord OneAAA', 'Gord TwoAAA'])
    expect(a.players.filter((p) => !p.isGoalie && p.forward)).toHaveLength(15)
    expect(a.players.filter((p) => !p.isGoalie && !p.forward)).toHaveLength(8)
    // The traded player is on the team they played most for, and only there.
    expect(b.players.some((p) => p.player.name === 'Moved Man')).toBe(true)
    expect(a.players.some((p) => p.player.name === 'Moved Man')).toBe(false)
    // The star's offence and the enforcer's aggression stand out; ratings stay 0 to 6, overall at most 100.
    const find = (name: string) => a.players.find((p) => p.player.name === name)!.player.attributes
    const OfA = NHL94.playerAttributeLabels.indexOf('OfA')
    const Agr = NHL94.playerAttributeLabels.indexOf('Agr')
    const HF = NHL94.playerAttributeLabels.indexOf('H/F')
    expect(find('Wayne Star')[OfA]).toBeGreaterThan(find('Tie Domi')[OfA])
    expect(find('Tie Domi')[Agr]).toBeGreaterThan(find('Wayne Star')[Agr])
    expect(find('Tie Domi')[HF] >> 1).toBeGreaterThan(find('Wayne Star')[HF] >> 1)
    for (const t of built)
      for (const p of t.players) {
        expect(overallRating(p.player.attributes, p.isGoalie)).toBeLessThanOrEqual(p.isGoalie ? 98 : 100)
        p.player.attributes.forEach((v, i) => {
          const kind = (p.isGoalie ? NHL94.goalieAttributeKinds : NHL94.playerAttributeKinds)[i]
          expect(v).toBeLessThanOrEqual(kind === 'rating' ? 6 : 15)
        })
      }
  })

  it('can put a traded player on the team they ended the season with', () => {
    const [a, b] = buildSeasonRosters(NHL94, smallSeason(), { ...DEFAULT_SEASON_OPTIONS, traded: 'last', forwards: 17, defence: 6 })
    expect(a.players.some((p) => p.player.name === 'Moved Man')).toBe(true)
    expect(b.players.some((p) => p.player.name === 'Moved Man')).toBe(false)
    // Never more than a roster holds, however many are asked for: 3 goalies, 17 forwards and 8 defence is 28.
    for (const t of buildSeasonRosters(NHL94, smallSeason(), { ...DEFAULT_SEASON_OPTIONS, goalies: 3, forwards: 17, defence: 8 })) expect(t.players.length).toBeLessThanOrEqual(26)
  })

  it('knows the end-of-season team from the files: Jake Guentzel ended 2023-24 with Carolina', () => {
    const s = seasonOf('20232024')
    const name = (team: string, traded: 'most' | 'last') =>
      buildSeasonRosters(NHL94, s, { ...DEFAULT_SEASON_OPTIONS, traded })[s.teams.findIndex((t) => t.code === team)].players.some((p) => p.player.name === 'Jake Guentzel')
    expect(name('PIT', 'most')).toBe(true)
    expect(name('CAR', 'last')).toBe(true)
    expect(name('PIT', 'last')).toBe(false)
    expect(s.teams.every((t) => t.special !== null)).toBe(true)
    expect(seasonOf('19701971').teams.every((t) => t.special === null)).toBe(true)
  })

  it('is offered for games with the original attributes', () => {
    expect(seasonBuilderSupported(NHL94)).toBe(true)
  })
})

describe.skipIf(!existsSync(romPath))('a real season in the original NHL 94', () => {
  it('gives back the original ratings from 1992-93, the season EA rated from', () => {
    const project = openRom(new Uint8Array(readFileSync(romPath)))
    const built = buildSeasonRosters(project.game, seasonOf('19921993'))
    const retail = new Map<string, { attributes: number[]; goalie: boolean }>()
    for (const team of project.teams.slice(0, 26))
      team.players.forEach((p, i) => retail.set(p.name.toLowerCase(), { attributes: p.attributes, goalie: i < goalieCount(team) }))
    const near: Record<string, [number, number]> = {}
    let matched = 0
    for (const team of built)
      for (const p of team.players) {
        const r = retail.get(p.player.name.toLowerCase())
        if (!r || r.goalie !== p.isGoalie) continue
        matched++
        const labels = p.isGoalie ? project.game.goalieAttributeLabels : project.game.playerAttributeLabels
        p.player.attributes.forEach((v, i) => {
          const key = `${p.isGoalie ? 'G ' : ''}${labels[i]}`
          near[key] ??= [0, 0]
          near[key][0] += Math.abs(v - r.attributes[i]) <= 1 ? 1 : 0
          near[key][1]++
        })
      }
    expect(matched).toBeGreaterThan(500)
    const share = (key: string) => near[key][0] / near[key][1]
    for (const key of ['OfA', 'ShA', 'Agr', 'Rgh', 'G OfA']) expect(share(key), key).toBeGreaterThan(0.97)
    for (const key of ['Agl', 'Spd', 'DfA', 'ShP', 'Chk', 'StH', 'End', 'Pas', 'G Agl', 'G PkC']) expect(share(key), key).toBeGreaterThan(0.88)
  })

  it('puts each team where its franchise is, and the ROM still builds', () => {
    const project = openRom(new Uint8Array(readFileSync(romPath)))
    const franchises = JSON.parse(readFileSync(new URL('franchises.json', seasonsDir), 'utf8'))
    const at = (placement: (number | null)[], season: Season, nickname: string) => {
      const slot = project.teams.findIndex((t) => t.names[2] === nickname)
      return placement[slot] === null ? null : season.teams[placement[slot]!].code
    }
    const s93 = seasonOf('19921993')
    const placement = defaultPlacement(project, s93, franchises)
    expect(at(placement, s93, 'Stars')).toBe('MNS')
    expect(at(placement, s93, 'Mighty Ducks')).toBeNull()
    // The All-Star teams are kept.
    expect(placement.slice(26)).toEqual([null, null])

    const result = applySeason(project, s93, placement)
    expect(result.notes).toContain('24 teams from 1992-93 brought in.')
    const again = openRom(buildRom(result.project))
    const stars = again.teams.find((t) => t.names[2] === 'North Stars')!
    expect(stars.names.slice(0, 3)).toEqual(['Minnesota', 'MNS', 'North Stars'])
    expect(stars.players[0].name).toBe('Jon Casey')
    // Jersey numbers as the game keeps them, two decimal digits: Mario Lemieux's 66 is 0x66.
    const pens = again.teams.find((t) => t.names[2] === 'Penguins')!
    expect(pens.players.find((p) => p.name === 'Mario Lemieux')!.jersey).toBe(0x66)
    // Nothing for Check ROM to raise: teammates who shared a number that season have one each.
    expect(checkProject(result.project)).toEqual([])
    expect(goalieCount(stars)).toBe(2)

    // The power play and penalty kill follow that season's percentages: the best power play gets the best bonus
    // the placed teams had, and the best penalty kill the lowest cost.
    const ratings = projectTeamRatings(result.project)
    const pp = ratings.findIndex((r) => r.label === 'Power play')
    const pk = ratings.findIndex((r) => r.label === 'Penalty kill')
    const placedSlots = placement.flatMap((s, slot) => (s === null ? [] : [slot]))
    const best = (which: number) => placedSlots.reduce((a, b) => (s93.teams[placement[b]!].special![which] > s93.teams[placement[a]!].special![which] ? b : a))
    const had = (index: number) => placedSlots.map((slot) => teamRatings(project.teams[slot])[index])
    expect(teamRatings(result.project.teams[best(0)])[pp]).toBe(Math.max(...had(pp)))
    expect(teamRatings(result.project.teams[best(1)])[pk]).toBe(Math.min(...had(pk)))
    expect(result.notes.some((n) => n.includes('power play'))).toBe(false)

    // An older season: the Atlanta Flames go where the Calgary Flames are, and teams no longer in the ROM to the rest.
    const s80 = seasonOf('19791980')
    const old = defaultPlacement(project, s80, franchises)
    expect(at(old, s80, 'Flames')).toBe('AFM')
    expect(old.filter((s) => s !== null)).toHaveLength(21)
    expect(() => buildRom(applySeason(project, s80, old).project)).not.toThrow()
  })

  it("re-rates the ROM's own players by name, and leaves the rest", () => {
    const project = openRom(new Uint8Array(readFileSync(romPath)))
    // One player renamed (the same length, so the ROM still fits) so the season cannot have them.
    const nobody = project.teams[0].players[3].name.replace(/[a-z]/g, 'q')
    const renamed = { ...project, teams: project.teams.map((t, i) => (i === 0 ? { ...t, players: t.players.map((p, j) => (j === 3 ? { ...p, name: nobody } : p)) } : t)) }
    const result = rerateByName(renamed, seasonOf('19921993'))
    expect(result.rerated).toBeGreaterThan(650)
    // Those with too few games for a roster too: Cam Neely's 13 games in 1992-93, rated against the regulars.
    expect(result.missing).not.toContain('Cam Neely')
    // And EA's shortened names, each listed to check.
    expect(result.loose).toContainEqual(['Glen Feathrston', 'Glen Featherstone'])
    expect(result.missing).toContain(nobody)
    expect(result.project.teams[0].players[3].attributes).toEqual(project.teams[0].players[3].attributes)
    // Names, numbers and teams stay; the ratings are the season's, close to EA's own for 1992-93.
    const kings = result.project.teams.findIndex((t) => t.names[2] === 'Kings')
    const gretzky = (p: typeof project) => p.teams[kings].players.find((p) => p.name === 'Wayne Gretzky')!
    expect(gretzky(result.project).jersey).toBe(0x99)
    const OfA = project.game.playerAttributeLabels.indexOf('OfA')
    expect(Math.abs(gretzky(result.project).attributes[OfA] - gretzky(project).attributes[OfA])).toBeLessThanOrEqual(1)
    expect(result.project.teams.map((t) => t.names)).toEqual(project.teams.map((t) => t.names))
    expect(checkProject(result.project)).toEqual([])
  })
})
