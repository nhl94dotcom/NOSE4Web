import { useState } from 'react'
import {
  ANNOUNCER_HEIGHT,
  ANNOUNCER_INSIDE,
  ANNOUNCER_OWN_COLOURS,
  ANNOUNCER_WIDTH,
  genesisAnnouncer,
  genesisAnnouncerFromImage,
  SNES_ANNOUNCER_HEIGHT,
  SNES_ANNOUNCER_WIDTH,
  snesAnnouncer,
  snesAnnouncerFromImage,
  withGenesisAnnouncer,
  withOriginalGenesisAnnouncer,
  withOriginalSnesAnnouncer,
  withSnesAnnouncer,
} from './core/announcer'
import { SNES_COLORS } from './core/color'
import type { RomProject } from './core/rom'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// The announcer's picture on the pregame matchup screen (Genesis) or the
// scouting screen (SNES), Ron Barr: the original's, or a picture of the
// league's own.
export function AnnouncerSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const snes = project.game.platform === 'snes'
  const shown = snes ? snesAnnouncer(project) : genesisAnnouncer(project)
  if (!shown) return null
  const format = snes ? SNES_COLORS : undefined

  function report(text: string, isError: boolean) {
    setNotice(text)
    setFailed(isError)
  }

  async function importPicture(file: File) {
    try {
      let image
      try {
        image = await readImage(file)
      } catch {
        throw new Error(`${file.name} could not be read as an image.`)
      }
      let made: { tiles: Uint8Array[]; colours: number; kept: number }
      if (snes) {
        const picture = snesAnnouncerFromImage(image.rgba, image.width, image.height)
        onChange(withSnesAnnouncer(project, picture))
        made = { ...picture, tiles: picture.tiles.slice(1) }
      } else {
        const picture = genesisAnnouncerFromImage(image.rgba, image.width, image.height, shown!)
        onChange(withGenesisAnnouncer(project, picture))
        made = picture
      }
      const colours = made.colours > made.kept ? ` Its ${made.colours} colours were brought down to ${made.kept}.` : ''
      report(`${file.name} is now the announcer's picture, in ${made.tiles.length} squares.${colours} Undo takes it back.`, false)
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true)
    }
  }

  function putBack() {
    try {
      onChange(snes ? withOriginalSnesAnnouncer(project) : withOriginalGenesisAnnouncer(project))
      report("The ROM's own announcer picture is back. Undo takes it back.", false)
    } catch (e) {
      report(e instanceof Error ? e.message : String(e), true)
    }
  }

  return (
    <section>
      <h2>Announcer picture</h2>
      {snes ? (
        <p className="note">
          Ron Barr at the EA SPORTS desk, in the bottom right of the scouting screen before each game. Shown here is
          that corner of the screen; where it is empty, the screen's own frame shows. A picture of your own fills the
          right of it, {SNES_ANNOUNCER_WIDTH} by {SNES_ANNOUNCER_HEIGHT} pixels, which nothing else on the screen covers:
          it is scaled to fill that, cropped at the sides or the top and bottom to fit, so a tall picture, such as a
          person from the waist up, works best. The desk and the rest of the original go. It has up to 15 colours of
          its own, which nothing else on the screen uses. It goes into free room in the ROM, and{' '}
          <b>Put back the original</b> brings back the picture the ROM was opened with.
        </p>
      ) : (
        <p className="note">
          The picture of Ron Barr on the pregame matchup screen, where he gives the scouting report:{' '}
          {ANNOUNCER_WIDTH} by {ANNOUNCER_HEIGHT} pixels with a grey frame. A picture of your own keeps the frame and is
          scaled to fill the {ANNOUNCER_INSIDE.width} by {ANNOUNCER_INSIDE.height} pixels inside it, cropped at the sides
          or the top and bottom to fit, so a head-and-shoulders photo works best. It has up to {ANNOUNCER_OWN_COLOURS}{' '}
          colours of its own, and can use the seven the frame and the screen's boxes and background have, which stay as
          they are. It goes into free room at the end of the ROM, and <b>Put back the original</b> brings back the
          picture the ROM was opened with. Tested in the game by the NHL94 Match Viewer project: the rest of the screen
          stays exactly as it was.
        </p>
      )}
      <PictureView picture={shown.picture} palette={shown.palette} scale={snes ? 2 : 3} format={format} />
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
            void pictureToPng(shown.picture, shown.palette, format)
              .then((png) => download(png, 'announcer.png', 'image/png'))
              .catch((e) => report(e instanceof Error ? e.message : String(e), true))
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
