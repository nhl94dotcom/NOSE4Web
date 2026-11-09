import { useState } from 'react'
import type { RomProject } from './core/rom'
import { readSplash, splashFromImage, withOriginalSplash, withSplashImage } from './core/splash'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'

interface Props {
  project: RomProject
  // The ROM as it was opened, to say whether the screen has been changed.
  opened: RomProject
  onChange: (project: RomProject) => void
}

// The Genesis game's second splash screen: the original's High Score
// Productions and Mark Lesser pictures, or a full-screen picture of the league's own.
export function SplashScreenSection({ project, opened, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const splash = readSplash(project.bytes)
  if (!splash) return null
  const wasOriginal = readSplash(opened.bytes)?.original ?? true

  async function importPicture(file: File) {
    try {
      let image
      try {
        image = await readImage(file)
      } catch {
        throw new Error(`${file.name} could not be read as an image.`)
      }
      const made = splashFromImage(image.rgba, image.width, image.height)
      onChange(withSplashImage(project, made))
      const merged = made.colours > made.kept ? ` Its ${made.colours} colours were brought down to ${made.kept}, in four sets of up to 15.` : ''
      setNotice(`${file.name} is now the splash screen, ${made.tiles.length} tiles.${merged} Undo takes it back.`)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  function putBack() {
    try {
      onChange(withOriginalSplash(project))
      setNotice("The original game's splash screen is back. Undo takes it back.")
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  return (
    <section>
      <h2>Splash screen</h2>
      <p className="note">
        The second screen the game shows when it starts, after EA Sports: High Score Productions and Mark Lesser
        Presents in the original game. A picture of your own takes the whole screen, 320 by 224 pixels: a picture of
        another size is fitted inside it, centred on black. The console shows up to 60 colours on it, in four sets of
        15, each 8 by 8 square in one set, so a picture with more is matched to the nearest. It goes into free room at
        the end of the ROM, as wboy's 30-team ROMs have theirs. How long the screen stays is the intro screen wait on the
        Hacks page.
      </p>
      <PictureView picture={splash.picture} palette={splash.palette} scale={2} />
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
            void pictureToPng(splash.picture, splash.palette)
              .then((png) => download(png, 'splash_screen.png', 'image/png'))
              .catch((e) => {
                setNotice(e instanceof Error ? e.message : String(e))
                setFailed(true)
              })
          }
        >
          Export as PNG
        </button>{' '}
        <button disabled={splash.original} onClick={putBack}>
          Put back the original
        </button>{' '}
        <span className="note">
          {splash.original
            ? "The original game's screen."
            : wasOriginal
              ? 'A picture of your own.'
              : splash.ownColours
                ? 'This ROM has a picture of its own.'
                : "This ROM has a picture of its own, drawn in the original screen's colours, as wboy's ROMs have it: importing it again gives it its own."}
        </span>
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
    </section>
  )
}
