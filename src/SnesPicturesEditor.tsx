import { useState } from 'react'
import { SNES_COLORS } from './core/color'
import { pictureToImage } from './core/graphics'
import type { RomProject } from './core/rom'
import {
  LOGO_SIZE,
  NO_SNES_PICTURE_EDITS,
  snesCentreIce,
  snesCentreIceFromImage,
  snesCentreIceSharedWith,
  snesLogo,
  snesLogoColoursSharedWith,
  snesLogoFromImage,
  snesLogoTable,
  snesPicturesSupported,
  writeSnesPictures,
  type SnesPictureEdits,
} from './core/snespictures'
import { teamDisplayName } from './core/team'
import { download } from './download'
import { PictureView } from './GraphicsEditor'
import { pictureToPng, readImage } from './images'
import { ResetButton } from './ResetButton'

type Kind = 'logo' | 'centreIce'

interface Props {
  project: RomProject
  team: number
  onChange: (project: RomProject) => void
}

// The SNES game's team logo and centre ice logo, exported and imported as
// PNG images. See core/snespictures.ts.
export function SnesPicturesEditor({ project, team, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const teams = project.teams.length
  const edits = project.snesPictures ?? NO_SNES_PICTURE_EDITS

  if (!snesPicturesSupported(project.bytes, teams)) {
    return (
      <section>
        <h2>Logos</h2>
        <p className="note">
          This ROM keeps its logos in a way the editor cannot read, so they are left exactly as they are.
        </p>
      </section>
    )
  }

  const name = teamDisplayName(project.teams[team]).replace(/[^A-Za-z0-9]+/g, '_')
  const names = (others: number[]) => others.map((other) => teamDisplayName(project.teams[other])).join(', ')

  // Takes the edits if they can be written into the ROM; the logos share limited room.
  function apply(next: SnesPictureEdits, message: string) {
    try {
      writeSnesPictures(project.bytes.slice(), teams, next)
      onChange({ ...project, snesPictures: next })
      setNotice(message)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  async function importPicture(file: File, kind: Kind) {
    try {
      let image
      try {
        image = await readImage(file)
      } catch {
        throw new Error(`${file.name} could not be read as an image.`)
      }
      if (kind === 'logo') {
        const made = snesLogoFromImage(image.rgba, image.width, image.height)
        const merged = made.colorsFound > 15 ? ` The image had ${made.colorsFound} colours; the logo can have 15, so the rest were matched to the nearest.` : ''
        apply({ ...edits, logos: { ...edits.logos, [team]: { picture: made.picture, palette: made.palette } } }, `Logo replaced.${merged}`)
      } else {
        const { centreIce, replaced } = withCentreIce(team, image.rgba, image.width, image.height)
        apply({ ...edits, centreIce }, `Centre ice logo replaced${replaced.length > 1 ? ` for ${names(replaced)}` : ''}.`)
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `${file.name} could not be used.`)
      setFailed(true)
    }
  }

  // The centre ice logos with `to`'s made from an image, matched to the
  // colours `to`'s is drawn in, and the teams that share it given it too.
  function withCentreIce(to: number, rgba: Uint8Array | Uint8ClampedArray, width: number, height: number) {
    const picture = snesCentreIceFromImage(rgba, width, height, snesCentreIce(project.bytes, teams, edits, to, project.rinkPalette))
    const replaced = [to, ...snesCentreIceSharedWith(project.bytes, teams, to)]
    const centreIce = { ...edits.centreIce }
    for (const other of replaced) centreIce[other] = picture
    return { centreIce, replaced }
  }

  // This team's logo given to another: the team logo as it is, with its colours,
  // and the centre ice logo as it looks, matched to the colours the other's is drawn in.
  function copyTo(to: number, kind: Kind) {
    try {
      if (kind === 'logo') {
        apply({ ...edits, logos: { ...edits.logos, [to]: { picture: logo.picture, palette: logo.palette } } }, `Logo copied to ${names([to])}.`)
      } else {
        const rgba = pictureToImage(ice.picture, ice.palette, SNES_COLORS)
        const { centreIce, replaced } = withCentreIce(to, rgba, ice.picture.width, ice.picture.height)
        apply({ ...edits, centreIce }, `Centre ice logo copied to ${names(replaced)}.`)
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'The logo could not be copied.')
      setFailed(true)
    }
  }

  function reset(kind: Kind) {
    const next: SnesPictureEdits = { logos: { ...edits.logos }, centreIce: { ...edits.centreIce } }
    if (kind === 'logo') delete next.logos[team]
    else for (const other of [team, ...snesCentreIceSharedWith(project.bytes, teams, team)]) delete next.centreIce[other]
    onChange({ ...project, snesPictures: next })
    setNotice(`${kind === 'logo' ? 'Logo' : 'Centre ice logo'} put back as it was.`)
    setFailed(false)
  }

  const logo = snesLogo(project.bytes, teams, edits, team)
  const ice = snesCentreIce(project.bytes, teams, edits, team, project.rinkPalette)
  const sharedColours = snesLogoColoursSharedWith(project.bytes, teams, team)
  const sharedIce = snesCentreIceSharedWith(project.bytes, teams, team)
  const pictures: { kind: Kind; title: string; picture: typeof logo; scale: number; note: string }[] = [
    {
      kind: 'logo',
      title: 'Team logo',
      picture: logo,
      scale: 3,
      note:
        `Shown on the matchup, setup and player card screens, in 15 colours of its own taken from the image you ` +
        `import. It can be at most 36 tiles of 8 by 8 pixels` +
        (snesLogoTable(project.bytes, teams) !== null
          ? '; one bigger than the one it replaces goes into free space in the ROM.'
          : ', and all the logos together must fit the room the game unpacks them into, which the original logos ' +
            'fill: a bigger logo fits where others give up room.') +
        (sharedColours.length > 0 ? ` Its colours are shared with ${names(sharedColours)}.` : ''),
    },
    {
      kind: 'centreIce',
      title: 'Centre ice logo',
      picture: ice,
      scale: 4,
      note:
        (ice.ownColours
          ? 'Drawn on the ice of the home team’s rink in 15 colours of the team’s own, faded as if seen through the ice, so an imported picture is matched to those.'
          : 'Drawn on the ice of the home team’s rink in the rink’s own colours, faded as if seen through the ice and the ' +
            'same for every team, so an imported picture is matched to those.') +
        (sharedIce.length > 0 ? ` The same logo as ${names(sharedIce)}'s, so replacing it replaces theirs too.` : ''),
    },
  ]

  return (
    <section>
      <h2>Logos</h2>
      <p className="note">
        Export a logo, change it in any image editor, and import it again at the same size ({LOGO_SIZE} by {LOGO_SIZE}{' '}
        for the team logo). See-through areas stay see-through.
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <div className="pictures">
        {pictures.map(({ kind, title, picture, scale, note }) => (
          <div key={kind} className="picture">
            <strong>{title}</strong>{' '}
            <span className="note">
              {picture.picture.width} by {picture.picture.height}
            </span>
            <PictureView picture={picture.picture} palette={picture.palette} scale={scale} format={SNES_COLORS} />
            <p>
              <button
                onClick={() =>
                  void pictureToPng(picture.picture, picture.palette, SNES_COLORS)
                    .then((png) => download(png, `${name}_${kind === 'logo' ? 'logo' : 'centre_ice'}.png`, 'image/png'))
                    .catch((e) => {
                      setNotice(e instanceof Error ? e.message : 'The picture could not be exported.')
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
                  aria-label={`Import ${title.toLowerCase()}`}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void importPicture(file, kind)
                    e.target.value = ''
                  }}
                />
              </label>{' '}
              <ResetButton what="picture" changed={kind === 'logo' ? team in edits.logos : team in edits.centreIce} onReset={() => reset(kind)} />
            </p>
            <p>
              <select
                aria-label={`Copy ${title.toLowerCase()} to`}
                value=""
                onChange={(e) => {
                  if (e.target.value !== '') copyTo(Number(e.target.value), kind)
                }}
              >
                <option value="">Copy to another team…</option>
                {project.teams.map((other, t) =>
                  t === team ? null : (
                    <option key={t} value={t}>
                      {teamDisplayName(other)}
                    </option>
                  ),
                )}
              </select>
            </p>
            <p className="note">{note}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
