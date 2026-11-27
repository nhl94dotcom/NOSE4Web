// The League page's schedule maker: a league's regular season, every pair of its teams meeting as often as asked
// (more often within a group, if the league has groups), home and away shared out fairly, laid out in game days in
// which no team plays twice. Nothing in the ROM changes: it is a spreadsheet for the league's own site.

export interface ScheduleRequest {
  // The teams, by the editor's team numbers, and the names to write.
  teams: { team: number; name: string; group: string }[]
  // How many times each pair meets: two teams of one group (where the group is not blank), and any other two.
  withinGroup: number
  betweenGroups: number
  // Mixes the order of the game days; the same number gives the same schedule.
  seed: number
}

export interface ScheduledGame {
  day: number
  home: number
  away: number
}

export interface Schedule {
  games: ScheduledGame[]
  days: number
  // For each team: its games, at home and away.
  totals: Map<number, { games: number; home: number; away: number }>
}

// A small seeded random number generator (mulberry32), so a schedule can be made again.
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The list in an order mixed by `rand` (Fisher-Yates).
function shuffled<T>(list: T[], rand: () => number): T[] {
  const out = list.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export class ScheduleError extends Error {}

export function makeSchedule(request: ScheduleRequest): Schedule {
  const { teams } = request
  if (teams.length < 2) throw new ScheduleError('Choose at least two teams.')
  for (const n of [request.withinGroup, request.betweenGroups]) {
    if (!Number.isInteger(n) || n < 0 || n > 20) throw new ScheduleError('A pair of teams meets from 0 to 20 times.')
  }
  const rand = random(request.seed)
  const ids = teams.map((t) => t.team)
  const groupOf = new Map(teams.map((t) => [t.team, t.group.trim().toLowerCase()]))
  const meetings = (a: number, b: number) => (groupOf.get(a) && groupOf.get(a) === groupOf.get(b) ? request.withinGroup : request.betweenGroups)

  // Every meeting, home and away shared within each pair (an odd last one decided below).
  const homeCount = new Map(ids.map((id) => [id, 0]))
  const awayCount = new Map(ids.map((id) => [id, 0]))
  const pending: { home: number; away: number }[] = []
  const odd: [number, number][] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const [a, b] = [ids[i], ids[j]]
      const n = meetings(a, b)
      for (let k = 0; k < Math.floor(n / 2); k++) pending.push({ home: a, away: b }, { home: b, away: a })
      homeCount.set(a, homeCount.get(a)! + Math.floor(n / 2))
      homeCount.set(b, homeCount.get(b)! + Math.floor(n / 2))
      awayCount.set(a, awayCount.get(a)! + Math.floor(n / 2))
      awayCount.set(b, awayCount.get(b)! + Math.floor(n / 2))
      if (n % 2) odd.push([a, b])
    }
  }
  if (pending.length + odd.length === 0) throw new ScheduleError('With these numbers no two teams meet.')
  // The odd meetings: each to the team with fewer home games so far (ties by chance), so every team's home and away
  // differ by as little as can be.
  for (const [a, b] of shuffled(odd, rand)) {
    const [ha, hb] = [homeCount.get(a)! - awayCount.get(a)!, homeCount.get(b)! - awayCount.get(b)!]
    const [home, away] = ha < hb || (ha === hb && rand() < 0.5) ? [a, b] : [b, a]
    pending.push({ home, away })
    homeCount.set(home, homeCount.get(home)! + 1)
    awayCount.set(away, awayCount.get(away)! + 1)
  }

  // Game days: each day takes as many games as it can, no team twice, the teams with the most games left first, and
  // not the same two teams as on the day before where another game will do.
  const left = shuffled(pending, rand)
  const remaining = new Map(ids.map((id) => [id, 0]))
  for (const g of left) {
    remaining.set(g.home, remaining.get(g.home)! + 1)
    remaining.set(g.away, remaining.get(g.away)! + 1)
  }
  const games: ScheduledGame[] = []
  let day = 0
  let yesterday = new Set<string>()
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  while (left.length > 0) {
    day++
    const busy = new Set<number>()
    const today = new Set<string>()
    const order = left
      .map((g, i) => ({ g, i, weight: remaining.get(g.home)! + remaining.get(g.away)! - (yesterday.has(pairKey(g.home, g.away)) ? 1000 : 0) }))
      .sort((x, y) => y.weight - x.weight)
    const taken: number[] = []
    for (const { g, i } of order) {
      if (busy.has(g.home) || busy.has(g.away)) continue
      busy.add(g.home)
      busy.add(g.away)
      taken.push(i)
      today.add(pairKey(g.home, g.away))
      games.push({ day, home: g.home, away: g.away })
      remaining.set(g.home, remaining.get(g.home)! - 1)
      remaining.set(g.away, remaining.get(g.away)! - 1)
    }
    for (const i of taken.sort((a, b) => b - a)) left.splice(i, 1)
    yesterday = today
  }
  const totals = new Map(ids.map((id) => [id, { games: homeCount.get(id)! + awayCount.get(id)!, home: homeCount.get(id)!, away: awayCount.get(id)! }]))
  return { games, days: day, totals }
}

// The schedule as spreadsheet rows: a heading, then a row a game.
export function scheduleRows(schedule: Schedule, nameOf: (team: number) => string): (string | number)[][] {
  return [['Game', 'Day', 'Home', 'Visitors'], ...schedule.games.map((g, i) => [i + 1, g.day, nameOf(g.home), nameOf(g.away)])]
}
