import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { copiedPhotos, copyPlayers, pastePlayers } from '../src/core/clipboard'
import { teamPhotos } from '../src/core/photos'
import { playerPhoto, withPlayerPhotos } from '../src/core/playerphotos'
import { buildRom, openRom, type RomProject } from '../src/core/rom'
import { snesTeamPhotos } from '../src/core/snesphotos'
import { goalieCount } from '../src/core/team'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))

// A paste as the team page makes it: the players, then each row's photo.
function paste(project: RomProject, from: number, indexes: number[], to: number, over: number[]) {
  const text = copyPlayers(project.teams[from], indexes, (slot) => playerPhoto(project, from, slot))
  const team = pastePlayers(project.teams[to], over, text, false)
  const goalies = goalieCount(project.teams[to])
  const photos = copiedPhotos(text, over)!
  const rows = over.map((slot, n) => ({ slot, goalie: slot < goalies, photo: photos[n] }))
  return withPlayerPhotos({ ...project, teams: project.teams.map((t, i) => (i === to ? team : t)) }, to, rows)
}

// A skater on a team other than Anaheim with a photo of his own.
const find = (project: RomProject) => {
  for (let team = 1; team < project.teams.length; team++) {
    const goalies = goalieCount(project.teams[team])
    const slot = project.teams[team].players.findIndex((_, s) => s >= goalies && playerPhoto(project, team, s))
    if (slot >= 0) return { team, slot, name: project.teams[team].players[slot].name }
  }
  throw new Error('No player with a photo of his own.')
}

for (const name of ['nhl94.bin', 'NHL94.smc']) {
  describe.skipIf(!existsSync(path(name)))(`a player copied with his photo (${name})`, () => {
    it("brings a player and his photo onto one of Anaheim's rows", () => {
      const project = open(name)
      const graves = find(project)
      const own = playerPhoto(project, graves.team, graves.slot)
      expect(own).not.toBe(null)
      // Over Anaheim's last skater (the original Genesis game has no room for one more without making room).
      const row = project.teams[0].players.length - 1
      const result = paste(project, graves.team, [graves.slot], 0, [row])
      expect(result.notes).toEqual([])
      const reopened = openRom(buildRom(result.project))
      expect(reopened.teams[0].players[row].name).toBe(graves.name)
      const now = playerPhoto(reopened, 0, row)
      expect(now).not.toBe(null)
      // On the Genesis, where every team has the same photo colours, the very same photo.
      if (name.endsWith('.bin')) expect(now).toEqual(own)
      // The Rangers keep theirs.
      expect(playerPhoto(reopened, graves.team, graves.slot)).toEqual(own)
    })

    it('gives a row a stand-in when its new player has no photo of his own, and leaves photos alone for attributes only', () => {
      const project = open(name)
      const graves = find(project)
      // A Rangers skater without a photo of his own, pasted over Graves.
      const goalies = goalieCount(project.teams[graves.team])
      const plain = project.teams[graves.team].players.findIndex((_, slot) => slot >= goalies && !playerPhoto(project, graves.team, slot))
      const result = paste(project, graves.team, [plain], graves.team, [graves.slot])
      expect(playerPhoto(result.project, graves.team, graves.slot)).toBe(null)
      if (name.endsWith('.smc')) expect(snesTeamPhotos(result.project, graves.team)[graves.slot].generic).toBe(true)
      else expect(teamPhotos(result.project, graves.team).find((p) => p.slot === graves.slot)?.generic ?? true).toBe(true)
      // A copy made without photos says so, and a paste of it leaves the photos as they are.
      const old = copyPlayers(project.teams[graves.team], [plain])
      expect(copiedPhotos(old, [graves.slot])).toBe(null)
    })
  })
}
