import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { convertAttributes, shootsRight, stickHandling95Step } from '../src/core/attributes'
import { copyPlayers, pasteConversionNote, pastePlayers } from '../src/core/clipboard'
import { NHL94, NHL95 } from '../src/core/games'
import { ALL_PARTS, importTeam } from '../src/core/importteam'
import { openRom } from '../src/core/rom'
import { goalieCount } from '../src/core/team'

const path = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url))
const has = existsSync(path('nhl94.bin')) && existsSync(path('NHL95/NHL_95.bin'))
const open = (name: string) => openRom(new Uint8Array(readFileSync(path(name))))
const H_F = 7
const STH = 8

describe('players between NHL 94 and NHL 95', () => {
  it('turns the shooting hand and restates stick handling, so a player plays as he did', () => {
    for (let hf = 0; hf < 16; hf++) {
      for (let sth = 0; sth <= 6; sth++) {
        const values = [3, 3, 3, 3, 3, 3, 3, hf, sth, 3, 3, 3, 3, 3]
        const to95 = convertAttributes(values, NHL94.playerAttributeKinds, NHL95.playerAttributeKinds).values
        expect(shootsRight('handedFighting93', to95[H_F])).toBe(shootsRight('handedFighting', hf))
        expect(to95[H_F] >> 1).toBe(hf >> 1)
        expect(stickHandling95Step(to95[STH])).toBe(sth)
        // And back as it was.
        expect(convertAttributes(to95, NHL95.playerAttributeKinds, NHL94.playerAttributeKinds).values).toEqual(values)
      }
    }
    // Goalies: the same glove hand in both games, nothing changed.
    const goalie = [5, 4, 3, 3, 3, 3, 0, 1, 0, 0, 3, 3, 3, 3]
    expect(convertAttributes(goalie, NHL94.goalieAttributeKinds, NHL95.goalieAttributeKinds).values).toEqual(goalie)
  })

  it.skipIf(!has)('copies and pastes players from one game into the other', () => {
    const nhl94 = open('nhl94.bin')
    const nhl95 = open('NHL95/NHL_95.bin')
    const boston = nhl94.teams[1]
    const skater = goalieCount(boston)
    const text = copyPlayers(boston, [skater], undefined, nhl94.game)
    const anaheim = nhl95.teams[0]
    const target = goalieCount(anaheim)
    const pasted = pastePlayers(anaheim, [target], text, false, nhl95.game).players[target]
    const source = boston.players[skater]
    expect(pasted.name).toBe(source.name)
    expect(shootsRight('handedFighting93', pasted.attributes[H_F])).toBe(shootsRight('handedFighting', source.attributes[H_F]))
    expect(stickHandling95Step(pasted.attributes[STH])).toBe(source.attributes[STH])
    expect(pasteConversionNote(text, nhl95.game)).toContain('shooting hands turned')
    // Within one game nothing is converted, and a copy made before copies said their game is pasted as stored.
    expect(pasteConversionNote(copyPlayers(boston, [skater], undefined, nhl94.game), nhl94.game)).toBe('')
    expect(pastePlayers(anaheim, [target], copyPlayers(boston, [skater]), false, nhl95.game).players[target].attributes).toEqual(source.attributes)
  })

  it.skipIf(!has)('brings a team in from the other game, roster and colours converted', () => {
    const nhl94 = open('nhl94.bin')
    const nhl95 = open('NHL95/NHL_95.bin')
    const into95 = importTeam(nhl95, nhl94, 1, 1, ALL_PARTS)
    const team = into95.project.teams[1]
    const source = nhl94.teams[1]
    const goalies = goalieCount(source)
    source.players.forEach((p, i) => {
      if (i < goalies) return
      expect(shootsRight('handedFighting93', team.players[i].attributes[H_F])).toBe(shootsRight('handedFighting', p.attributes[H_F]))
      expect(stickHandling95Step(team.players[i].attributes[STH])).toBe(p.attributes[STH])
    })
    const notes = into95.notes.join(' ')
    expect(notes).toContain('the shooting hand the other way round')
    expect(notes).toContain('stick handling in 16 steps')
    expect(notes).not.toContain('different scales')
    // The jersey's main colour in NHL '95 (4) is NHL 94's helmet and body (11); the goalie pads kept.
    expect(team.palette[4]).toBe(source.palette[11])
    expect(team.palette[7]).toBe(nhl95.teams[1].palette[7])
    expect(notes).toContain('moved to the part of the player it colours')
    // And the other way.
    const into94 = importTeam(nhl94, nhl95, 0, 0, ALL_PARTS)
    expect(into94.project.teams[0].palette[11]).toBe(nhl95.teams[0].palette[4])
    expect(into94.notes.join(' ')).toContain('shooting hand the other way round')
  })
})
