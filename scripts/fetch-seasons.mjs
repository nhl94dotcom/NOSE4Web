// Fetches real NHL seasons' regular-season stats from the NHL's public stats service and writes one small file a
// season to public/seasons/, which the Season builder page reads. Run now and then to add a finished season:
//
//   node scripts/fetch-seasons.mjs            every season from 1967-68 to the last finished one
//   node scripts/fetch-seasons.mjs 19871988   just that season
//
// Each file: { season, teams: [{ code, location, name, franchise, record, skaters, goalies }] } with players as
// arrays (see the SKATER and GOALIE lists below), to keep the files small.
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = new URL('../public/seasons/', import.meta.url)
const FIRST = 1967
// The last season that has finished by the time this is run: the season ends in June.
const now = new Date()
const LAST = now.getMonth() >= 6 ? now.getFullYear() - 1 : now.getFullYear() - 2
const NO_SEASON = new Set(['20042005'])

export const SKATER = ['first', 'last', 'pos', 'number', 'shoots', 'inches', 'pounds', 'born', 'gp', 'g', 'a', 'pm', 'pim', 'shots', 'ppg', 'shg']
export const GOALIE = ['first', 'last', 'number', 'catches', 'inches', 'pounds', 'born', 'gp', 'gs', 'w', 'l', 't', 'ga', 'sa', 'so', 'seconds']

// Nicknames of more than one word; any other team's nickname is its last word.
const LONG_NAMES = ['Maple Leafs', 'Red Wings', 'North Stars', 'Golden Seals', 'Blue Jackets', 'Golden Knights', 'Hockey Club', 'Mammoth']

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url) {
  for (let tries = 0; ; tries++) {
    await sleep(120)
    const response = await fetch(url, { headers: { 'user-agent': 'nose4web-season-data' } })
    if (response.ok) return response.json()
    if (response.status === 404) return null
    if (tries >= 4) throw new Error(`${response.status} for ${url}`)
    await sleep(2000 * (tries + 1))
  }
}

// Plain letters, as the games' fonts have them.
const plain = (text) => (text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '')
const name = (part) => plain(part?.default)

function split(fullName) {
  // "Winnipeg Jets (1979)" is the Winnipeg Jets.
  const full = plain(fullName).replace(/ \(\d+\)$/, '')
  const long = LONG_NAMES.find((n) => full.endsWith(' ' + n) || full === n)
  const nick = long ?? full.split(' ').pop()
  return { location: full.slice(0, full.length - nick.length).trim() || full, name: nick }
}

const landings = new Map()

async function season(id, teamCodes) {
  const summary = await get(`https://api.nhle.com/stats/rest/en/team/summary?limit=-1&cayenneExp=seasonId=${id}%20and%20gameTypeId=2`)
  const teams = []
  for (const row of summary.data.sort((a, b) => a.teamFullName.localeCompare(b.teamFullName))) {
    const team = teamCodes.get(row.teamId)
    if (!team) throw new Error(`No code for team ${row.teamId} (${row.teamFullName})`)
    const [stats, roster] = await Promise.all([
      get(`https://api-web.nhle.com/v1/club-stats/${team.code}/${id}/2`),
      get(`https://api-web.nhle.com/v1/roster/${team.code}/${id}`),
    ])
    const bio = new Map()
    for (const p of [...(roster?.forwards ?? []), ...(roster?.defensemen ?? []), ...(roster?.goalies ?? [])]) bio.set(p.id, p)
    // The rosters of the last few seasons hold only the players there now; the others' come from their own pages.
    for (const p of [...(stats?.skaters ?? []), ...(stats?.goalies ?? [])]) {
      if (bio.has(p.playerId)) continue
      if (!landings.has(p.playerId)) landings.set(p.playerId, await get(`https://api-web.nhle.com/v1/player/${p.playerId}/landing`))
      const page = landings.get(p.playerId)
      if (page) bio.set(p.playerId, page)
    }
    const about = (id) => {
      const p = bio.get(id) ?? {}
      return [p.sweaterNumber ?? null, p.shootsCatches ?? null, p.heightInInches ?? null, p.weightInPounds ?? null, p.birthDate ? Number(p.birthDate.slice(0, 4)) : null]
    }
    const skaters = (stats?.skaters ?? []).map((s) => {
      const [number, shoots, inches, pounds, born] = about(s.playerId)
      return [name(s.firstName), name(s.lastName), s.positionCode, number, shoots, inches, pounds, born,
        s.gamesPlayed, s.goals, s.assists, s.plusMinus ?? null, s.penaltyMinutes, s.shots ?? null, s.powerPlayGoals ?? null, s.shorthandedGoals ?? null]
    })
    const goalies = (stats?.goalies ?? []).map((g) => {
      const [number, catches, inches, pounds, born] = about(g.playerId)
      return [name(g.firstName), name(g.lastName), number, catches, inches, pounds, born,
        g.gamesPlayed, g.gamesStarted ?? null, g.wins ?? null, g.losses ?? null, g.ties ?? null, g.goalsAgainst ?? null, g.shotsAgainst ?? null, g.shutouts ?? null, g.timeOnIce ?? null]
    })
    teams.push({
      code: team.code,
      ...split(row.teamFullName),
      franchise: team.franchise,
      record: [row.wins, row.losses, row.ties ?? 0, row.otLosses ?? 0, row.goalsFor, row.goalsAgainst],
      skaters,
      goalies,
    })
  }
  return { season: `${id.slice(0, 4)}-${id.slice(6)}`, teams }
}

const list = await get('https://api.nhle.com/stats/rest/en/team')
const teamCodes = new Map(list.data.map((t) => [t.id, { code: t.triCode, franchise: t.franchiseId }]))
const wanted = process.argv[2] ? [process.argv[2]] : Array.from({ length: LAST - FIRST + 1 }, (_, i) => `${FIRST + i}${FIRST + i + 1}`)
await mkdir(OUT, { recursive: true })
// Each franchise's names over the years, by which a season's team finds its place in a ROM: the Atlanta Flames
// go where the Calgary Flames are.
const franchises = {}
for (const t of list.data) if (t.franchiseId) (franchises[t.franchiseId] ??= []).push(plain(t.fullName).replace(/ [(][0-9]+[)]$/, ''))
await writeFile(new URL('franchises.json', OUT), JSON.stringify(franchises))
const done = []
for (const id of wanted) {
  if (NO_SEASON.has(id)) continue
  const data = await season(id, teamCodes)
  await writeFile(new URL(`${id}.json`, OUT), JSON.stringify(data))
  done.push(id)
  console.log(id, data.teams.length, 'teams', data.teams.reduce((n, t) => n + t.skaters.length + t.goalies.length, 0), 'players')
}
// The list of seasons the page offers.
if (!process.argv[2]) await writeFile(new URL('index.json', OUT), JSON.stringify(done))
