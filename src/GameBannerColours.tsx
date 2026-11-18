import { useMemo } from 'react'
import { cssColor } from './core/color'
import { colourName, inGameColour, spareArenaColour, teamsShowingArenaColour, withArenaColour } from './core/gamebannercolours'
import { bannerColors, bannerPalette } from './core/graphics'
import { letterBanner } from './core/lettering'
import type { RomProject } from './core/rom'
import { teamLabels } from './core/team'
import { PictureView } from './GraphicsEditor'

const STRIPES = ['Top stripe', 'Bottom stripe']

interface Props {
  project: RomProject
  team: number
  // What the banner lettering reads, for the preview.
  text: string
  onChange: (project: RomProject) => void
  onShowRink?: () => void
}

const Swatch = ({ word, title }: { word: number; title: string }) => (
  <span className="inline-swatch" title={title} style={{ background: cssColor(word) }} />
)

// As the Rink colours page names them.
const arenaLabel = (slot: number) => `Arena colour ${slot.toString(16).toUpperCase()}`

const listed = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

// NHL 94's in-game banners share the arena's 16 colours: how each stripe
// colour shows there, and a way to give them one they lack.
export function GameBannerColours({ project, team, text, onChange, onShowRink }: Props) {
  const stripes = bannerColors(project, team)
  const spare = spareArenaColour(project)
  const spareWord = project.rinkPalette[16 + spare]
  const labels = teamLabels(project.teams, project.game)
  const showing = useMemo(() => teamsShowingArenaColour(project, spare), [project, spare])
  const shown = stripes.map((word) => inGameColour(project, word))

  return (
    <div className="game-banner-colours">
      {stripes.map((word, i) => {
        const now = shown[i]
        // The one spare colour already gives the other stripe its colour.
        const taken = shown.some((other, j) => j !== i && other.slot === spare && !other.far && stripes[j] !== word)
        const next = withArenaColour(project, spare, word)
        let preview = null
        try {
          preview = letterBanner(next, 'game', team, text)
        } catch {
          // Nothing to letter; the preview is left out.
        }
        return (
          <div key={i}>
            <p>
              {STRIPES[i]} in the game: <Swatch word={now.word} title={arenaLabel(now.slot)} />{' '}
              {now.far && (
                <span className="note">
                  In the game this shows as {colourName(now.word)}: the in-game banners share 16 colours with the crowd, and
                  none is close to this one.
                </span>
              )}
            </p>
            {now.far && !taken && (
              <div className="game-colour-tool">
                <p>
                  <button onClick={() => onChange(next)}>Use this colour in the game too</button>{' '}
                  <span className="note">
                    Replaces the in-game colour <Swatch word={spareWord} title={arenaLabel(spare)} /> (
                    {colourName(spareWord)}, arena colour {spare.toString(16).toUpperCase()}), which also changes it in the crowd
                    {showing.length > 0 && ` and on the in-game banners of ${listed(showing.map((other) => labels[other]))}`}. Then
                    letter the in-game banner again. Undo takes it back.
                  </span>
                </p>
                {preview && (
                  <p>
                    <span className="note">The in-game banner with it: </span>
                    <PictureView picture={preview} palette={bannerPalette(next, 'game', team)} scale={2} />
                  </p>
                )}
              </div>
            )}
            {now.far && taken && <p className="note">The one colour the game can spare already holds the other stripe's.</p>}
          </div>
        )
      })}
      <p className="note">
        The in-game colours are the arena colours on{' '}
        {onShowRink ? (
          <button className="link" onClick={onShowRink}>
            Rink colours
          </button>
        ) : (
          'Rink colours'
        )}
        .
      </p>
    </div>
  )
}
