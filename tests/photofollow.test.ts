import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { photosFollowPlayers } from '../src/core/photofollow'
import { photoLayout, teamPhotos } from '../src/core/photos'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { deletePlayer, transferPlayers } from '../src/core/roster'
import { snesTeamPhotos } from '../src/core/snesphotos'
import { goalieCount } from '../src/core/team'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const key = (pixels: Uint8Array) => Buffer.from(pixels).toString('base64')
// Each player's photo on the Genesis, by name: those in the featured list.
const genesisFaces = (project: RomProject, team: number) =>
  new Map(teamPhotos(project, team).map((photo) => [project.teams[team].players[photo.slot]?.name, key(photo.picture.pixels)]))
const snesFaces = (project: RomProject, team: number) =>
  new Map(snesTeamPhotos(project, team).slice(0, project.teams[team].players.length).map((photo, slot) => [project.teams[team].players[slot].name, key(photo.picture.pixels)]))
const withTeams = (project: RomProject, teams: RomProject['teams']) => photosFollowPlayers(project, { ...project, teams })

describe.skipIf(!existsSync(path('nhl94.bin')))('Genesis photos follow their players', () => {
  const stock = () => openRom(new Uint8Array(readFileSync(path('nhl94.bin'))))

  it('through a trade: the photo goes to the new team, and the old team keeps six', () => {
    const project = stock()
    const before = genesisFaces(project, 1)
    // A Boston skater with a photo of his own.
    const photo = teamPhotos(project, 1).find((p) => !p.generic && p.slot >= goalieCount(project.teams[1]))!
    const name = project.teams[1].players[photo.slot].name
    const after = withTeams(project, transferPlayers(project.teams, 1, [photo.slot], 2))
    expect(genesisFaces(after, 2).get(name)).toBe(before.get(name))
    expect(genesisFaces(after, 1).has(name)).toBe(false)
    expect(teamPhotos(after, 1).length).toBeGreaterThanOrEqual(6)
    // Everyone who stayed keeps his face.
    for (const [player, face] of genesisFaces(after, 1)) if (before.has(player)) expect(face).toBe(before.get(player))
    expect(genesisFaces(openRom(buildRom(after)), 2).get(name)).toBe(before.get(name))
  })

  it('through a player deleted ahead of them on the roster, and a player renamed', () => {
    const project = stock()
    const before = genesisFaces(project, 1)
    const team = project.teams[1]
    const goalies = goalieCount(team)
    const after = withTeams(project, project.teams.map((t, i) => (i === 1 ? deletePlayer(t, goalies) : t)))
    const gone = team.players[goalies].name
    for (const [player, face] of genesisFaces(after, 1)) if (player !== gone && before.has(player)) expect(face).toBe(before.get(player))
    // A renamed player is the same man.
    const renamed = after.teams.map((t, i) => (i === 1 ? { ...t, players: t.players.map((p, s) => (s === 0 ? { ...p, name: 'New Name' } : p)) } : t))
    const again = photosFollowPlayers(after, { ...after, teams: renamed })
    expect(again.bytes).toBe(after.bytes)
    expect(genesisFaces(again, 1).get('New Name')).toBe(before.get(team.players[0].name))
  })

  it('leaves alone an edit that changed no players, and a team whose photos the edit set', () => {
    const project = stock()
    expect(photosFollowPlayers(project, { ...project })).toEqual({ ...project })
    const layout = photoLayout(project.bytes, project.teams.length)!
    expect(layout.lists[1].entries.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!existsSync(path('NHL94.smc')))('SNES photos follow their players', () => {
  it('through a trade and a player let go', () => {
    const project = openRom(new Uint8Array(readFileSync(path('NHL94.smc'))))
    const before = snesFaces(project, 1)
    const own = snesTeamPhotos(project, 1).findIndex((photo, slot) => photo.shared === 0 && slot >= goalieCount(project.teams[1]) && slot < project.teams[1].players.length)
    const name = project.teams[1].players[own].name
    const after = withTeams(project, transferPlayers(project.teams, 1, [own], 2))
    expect(snesFaces(after, 2).get(name)).toBe(before.get(name))
    for (const [player, face] of snesFaces(after, 1)) expect(face).toBe(before.get(player))
    expect(snesFaces(openRom(buildRom(after)), 2).get(name)).toBe(before.get(name))
  })
})
