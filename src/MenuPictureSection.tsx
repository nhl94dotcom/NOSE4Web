import { useState } from 'react'
import { MENU_PICTURE_COLOURS, MENU_PICTURE_TILES, menuPictureFromImage, menuPicturePalette, readMenuPicture, withMenuPicture, withOriginalMenuPicture } from './core/menupicture'
import type { RomProject } from './core/rom'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'

interface Props {
  project: RomProject
  opened: RomProject
  onChange: (project: RomProject) => void
}

// The Genesis game's Game Setup screen background, behind the main menu: the
// original's, or a picture of the league's own.
export function MenuPictureSection({ project, opened, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const menu = readMenuPicture(project.bytes)
  if (!menu) return null
  const wasOriginal = readMenuPicture(opened.bytes)?.original ?? true

  async function importPicture(file: File) {
    try {
      let image
      try {
        image = await readImage(file)
      } catch {
        throw new Error(`${file.name} could not be read as an image.`)
      }
      const made = menuPictureFromImage(image.rgba, image.width, image.height, menuPicturePalette(project.bytes)!)
      onChange(withMenuPicture(project, made))
      const colours = made.colours > made.kept ? ` Its ${made.colours} colours were brought down to ${made.kept}.` : ''
      const tiles =
        made.distinct > made.tiles.length
          ? ` It came to ${made.distinct} different 8 by 8 squares, so the most alike were merged into ${made.tiles.length}.`
          : ` It takes ${made.tiles.length} of the ${MENU_PICTURE_TILES} squares the screen has room for.`
      setNotice(`${file.name} is now the Game Setup background.${tiles}${colours} Undo takes it back.`)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  function putBack() {
    try {
      onChange(withOriginalMenuPicture(project))
      setNotice("The original game's Game Setup background is back. Undo takes it back.")
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  return (
    <section>
      <h2>Main menu background</h2>
      <p className="note">
        The picture behind the Game Setup screen, the game's main menu. The menu, the team banners and logos and the
        player cards are drawn over it, and about half of it shows. A picture of your own is fitted inside the screen,
        320 by 224 pixels. The screen has room for {MENU_PICTURE_TILES} different 8 by 8 squares of it (the original
        has 240), so a detailed picture has its most alike squares merged: logos and simple designs come out clean,
        photos blocky. It has up to {MENU_PICTURE_COLOURS} colours of its own, each square in one of two sets, plus the
        menu's own white, greys and black, which it keeps so the menu's lettering and frames look as they do. The parts
        the screen always covers, under the top strip, the team banners and the logo box frame, are left blank, so the
        room goes to the parts that show. It goes into free room at the end of the ROM. Tested in the game by the NHL94
        Match Viewer project: the menu, banners, logos and player cards stay exactly as they were, and every colour
        shows as it should.
      </p>
      <PictureView picture={menu.picture} palette={menu.palette} scale={2} />
      <p>
        <label className="button">
          Import a picture
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importPicture(file)
            }}
          />
        </label>{' '}
        <button
          onClick={() =>
            void pictureToPng(menu.picture, menu.palette)
              .then((png) => download(png, 'main_menu_background.png', 'image/png'))
              .catch((e) => {
                setNotice(e instanceof Error ? e.message : String(e))
                setFailed(true)
              })
          }
        >
          Export as PNG
        </button>{' '}
        <button disabled={menu.original} onClick={putBack}>
          Put back the original
        </button>{' '}
        <span className="note">
          {menu.original ? "The original game's background." : wasOriginal ? 'A picture of your own.' : 'This ROM has a picture of its own.'}
        </span>
      </p>
      {menu.tiles > MENU_PICTURE_TILES && (
        <p className="error">
          This ROM's background loads {menu.tiles} squares, more than the {MENU_PICTURE_TILES} the screen has room for, as
          pictures made with Drezz's forum guide do: the rest are written over the screen's own pictures, which can show
          marks on the player cards and logos. Export it as a PNG and import it again to fit it in the room.
        </p>
      )}
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
    </section>
  )
}
