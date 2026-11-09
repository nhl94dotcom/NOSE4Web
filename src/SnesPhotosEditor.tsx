import { useState } from 'react'
import { SNES_COLORS } from './core/color'
import { colourPhotoFromImage, PHOTO_SIZE } from './core/photos'
import type { RomProject } from './core/rom'
import { snesPhotoPalette, snesPhotoRgbs, snesTeamPhotos, withSnesPhoto, withSnesPhotoPalette, withSnesPhotosSwapped } from './core/snesphotos'
import { PaletteEditor } from './Palette'
import { ResetButton } from './ResetButton'
import { goalieCount, teamDisplayName } from './core/team'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'
import { PixelEditor } from './PixelEditor'

interface Props {
  project: RomProject
  // The ROM as opened, which Reset goes back to.
  original?: RomProject
  team: number
  onChange: (project: RomProject) => void
}

// A team's photo colours: 1 to 12 the skin and hair shades every team has, 13
// to 15 its uniform as the photos show it, which follow the team's colours.
const UNIFORM = 13
const UNIFORM_LABELS = ['Uniform 1 (colour 13)', 'Uniform 2 (colour 14)', 'Uniform 3 (colour 15)']

const COLOURS = Array.from({ length: 15 }, (_, i) => i + 1)
const fileName = (text: string) => text.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')

// An SNES team's player photos, one for each place on the roster. See core/snesphotos.ts.
export function SnesPhotosEditor({ project, original, team, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const [drawing, setDrawing] = useState<number | null>(null)
  const roster = project.teams[team]
  const goalies = goalieCount(roster)
  const photos = snesTeamPhotos(project, team).slice(0, roster.players.length)
  const palette = snesPhotoPalette(project, team)
  // The uniform colours as the ROM was opened with them, where its photos can be read.
  let opened: number[] | null = null
  try {
    if (original && original.teams.length === project.teams.length) opened = snesPhotoPalette(original, team).slice(UNIFORM)
  } catch {
    opened = null
  }
  const teamName = teamDisplayName(roster)
  const playerName = (slot: number) => roster.players[slot]?.name ?? `Place ${slot + 1}`

  function act(change: () => RomProject, message: string) {
    try {
      onChange(change())
      setNotice(message)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  async function importPhoto(file: File, slot: number) {
    try {
      const image = await readImage(file)
      const picture = colourPhotoFromImage(image.rgba, image.width, image.height, snesPhotoRgbs(project, team))
      const resized = image.width !== PHOTO_SIZE || image.height !== PHOTO_SIZE
      act(
        () => withSnesPhoto(project, team, slot, picture),
        `Photo of ${playerName(slot)} replaced.` +
          (resized ? ` The image was ${image.width} by ${image.height}: its middle square was shrunk to ${PHOTO_SIZE} by ${PHOTO_SIZE}.` : '') +
          " It is in the team's 15 photo colours, which all its photos share.",
      )
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `${file.name} could not be read as an image.`)
      setFailed(true)
    }
  }

  return (
    <section>
      <h2>Player photos</h2>
      <p className="note">
        Each player's photo, on the player cards and the matchup screens. Photos follow their players when players are moved, traded or reordered here;
        Swap with puts right a ROM whose photos are on the wrong players. A photo is {PHOTO_SIZE} by {PHOTO_SIZE} pixels in the team's 15 photo colours, which all its photos share (see-through where the card shows
        through); an imported image of any size is cropped to the square in its middle, shrunk, and shaded to those colours.
      </p>
      <h3>Uniform colours in the photos</h3>
      <p className="note">
        The three colours the photos show the uniform in, separate from the home and away colours: change them along with
        those, and every photo on the team, a player moved here too, shows the new ones.
      </p>
      <PaletteEditor
        palette={palette.slice(UNIFORM)}
        labels={UNIFORM_LABELS}
        format={SNES_COLORS}
        onChange={(next) => act(() => withSnesPhotoPalette(project, team, [...palette.slice(0, UNIFORM), ...next]), '')}
      />
      {opened && (
        <p>
          <ResetButton
            what="uniform colours"
            changed={opened.some((word, i) => (word & 0x7fff) !== (palette[UNIFORM + i] & 0x7fff))}
            onReset={() => act(() => withSnesPhotoPalette(project, team, [...palette.slice(0, UNIFORM), ...opened]), '')}
          />
        </p>
      )}
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <div className="pictures">
        {photos.map((photo, slot) => {
          const name = playerName(slot)
          return (
            <div key={slot} className="picture">
              <strong>
                {slot < goalies ? 'G ' : ''}
                {name}
              </strong>
              <PictureView picture={photo.picture} palette={palette} scale={2} format={SNES_COLORS} />
              <p>
                <button
                  onClick={() =>
                    void pictureToPng(photo.picture, palette, SNES_COLORS)
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
                    aria-label={`Import the photo of ${name}`}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void importPhoto(file, slot)
                      e.target.value = ''
                    }}
                  />
                </label>{' '}
                <button aria-pressed={drawing === slot} onClick={() => setDrawing(drawing === slot ? null : slot)}>
                  Draw…
                </button>
              </p>
              <p>
                <select
                  aria-label={`Swap the photo of ${name} with`}
                  value=""
                  onChange={(e) => {
                    if (e.target.value === '') return
                    const other = Number(e.target.value)
                    act(() => withSnesPhotosSwapped(project, team, slot, other), `The photos of ${name} and ${playerName(other)} swapped.`)
                  }}
                >
                  <option value="">Swap with…</option>
                  {roster.players.map((player, other) =>
                    other === slot ? null : (
                      <option key={other} value={other}>
                        {other < goalies ? 'G ' : ''}
                        {player.name}
                      </option>
                    ),
                  )}
                </select>
              </p>
              {photo.generic ? (
                <p className="note">A stand-in picture, shared by {photo.shared} other places with no photo of their own. Importing or drawing gives this player his own.</p>
              ) : (
                photo.shared > 0 && (
                  <p className="note">
                    His own photo, also shown for{' '}
                    {photo.sharedWith
                      .map((other) => `${teamDisplayName(project.teams[other.team])}'s ${project.teams[other.team].players[other.slot]?.name ?? `place ${other.slot + 1}`}`)
                      .join(', ')}
                    . Importing or drawing changes it here only.
                  </p>
                )
              )}
            </div>
          )
        })}
      </div>
      {drawing !== null && photos[drawing] && (
        <>
          <h3>Drawing the photo of {playerName(drawing)}</h3>
          <p className="note">In the team's photo colours. The eraser makes pixels see-through.</p>
          <PixelEditor
            key={`${team}-${drawing}`}
            title={`Photo of ${playerName(drawing)}`}
            picture={photos[drawing].picture}
            palette={palette}
            format={SNES_COLORS}
            colours={COLOURS}
            problem={failed ? notice : undefined}
            onCommit={(picture) => act(() => withSnesPhoto(project, team, drawing, picture), '')}
            onClose={() => setDrawing(null)}
          />
        </>
      )}
    </section>
  )
}
