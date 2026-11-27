import { useState } from 'react'
import { SNES_COLORS } from './core/color'
import type { RomProject } from './core/rom'
import { readSnesSetupPicture, SNES_SETUP_SQUARES, snesSetupPictureFromImage, withOriginalSnesSetupPicture, withSnesSetupPicture } from './core/snessetuppicture'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// The SNES Game Setup screen's background, behind the main menu: the original's goalie picture, or a picture of the
// league's own.
export function SnesSetupPictureSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const shown = readSnesSetupPicture(project)
  if (!shown) return null

  async function importPicture(file: File) {
    try {
      let image
      try {
        image = await readImage(file)
      } catch {
        throw new Error(`${file.name} could not be read as an image.`)
      }
      const made = snesSetupPictureFromImage(project, image.rgba, image.width, image.height)
      const grew = project.bytes.length
      const next = withSnesSetupPicture(project, made)
      onChange(next)
      const colours = made.had > made.kept ? ` Its ${made.had} colours were brought down to ${made.kept}.` : ''
      const squares =
        made.distinct > made.tiles.length - 1
          ? ` It came to ${made.distinct} different 8 by 8 squares, so the most alike were merged into ${made.tiles.length - 1}.`
          : ` It takes ${made.tiles.length - 1} of the ${SNES_SETUP_SQUARES} squares the screen has room for.`
      const bigger = next.bytes.length > grew ? ' The ROM had no room left, so it is now 2 MB.' : ''
      setNotice(`${file.name} is now the Game Setup background.${squares}${colours}${bigger} Undo takes it back.`)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  function putBack() {
    try {
      onChange(withOriginalSnesSetupPicture(project))
      setNotice('The Game Setup background this ROM was opened with is back. Undo takes it back.')
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  return (
    <section data-tab="Pictures">
      <h2>Main menu background</h2>
      <p className="note">
        The picture behind the Game Setup screen, the game's main menu, over the pattern the game's other menus share.
        The menu, the team names and logos and the player photos are drawn over it. A picture of your own is fitted
        inside the screen, 256 by 224 pixels. It has 15 colours of its own, plus the pattern's and the backdrop's to use
        as they are, and room for {SNES_SETUP_SQUARES} different 8 by 8 squares; a busier picture has its most alike
        squares merged to fit. Squares that match the pattern, and the parts the logo boxes and team names always cover,
        are left to the pattern and cost nothing. The ROM grows to 2 MB if it has no room left. Tested in the game
        by the NHL94 Match Viewer project.
      </p>
      <PictureView picture={shown.picture} palette={shown.palette} scale={2} format={SNES_COLORS} />
      <p>
        <label className="button">
          Import a picture
          <input
            type="file"
            accept="image/*"
            hidden
            aria-label="Import a Game Setup background"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importPicture(file)
            }}
          />
        </label>{' '}
        <button
          onClick={() =>
            void pictureToPng(shown.picture, shown.palette, SNES_COLORS)
              .then((png) => download(png, 'main_menu_background.png', 'image/png'))
              .catch((e) => {
                setNotice(e instanceof Error ? e.message : String(e))
                setFailed(true)
              })
          }
        >
          Export as PNG
        </button>{' '}
        <button disabled={shown.original} onClick={putBack}>
          Put back the original
        </button>{' '}
        <span className="note">{shown.original ? 'The picture this ROM was opened with.' : 'A picture of your own.'}</span>
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
    </section>
  )
}
