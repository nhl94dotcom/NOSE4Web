import { useState } from 'react'
import { HorBoardError, HOR_MOST_TILES, readHorBoard, withHorBoardImage, withOriginalHorBoard } from './core/horboard'
import type { RomProject } from './core/rom'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'

interface Props {
  project: RomProject
  opened: RomProject
  onChange: (project: RomProject) => void
}

// The side-on scoreboard screen's picture (horboard.ts, Genesis NHL 94): behind the pause menu, the intermission and a
// penalty's side-on view.
export function HorBoardSection({ project, opened, onChange }: Props) {
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null)
  const board = readHorBoard(project)
  if (!board) return null
  const wasOriginal = readHorBoard(opened)?.original ?? true

  async function importPicture(file: File) {
    try {
      let image
      try {
        image = await readImage(file)
      } catch {
        throw new Error(`${file.name} could not be read as an image.`)
      }
      const made = withHorBoardImage(project, image.rgba, image.width, image.height)
      onChange(made.project)
      setNotice({ text: `${file.name} is now the side-on scoreboard's picture: it takes ${made.tiles} of the ${HOR_MOST_TILES} squares there is room for. Undo takes it back.`, failed: false })
    } catch (e) {
      setNotice({ text: e instanceof HorBoardError || e instanceof Error ? e.message : String(e), failed: true })
    }
  }

  return (
    <section>
      <h2>Side-on scoreboard</h2>
      <p className="note">
        The rink seen from the side, behind the pause menu, the intermission and a penalty's side-on view: a place for a
        league's logo or ads on the boards and glass (about rows 17 to 21 of the 28, 136 to 175 pixels down). The team
        blocks, scores and clock cover rows 2 to 5, and the menu box, the intermission's scores and a penalty's name bar
        cover their parts while they show. It is drawn in the rink's own colours (the Rink colours above), all of them
        to use; a picture of your own, 256 by 224 pixels as <b>Export as PNG</b> saves it, has room for{' '}
        {HOR_MOST_TILES} different 8 by 8 squares. Tested in the game by the NHL94 Match Viewer project.
      </p>
      <PictureView picture={board.picture} palette={board.palette} scale={2} />
      <p>
        <button
          onClick={() =>
            void pictureToPng(board.picture, board.palette)
              .then((png) => download(png, 'side_on_scoreboard.png', 'image/png'))
              .catch((e) => setNotice({ text: e instanceof Error ? e.message : String(e), failed: true }))
          }
        >
          Export as PNG
        </button>{' '}
        <label className="button">
          Import a PNG…
          <input
            type="file"
            accept="image/png,image/*"
            hidden
            aria-label="Import a side-on scoreboard picture"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importPicture(file)
            }}
          />
        </label>{' '}
        <button
          disabled={board.original}
          onClick={() => {
            try {
              onChange(withOriginalHorBoard(project))
              setNotice({ text: "The original game's side-on scoreboard picture is back. Undo takes it back.", failed: false })
            } catch (e) {
              setNotice({ text: e instanceof Error ? e.message : String(e), failed: true })
            }
          }}
        >
          Put back the original
        </button>{' '}
        <span className="note">{board.original ? "The original game's picture." : wasOriginal ? 'A picture of your own.' : 'This ROM has a picture of its own.'}</span>
      </p>
      {notice && <p className={notice.failed ? 'error' : 'note'}>{notice.text}</p>}
    </section>
  )
}
