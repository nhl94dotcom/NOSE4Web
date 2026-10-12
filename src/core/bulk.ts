// Changing one attribute for many players at once.

import { attributeText, type AttributeKind } from './attributes'
import type { GameConfig } from './games'
import { leaguePlayers, type Role } from './league'
import { overallRating } from './rating'
import type { RomProject } from './rom'

export type BulkGroup = 'skaters' | 'forwards' | 'defence' | 'goalies'
export type BulkAction = 'raise' | 'lower' | 'set' | 'atMost' | 'atLeast'

export interface BulkChange {
  group: BulkGroup
  // A team's number, or null for every team.
  team: number | null
  // Which of the 14 attributes, counted in the order of the game's labels.
  attribute: number
  action: BulkAction
  // In stored values: steps for raise and lower, a value for the rest.
  amount: number
  // Only players whose overall rating is within these, if given.
  overallAtLeast: number | null
  overallAtMost: number | null
}

export const BULK_GROUPS: { value: BulkGroup; label: string }[] = [
  { value: 'skaters', label: 'All skaters' },
  { value: 'forwards', label: 'Forwards' },
  { value: 'defence', label: 'Defencemen' },
  { value: 'goalies', label: 'Goalies' },
]

export const BULK_ACTIONS: { value: BulkAction; label: string }[] = [
  { value: 'raise', label: 'Raise by' },
  { value: 'lower', label: 'Lower by' },
  { value: 'set', label: 'Set to' },
  { value: 'atMost', label: 'Cap at (lower anyone above)' },
  { value: 'atLeast', label: 'Floor at (raise anyone below)' },
]

const ROLES: Record<BulkGroup, Role[]> = { skaters: ['F', 'D'], forwards: ['F'], defence: ['D'], goalies: ['G'] }

const kindsFor = (game: GameConfig, group: BulkGroup) =>
  group === 'goalies' ? game.goalieAttributeKinds : game.playerAttributeKinds

// The attributes a bulk change can sensibly touch: those on a scale. Hand and
// fighting share one value, and some goalie values must stay zero.
export function bulkAttributes(game: GameConfig, group: BulkGroup): { index: number; name: string; kind: AttributeKind }[] {
  const names = group === 'goalies' ? game.goalieAttributeNames : game.playerAttributeNames
  return kindsFor(game, group).flatMap((kind, index) =>
    kind === 'rating' || kind === 'weight' ? [{ index, name: names[index], kind }] : [],
  )
}

// The stored values an attribute may take, lowest first, with what each means.
export function bulkValues(kind: AttributeKind): { value: number; text: string }[] {
  return Array.from({ length: 16 }, (_, value) => ({ value, text: attributeText(kind, value) })).flatMap(({ value, text }) =>
    text === null ? [] : [{ value, text }],
  )
}

export interface BulkEffect {
  team: number
  index: number
  name: string
  role: Role
  from: number
  to: number
  overallFrom: number
  overallTo: number
}

// Every player the change would alter, and how. Players it leaves as they
// are, because they are already at a limit or outside the filter, are left out.
export function previewBulk(project: RomProject, change: BulkChange): BulkEffect[] {
  const kind = kindsFor(project.game, change.group)[change.attribute]
  const allowed = bulkValues(kind).map((v) => v.value)
  if (allowed.length === 0) return []
  const [lowest, highest] = [allowed[0], allowed[allowed.length - 1]]
  const clamp = (value: number) => Math.max(lowest, Math.min(highest, value))

  return leaguePlayers(project).flatMap(({ team, index, player, role, overall }) => {
    if (!ROLES[change.group].includes(role)) return []
    if (change.team !== null && change.team !== team) return []
    if (change.overallAtLeast !== null && overall < change.overallAtLeast) return []
    if (change.overallAtMost !== null && overall > change.overallAtMost) return []
    const from = player.attributes[change.attribute]
    const to = clamp(
      change.action === 'raise'
        ? from + change.amount
        : change.action === 'lower'
          ? from - change.amount
          : change.action === 'set'
            ? change.amount
            : change.action === 'atMost'
              ? Math.min(from, change.amount)
              : Math.max(from, change.amount),
    )
    if (to === from) return []
    const attributes = player.attributes.map((v, i) => (i === change.attribute ? to : v))
    return [{ team, index, name: player.name, role, from, to, overallFrom: overall, overallTo: overallRating(attributes, role === 'G') }]
  })
}

export function applyBulk(project: RomProject, change: BulkChange): RomProject {
  const effects = previewBulk(project, change)
  if (effects.length === 0) return project
  const teams = project.teams.map((team, t) => {
    const mine = effects.filter((effect) => effect.team === t)
    if (mine.length === 0) return team
    const players = team.players.map((player, index) => {
      const effect = mine.find((e) => e.index === index)
      return effect ? { ...player, attributes: player.attributes.map((v, i) => (i === change.attribute ? effect.to : v)) } : player
    })
    return { ...team, players }
  })
  return { ...project, teams }
}
