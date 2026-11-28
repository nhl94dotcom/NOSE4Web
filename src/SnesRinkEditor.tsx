import { CrowdColoursSection } from './CrowdColoursSection'
import { useEffect, useMemo, useRef, useState } from 'react'
import { download } from './download'
import { colorRgb, SNES_COLORS } from './core/color'
import type { RomProject } from './core/rom'
import { pictureToImage, type Picture } from './core/graphics'
import { drawSnesRink, importSnesRink, snesRinkFileColours, SnesRinkImportError, snesRinkImportable } from './core/snesrink'
import { NO_SNES_PICTURE_EDITS, snesCentreIce, snesPicturesSupported } from './core/snespictures'
import { teamDisplayName } from './core/team'
import { PaletteEditor } from './Palette'
import { ResetButton } from './ResetButton'
import { pictureToPng, readImage } from './images'
import { PixelEditor } from './PixelEditor'

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
  // A change to the ROM itself (an imported rink, or each home team's crowd colours).
  onProject?: (project: RomProject) => void
}

// The first row of the pause and intermission scoreboard's side view, below the rink in play.
const SIDE_FROM = 680

export function SnesRinkEditor({ project, original, onChange, onProject }: Props) {
  const palette = project.rinkPalette
  const teams = project.teams
  const [home, setHome] = useState(0)
  const [visitor, setVisitor] = useState(Math.min(1, teams.length - 1))
  const canvas = useRef<HTMLCanvasElement>(null)
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)
  // Which part the editor draws on: the rink in play, or the pause scoreboard's side view below it.
  const [editing, setEditing] = useState<false | 'rink' | 'side'>(false)
  const [refused, setRefused] = useState('')

  const edits = project.snesPictures ?? NO_SNES_PICTURE_EDITS
  const ice = useMemo(
    () => (snesPicturesSupported(project.bytes, teams.length) ? snesCentreIce(project.bytes, teams.length, edits, home, palette) : null),
    [project.bytes, teams.length, edits, home, palette],
  )
  const picture = useMemo(() => drawSnesRink(project.bytes, ice?.picture ?? null), [project.bytes, ice])

  // As the game has them during play: the teams' colours in rows 2 and 3, and a team's own centre ice colours.
  const colours = useMemo(() => {
    const out = palette.slice()
    for (let i = 0; i < COLOURS; i++) {
      out[2 * COLOURS + i] = teams[home].palette[i] ?? out[2 * COLOURS + i]
      out[3 * COLOURS + i] = teams[visitor].palette[COLOURS + i] ?? out[3 * COLOURS + i]
    }
    if (ice?.ownColours) for (let i = 1; i < COLOURS; i++) out[5 * COLOURS + i] = ice.palette[5 * COLOURS + i]
    return out
  }, [palette, teams, home, visitor, ice])
  const importable = onProject !== undefined && snesRinkImportable(project.bytes)
  // The whole picture without the centre ice logo (its cells stay as they are); the editor draws on the rows in play,
  // or on the side view's rows below them, and a stroke goes in as the whole picture.
  const whole = useMemo(() => drawSnesRink(project.bytes, null), [project.bytes])
  const bare = useMemo(() => {
    if (!whole) return null
    if (editing === 'side') return whole.height > SIDE_FROM ? { width: whole.width, height: whole.height - SIDE_FROM, pixels: whole.pixels.slice(whole.width * SIDE_FROM) } : null
    return { width: whole.width, height: SIDE_FROM, pixels: whole.pixels.slice(0, whole.width * SIDE_FROM) }
  }, [whole, editing])
  // A drawing as the whole picture: the side view's rows put under the rink's.
  const asWhole = (p: Picture): Picture => {
    if (editing !== 'side' || !whole) return p
    const pixels = whole.pixels.slice()
    pixels.set(p.pixels, whole.width * SIDE_FROM)
    return { width: whole.width, height: whole.height, pixels }
  }
  // Saved, edited and put back in one set of colours whoever is chosen to look at (snesRinkFileColours).
  const files = useMemo(() => snesRinkFileColours(project), [project])
  const asImage = (p: Picture) => ({ rgba: pictureToImage(p, files, SNES_COLORS), width: p.width, height: p.height })
  const put = (image: { rgba: Uint8Array | Uint8ClampedArray; width: number; height: number }) => importSnesRink(project.bytes, image, files, project.source)

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context || !picture) return
    const rgb = colours.map((word) => colorRgb(word, SNES_COLORS))
    const data = context.createImageData(picture.width, picture.height)
    picture.pixels.forEach((value, i) => data.data.set([...rgb[value], 255], i * 4))
    context.putImageData(data, 0, 0)
  }, [picture, colours])

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
      <section data-tab-always>
        <h2>Rink colours</h2>
        <p className="note">
          The rink is the same for every game; the home team's centre ice logo is put in its middle, and the players on
          the benches are drawn in the two teams' uniform colours. The game also uses some of these colours for other
          graphics, so a change can show there too. <b>Each home team's crowd colours</b>, below, dresses the crowd by
          home team.
        </p>
        <p>
          {teamSelect('Home', home, setHome)} {teamSelect('Visitors', visitor, setVisitor)}{' '}
          {picture && (
            <button
              onClick={() => {
                // The whole rink in the file colours (snesRinkFileColours), the centre ice logo's place as the rink has it.
                const whole = drawSnesRink(project.bytes, null)
                if (whole) void pictureToPng(whole, files, SNES_COLORS).then((png) => download(png, 'rink.png', 'image/png'))
              }}
            >
              Export as PNG
            </button>
          )}{' '}
          {importable && (
            <>
              <label className="button">
                Import a PNG…
                <input
                  type="file"
                  accept="image/png,image/*"
                  hidden
                  aria-label="Import a rink picture"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    try {
                      const result = put(await readImage(file))
                      onProject!({ ...project, bytes: result.rom })
                      setMessage({ text: `The rink is now the picture: it takes ${result.used} of the ${result.room} squares of 8 by 8 pixels there is room for. Undo takes it back.`, failed: false })
                    } catch (err) {
                      setMessage({ text: err instanceof SnesRinkImportError ? err.message : `${file.name} could not be read as a picture.`, failed: true })
                    }
                  }}
                />
              </label>{' '}
              <button aria-pressed={editing === 'rink'} onClick={() => setEditing(editing === 'rink' ? false : 'rink')}>
                {editing === 'rink' ? 'Stop editing' : 'Edit the rink…'}
              </button>{' '}
              {whole && whole.height > SIDE_FROM && (
                <button aria-pressed={editing === 'side'} onClick={() => setEditing(editing === 'side' ? false : 'side')}>
                  {editing === 'side' ? 'Stop editing' : 'Edit the pause side view…'}
                </button>
              )}
            </>
          )}
        </p>
        <p className="note">
          <b>Export as PNG</b> saves the whole rink, the boards, benches, penalty boxes and crowd too (in the rink's own
          colours, the first two teams on the benches, whoever is chosen above, and without a centre ice logo), to
          look at or to draw on in a paint program. <b>Import a PNG</b> puts an edited one back: the same size (or only
          its top 680 rows), each square of 8 by 8 pixels in the colours its square has now, matched to the nearest. The
          centre ice logo's place, the crowd's moving squares and the replay icon stay as they are. The rows below the
          rink (from 680 pixels down) are the pause and intermission scoreboard's side view: with the whole picture, 904
          rows, ads can go on its boards and glass too (its left 256 pixels show, from about 680 to 840 down). The rink has room for its own squares and about 85 more; a square that
          repeats another, turned round or not, costs nothing. <b>Edit the rink…</b> draws on it here, a stroke at a
          time, with the same rules, and <b>Edit the pause side view…</b> the side view's rows below it (the boards and stands
          seen from the side at a pause, an intermission or a penalty; its left 256 pixels show). Tested in the game by
          the NHL94 Match Viewer project.
        </p>
        {message && <p className={message.failed ? 'error' : 'note'}>{message.text}</p>}
        {editing && importable && bare && (
          <PixelEditor
            key={editing}
            title={editing === 'side' ? 'Pause side view' : 'Rink'}
            picture={bare}
            palette={files}
            format={SNES_COLORS}
            colours={[...Array.from({ length: 15 }, (_, i) => i + 1), ...Array.from({ length: 15 }, (_, i) => i + 17)]}
            limit={(p) => {
              try {
                const result = put(asImage(asWhole(p)))
                return { text: `It takes ${result.used} of the ${result.room} squares of 8 by 8 pixels the rink has room for.`, over: false }
              } catch (err) {
                return err instanceof SnesRinkImportError ? { text: err.message, over: true } : null
              }
            }}
            problem={refused || undefined}
            snap={8}
            startZoom={4}
            onCommit={(p) => {
              try {
                onProject!({ ...project, bytes: put(asImage(asWhole(p))).rom })
                setRefused('')
              } catch (err) {
                setRefused(err instanceof SnesRinkImportError ? err.message : String(err))
              }
            }}
            onClose={() => {
              setEditing(false)
              setRefused('')
            }}
          />
        )}
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
      {onProject && <CrowdColoursSection project={project} onChange={onProject} />}
    </main>
  )
}
