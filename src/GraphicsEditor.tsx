import { useEffect, useRef, useState } from 'react'
import {
  banner,
  bannerColors,
  bannerPalette,
  bannersEditable,
  expandPictureSpace,
  LOGO_COLORS,
  menuLogo,
  menuLogoEditable,
  menuLogoFromImage,
  menuLogoPalette,
  menuPalette,
  NoRoomError,
  pictureFromImage,
  pictureSpace,
  pictureToImage,
  rinkLogo,
  rinkLogoSharedWith,
  withBannerColors,
  withRinkLogo,
  writeGraphics,
  type GraphicsEdits,
  type Picture,
} from './core/graphics'
import type { RomProject } from './core/rom'
import { teamDisplayName } from './core/team'
import { PaletteEditor } from './Palette'

// Colours a banner may use: all but 3 and 4, which belong to the other team's
// banner when two are on screen together.
const BANNER_COLORS = [0, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
const ALL_COLORS = Array.from({ length: 16 }, (_, i) => i)

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

// Reads an image file into raw pixels, four bytes each.
async function readImage(file: File): Promise<{ rgba: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  return { rgba: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height }
}

function savePng(picture: Picture, palette: number[], fileName: string) {
  const canvas = document.createElement('canvas')
  canvas.width = picture.width
  canvas.height = picture.height
  const context = canvas.getContext('2d')!
  const data = context.createImageData(picture.width, picture.height)
  data.data.set(pictureToImage(picture, palette))
  context.putImageData(data, 0, 0)
  canvas.toBlob((blob) => {
    if (!blob) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = fileName
    link.click()
    URL.revokeObjectURL(link.href)
  })
}

interface Props {
  project: RomProject
  team: number
  onChange: (project: RomProject) => void
}

export function GraphicsEditor({ project, team, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const name = teamDisplayName(project.teams[team]).replace(/[^A-Za-z0-9]+/g, '_')
  const homePalette = project.teams[team].palette.slice(0, 16)
  const shared = rinkLogoSharedWith(project, team).filter((other) => other !== team)
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

  async function importPicture(file: File, width: number, height: number, load: (rgba: Uint8ClampedArray) => void) {
    try {
      const image = await readImage(file)
      if (image.width !== width || image.height !== height) {
        throw new Error(`${file.name} is ${image.width} by ${image.height} pixels. This picture has to be ${width} by ${height}.`)
      }
      load(image.rgba)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : `${file.name} could not be read as an image.`)
      setFailed(true)
    }
  }

  const pictures = [
    {
      title: 'Centre-ice logo',
      editable: true,
      picture: rinkLogo(project, team),
      palette: homePalette,
      scale: 4,
      file: `${name}_rink_logo.png`,
      note:
        'Drawn with the home colours above, so it can only use those 16.' +
        (shared.length > 0 ? ` Shared with ${shared.map((other) => teamDisplayName(project.teams[other])).join(', ')}.` : ''),
      load: (rgba: Uint8ClampedArray) =>
        apply(
          withRinkLogo(project, team, pictureFromImage(rgba, 48, 32, homePalette, ALL_COLORS.slice(1))),
          'Centre-ice logo replaced, matched to the home colours.',
        ),
    },
    {
      title: 'Menu logo',
      editable: menuLogoEditable(project, team),
      picture: menuLogo(project, team),
      palette: menuLogoPalette(project, team),
      scale: 3,
      file: `${name}_menu_logo.png`,
      note: `Uses white, black and ${LOGO_COLORS} colours of its own, taken from the image you import.`,
      load: (rgba: Uint8ClampedArray) => {
        const logo = menuLogoFromImage(rgba, 48, 48, menuPalette(project, team))
        const merged =
          logo.colorsFound > LOGO_COLORS
            ? ` Besides white and black the image had ${logo.colorsFound} colours, and a logo can hold ${LOGO_COLORS}; the least used were merged into the nearest.`
            : ''
        apply(
          {
            ...project.graphics,
            menuLogos: { ...project.graphics.menuLogos, [team]: logo.picture },
            menuPalettes: { ...project.graphics.menuPalettes, [team]: logo.palette },
          },
          `Menu logo replaced.${merged}`,
        )
      },
    },
    {
      title: 'Menu banner',
      editable: bannersEditable(project, 'menu'),
      picture: banner(project, 'menu', team),
      palette: bannerPalette(project, 'menu', team),
      scale: 3,
      file: `${name}_menu_banner.png`,
      note: 'Shown on the menus, with its two stripes in the banner colours below.',
      load: (rgba: Uint8ClampedArray) =>
        apply(
          {
            ...project.graphics,
            menuBanners: {
              ...project.graphics.menuBanners,
              [team]: pictureFromImage(rgba, 88, 16, bannerPalette(project, 'menu', team), BANNER_COLORS.slice(1)),
            },
          },
          'Menu banner replaced.',
        ),
    },
    {
      title: 'In-game banner',
      editable: bannersEditable(project, 'game'),
      picture: banner(project, 'game', team),
      palette: bannerPalette(project, 'game', team),
      scale: 3,
      file: `${name}_game_banner.png`,
      note: 'Shown during play. Every team shares the same 16 colours for these.',
      load: (rgba: Uint8ClampedArray) =>
        apply(
          {
            ...project.graphics,
            gameBanners: {
              ...project.graphics.gameBanners,
              [team]: pictureFromImage(rgba, 88, 16, bannerPalette(project, 'game', team), ALL_COLORS.slice(1)),
            },
          },
          'In-game banner replaced.',
        ),
    },
  ]

  return (
    <section>
      <h2>Logos and banners</h2>
      <p className="note">
        Export a picture, change it in any image editor, and import it again at the same size. Colours are matched to
        the nearest the picture is allowed to use, and see-through areas stay see-through.
      </p>
      {notice && <p className={failed ? 'error' : 'note'}>{notice}</p>}
      <div className="pictures">
        {pictures.map((item) => (
          <div key={item.title} className="picture">
            <strong>{item.title}</strong>{' '}
            <span className="note">
              {item.picture.width} by {item.picture.height}
            </span>
            <PictureView picture={item.picture} palette={item.palette} scale={item.scale} />
            <p>
              <button onClick={() => savePng(item.picture, item.palette, item.file)}>Export PNG</button>{' '}
              <label className="button" hidden={!item.editable}>
                Import…
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void importPicture(file, item.picture.width, item.picture.height, item.load)
                    e.target.value = ''
                  }}
                />
              </label>
            </p>
            <p className="note">
              {item.editable
                ? item.note
                : 'This ROM stores or colours this picture differently from the original game, so it cannot be replaced here yet, and may not be shown in its true colours.'}
            </p>
          </div>
        ))}
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
            In this ROM the menu logos and banners are packed with almost no room to spare. This moves them to unused
            space at the end of the ROM, where each can be as detailed as you like.
          </span>
        </p>
      )}
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
    </section>
  )
}
