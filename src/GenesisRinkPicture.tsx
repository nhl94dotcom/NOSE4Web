import { useEffect, useMemo, useRef, useState } from 'react'
import { drawGenesisRink } from './core/genesisrink'
import { pictureToImage } from './core/graphics'
import type { RomProject } from './core/rom'
import { teamDisplayName } from './core/team'
import { download } from './download'
import { pictureToPng } from './images'

// The Genesis rink as the game draws it, boards, crowd, benches and ice markings, in the rink colours above and two
// teams' colours for the players on the benches; to look at, and to save as a PNG.
export function GenesisRinkPicture({ project }: { project: RomProject }) {
  const [home, setHome] = useState(0)
  const [away, setAway] = useState(Math.min(1, project.teams.length - 1))
  const [message, setMessage] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawn = useMemo(() => {
    const rink = drawGenesisRink(project.bytes, project.teams[home]?.palette.slice(0, 16), project.teams[away]?.palette.slice(16, 32))
    // The rink's own two lines as the page has them now.
    return rink && { picture: rink.picture, palette: [...project.rinkPalette.slice(0, 32), ...rink.palette.slice(32)] }
  }, [project.bytes, project.teams, project.rinkPalette, home, away])

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context || !drawn) return
    const image = context.createImageData(drawn.picture.width, drawn.picture.height)
    image.data.set(pictureToImage(drawn.picture, drawn.palette))
    context.putImageData(image, 0, 0)
  }, [drawn])

  if (!drawn) return null
  const teamChoice = (label: string, value: number, set: (n: number) => void) => (
    <label>
      {label}{' '}
      <select value={value} onChange={(e) => set(Number(e.target.value))}>
        {project.teams.map((team, i) => (
          <option key={i} value={i}>
            {teamDisplayName(team)}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <section>
      <h2>The whole rink</h2>
      <p className="note">
        The rink as the game has it: the ice and its markings, the boards, the benches, the penalty boxes and the crowd,
        {` ${drawn.picture.width} by ${drawn.picture.height}`} pixels. The block at centre ice is where
        the game puts the home team's centre ice logo as a game starts (in NHL 94 the EA Sports logo too){drawn.picture.height > 700 ? '; and only the top 680 rows are the rink, the rows below holding the replay icon and other pieces the game uses' : ''}. The players on the benches take the colours of the teams
        playing: choose two to see them. <b>Export as PNG</b> saves the picture, to look at or to draw on in a paint
        program. Putting an edited picture back in comes next; it is not offered yet.
      </p>
      <p>
        {teamChoice('Home', home, setHome)} {teamChoice('Visitors', away, setAway)}{' '}
        <button
          onClick={async () => {
            try {
              download(await pictureToPng(drawn.picture, drawn.palette), 'rink.png', 'image/png')
              setMessage('')
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e))
            }
          }}
        >
          Export as PNG
        </button>
      </p>
      {message && <p className="error">{message}</p>}
      <div className="rink-picture">
        <canvas ref={canvas} width={drawn.picture.width} height={drawn.picture.height} aria-label="The whole rink" />
      </div>
    </section>
  )
}
