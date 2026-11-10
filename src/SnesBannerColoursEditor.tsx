import { useState } from 'react'
import { SNES_COLORS } from './core/color'
import type { RomProject } from './core/rom'
import { snesPlaceNameRoom } from './core/snesplacenames'
import { teamLabels } from './core/team'
import { SNES_BLOCK_KEPT, snesBlockColours, withSnesBlockColours } from './core/snesblockcolours'
import { snesBlockPicture } from './core/snesblockpicture'
import { PictureView } from './GraphicsEditor'
import { PaletteEditor } from './Palette'
import { ResetButton } from './ResetButton'

interface Props {
  project: RomProject
  // The ROM as opened, which Reset goes back to.
  original: RomProject
  team: number
  onChange: (project: RomProject) => void
}

// Colours 2 to 14 fill the block and 15 is its frame. 0 is see-through and 1 is
// the menu text, so neither is offered (see core/snesblockcolours.ts).
const LABELS = [...Array.from({ length: 13 }, (_, i) => `Fill ${i + 1} (colour ${i + 2})`), 'Frame (colour 15)']
const same = (a: number[], b: number[]) => a.length === b.length && a.every((word, i) => i < SNES_BLOCK_KEPT || (word & 0x7fff) === (b[i] & 0x7fff))

// The SNES game's name banner colours: the 16 colours of the team block its
// name is drawn on, on the menus. See core/snesblockcolours.ts.
export function SnesBannerColoursEditor({ project, original, team, onChange }: Props) {
  const [problem, setProblem] = useState('')
  const [from, setFrom] = useState<number | null>(null)
  const [nameToo, setNameToo] = useState(true)
  const [copied, setCopied] = useState('')
  const colours = snesBlockColours(project, team)
  if (!colours) return null
  const before = original.teams.length === project.teams.length ? snesBlockColours(original, team) : null
  // The banner as the menus show it, with the team's banner name on it.
  const banner = snesBlockPicture(project.bytes, colours, project.teams[team].placeName ?? '')

  function set(next: number[]) {
    try {
      onChange(withSnesBlockColours(project, team, next))
      setProblem('')
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    }
  }

  // Another team's banner for this one: its colours, and the name lettered on it unless unticked.
  const labels = teamLabels(project.teams, project.game)
  const others = project.teams.map((_, i) => i).filter((i) => i !== team && snesBlockColours(project, i))
  const source = from !== null && others.includes(from) ? from : (others[0] ?? null)
  function takeBanner() {
    if (source === null) return
    try {
      const theirs = snesBlockColours(project, source)!
      let next = withSnesBlockColours(project, team, [...colours!.slice(0, SNES_BLOCK_KEPT), ...theirs.slice(SNES_BLOCK_KEPT)])
      const name = project.teams[source].placeName
      const withName = nameToo && name !== undefined && project.teams[team].placeName !== undefined
      if (withName) next = { ...next, teams: next.teams.map((t, i) => (i === team ? { ...t, placeName: name } : t)) }
      // The banner names share a table with little room; a longer one may not fit until others are shortened.
      const room = withName ? snesPlaceNameRoom(next.bytes, next.teams.map((t) => t.placeName ?? ''), next.layout.overflow) : null
      const short = room && room.used > room.room ? room.used - room.room : 0
      onChange(next)
      setCopied(
        `This team's banner now has ${labels[source]}'s colours${withName ? ` and reads ${name}` : ''}. Undo takes it back.` +
          (short
            ? ` But the banner names have no room for it: they need ${short} ${short === 1 ? 'letter' : 'letters'} more than this ROM holds, so the game keeps showing the old name until some are shortened (Banner name, above).`
            : ''),
      )
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
        and stats), on the pause scoreboard and in the playoff bracket. Colours 2 to 7 and 8 to 14, the fill, are each a run of
        shades from one of the team's colours, and colour 15 is the frame. Colours 7 and 8 also colour the stripes on the
        player card's team page.
      </p>
      {banner && (
        <p>
          <PictureView picture={banner.picture} palette={banner.palette} scale={4} format={SNES_COLORS} />
        </p>
      )}
      <PaletteEditor palette={colours.slice(SNES_BLOCK_KEPT)} labels={LABELS} format={SNES_COLORS} onChange={(next) => set([...colours.slice(0, SNES_BLOCK_KEPT), ...next])} />
      {problem && <p className="error">{problem}</p>}
      <p>
        <ResetButton what="banner colours" changed={!!before && !same(colours, before)} onReset={() => before && set(before)} />
      </p>
      {source !== null && (
        <p>
          <button onClick={takeBanner}>Use the banner of</button>{' '}
          <select className="wide" aria-label="Team whose banner to use" value={source} onChange={(e) => setFrom(Number(e.target.value))}>
            {others.map((other) => (
              <option key={other} value={other}>
                {labels[other]}
              </option>
            ))}
          </select>{' '}
          {project.teams[team].placeName !== undefined && (
            <label className="choice">
              <input type="checkbox" checked={nameToo} onChange={(e) => setNameToo(e.target.checked)} /> and its banner name
            </label>
          )}{' '}
          <span className="note">That team keeps its own.</span>
        </p>
      )}
      {copied && <p className="note">{copied}</p>}
    </section>
  )
}
