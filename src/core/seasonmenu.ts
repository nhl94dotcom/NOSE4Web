import { isAllStarTeam } from './league'
import { leagueDraws } from './menuteams'
import type { RomProject } from './rom'
import { teamDisplayName } from './team'
import { teamMoveRange, withTeamOrder } from './teamorder'

// After a real season is brought in (seasonbuilder.ts), the Game Setup menu offering only that season's teams, as a
// commissioner would set it by hand: the season's teams moved to the top of the team list in the order they are in,
// then the All-Star teams, then the rest (Bulk changes' Move teams); the menu offering the season's teams and the
// All-Star teams (Game settings' Teams in the menu); and new playoff draws made of the season's teams only (Fill the
// draws with the league's teams). The teams after them stay in the ROM as they were.

export type SeasonMenu = { project: RomProject; offered: number } | { reason: string }

export function offerOnly(project: RomProject, slots: number[]): SeasonMenu {
  const range = teamMoveRange(project)
  if ('reason' in range) return { reason: range.reason }
  if (!project.settings.menuTeams) return { reason: "This ROM's menu offers every team, and the editor cannot change how many." }
  const chosen = [...new Set(slots)].sort((a, b) => a - b)
  const slotsPerDraw = project.settings.playoffDraws[0]?.length ?? 0
  if (chosen.length < slotsPerDraw) return { reason: `A playoff draw has ${slotsPerDraw} teams, and the season has ${chosen.length} here.` }
  const stars = project.teams.flatMap((team, t) => (!chosen.includes(t) && isAllStarTeam(teamDisplayName(team)) ? [t] : []))
  const rest = project.teams.flatMap((_, t) => (chosen.includes(t) || stars.includes(t) ? [] : [t]))
  // Team n becomes the team that is team order[n] now.
  const moved = withTeamOrder(project, [...chosen, ...stars, ...rest])
  const offered = chosen.length + stars.length
  const { settings, game } = moved
  // As Teams in the menu does: a team line that starts on a team no longer offered starts on the last one.
  const menu = settings.menu.map((item, i) => (game.menuTeamItems.includes(i) && item.value >= offered ? { ...item, value: offered - 1 } : item))
  const draws = settings.playoffDraws.length > 0 ? leagueDraws(chosen.map((_, n) => n), settings.playoffDraws.length, slotsPerDraw) : settings.playoffDraws
  return { project: { ...moved, settings: { ...settings, menu, menuTeams: { offered }, playoffDraws: draws } }, offered }
}

// Whether the menu already offers just these teams, first, with new draws not needed: nothing for offerOnly to do.
export function offersOnly(project: RomProject, slots: number[]): boolean {
  const offered = project.settings.menuTeams?.offered ?? project.teams.length
  const stars = project.teams.filter((team, t) => !slots.includes(t) && isAllStarTeam(teamDisplayName(team))).length
  const top = [...slots].sort((a, b) => a - b)
  return offered === slots.length + stars && top.every((slot, n) => slot === n) && project.settings.playoffDraws.every((draw) => draw.every((team) => team < slots.length))
}
