import { useEffect, useMemo, useRef, useState } from 'react'
import { colorRgb, SNES_COLORS } from './core/color'
import type { RomProject } from './core/rom'
import { drawSnesRink } from './core/snesrink'
import { NO_SNES_PICTURE_EDITS, snesCentreIce, snesPicturesSupported } from './core/snespictures'
import { teamDisplayName } from './core/team'
import { PaletteEditor } from './Palette'
import { ResetButton } from './ResetButton'

const COLOURS = 16
// The rows of the rink's 128 colours offered, by what they are for. Rows 2
// and 3 are not: the game puts the home team's and the visitors' uniform
// colours there for every game, for the players on the benches.
const GROUPS = [
  { title: 'Rink', rows: [0, 1], what: 'rink colours', note: 'The ice, its lines, the boards and the crowd.' },
  {
    title: 'Centre ice',
    rows: [5, 6],
    what: 'centre ice colours',
    note: "The colours every team's centre ice logo is drawn in, unless the team has colours of its own.",
  },
  { title: 'Other', rows: [4, 7], what: 'other colours', note: 'Not drawn on the rink; the game may use them for other pictures on the game screen.' },
]

const labelsFor = (rows: number[]) => rows.flatMap((row) => Array.from({ length: COLOURS }, (_, i) => `Row ${row} colour ${i.toString(16).toUpperCase()}`))

interface Props {
  project: RomProject
  // The colours as they are in the ROM that was opened.
  original: number[]
  onChange: (palette: number[]) => void
}

export function SnesRinkEditor({ project, original, onChange }: Props) {
  const palette = project.rinkPalette
  const teams = project.teams
  const [home, setHome] = useState(0)
  const [visitor, setVisitor] = useState(Math.min(1, teams.length - 1))
  const canvas = useRef<HTMLCanvasElement>(null)

  const edits = project.snesPictures ?? NO_SNES_PICTURE_EDITS
  const ice = useMemo(
    () => (snesPicturesSupported(project.bytes, teams.length) ? snesCentreIce(project.bytes, teams.length, edits, home, palette) : null),
    [project.bytes, teams.length, edits, home, palette],
  )
  const picture = useMemo(() => drawSnesRink(project.bytes, ice?.picture ?? null), [project.bytes, ice])

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context || !picture) return
    // As the game has them during play: the teams' colours in rows 2 and 3, and a team's own centre ice colours.
    const colours = palette.slice()
    for (let i = 0; i < COLOURS; i++) {
      colours[2 * COLOURS + i] = teams[home].palette[i] ?? colours[2 * COLOURS + i]
      colours[3 * COLOURS + i] = teams[visitor].palette[COLOURS + i] ?? colours[3 * COLOURS + i]
    }
    if (ice?.ownColours) for (let i = 1; i < COLOURS; i++) colours[5 * COLOURS + i] = ice.palette[5 * COLOURS + i]
    const rgb = colours.map((word) => colorRgb(word, SNES_COLORS))
    const data = context.createImageData(picture.width, picture.height)
    picture.pixels.forEach((value, i) => data.data.set([...rgb[value], 255], i * 4))
    context.putImageData(data, 0, 0)
  }, [picture, palette, teams, home, visitor, ice])

  const replaceRows = (rows: number[], next: number[]) => {
    const out = palette.slice()
    rows.forEach((row, r) => out.splice(row * COLOURS, COLOURS, ...next.slice(r * COLOURS, (r + 1) * COLOURS)))
    return out
  }
  const rowsOf = (from: number[], rows: number[]) => rows.flatMap((row) => from.slice(row * COLOURS, (row + 1) * COLOURS))
  const teamSelect = (label: string, value: number, onValue: (team: number) => void) => (
    <label>
      {label}{' '}
      <select value={value} onChange={(e) => onValue(Number(e.target.value))}>
        {teams.map((team, t) => (
          <option key={t} value={t}>
            {teamDisplayName(team)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <main className="team">
      <section>
        <h2>Rink colours</h2>
        <p className="note">
          The rink is the same for every game; the home team's centre ice logo is put in its middle, and the players on
          the benches are drawn in the two teams' uniform colours. The game also uses some of these colours for its
          moving pictures, so a change can show there too.
        </p>
        <p>
          {teamSelect('Home', home, setHome)} {teamSelect('Visitors', visitor, setVisitor)}
        </p>
        {picture && (
          <div className="rink-preview">
            <canvas ref={canvas} className="preview" width={picture.width} height={picture.height} aria-label="Rink preview" />
          </div>
        )}
      </section>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <p className="note">{group.note}</p>
          <PaletteEditor
            palette={rowsOf(palette, group.rows)}
            labels={labelsFor(group.rows)}
            format={SNES_COLORS}
            onChange={(next) => onChange(replaceRows(group.rows, next))}
          />
          <p>
            <ResetButton
              what={group.what}
              changed={rowsOf(palette, group.rows).join() !== rowsOf(original, group.rows).join()}
              onReset={() => onChange(replaceRows(group.rows, rowsOf(original, group.rows)))}
            />
          </p>
        </section>
      ))}
    </main>
  )
}
