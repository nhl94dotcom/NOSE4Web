import { useEffect, useRef, useState } from 'react'
import {
  bannerColors,
  expandPictureSpace,
  LOGO_COLORS,
  menuPalette,
  NoRoomError,
  pictureSpace,
  pictureToImage,
  withBanner,
  withBannerColors,
  writeGraphics,
  type BannerKind,
  type GraphicsEdits,
  type Picture,
} from './core/graphics'
import { importTeam } from './core/importteam'
import { letterBanner, measureLettering } from './core/lettering'
import {
  currentPicture,
  pictureEditable,
  pictureKinds,
  pictureSharedWith,
  pictureTitle,
  withPictureFromImage,
  type PictureKind,
} from './core/pictureset'
import { pictureChanged, resetPicture } from './core/reset'
import type { RomProject } from './core/rom'
import { teamDisplayName } from './core/team'
import { download } from './download'
import { pictureToPng, readImage } from './images'
import { PaletteEditor } from './Palette'
import { ResetButton } from './ResetButton'

interface PictureViewProps {
  picture: Picture
  palette: number[]
  scale: number
}

function PictureView({ picture, palette, scale }: PictureViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const data = context.createImageData(picture.width, picture.height)
    data.data.set(pictureToImage(picture, palette))
    context.putImageData(data, 0, 0)
  }, [picture, palette])
  return (
    <canvas
      ref={canvas}
      className="preview checkered"
      width={picture.width}
      height={picture.height}
      style={{ width: picture.width * scale }}
    />
  )
}

const FILE_ENDINGS: Record<PictureKind, string> = {
  rinkLogo: 'rink_logo',
  menuLogo: 'menu_logo',
  menuBanner: 'menu_banner',
  visitorBanner: 'visitor_banner',
  gameBanner: 'game_banner',
}
const BANNERS: { kind: PictureKind; banner: BannerKind }[] = [
  { kind: 'menuBanner', banner: 'menu' },
  { kind: 'visitorBanner', banner: 'visitor' },
  { kind: 'gameBanner', banner: 'game' },
]

interface Props {
  project: RomProject
  team: number
  onChange: (project: RomProject) => void
}

export function GraphicsEditor({ project, team, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const teamName = teamDisplayName(project.teams[team])
  const name = teamName.replace(/[^A-Za-z0-9]+/g, '_')
  const kinds = pictureKinds(project)
  const moreRoom = pictureSpace(project)
  const roomButton = moreRoom
    ? `Give logos and banners more room${moreRoom.grows ? ` (ROM grows to ${moreRoom.romSize / 0x100000} MB)` : ''}`
    : ''

  // Applies a replacement if it can be written into the ROM. Pictures share
  // limited room, so some replacements do not fit.
  function apply(graphics: GraphicsEdits, message: string) {
    try {
      writeGraphics(project.bytes.slice(), project.game, graphics)
      onChange({ ...project, graphics })
      setNotice(message)
      setFailed(false)
    } catch (e) {
      const hint = e instanceof NoRoomError && moreRoom ? ` Or click "${roomButton}" below.` : ''
      setNotice((e instanceof Error ? e.message : String(e)) + hint)
      setFailed(true)
    }
  }

  function fail(e: unknown, fallback: string) {
    setNotice(e instanceof Error ? e.message : fallback)
    setFailed(true)
  }

  const everyTeam = (kind: PictureKind) => pictureSharedWith(project, team, kind).length === project.teams.length
  const replacedText = (kind: PictureKind) => `${pictureTitle(project, kind)} replaced${everyTeam(kind) ? ' for every team' : ''}.`

  async function importPicture(file: File, kind: PictureKind) {
    try {
      let image
      try {
        image = await readImage(file)
      } catch {
        throw new Error(`${file.name} could not be read as an image.`)
      }
      const made = withPictureFromImage(project, team, kind, image)
      apply(made.graphics, `${replacedText(kind)} ${made.note}`.trim())
    } catch (e) {
      fail(e, `${file.name} could not be used.`)
    }
  }

  function note(kind: PictureKind): string {
    const others = pictureSharedWith(project, team, kind).filter((other) => other !== team)
    switch (kind) {
      case 'rinkLogo':
        return (
          'Drawn with the home colours above, so it can only use those 16.' +
          (others.length > 0 ? ` Shared with ${others.map((other) => teamDisplayName(project.teams[other])).join(', ')}.` : '')
        )
      case 'menuLogo':
        return `Uses white, black and ${LOGO_COLORS} colours of its own, taken from the image you import.`
      case 'gameBanner':
        return 'Shown during play. Every team shares the same 16 colours for these.'
      default:
        return (
          `Shown on the menus${kinds.includes('visitorBanner') ? (kind === 'visitorBanner' ? ' for the visiting team' : ' for the home team') : ''}, with its two stripes in the banner colours below.` +
          (everyTeam(kind)
            ? ' This ROM has one banner here for every team, so replacing it replaces it for all of them. Giving the logos and banners more room, below, lets each team have its own.'
            : '')
        )
    }
  }

  // ----------------------------------------------------------- lettering
  const [letteringText, setLetteringText] = useState<string | null>(null)
  // Until the user types, the banner reads what the game's own would: the team's location.
  const wanted = letteringText ?? project.teams[team].names[0]
  const lettering = measureLettering(wanted)
  const letterable = BANNERS.filter((b) => kinds.includes(b.kind) && pictureEditable(project, b.kind) && !everyTeam(b.kind))
  const preview = (() => {
    try {
      const kind = letterable[0]?.banner ?? 'menu'
      return { picture: letterBanner(project, kind, team, wanted), palette: currentPicture(project, team, letterable[0]?.kind ?? 'menuBanner').palette }
    } catch {
      return null
    }
  })()

  function letter(targets: typeof letterable) {
    try {
      let graphics = project.graphics
      for (const target of targets) {
        graphics = withBanner({ ...project, graphics }, target.banner, team, letterBanner(project, target.banner, team, wanted))
      }
      const names = targets.map((target) => pictureTitle(project, target.kind).toLowerCase())
      apply(graphics, `Lettered the ${names.join(' and the ')} "${lettering.text}".`)
    } catch (e) {
      fail(e, 'The banner could not be made.')
    }
  }

  // ------------------------------------------------------------- copying
  const others = project.teams.map((_, i) => i).filter((i) => i !== team)
  const [copyTo, setCopyTo] = useState(others[0] ?? 0)
  const [copyColours, setCopyColours] = useState(true)
  const [copyPictures, setCopyPictures] = useState(true)
  const [copyNotes, setCopyNotes] = useState<string[]>([])
  const target = others.includes(copyTo) ? copyTo : (others[0] ?? 0)

  function copyToTeam() {
    const result = importTeam(project, project, team, target, { names: false, roster: false, colours: copyColours, pictures: copyPictures })
    onChange(result.project)
    setCopyNotes(result.notes.map((line) => line.replace('brought in', 'copied')))
  }

  return (
    <section>
      <h2>Logos and banners</h2>
      <p className="note">
        Export a picture, change it in any image editor, and import it again at the same size. Colours are matched to
        the nearest the picture is allowed to use, and see-through areas stay see-through. To move every team's
        pictures at once, use Picture files in the list on the left.
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <div className="pictures">
        {kinds.map((kind) => {
          const { picture, palette } = currentPicture(project, team, kind)
          const title = pictureTitle(project, kind)
          const editable = pictureEditable(project, kind)
          const fileName = everyTeam(kind) ? `${FILE_ENDINGS[kind]}.png` : `${name}_${FILE_ENDINGS[kind]}.png`
          return (
            <div key={kind} className="picture">
              <strong>{title}</strong>{' '}
              <span className="note">
                {picture.width} by {picture.height}
              </span>
              <PictureView picture={picture} palette={palette} scale={kind === 'rinkLogo' ? 4 : 3} />
              <p>
                <button
                  onClick={() =>
                    void pictureToPng(picture, palette)
                      .then((png) => download(png, fileName, 'image/png'))
                      .catch((e) => fail(e, 'The picture could not be exported.'))
                  }
                >
                  Export PNG
                </button>{' '}
                <label className="button" hidden={!editable}>
                  Import…
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void importPicture(file, kind)
                      e.target.value = ''
                    }}
                  />
                </label>{' '}
                <ResetButton
                  what="picture"
                  changed={pictureChanged(project, team, kind)}
                  onReset={() => {
                    onChange({ ...project, graphics: resetPicture(project, team, kind) })
                    setNotice(`${title} put back as it was.`)
                    setFailed(false)
                  }}
                />
              </p>
              <p className="note">
                {editable
                  ? note(kind)
                  : 'This ROM stores this picture differently from the original game, so it cannot be replaced here yet.'}
              </p>
            </div>
          )
        })}
      </div>
      {moreRoom && (
        <p>
          <button
            onClick={() => {
              onChange(expandPictureSpace(project))
              setNotice('The logos and banners now have room for any replacement.')
              setFailed(false)
            }}
          >
            {roomButton}
          </button>{' '}
          <span className="note">
            In this ROM some logos and banners are packed with little or no room to spare. This moves them to unused
            space at the end of the ROM, where each team's can be as detailed as you like.
          </span>
        </p>
      )}

      <h2>Banner lettering</h2>
      <p className="note">
        Makes a banner that reads whatever you type, in the game's own lettering, with the stripes in the banner
        colours below.
      </p>
      <p>
        <input
          className="wide-input"
          aria-label="Banner text"
          value={wanted}
          onChange={(e) => setLetteringText(e.target.value)}
        />{' '}
        {letterable.map((b) => (
          <span key={b.kind}>
            <button disabled={!preview} onClick={() => letter([b])}>
              Use for the {pictureTitle(project, b.kind).toLowerCase()}
            </button>{' '}
          </span>
        ))}
        {letterable.length > 1 && (
          <button disabled={!preview} onClick={() => letter(letterable)}>
            Use for all {letterable.length}
          </button>
        )}
      </p>
      {preview && <PictureView picture={preview.picture} palette={preview.palette} scale={3} />}
      <p className={lettering.tooWide > 0 ? 'error' : 'note'}>
        {lettering.tooWide > 0
          ? `That is ${lettering.tooWide} pixels too wide for a banner. Try a shorter form of the name.`
          : lettering.text === ''
            ? 'Type the name to put on the banner.'
            : `${lettering.width} of 82 pixels wide.`}
        {lettering.dropped && ` There is no lettering for ${[...lettering.dropped].join(' ')}, so it is left out.`}
        {letterable.length === 0 &&
          ' In this ROM every team shows the same banners, so there is none to letter for one team. Give the logos and banners more room first.'}
      </p>

      <h2>Menu banner colours</h2>
      <PaletteEditor
        palette={bannerColors(project, team)}
        labels={['Top stripe', 'Bottom stripe']}
        onChange={(colors) =>
          onChange({
            ...project,
            graphics: {
              ...project.graphics,
              menuPalettes: { ...project.graphics.menuPalettes, [team]: withBannerColors(menuPalette(project, team), colors) },
            },
          })
        }
      />
      <p>
        <ResetButton
          what="banner colours"
          changed={pictureChanged(project, team, 'bannerColors')}
          onReset={() => onChange({ ...project, graphics: resetPicture(project, team, 'bannerColors') })}
        />
      </p>

      <h2>Copy to another team</h2>
      <p>
        <label className="choice">
          <input type="checkbox" checked={copyColours} onChange={(e) => setCopyColours(e.target.checked)} /> Home and away
          colours
        </label>
        <label className="choice">
          <input type="checkbox" checked={copyPictures} onChange={(e) => setCopyPictures(e.target.checked)} /> Logos,
          banners and banner colours
        </label>
      </p>
      <p>
        <button disabled={others.length === 0 || (!copyColours && !copyPictures)} onClick={copyToTeam}>
          Copy from {teamName} to
        </button>{' '}
        <select className="wide" aria-label="Team to copy colours and pictures to" value={target} onChange={(e) => setCopyTo(Number(e.target.value))}>
          {others.map((other) => (
            <option key={other} value={other}>
              {teamDisplayName(project.teams[other])}
            </option>
          ))}
        </select>{' '}
        <span className="note">This team keeps its own; the other team's are replaced. Undo takes it back.</span>
      </p>
      {copyNotes.length > 0 && (
        <ul>
          {copyNotes.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
