import { useState } from 'react'
import {
  awayFromHome,
  canAddGenesisScoreLogos,
  GENESIS_SCORE_LOGO,
  GENESIS_SCORE_LOGO_ROWS,
  genesisScoreLogo,
  genesisScoreLogoFromCentreIce,
  genesisScoreLogoFromImage,
  hasGenesisScoreLogos,
  SCORE_BACKGROUND,
  withGenesisScoreLogo,
  withGenesisScoreLogosAdded,
  withGenesisScoreLogosTakenOut,
  withoutGenesisScoreLogo,
} from './core/genesisscorelogos'
import type { RomProject } from './core/rom'
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

const COLOURS = Array.from({ length: 15 }, (_, i) => i + 1)

// Score box logos for the Genesis game. See core/genesisscorelogos.ts.
export function GenesisScoreLogoEditor({ project, team, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const added = hasGenesisScoreLogos(project)
  if (!added && !canAddGenesisScoreLogos(project)) return null
  const roster = project.teams[team]
  const name = teamDisplayName(roster)
  const place = roster.names[0]?.trim() || name
  const letters = roster.names[1]?.trim()
  const palette = roster.palette
  const home = palette.slice(0, 16)
  const away = palette.slice(16, 32)
  const logo = added ? genesisScoreLogo(project, team) : null

  function act(change: () => RomProject, message: string) {
    try {
      const next = change()
      onChange(next)
      const grew = next.bytes.length > project.bytes.length ? ` The ROM grew to ${next.bytes.length / 0x100000} MB to make room.` : ''
      setNotice(message + grew)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  async function importLogo(file: File) {
    try {
      const image = await readImage(file)
      const made = genesisScoreLogoFromImage(image.rgba, image.width, image.height, palette)
      act(() => withGenesisScoreLogo(project, team, made), 'Score logo replaced, in the home colours and, for road games, the away colours.')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `${file.name} could not be read as an image.`)
      setFailed(true)
    }
  }

  return (
    <section>
      <h2>Score logo</h2>
      {!added ? (
        <>
          <p className="note">
            The game prints each team's three letters in the score box during play. NOSE4Web can show a small logo there instead, an idea from
            McMarkis's 32-team SNES build: the score box grows two rows taller so that each team has a logo, 24 by 16 pixels, beside its score. Each
            logo is drawn in its team's uniform colours, the home colours at home and the away colours on the road, as the game colours the teams in
            play, so a team has two. Every team gets logos made from its centre-ice logo, to touch up or replace; taking them out again puts the game
            back as it was.
          </p>
          <p>
            <button onClick={() => act(() => withGenesisScoreLogosAdded(project), 'Score logos added for every team.')}>Add score logos for every team</button>
          </p>
          {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
        </>
      ) : (
        <>
          <p className="note">
            {name}'s logo in the score box, {GENESIS_SCORE_LOGO.width} by {GENESIS_SCORE_LOGO.height} pixels, the logo in the top {GENESIS_SCORE_LOGO_ROWS}{' '}
            rows: in its home colours at home and its away colours on the road, on black (colour {SCORE_BACKGROUND + 1} of the uniform, black in the
            original game). Changing the uniform colours changes the logos with them. A team without one shows its letters.
          </p>
          <p>
            <button
              onClick={() => {
                setDrawing(false)
                act(() => withGenesisScoreLogosTakenOut(project), 'Score logos taken out: every team shows its letters again. Undo puts them back.')
              }}
            >
              Take score logos out of this ROM
            </button>
          </p>
          {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
          {logo ? (
            <div className="picture">
              <span className="note">Home</span> <PictureView picture={logo.home} palette={home} scale={4} />{' '}
              <span className="note">Away</span> <PictureView picture={logo.away} palette={away} scale={4} />
              <p>
                <button
                  onClick={() =>
                    void pictureToPng(logo.home, home)
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
                    act(
                      () => withoutGenesisScoreLogo(project, team),
                      `${name} now shows its letters${letters ? `, ${letters},` : ''} in the score box; every other team keeps its logo. Undo brings this one back.`,
                    )
                  }}
                >
                  Show {place}'s letters instead
                </button>
              </p>
            </div>
          ) : (
            <p>
              <button
                onClick={() =>
                  act(
                    () => withGenesisScoreLogo(project, team, genesisScoreLogoFromCentreIce(project, team)),
                    `${name} has a score logo again, made from its centre-ice logo. Import or draw another if you like.`,
                  )
                }
              >
                Give {place} a score logo
              </button>{' '}
              <span className="note">
                {place} shows its letters{letters ? ` (${letters})` : ''} in the score box; the other teams are as they are.
              </span>
            </p>
          )}
          {drawing && logo && (
            <>
              <h3>Drawing the score logo</h3>
              <p className="note">
                In the home colours; the away logo is made from it, each colour matched to the nearest of the away colours. Keep the bottom rows clear,
                and the background colour {SCORE_BACKGROUND + 1}, black.
              </p>
              <PixelEditor
                key={team}
                title="Score logo"
                picture={logo.home}
                palette={home}
                colours={COLOURS}
                problem={failed ? notice : undefined}
                onCommit={(picture) => act(() => withGenesisScoreLogo(project, team, { home: picture, away: awayFromHome(picture, palette) }), '')}
                onClose={() => setDrawing(false)}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}
