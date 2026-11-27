import { useState } from 'react'
import type { RomProject } from './core/rom'
import { readTitlePicture, titlePictureColours, titlePictureFromImage, titlePicturePalette, withOriginalTitlePicture, withTitlePicture } from './core/titlepicture'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'

interface Props {
  project: RomProject
  opened: RomProject
  onChange: (project: RomProject) => void
}

// The Genesis title screen's picture (NHL 94 and NHL '95): the original's, or a picture of the league's own.
export function TitlePictureSection({ project, opened, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const title = readTitlePicture(project)
  if (!title) return null
  const wasOriginal = readTitlePicture(opened)?.original ?? true
  const nhl95 = project.game.edition === 95

  async function importPicture(file: File) {
    try {
      let image
      try {
        image = await readImage(file)
      } catch {
        throw new Error(`${file.name} could not be read as an image.`)
      }
      const made = titlePictureFromImage(project, image.rgba, image.width, image.height, titlePicturePalette(project)!)
      onChange(withTitlePicture(project, made))
      const colours = made.colours > made.kept ? ` Its ${made.colours} colours were brought down to ${made.kept}.` : ''
      setNotice(`${file.name} is now the title screen's picture.${colours} Undo takes it back.`)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  function putBack() {
    try {
      onChange(withOriginalTitlePicture(project))
      setNotice("The original game's title screen picture is back. Undo takes it back.")
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  return (
    <section data-tab="Pictures">
      <h2>Title screen picture</h2>
      <p className="note">
        The picture on the title screen, 256 by 224 pixels.{' '}
        {nhl95
          ? 'The "NHL 95" lettering slides in over it, and the credits roll over its bottom rows.'
          : 'The NHL shield, the NHLPA logo and the "NHL Hockey" lettering slide in over it, and the credits roll over its bottom rows.'}{' '}
        A picture of your own is fitted inside the screen on black. It has up to {titlePictureColours(project)} colours of
        its own, plus the colours of the {nhl95 ? 'lettering' : 'shield, logo and lettering'} to use as they are, which
        stay so those look as they do. Every 8 by 8 square can be different, so detail is kept. Not yet tested in the
        game.
      </p>
      <PictureView picture={title.picture} palette={title.palette} scale={2} />
      <p>
        <label className="button">
          Import a picture
          <input
            type="file"
            accept="image/*"
            hidden
            aria-label="Import a title screen picture"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void importPicture(file)
            }}
          />
        </label>{' '}
        <button
          onClick={() =>
            void pictureToPng(title.picture, title.palette)
              .then((png) => download(png, 'title_screen.png', 'image/png'))
              .catch((e) => {
                setNotice(e instanceof Error ? e.message : String(e))
                setFailed(true)
              })
          }
        >
          Export as PNG
        </button>{' '}
        <button disabled={title.original} onClick={putBack}>
          Put back the original
        </button>{' '}
        <span className="note">
          {title.original ? "The original game's picture." : wasOriginal ? 'A picture of your own.' : 'This ROM has a picture of its own.'}
        </span>
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
    </section>
  )
}
