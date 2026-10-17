import { attributeText } from './core/attributes'
import { hex } from './core/bytes'
import { cssHex } from './core/color'
import type { GameConfig } from './core/games'
import { overallRating } from './core/rating'
import { goalieCount, teamDisplayName, type Team } from './core/team'

// A team's roster as a picture, sized to post in a chat: the team's name
// over a table of every player with his number, position and ratings.

const SCALE = 2 // drawn at twice the size, so it stays sharp when a chat app shrinks it
const PAD = 16
const ROW = 22
const TITLE = 54
const HEAD = 26
const NAME_WIDTH = 190
const SMALL_WIDTH = 40
const CELL_WIDTH = 50
const FONT = 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

// Black or white, whichever reads better on a colour.
function inkOn(word: number): string {
  const [r, g, b] = [(word >> 1) & 7, (word >> 5) & 7, (word >> 9) & 7]
  return r * 0.3 + g * 0.6 + b * 0.1 > 3.6 ? '#111' : '#fff'
}

export function drawRosterCard(game: GameConfig, team: Team, rawAttributes: boolean): HTMLCanvasElement {
  const goalies = goalieCount(team)
  const groups = [
    { title: 'Goalies', from: 0, to: goalies, labels: game.goalieAttributeLabels, kinds: game.goalieAttributeKinds, goalie: true },
    { title: 'Skaters', from: goalies, to: team.players.length, labels: game.playerAttributeLabels, kinds: game.playerAttributeKinds, goalie: false },
  ].filter((group) => group.to > group.from)

  const columns = 14
  const width = PAD * 2 + SMALL_WIDTH * 3 + NAME_WIDTH + columns * CELL_WIDTH
  const height = TITLE + groups.reduce((sum, group) => sum + HEAD + (group.to - group.from) * ROW + 10, 0) + PAD
  const canvas = document.createElement('canvas')
  canvas.width = width * SCALE
  canvas.height = height * SCALE
  const c = canvas.getContext('2d')!
  c.scale(SCALE, SCALE)
  c.textBaseline = 'middle'

  // The band across the top takes the jersey colour of whichever strip is the
  // more colourful, since one of the two is usually white, and its trim.
  const colourful = (word: number) => {
    const levels = [(word >> 1) & 7, (word >> 5) & 7, (word >> 9) & 7]
    return Math.max(...levels) - Math.min(...levels)
  }
  // The SNES game's colours are not known to the editor, so its teams get a plain blue.
  const strip = colourful(team.palette[16 + 11] ?? 0) > colourful(team.palette[11] ?? 0) ? 16 : 0
  const [band, trim] = team.palette.length > 0 ? [team.palette[strip + 11], team.palette[strip + 9]] : [0x842, 0xccc]
  c.fillStyle = '#f6f7f9'
  c.fillRect(0, 0, width, height)
  c.fillStyle = cssHex(band)
  c.fillRect(0, 0, width, TITLE - 8)
  c.fillStyle = cssHex(trim)
  c.fillRect(0, TITLE - 8, width, 4)
  c.fillStyle = inkOn(band)
  c.font = `700 22px ${FONT}`
  c.fillText(teamDisplayName(team), PAD, (TITLE - 8) / 2)
  c.font = `500 13px ${FONT}`
  c.textAlign = 'right'
  c.fillText(`${team.names[1]}  ·  ${team.names[3]}  ·  ${team.players.length} players`, width - PAD, (TITLE - 8) / 2)

  let y = TITLE
  for (const group of groups) {
    let x = PAD
    const cell = (text: string, w: number, align: CanvasTextAlign = 'center') => {
      c.textAlign = align
      c.fillText(text, align === 'left' ? x + 4 : x + w / 2, y + ROW / 2)
      x += w
    }
    c.fillStyle = '#667'
    c.font = `600 12px ${FONT}`
    y += HEAD - ROW
    cell('No.', SMALL_WIDTH)
    cell(group.title, NAME_WIDTH, 'left')
    cell('Pos', SMALL_WIDTH)
    cell('Ovr', SMALL_WIDTH)
    for (const label of group.labels) cell(label, CELL_WIDTH)
    y += ROW

    for (let i = group.from; i < group.to; i++) {
      const player = team.players[i]
      if ((i - group.from) % 2 === 0) {
        c.fillStyle = '#e9ecf1'
        c.fillRect(PAD, y, width - PAD * 2, ROW)
      }
      x = PAD
      c.fillStyle = '#1a1c1f'
      c.font = `13px ${FONT}`
      cell(hex(player.jersey), SMALL_WIDTH)
      c.font = `600 13px ${FONT}`
      cell(player.name, NAME_WIDTH, 'left')
      c.font = `13px ${FONT}`
      cell(group.goalie ? 'G' : i - goalies < team.forwards ? 'F' : 'D', SMALL_WIDTH)
      c.font = `700 13px ${FONT}`
      cell(String(overallRating(player.attributes, group.goalie, game)), SMALL_WIDTH)
      c.font = `12px ${FONT}`
      player.attributes.forEach((value, a) => cell(rawAttributes ? String(value) : (attributeText(group.kinds[a], value) ?? `!${value}`), CELL_WIDTH))
      y += ROW
    }
    y += 10
  }
  return canvas
}

// The card as a PNG file.
export async function rosterCardPng(game: GameConfig, team: Team, rawAttributes: boolean): Promise<Uint8Array> {
  const canvas = drawRosterCard(game, team, rawAttributes)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The browser could not make a PNG file.')
  return new Uint8Array(await blob.arrayBuffer())
}
