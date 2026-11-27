import { useEffect, useMemo, useRef, useState } from 'react'
import { ARENA_SLOTS, readArenaColours, RINK_OWN } from './core/arenacolours'
import { drawGenesisRink, importGenesisRink, readGenesisRink, RinkImportError, type RinkView } from './core/genesisrink'
import { pictureToImage } from './core/graphics'
import type { RomProject } from './core/rom'
import { teamDisplayName } from './core/team'
import { download } from './download'
import { pictureToPng, readImage } from './images'

interface Props {
  project: RomProject
  // The ROM as it was opened, for Put back the original rink, and a change to the ROM (an imported rink).
  opened?: RomProject
  onChange?: (project: RomProject) => void
}

// The Genesis rink as the game draws it, boards, crowd, benches and ice markings, in the rink colours above and two
// teams' colours for the players on the benches; to look at, to save as a PNG, and on NHL 94 to put an edited one back
// (genesisrink.ts): the rink in play, and the reverse angle replay's own.
export function GenesisRinkPicture({ project, opened, onChange }: Props) {
  const [home, setHome] = useState(0)
  const [away, setAway] = useState(Math.min(1, project.teams.length - 1))
  const [view, setView] = useState<RinkView>('play')
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null)
  // A picture with too many different squares, kept for Make it fit.
  const [tooMany, setTooMany] = useState<{ image: Awaited<ReturnType<typeof readImage>>; view: RinkView } | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const hasReverse = readGenesisRink(project.bytes, 'reverse') !== null
  // Putting a picture in: NHL 94's rinks (113 rows, the replay icon and three stars box below the rink).
  const importable = (v: RinkView) => (readGenesisRink(project.bytes, v)?.height ?? 0) === 113 && onChange !== undefined
  const drawn = useMemo(() => {
    const rink = drawGenesisRink(project.bytes, project.teams[home]?.palette.slice(0, 16), project.teams[away]?.palette.slice(16, 32), view)
    // The rink's own two lines as the page has them now (the reverse rink is drawn in them too, as the game does),
    // with the home team's own boards trim and red markings where it has them (arenacolours.ts).
    if (!rink) return null
    const palette = [...project.rinkPalette.slice(0, 32), ...rink.palette.slice(32)]
    const own = readArenaColours(project)?.[home]
    ARENA_SLOTS.forEach((slot, i) => {
      if (own && own[i] !== RINK_OWN) palette[slot] = own[i]
    })
    return { picture: rink.picture, palette }
  }, [project, home, away, view])

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context || !drawn) return
    const image = context.createImageData(drawn.picture.width, drawn.picture.height)
    image.data.set(pictureToImage(drawn.picture, drawn.palette))
    context.putImageData(image, 0, 0)
  }, [drawn])

  if (!drawn) return null
  // The rink's tiles and map, as the ROM has them and as it was opened.
  const region = (rom: Uint8Array, v: RinkView) => {
    const rink = readGenesisRink(rom, v)
    return rink ? { tiles: [rink.tilesAt, rink.tilesAt + rink.tileCount * 32], map: [rink.mapAt + 4, rink.mapAt + 4 + rink.width * rink.height * 2] } : null
  }
  const changed = (v: RinkView) => {
    const [now, was] = [region(project.bytes, v), opened && region(opened.bytes, v)]
    if (!now || !was) return false
    return [now.tiles, now.map].some(([from, to], k) => {
      const [wFrom] = k === 0 ? was.tiles : was.map
      for (let i = 0; i < to - from; i++) if (project.bytes[from + i] !== opened!.bytes[wFrom + i]) return true
      return false
    })
  }
  const putBack = () => {
    if (!opened || !onChange) return
    const bytes = project.bytes.slice()
    for (const v of ['play', 'reverse'] as const) {
      const [now, was] = [region(bytes, v), region(opened.bytes, v)]
      if (!now || !was) continue
      bytes.set(opened.bytes.subarray(was.tiles[0], was.tiles[1]), now.tiles[0])
      bytes.set(opened.bytes.subarray(was.map[0], was.map[1]), now.map[0])
    }
    onChange({ ...project, bytes })
    setMessage({ text: 'The rink is the one the ROM had when it was opened. Undo takes it back.', failed: false })
  }
  const putIn = (image: Awaited<ReturnType<typeof readImage>>, fit: boolean) => {
    setTooMany(null)
    try {
      const result = importGenesisRink(project.bytes, view, image, drawn.palette, fit)
      onChange!({ ...project, bytes: result.rom })
      const swapped = result.swapped
        ? ` To fit, ${result.swapped} of its squares were swapped for the closest ones the rink has: ${result.pixels} ${result.pixels === 1 ? 'pixel' : 'pixels'} in ${result.places} ${result.places === 1 ? 'place' : 'places'} differ from the picture.`
        : ''
      setMessage({
        text: `${view === 'play' ? 'The rink' : "The reverse angle replay's rink"} is now the picture: it takes ${result.used} of the ${result.room} squares of 8 by 8 pixels there is room for.${swapped} Undo takes it back.`,
        failed: false,
      })
    } catch (e) {
      if (e instanceof RinkImportError && e.over > 0) setTooMany({ image, view })
      setMessage({ text: e instanceof Error ? e.message : String(e), failed: true })
    }
  }
  const importFile = async (file: File) => {
    let image: Awaited<ReturnType<typeof readImage>>
    try {
      image = await readImage(file)
    } catch {
      setTooMany(null)
      setMessage({ text: `${file.name} could not be read as a picture.`, failed: true })
      return
    }
    putIn(image, false)
  }
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
        {` ${drawn.picture.width} by ${drawn.picture.height}`} pixels. The block at centre ice is where the game puts
        the home team's centre ice logo as a game starts{drawn.picture.height > 700 ? '; and only the top 680 rows are the rink, the rows below holding the replay icon and other pieces the game uses' : ''}. The players on the benches take the colours of the teams
        playing, and the home team's own boards trim and red markings show where it has them: choose two to see them. <b>Export as PNG</b> saves the picture, to look at or to draw on in a paint
        program.
      </p>
      {importable(view) && (
        <p className="note">
          <b>Import a PNG</b> puts an edited picture back in place of the rink: the same size as the export (or only its
          top 680 rows), each square of 8 by 8 pixels in the colours its square has now (the rink's, or for the players on
          the benches the teams'), matched to the nearest. The centre ice logo's block, the replay icon and the three
          stars box below the rink stay as they are, and so do the boards and glass drawn in front of the players. The
          rink has room for only so many different squares; one that repeats another, or another turned round, costs
          nothing, and the page says when a picture needs more. The reverse angle replay has a rink of its own: put a
          picture in for it too, or its replays show the old rink. Tested in the game by the NHL94 Match Viewer project.
        </p>
      )}
      <p>
        {hasReverse && (
          <>
            <label>
              Rink{' '}
              <select aria-label="Which rink" value={view} onChange={(e) => setView(e.target.value as RinkView)}>
                <option value="play">In play</option>
                <option value="reverse">Reverse angle replays</option>
              </select>
            </label>{' '}
          </>
        )}
        {teamChoice('Home', home, setHome)} {teamChoice('Visitors', away, setAway)}{' '}
        <button
          onClick={async () => {
            try {
              download(await pictureToPng(drawn.picture, drawn.palette), view === 'play' ? 'rink.png' : 'rink_reverse.png', 'image/png')
              setMessage(null)
            } catch (e) {
              setMessage({ text: e instanceof Error ? e.message : String(e), failed: true })
            }
          }}
        >
          Export as PNG
        </button>{' '}
        {importable(view) && (
          <label className="button">
            Import a PNG…
            <input
              type="file"
              accept="image/png,image/*"
              hidden
              aria-label="Import a rink picture"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void importFile(file)
              }}
            />
          </label>
        )}{' '}
        {opened && onChange && (changed('play') || changed('reverse')) && <button onClick={putBack}>Put back the original rink</button>}
      </p>
      {message && <p className={message.failed ? 'error' : 'note'}>{message.text}</p>}
      {tooMany && tooMany.view === view && (
        <p>
          <button onClick={() => putIn(tooMany.image, true)}>Make it fit</button>{' '}
          <span className="note">
            swaps the squares that differ least from another for the closest one the rink has, until the picture fits,
            and says how many pixels differ. Undo takes it back.
          </span>
        </p>
      )}
      <div className="rink-picture">
        <canvas ref={canvas} width={drawn.picture.width} height={drawn.picture.height} aria-label="The whole rink" />
      </div>
    </section>
  )
}
