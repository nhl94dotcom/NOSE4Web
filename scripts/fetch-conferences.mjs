// Adds each team's conference to the season files already in public/seasons/, without fetching their players
// again (fetch-seasons.mjs adds it to the files it writes):
//
//   node scripts/fetch-conferences.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { conferences } from './conferences.mjs'

const OUT = new URL('../public/seasons/', import.meta.url)
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

const ids = JSON.parse(await readFile(new URL('index.json', OUT), 'utf8'))
let before = new Map()
for (const id of ids) {
  const file = new URL(`${id}.json`, OUT)
  const data = JSON.parse(await readFile(file, 'utf8'))
  const sides = await conferences(id, get, before)
  const missing = []
  for (const team of data.teams) {
    // Keys in the order fetch-seasons.mjs writes them: conference after special.
    const { skaters, goalies, ...rest } = team
    const conference = sides.get(team.code) ?? sides.get(`name:${team.location} ${team.name}`) ?? null
    if (conference === null) missing.push(team.code)
    Object.keys(team).forEach((k) => delete team[k])
    Object.assign(team, { ...rest, conference, skaters, goalies })
  }
  await writeFile(file, JSON.stringify(data))
  before = new Map(data.teams.map((t) => [t.code, t.conference]))
  const east = data.teams.filter((t) => t.conference === 'East').length
  console.log(id, `${east} East, ${data.teams.length - east - missing.length} West`, missing.length ? `none for ${missing.join(' ')}` : '')
}
