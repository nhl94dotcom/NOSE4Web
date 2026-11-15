import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { openRom, type RomProject } from '../src/core/rom'
import { goalieCount } from '../src/core/team'
import { WEBSITE_HEADINGS, websiteRosterCsv, websiteRosterRows, websiteRosterSupported } from '../src/core/websiteroster'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

// Rows of the website admin's own file (an NHL '94 SNES league ROM), each player's name, position, jersey and
// ratings put on a team here: what this file has for them must be what theirs has.
const THEIRS = [
  'Lukas,Dostal,ANH,G,1,70,6,4,3,4,4,4,0,0,0,0,4,4,4,4',
  'Petr,Mrazek,ANH,G,34,56,6,4,3,4,3,3,0,0,0,0,3,4,2,3',
  'Jeremy,Swayman,ANH,G,1,84,7,5,5,5,5,5,0,0,0,0,4,5,5,4',
  'David,Pastrnak,ANH,F,88,99,7,5,5,5,4,5,2,1,6,6,6,5,6,2',
  'Troy,Terry,ANH,F,19,94,6,5,5,4,4,5,4,1,5,6,4,5,5,4',
  'Jackson,Lacombe,ANH,D,2,77,8,4,4,4,5,5,3,0,3,3,5,2,4,3',
]

function withTheirPlayers(project: RomProject): RomProject {
  const rows = THEIRS.map((line) => line.split(','))
  const team = project.teams[0]
  const players = rows.map((r) => ({ ...team.players[0], name: `${r[0]} ${r[1]}`, jersey: Math.floor(+r[4] / 10) * 16 + (+r[4] % 10), attributes: r.slice(6).map(Number) }))
  const teams = project.teams.map((t, i) => (i === 0 ? { ...t, players, goalieNibbles: [1, 1, 1, 0], forwards: 2 } : t))
  return { ...project, teams }
}

describe("the league website's players file", () => {
  it.skipIf(!existsSync(path('NHL94.smc')))("comes out as the website's own file has the same players", () => {
    const project = withTheirPlayers(open('NHL94.smc'))
    expect(goalieCount(project.teams[0])).toBe(3)
    const lines = websiteRosterCsv(project).split('\n')
    expect(lines[0]).toBe(WEBSITE_HEADINGS.join(','))
    // ANH: this ROM's initials for Anaheim are its own.
    const initials = project.teams[0].names[1]
    expect(lines.slice(1, 1 + THEIRS.length)).toEqual(THEIRS.map((line) => line.replace(',ANH,', `,${initials},`)))
  })

  it.skipIf(!existsSync(path('nhl94.bin')))('lists every player of every team, the hand as 0 or 1, the overall at most 99', () => {
    const project = open('nhl94.bin')
    expect(websiteRosterSupported(project.game)).toBe(true)
    // Not for a ROM rated 0 to 15, or with an overall of its own: the website takes 0 to 6.
    expect(websiteRosterSupported({ ...project.game, overallIsEstimate: true })).toBe(false)
    const rows = websiteRosterRows(project)
    expect(rows).toHaveLength(1 + project.teams.reduce((sum, team) => sum + team.players.length, 0))
    expect(rows[1].slice(0, 5)).toEqual(['Guy', 'Hebert', 'ANH', 'G', 29])
    for (const row of rows.slice(1)) {
      expect(row).toHaveLength(WEBSITE_HEADINGS.length)
      if (row[3] !== 'G') expect([0, 1]).toContain(row[13])
      expect(row[5] as number).toBeLessThanOrEqual(99)
    }
    // A name with spaces in it is split at the first.
    const named = { ...project, teams: project.teams.map((t, i) => (i === 0 ? { ...t, players: t.players.map((p, j) => (j === 0 ? { ...p, name: 'James van Riemsdyk' } : p)) } : t)) }
    expect(websiteRosterRows(named)[1].slice(0, 2)).toEqual(['James', 'van Riemsdyk'])
  })

  it.skipIf(!existsSync(path('NHL95/NHL_95.bin')))("NHL '95: the hand by its own rule, stick handling as its 0 to 6 rating", () => {
    const project = open('NHL95/NHL_95.bin')
    expect(websiteRosterSupported(project.game)).toBe(true)
    const rows = websiteRosterRows(project).slice(1)
    for (const row of rows.filter((r) => r[3] !== 'G')) {
      expect([0, 1]).toContain(row[13])
      expect(row[14] as number).toBeLessThanOrEqual(6)
    }
  })
})
