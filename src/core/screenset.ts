// The whole screens a league brands, as picture files beside the logos and banners (Picture files, a folder of
// their own: screens/): the title screen and the main menu background, and the rink in play and the reverse angle
// replay's, as each one's own page exports and imports them. A file that shows what the ROM has already is left
// alone, so a pack exported, partly edited and imported again changes only what was edited.

import { SNES_COLORS } from './color'
import { drawGenesisRink, importGenesisRink, readGenesisRink, RinkImportError, type RinkView } from './genesisrink'
import { pictureToImage, type Picture } from './graphics'
import { readHorBoard, withHorBoardImage } from './horboard'
import { menuPictureFromImage, menuPicturePalette, readMenuPicture, withMenuPicture } from './menupicture'
import type { RomProject } from './rom'
import { readSnesSetupPicture, snesSetupPictureFromImage, withSnesSetupPicture } from './snessetuppicture'
import { drawSnesRink, importSnesRink, snesRinkFileColours, SnesRinkImportError, snesRinkImportable } from './snesrink'
import { readTitlePicture, titlePictureFromImage, titlePicturePalette, withTitlePicture } from './titlepicture'

export const SCREENS_FOLDER = 'screens/'

export interface ScreenFile {
  name: string
  title: string
  picture: Picture
  palette: number[]
  snes: boolean
}

type Image = { rgba: Uint8Array | Uint8ClampedArray; width: number; height: number }

interface Screen {
  file: string
  title: string
  // The picture as its page exports it, or null where this ROM does not have it.
  read: (project: RomProject) => { picture: Picture; palette: number[] } | null
  // The project with the picture put in (throws where it cannot go).
  put: (project: RomProject, image: Image) => RomProject
}

// The Genesis rink as its page draws it with the first two teams on the benches, and the rink's colours as the page
// has them.
function genesisRink(project: RomProject, view: RinkView) {
  const rink = drawGenesisRink(project.bytes, project.teams[0]?.palette.slice(0, 16), project.teams[1]?.palette.slice(16, 32), view)
  if (!rink || readGenesisRink(project.bytes, view) === null) return null
  return { picture: rink.picture, palette: [...project.rinkPalette.slice(0, 32), ...rink.palette.slice(32)] }
}

// The SNES rink without a centre ice logo (its cells stay as they are), the first two teams' colours on the benches.
const snesRinkColours = (project: RomProject) => snesRinkFileColours(project)

const SCREENS: Record<'genesis' | 'snes', Screen[]> = {
  genesis: [
    {
      file: 'title_screen.png',
      title: 'Title screen picture',
      read: (project) => readTitlePicture(project),
      put: (project, image) => withTitlePicture(project, titlePictureFromImage(project, image.rgba, image.width, image.height, titlePicturePalette(project)!)),
    },
    {
      file: 'main_menu_background.png',
      title: 'Main menu background',
      read: (project) => (project.game.edition === 95 ? null : readMenuPicture(project.bytes)),
      put: (project, image) => withMenuPicture(project, menuPictureFromImage(image.rgba, image.width, image.height, menuPicturePalette(project.bytes)!)),
    },
    {
      file: 'rink.png',
      title: 'The rink',
      read: (project) => genesisRink(project, 'play'),
      put: (project, image) => ({ ...project, bytes: importGenesisRink(project.bytes, 'play', image, genesisRink(project, 'play')!.palette).rom }),
    },
    {
      file: 'rink_reverse.png',
      title: "The reverse angle replay's rink",
      read: (project) => genesisRink(project, 'reverse'),
      put: (project, image) => ({ ...project, bytes: importGenesisRink(project.bytes, 'reverse', image, genesisRink(project, 'reverse')!.palette).rom }),
    },
    {
      file: 'side_on_scoreboard.png',
      title: 'Side-on scoreboard',
      read: (project) => readHorBoard(project),
      put: (project, image) => withHorBoardImage(project, image.rgba, image.width, image.height).project,
    },
  ],
  snes: [
    {
      file: 'main_menu_background.png',
      title: 'Main menu background',
      read: (project) => readSnesSetupPicture(project),
      put: (project, image) => withSnesSetupPicture(project, snesSetupPictureFromImage(project, image.rgba, image.width, image.height)),
    },
    {
      file: 'rink.png',
      title: 'The rink',
      read: (project) => {
        const rink = snesRinkImportable(project.bytes) ? drawSnesRink(project.bytes, null) : null
        return rink ? { picture: rink, palette: snesRinkColours(project) } : null
      },
      put: (project, image) => ({ ...project, bytes: importSnesRink(project.bytes, image, snesRinkColours(project), project.source).rom }),
    },
  ],
}

const screensOf = (project: RomProject) => SCREENS[project.game.platform === 'snes' ? 'snes' : 'genesis']

// The screens this ROM has, as files to export.
export function screenSet(project: RomProject): ScreenFile[] {
  const snes = project.game.platform === 'snes'
  return screensOf(project).flatMap((screen) => {
    const shown = screen.read(project)
    return shown ? [{ name: SCREENS_FOLDER + screen.file, title: screen.title, picture: shown.picture, palette: shown.palette, snes }] : []
  })
}

// Whether a file is one of the screens': in a screens folder, wherever that is in the zip.
export const isScreenFile = (name: string) => `/${name.toLowerCase()}`.includes('/' + SCREENS_FOLDER)

// Whether an image shows the picture as the pack exports it (see-through where colour 0 is).
function samePicture(image: Image, picture: Picture, palette: number[], snes: boolean): boolean {
  if (image.width !== picture.width || image.height > picture.height) return false
  const expected = pictureToImage(picture, palette, snes ? SNES_COLORS : undefined)
  for (let i = 0; i < image.width * image.height; i++) {
    const [clear, wasClear] = [image.rgba[i * 4 + 3] < 128, expected[i * 4 + 3] < 128]
    if (clear !== wasClear) return false
    if (!clear && (image.rgba[i * 4] !== expected[i * 4] || image.rgba[i * 4 + 1] !== expected[i * 4 + 1] || image.rgba[i * 4 + 2] !== expected[i * 4 + 2])) return false
  }
  return true
}

export interface ScreenSetResult {
  project: RomProject
  replaced: string[]
  unchanged: number
  problems: string[]
}

// The screens' files put in, each where its name says.
export function importScreenSet(project: RomProject, images: (Image & { name: string })[]): ScreenSetResult {
  const snes = project.game.platform === 'snes'
  let next = project
  const replaced: string[] = []
  const problems: string[] = []
  let unchanged = 0
  for (const image of images) {
    const file = image.name.slice(image.name.lastIndexOf('/') + 1).toLowerCase()
    const screen = screensOf(project).find((s) => s.file === file)
    if (!screen) {
      problems.push(`${image.name}: not one of the screens (${screensOf(project).map((s) => s.file).join(', ')}).`)
      continue
    }
    const shown = screen.read(next)
    if (!shown) {
      problems.push(`${image.name}: this ROM has no ${screen.title.toLowerCase()} to put it in.`)
      continue
    }
    if (samePicture(image, shown.picture, shown.palette, snes)) {
      unchanged++
      continue
    }
    try {
      next = screen.put(next, image)
      replaced.push(screen.title)
    } catch (e) {
      problems.push(`${image.name}: ${e instanceof RinkImportError || e instanceof SnesRinkImportError || e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { project: next, replaced, unchanged, problems }
}

export const screenImage = (file: ScreenFile) => pictureToImage(file.picture, file.palette, file.snes ? SNES_COLORS : undefined)
