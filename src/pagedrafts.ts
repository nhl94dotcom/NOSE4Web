// Work set up on the Bulk changes, Trade and Import a team pages but not done yet. Like the Hacks page's choices
// (hackdraft.ts), it is kept while other pages show, a notice says so on them, and Download asks first.
import { isWeight, WEIGHT_BASES, weightBase } from './core/attributes'
import { bulkAttributes, bulkValues, previewBulk, type BulkAction, type BulkChange, type BulkGroup } from './core/bulk'
import type { ImportParts } from './core/importteam'
import type { RomProject } from './core/rom'
import { teamLabels } from './core/team'
import { FREE_AGENTS, type TradeSide } from './core/trade'

export interface BulkForm {
  group: BulkGroup
  team: number | null
  // The attribute's index, or -1 for the first in the list.
  attribute: number
  action: BulkAction
  amount: number
  atLeast: string
  atMost: string
}

export const BULK_START: BulkForm = { group: 'skaters', team: null, attribute: -1, action: 'raise', amount: 1, atLeast: '', atMost: '' }

// `touched`: changed by the user since the page started or last applied, so a form left as it starts never counts.
export interface BulkKept {
  form: BulkForm
  touched: boolean
}

export interface TradeKept {
  sides: [TradeSide, TradeSide]
  // The names of the players ticked on each side, in the order of the picks.
  names: [string[], string[]]
}

export interface ImportKept {
  fileName: string
  other: RomProject
  from: number
  to: number
  parts: ImportParts
  // Opened or changed since the last import.
  dirty: boolean
}

export interface PageWork {
  bulk: BulkKept | null
  trade: TradeKept | null
  importTeam: ImportKept | null
}

export const NO_PAGE_WORK: PageWork = { bulk: null, trade: null, importTeam: null }

const optionalNumber = (text: string) => (text.trim() === '' || Number.isNaN(Number(text)) ? null : Number(text))
export const people = (count: number) => (count === 1 ? '1 player' : `${count} players`)

// The change a Bulk changes form makes. `order` lists the attributes as the tables show them.
export function bulkSetup(project: RomProject, form: BulkForm, order: number[] = []) {
  const attributes = bulkAttributes(project.game, form.group).sort((a, b) => order.indexOf(a.index) - order.indexOf(b.index))
  // Goalies and skaters have different attributes, so the choice may not carry over.
  const chosen = attributes.find((a) => a.index === form.attribute) ?? attributes[0]
  const values = bulkValues(chosen.kind)
  // Weights can also be moved from the base another ROM was set up with.
  const ownBase = weightBase(chosen.kind)
  const usable: BulkAction = form.action === 'fromBase' && !isWeight(chosen.kind) ? 'raise' : form.action
  const steps = usable === 'raise' || usable === 'lower'
  const bases = WEIGHT_BASES.filter((base) => base !== ownBase)
  const change: BulkChange = {
    group: form.group,
    team: form.team,
    attribute: chosen.index,
    action: usable,
    amount:
      usable === 'fromBase'
        ? (bases.find((base) => base === form.amount) ?? (ownBase === 140 ? 144 : 140))
        : steps
          ? Math.max(1, form.amount)
          : (values.find((v) => v.value === form.amount) ?? values[0]).value,
    overallAtLeast: optionalNumber(form.atLeast),
    overallAtMost: optionalNumber(form.atMost),
  }
  return { attributes, chosen, values, ownBase, usable, steps, bases, change }
}

const playerName = (project: RomProject, team: number, index: number): string | undefined =>
  team === FREE_AGENTS ? project.freeAgents[index]?.player.name : project.teams[team]?.players[index]?.name

// Ticks past the end of a roster, which Undo can leave, are dropped; so is a side whose team is gone.
export function liveSides(project: RomProject, sides: [TradeSide, TradeSide]): [TradeSide, TradeSide] {
  return sides.map((side) => ({ ...side, picks: side.picks.filter((i) => playerName(project, side.team, i) !== undefined) })) as [TradeSide, TradeSide]
}

export const tradeKept = (project: RomProject, sides: [TradeSide, TradeSide]): TradeKept => ({
  sides,
  names: sides.map((side) => side.picks.map((i) => playerName(project, side.team, i) ?? '')) as [string[], string[]],
})

// The kept sides on the ROM as it is now: a tick whose player is no longer in that place, because a roster was
// changed on another page, is dropped rather than left on someone else.
export function keptSides(project: RomProject, kept: TradeKept): [TradeSide, TradeSide] {
  return kept.sides.map((side, s) => ({
    ...side,
    picks: side.picks.filter((i, n) => playerName(project, side.team, i) === kept.names[s][n]),
  })) as [TradeSide, TradeSide]
}

export interface WorkLeft {
  // The page's place in the list of pages, from App.
  page: 'bulk' | 'trade' | 'importTeam'
  text: string
  // The button there that does it.
  button: string
}

// What is set up but not done, on the ROM as it is now.
export function workLeft(project: RomProject, work: PageWork): WorkLeft[] {
  const left: WorkLeft[] = []
  if (work.bulk?.touched) {
    const count = previewBulk(project, bulkSetup(project, work.bulk.form).change).length
    if (count > 0) left.push({ page: 'bulk', text: `Bulk changes has a change for ${people(count)} set up but not applied.`, button: 'Apply' })
  }
  if (work.trade) {
    const picked = keptSides(project, work.trade).reduce((sum, side) => sum + side.picks.length, 0)
    if (picked > 0) left.push({ page: 'trade', text: `Trade has ${people(picked)} ticked, but the trade is not made.`, button: 'Make this trade' })
  }
  const kept = work.importTeam
  if (kept?.dirty && Object.values(kept.parts).some(Boolean)) {
    const theirs = teamLabels(kept.other.teams, kept.other.game)[kept.from]
    const ours = teamLabels(project.teams, project.game)[kept.to]
    if (theirs && ours) left.push({ page: 'importTeam', text: `Import a team has ${theirs} from ${kept.fileName} chosen to replace ${ours}, but not imported.`, button: 'Import' })
  }
  return left
}
