// Each team's conference in a season, East or West, from the NHL's standings on 1 March of that season: the
// Eastern and Western conferences (1993-94 on), the Prince of Wales and Clarence Campbell conferences (1974-75 to
// 1992-93), and before that the East and West divisions. 2020-21 had four divisions and no conferences: each team
// takes the one it had the season before (`before`, by team code). By code, and by full name too, as the standings
// write some codes another way (the Cleveland Barons are CBN there, CLE in the stats). Used by fetch-seasons.mjs and
// fetch-conferences.mjs, for the season builder's All-Star teams.
export async function conferences(id, get, before = new Map()) {
  const standings = await get(`https://api-web.nhle.com/v1/standings/${Number(id.slice(0, 4)) + 1}-03-01`)
  const out = new Map()
  for (const row of standings?.standings ?? []) {
    const code = row.teamAbbrev?.default
    const conference = row.conferenceName ?? ''
    const division = row.divisionName ?? ''
    const side = /Wales|Eastern/.test(conference) ? 'East' : /Campbell|Western/.test(conference) ? 'West' : /^(East|West)$/.test(division) ? division : before.get(code) ?? null
    if (code) out.set(code, side)
    const full = row.teamName?.default
    if (full) out.set(`name:${full}`, side)
  }
  return out
}
