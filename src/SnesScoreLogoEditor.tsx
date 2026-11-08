import { useState } from 'react'
import { SNES_COLORS } from './core/color'
import type { RomProject } from './core/rom'
import {
  blankScoreLogo,
  SCORE_BLACK,
  SCORE_FIRST_OWN,
  SCORE_LOGO,
  SCORE_LOGO_ROWS,
  SCORE_RING,
  scoreLogoFromImage,
  snesScoreLogo,
  withoutSnesScoreLogo,
  withSnesScoreLogo,
} from './core/snesscorelogos'
import { canAddScoreLogos, hasAddedScoreLogos, withScoreLogosAdded, withScoreLogosTakenOut } from './core/snesscorecode'
import { teamDisplayName } from './core/team'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'
import { PixelEditor } from './PixelEditor'

interface Props {
  project: RomProject
  team: number
  onChange: (project: RomProject) => void
}

const OWN = Array.from({ length: 16 - SCORE_FIRST_OWN }, (_, i) => SCORE_FIRST_OWN + i)
const PAINTED = [SCORE_BLACK, SCORE_RING, ...OWN]

// The small logo in the score box of the 32-team SNES builds. See core/snesscorelogos.ts.
export function SnesScoreLogoEditor({ project, team, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const logo = snesScoreLogo(project, team)
  const name = teamDisplayName(project.teams[team])
  const shared = logo?.sharedWith.map((other) => teamDisplayName(project.teams[other])) ?? []

  function act(change: () => RomProject, message: string) {
    try {
      onChange(change())
      setNotice(message)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  async function importLogo(file: File) {
    try {
      const image = await readImage(file)
      const made = scoreLogoFromImage(image.rgba, image.width, image.height, (logo ?? blankScoreLogo()).palette)
      const merged = made.colorsFound > OWN.length ? ` The image had ${made.colorsFound} colours besides the black and the ring; a score logo has ${OWN.length}, so the rest were matched to the nearest.` : ''
      act(() => withSnesScoreLogo(project, team, made.picture, made.palette), `Score logo replaced.${merged}`)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `${file.name} could not be read as an image.`)
      setFailed(true)
    }
  }

  return (
    <section>
      <h2>Score logo</h2>
      <p className="note">
        This ROM shows a small logo for each team in the score box during play, where the original game prints the team's three letters. It is{' '}
        {SCORE_LOGO.width} by {SCORE_LOGO.height} pixels, the logo in the top {SCORE_LOGO_ROWS} rows, on the box's black with a ring, in {OWN.length} colours of
        its own. A team without one shows its letters.
        {hasAddedScoreLogos(project) &&
          " NOSE4Web added them to this ROM, with McMarkis's code from his 32-team build; they can be taken out again, which puts the ROM back as it was."}
      </p>
      {hasAddedScoreLogos(project) && (
        <p>
          <button
            onClick={() => {
              setDrawing(false)
              act(() => withScoreLogosTakenOut(project), 'Score logos taken out: every team shows its letters again. Undo puts them back.')
            }}
          >
            Take score logos out of this ROM
          </button>
        </p>
      )}
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      {logo ? (
        <div className="picture">
          <PictureView picture={logo.picture} palette={logo.palette} scale={4} format={SNES_COLORS} />
          <p>
            <button
              onClick={() =>
                void pictureToPng(logo.picture, logo.palette, SNES_COLORS)
                  .then((png) => download(png, `${name.replace(/[^A-Za-z0-9]+/g, '_')}_score_logo.png`, 'image/png'))
                  .catch((e) => {
                    setNotice(e instanceof Error ? e.message : 'The score logo could not be exported.')
                    setFailed(true)
                  })
              }
            >
              Export PNG
            </button>{' '}
            <label className="button">
              Import…
              <input
                type="file"
                accept="image/*"
                hidden
                aria-label="Import score logo"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void importLogo(file)
                  e.target.value = ''
                }}
              />
            </label>{' '}
            <button aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>
              Draw…
            </button>{' '}
            <button
              onClick={() => {
                setDrawing(false)
                act(() => withoutSnesScoreLogo(project, team), `${name} now shows its letters in the score box. Undo brings the logo back.`)
              }}
            >
              Show the letters instead
            </button>
          </p>
          {shared.length > 0 && <p className="note">Shared with {shared.join(', ')}: a change gives this team its own.</p>}
        </div>
      ) : (
        <p>
          <button
            onClick={() => {
              const blank = blankScoreLogo()
              act(() => withSnesScoreLogo(project, team, blank.picture, blank.palette), `${name} has a score logo now, still empty: import or draw it.`)
            }}
          >
            Give {name} a score logo
          </button>{' '}
          <span className="note">It shows its letters in the score box.</span>
        </p>
      )}
      {drawing && logo && (
        <>
          <h3>Drawing the score logo</h3>
          <p className="note">In the box's black, the ring and {OWN.length} colours of its own, which you can change below. Keep the bottom rows clear, a gap above the score.</p>
          <PixelEditor
            key={team}
            title="Score logo"
            picture={logo.picture}
            palette={logo.palette}
            format={SNES_COLORS}
            colours={PAINTED}
            editable={{ slots: OWN, onChange: (palette) => act(() => withSnesScoreLogo(project, team, logo.picture, palette), '') }}
            problem={failed ? notice : undefined}
            onCommit={(picture) => act(() => withSnesScoreLogo(project, team, picture, logo.palette), '')}
            onClose={() => setDrawing(false)}
          />
        </>
      )}
    </section>
  )
}

// For a ROM laid out as the original game, which has no score logos: they can be added.
export function AddScoreLogos({ project, onChange }: { project: RomProject; onChange: (project: RomProject) => void }) {
  const [problem, setProblem] = useState('')
  if (!canAddScoreLogos(project)) return null
  return (
    <section>
      <h2>Score logo</h2>
      <p className="note">
        The original game prints each team's three letters in the score box during play. McMarkis's 32-team build shows a small logo instead, and
        NOSE4Web can add that to this ROM, with his code: every team gets a score logo made from its team logo, which you can then import or draw
        anew, or take away to show the team's letters. It can be taken out again, which puts the ROM back as it was.
      </p>
      <p>
        <button
          onClick={() => {
            try {
              onChange(withScoreLogosAdded(project))
              setProblem('')
            } catch (e) {
              setProblem(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          Add score logos to this ROM
        </button>
      </p>
      {problem && <p className="error">{problem}</p>}
    </section>
  )
}
