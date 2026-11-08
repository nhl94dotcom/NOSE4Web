import { useState } from 'react'
import {
  FEWEST_PHOTOS,
  FIRST_SHADE,
  PHOTO_SIZE,
  photoFromImage,
  photoPalette,
  SHADES,
  teamPhotos,
  withPhoto,
  withPhotoAdded,
  withPhotoMoved,
  withPhotoRemoved,
  withPhotoSlot,
} from './core/photos'
import type { RomProject } from './core/rom'
import { goalieCount, teamDisplayName } from './core/team'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'
import { PixelEditor } from './PixelEditor'

interface Props {
  project: RomProject
  team: number
  onChange: (project: RomProject) => void
}

const SHADE_COLOURS = Array.from({ length: SHADES }, (_, i) => FIRST_SHADE + i)
const fileName = (text: string) => text.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')

// A Genesis team's featured players and their photos. See core/photos.ts.
export function PhotosEditor({ project, team, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  // The photo being drawn, by its place in the list.
  const [drawing, setDrawing] = useState<number | null>(null)
  const roster = project.teams[team]
  const goalies = goalieCount(roster)
  const photos = teamPhotos(project, team)
  const palette = photoPalette(project)
  const teamName = teamDisplayName(roster)
  const playerName = (slot: number) => roster.players[slot]?.name ?? `no player (place ${slot + 1})`
  const listed = new Set(photos.map((photo) => photo.slot))

  function act(change: () => RomProject, message: string) {
    try {
      const next = change()
      onChange(next)
      // New photos go at the end of the ROM, which grows when it is full.
      const grew = next.bytes.length > project.bytes.length ? ` The ROM grew to ${next.bytes.length / 0x100000} MB to make room for it.` : ''
      setNotice(message + grew)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  // A photo moved in the list; the one being drawn stays the one being drawn.
  function move(index: number, to: number) {
    act(() => withPhotoMoved(project, team, index, to), `${playerName(photos[index].slot)} moved ${to < index ? 'up' : 'down'}.`)
    if (drawing === index) setDrawing(to)
    else if (drawing === to) setDrawing(index)
  }

  async function importPhoto(file: File, index: number) {
    try {
      const image = await readImage(file)
      const picture = photoFromImage(image.rgba, image.width, image.height, palette)
      const resized = image.width !== PHOTO_SIZE || image.height !== PHOTO_SIZE
      act(
        () => withPhoto(project, team, index, picture),
        `Photo of ${playerName(photos[index].slot)} replaced.` +
          (resized ? ` The image was ${image.width} by ${image.height}: its middle square was shrunk to ${PHOTO_SIZE} by ${PHOTO_SIZE}.` : '') +
          ' Photos are in the eight greys the game shows them in.',
      )
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `${file.name} could not be read as an image.`)
      setFailed(true)
    }
  }

  const sharedText = (index: number) => {
    const photo = photos[index]
    if (photo.generic) return 'The generic picture, shared by every player with no photo of his own. Importing or drawing gives him his own.'
    if (photo.sharedWith.length === 0) return ''
    const others = photo.sharedWith.map((other) => `${teamDisplayName(project.teams[other.team])} ${project.teams[other.team].players[other.slot]?.name ?? ''}`.trim())
    return `Also shown for ${others.join(', ')}. Importing or drawing gives this player his own.`
  }

  return (
    <section>
      <h2>Player photos</h2>
      <p className="note">
        The team setup screen shows the first {FEWEST_PHOTOS} of these players' cards in turn, so a team keeps at least {FEWEST_PHOTOS}. The matchup screens
        show the photo of any player listed here, and a generic picture for everyone else. A photo is {PHOTO_SIZE} by {PHOTO_SIZE} pixels in eight shades
        of the game's photo colours; an imported image of any size is cropped to the square in its middle, shrunk, and shaded to them. Photos follow
        their players when players are moved, traded, let go or reordered here.
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <div className="pictures">
        {photos.map((photo, index) => {
          const name = playerName(photo.slot)
          return (
            <div key={index} className="picture">
              <strong>
                {index + 1}. {name}
              </strong>
              {index < FEWEST_PHOTOS && <span className="note"> (setup screen)</span>}
              <PictureView picture={photo.picture} palette={palette} scale={2} />
              <p>
                <select
                  aria-label={`Photo ${index + 1} is for`}
                  value={photo.slot}
                  onChange={(e) => act(() => withPhotoSlot(project, team, index, Number(e.target.value)), `Photo ${index + 1} is now for ${playerName(Number(e.target.value))}.`)}
                >
                  {!roster.players[photo.slot] && <option value={photo.slot}>{name}</option>}
                  {roster.players.map((player, slot) => (
                    <option key={slot} value={slot}>
                      {slot < goalies ? 'G' : ''} {player.name}
                    </option>
                  ))}
                </select>
              </p>
              <p>
                <button
                  onClick={() =>
                    void pictureToPng(photo.picture, palette)
                      .then((png) => download(png, `${fileName(teamName)}_${fileName(name)}_photo.png`, 'image/png'))
                      .catch((e) => {
                        setNotice(e instanceof Error ? e.message : 'The photo could not be exported.')
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
                    aria-label={`Import photo ${index + 1}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void importPhoto(file, index)
                      e.target.value = ''
                    }}
                  />
                </label>{' '}
                <button aria-pressed={drawing === index} onClick={() => setDrawing(drawing === index ? null : index)}>
                  Draw…
                </button>
              </p>
              <p>
                <button aria-label={`Move photo ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                  ↑
                </button>{' '}
                <button
                  aria-label={`Move photo ${index + 1} down`}
                  disabled={index === photos.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  ↓
                </button>{' '}
                <button
                  disabled={photos.length <= FEWEST_PHOTOS}
                  title={photos.length <= FEWEST_PHOTOS ? `A team keeps at least ${FEWEST_PHOTOS}.` : undefined}
                  onClick={() => {
                    setDrawing(null)
                    act(() => withPhotoRemoved(project, team, index), `${name} taken off the list.`)
                  }}
                >
                  Remove
                </button>
              </p>
              {sharedText(index) && <p className="note">{sharedText(index)}</p>}
            </div>
          )
        })}
      </div>
      <p>
        <select
          aria-label="Add a photo for"
          value=""
          onChange={(e) => {
            if (e.target.value === '') return
            const slot = Number(e.target.value)
            act(() => withPhotoAdded(project, team, slot, slot < goalies), `${playerName(slot)} added, with the generic picture: import or draw his photo above.`)
          }}
        >
          <option value="">Add a photo for…</option>
          {roster.players.map((player, slot) =>
            listed.has(slot) ? null : (
              <option key={slot} value={slot}>
                {slot < goalies ? 'G' : ''} {player.name}
              </option>
            ),
          )}
        </select>
      </p>
      {drawing !== null && photos[drawing] && (
        <>
          <h3>Drawing the photo of {playerName(photos[drawing].slot)}</h3>
          <p className="note">In the eight shades the game shows photos in. The eraser paints the first, white.</p>
          <PixelEditor
            key={`${team}-${drawing}`}
            title={`Photo of ${playerName(photos[drawing].slot)}`}
            picture={photos[drawing].picture}
            palette={palette}
            colours={SHADE_COLOURS}
            problem={failed ? notice : undefined}
            onCommit={(picture) => act(() => withPhoto(project, team, drawing, picture), '')}
            onClose={() => setDrawing(null)}
          />
        </>
      )}
    </section>
  )
}
