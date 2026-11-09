import { useState } from 'react'
import { SNES_COLORS } from './core/color'
import type { RomProject } from './core/rom'
import { snesBlockColours, withSnesBlockColours } from './core/snesblockcolours'
import { PaletteEditor } from './Palette'
import { ResetButton } from './ResetButton'

interface Props {
  project: RomProject
  // The ROM as opened, which Reset goes back to.
  original: RomProject
  team: number
  onChange: (project: RomProject) => void
}

// Colour 0 is see-through, so it is not offered.
const LABELS = Array.from({ length: 15 }, (_, i) => `Colour ${i + 1}`)
const same = (a: number[], b: number[]) => a.length === b.length && a.every((word, i) => (word & 0x7fff) === (b[i] & 0x7fff))

// The SNES game's name banner colours: the 16 colours of the team block its
// name is drawn on, on the menus. See core/snesblockcolours.ts.
export function SnesBannerColoursEditor({ project, original, team, onChange }: Props) {
  const [problem, setProblem] = useState('')
  const colours = snesBlockColours(project, team)
  if (!colours) return null
  const before = original.teams.length === project.teams.length ? snesBlockColours(original, team) : null

  function set(next: number[]) {
    try {
      onChange(withSnesBlockColours(project, team, next))
      setProblem('')
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <section>
      <h2>Name banner colours</h2>
      <p className="note">
        The colours of the block the team's name is drawn on, on the menus (team select, game setup, rosters, matchups
        and stats) and in the playoff bracket. Colours 2 to 7 and 8 to 14 are each a run of shades from one of the team's colours.
      </p>
      <PaletteEditor palette={colours.slice(1)} labels={LABELS} format={SNES_COLORS} onChange={(next) => set([colours[0], ...next])} />
      {problem && <p className="error">{problem}</p>}
      <p>
        <ResetButton what="banner colours" changed={!!before && !same(colours, before)} onReset={() => before && set(before)} />
      </p>
    </section>
  )
}
