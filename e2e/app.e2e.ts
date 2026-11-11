import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'
import { checkProject } from '../src/core/check'
import { rinkLogo } from '../src/core/graphics'
import { buildRom, openRom as readRom } from '../src/core/rom'
import { applyHacks, detectHacks, NO_HACKS } from '../src/core/hacks'
import { applySnesHacks, detectSnesHacks } from '../src/core/sneshacks'
import { snesBlockColours } from '../src/core/snesblockcolours'
import { NO_SNES_PICTURE_EDITS, snesCentreIce, snesLogo } from '../src/core/snespictures'
import { currentSnesPicture } from '../src/core/snespictureset'
import { createZip, readZip } from '../src/core/zip'

// Most of these need a ROM, which is copyrighted and not part of the project.
// They run when your own copy of NHL 94, named nhl94.bin, is in the folder
// above the project, and are skipped otherwise.
const romPath = resolve(process.cwd(), '..', 'nhl94.bin')
const hasRom = existsSync(romPath)

const romPicker = (page: Page) => page.locator('input[type=file][accept*=".bin"]').first()
const team = (page: Page, name: string) => page.locator('nav').getByRole('button', { name, exact: true })
const entry = (page: Page, name: string | RegExp) => page.locator('nav').getByRole('button', { name })
const rows = (page: Page, table: 'Goalies' | 'Skaters') =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: table, exact: true }) }).locator('tbody tr')
const nameOf = (row: Locator) => row.locator('input.name')
const tick = (row: Locator) => row.locator('input[type=checkbox]').check()

async function openRom(page: Page) {
  await page.goto('/')
  await romPicker(page).setInputFiles(romPath)
  await expect(page.locator('nav button')).toHaveCount(28 + 14)
}

async function downloadFrom(page: Page, button: Locator): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  return download
}

// The League page's table of every team.
const leagueTable = (page: Page) => page.locator('section').filter({ has: page.getByRole('heading', { name: 'How the teams compare' }) }).locator('table')

test.describe('without a ROM', () => {
  test('shows the welcome screen and the help', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'NOSE4Web' })).toBeVisible()
    await expect(page.getByText('It is never uploaded')).toBeVisible()

    await page.getByRole('button', { name: 'How to use it' }).click()
    await expect(page.getByRole('heading', { name: 'Getting started' })).toBeVisible()
    await page.getByRole('link', { name: 'Spreadsheet files' }).click()
    await expect(page.getByRole('heading', { name: 'Spreadsheet files' })).toBeInViewport()

    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('button', { name: 'How to use it' })).toBeVisible()
  })

  test('explains when a file is not a ROM', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles({ name: 'notes.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('hello') })
    await expect(page.getByText("This file is not a Sega Genesis ROM or NHL '94 for the SNES.")).toBeVisible()
  })
})

test.describe('with the NHL 94 ROM', () => {
  test.skip(!hasRom, 'needs ../nhl94.bin')

  test('opens the ROM and shows a team', async ({ page }) => {
    await openRom(page)
    await expect(page.locator('header')).toContainText('NHL 94')
    await expect(page.locator('header')).toContainText('0 bytes free')
    await expect(nameOf(rows(page, 'Goalies').first())).toHaveValue('Guy Hebert')
    await expect(rows(page, 'Skaters')).toHaveCount(16)
    await expect(page.locator('p.notice')).toHaveCount(0) // only for hacks with fewer skaters
    await team(page, 'Montreal Canadiens').click()
    await expect(nameOf(rows(page, 'Goalies').first())).toHaveValue('Patrick Roy')
    await page.screenshot({ path: 'test-results/shots/team.png', fullPage: true })
  })

  test('tracks unsaved edits, blocks an oversized ROM, and undoes', async ({ page }) => {
    await openRom(page)
    const goalie = nameOf(rows(page, 'Goalies').first())
    const downloadRom = page.getByRole('button', { name: 'Download ROM' })
    await expect(page.getByText('Not downloaded yet')).toBeHidden()

    await goalie.fill('Guy Hebert The Second')
    await expect(page.getByText('Not downloaded yet')).toBeVisible()
    await expect(page.locator('header')).toContainText('bytes over the limit')
    await expect(downloadRom).toBeDisabled()

    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(goalie).toHaveValue('Guy Hebert')
    await expect(page.locator('header')).toContainText('0 bytes free')
    await expect(page.getByText('Not downloaded yet')).toBeHidden()

    await page.getByRole('button', { name: 'Redo' }).click()
    await expect(goalie).toHaveValue('Guy Hebert The Second')
  })

  test('adds roster space, downloads a ROM, and reopens it with the edits', async ({ page }) => {
    await openRom(page)
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    await expect(page.locator('header')).toContainText('934 bytes free')
    await nameOf(rows(page, 'Skaters').first()).fill('A Considerably Longer Name')
    await page.getByRole('button', { name: 'Add player' }).click()
    await expect(rows(page, 'Skaters')).toHaveCount(17)

    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    expect(download.suggestedFilename()).toBe('nhl94.bin')
    const saved = readFileSync(await download.path())
    expect(saved.length).toBe(1048576)
    await expect(page.getByText('Not downloaded yet')).toBeHidden()

    await romPicker(page).setInputFiles({ name: 'edited.bin', mimeType: 'application/octet-stream', buffer: saved })
    await expect(page.locator('input.rom-name')).toHaveValue('edited')
    await expect(nameOf(rows(page, 'Skaters').first())).toHaveValue('A Considerably Longer Name')
    await expect(rows(page, 'Skaters')).toHaveCount(17)
    // The second expansion is now on offer, and warns that the ROM grows.
    await expect(page.getByRole('button', { name: /Add 512 bytes of roster space \(ROM grows to 2 MB\)/ })).toBeVisible()
  })

  test('downloads a patch', async ({ page }) => {
    await openRom(page)
    await rows(page, 'Skaters').first().locator('input.num').first().fill('77')
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download patch' }))
    expect(download.suggestedFilename()).toBe('nhl94.ips')
    const patch = readFileSync(await download.path())
    expect(patch.subarray(0, 5).toString()).toBe('PATCH')
    expect(patch.subarray(-3).toString()).toBe('EOF')
  })

  test('draws the colour previews and redraws them when a colour changes', async ({ page }) => {
    await openRom(page)
    const preview = page.locator('canvas.preview').first()
    await expect(preview).toBeVisible()
    const colours = () =>
      preview.evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        const seen = new Set<string>()
        for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`)
        return [...seen].sort()
      })
    const before = await colours()
    expect(before.length).toBeGreaterThan(5) // a real picture, not a blank box

    // The first swatch is the jersey and helmet's lightest colour. Make it pure red.
    const home = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Home colours' }) })
    const sliders = home.locator('input[type=range]')
    await sliders.nth(0).fill('7')
    await sliders.nth(1).fill('0')
    await sliders.nth(2).fill('0')
    const after = await colours()
    expect(after).toContain('255,0,0,255')
    expect(after).not.toEqual(before)
    await home.screenshot({ path: 'test-results/shots/colours.png' })

    await entry(page, 'Rink colours').click()
    await expect(page.locator('canvas.preview')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/rink.png', fullPage: true })
  })

  test('exports and replaces team logos and banners', async ({ page }) => {
    await openRom(page)
    await team(page, 'Montreal Canadiens').click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Logos and banners' }) })
    const pictures = section.locator('.picture')
    await expect(pictures).toHaveCount(4)
    const colourCount = (picture: Locator) =>
      picture.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        const seen = new Set<number>()
        for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
        return seen.size
      })
    for (let i = 0; i < 4; i++) expect(await colourCount(pictures.nth(i))).toBeGreaterThan(2) // real pictures
    await section.screenshot({ path: 'test-results/shots/pictures.png' })

    // Exporting gives a PNG of the right size, and importing it back is accepted.
    const rink = pictures.nth(0)
    const exported = await downloadFrom(page, rink.getByRole('button', { name: 'Export PNG' }))
    expect(exported.suggestedFilename()).toBe('Montreal_Canadiens_rink_logo.png')
    const png = readFileSync(await exported.path())
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([48, 32])
    await rink.locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
    await expect(section.getByText('Centre-ice logo replaced')).toBeVisible()

    // A plain image of the right size replaces each picture.
    const plain = async (width: number, height: number) => {
      const url = await page.evaluate(
        ([w, h]) => {
          const canvas = document.createElement('canvas')
          canvas.width = w
          canvas.height = h
          const context = canvas.getContext('2d')!
          context.fillStyle = '#c00000'
          context.fillRect(0, 0, w, h)
          return canvas.toDataURL('image/png')
        },
        [width, height],
      )
      return { name: 'plain.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') }
    }
    await rink.locator('input[type=file]').setInputFiles(await plain(48, 32))
    expect(await colourCount(rink)).toBe(1)
    await pictures.nth(1).locator('input[type=file]').setInputFiles(await plain(48, 48))
    await expect(section.getByText('Menu logo replaced.')).toBeVisible()
    expect(await colourCount(pictures.nth(1))).toBe(1)
    await pictures.nth(3).locator('input[type=file]').setInputFiles(await plain(88, 16))
    await expect(section.getByText('In-game banner replaced.')).toBeVisible()

    // A busy menu banner does not fit the original ROM until the pictures are given more room.
    const busy = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 88
      canvas.height = 16
      const context = canvas.getContext('2d')!
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 88; x++) {
          context.fillStyle = (x * 7 + y * 13 + ((x * y) % 5)) % 3 ? '#ffffff' : '#000000'
          context.fillRect(x, y, 1, 1)
        }
      }
      return canvas.toDataURL('image/png')
    })
    const busyBanner = { name: 'busy.png', mimeType: 'image/png', buffer: Buffer.from(busy.split(',')[1], 'base64') }
    await pictures.nth(2).locator('input[type=file]').setInputFiles(busyBanner)
    await expect(section.getByText(/The menu banners share room for a set number of different squares of 8 by 8 pixels, and this change needs \d+ more/)).toBeVisible()
    await section.getByRole('button', { name: 'Give logos and banners more room (ROM grows to 2 MB)' }).click()
    await expect(section.getByText('now have room for any replacement')).toBeVisible()
    await pictures.nth(2).locator('input[type=file]').setInputFiles(busyBanner)
    await expect(section.getByText('Menu banner replaced.')).toBeVisible()
    await expect(section.getByRole('button', { name: /more room/ })).toBeHidden()

    // The wrong size is refused, with the size that is needed.
    await pictures.nth(2).locator('input[type=file]').setInputFiles(await plain(48, 48))
    await expect(section.getByText('This picture has to be 88 by 16.')).toBeVisible()

    // The replacements are in the downloaded ROM.
    const rom = readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())
    await romPicker(page).setInputFiles({ name: 'pictures.bin', mimeType: 'application/octet-stream', buffer: rom })
    await team(page, 'Montreal Canadiens').click()
    expect(await colourCount(pictures.nth(0))).toBe(1)
    expect(await colourCount(pictures.nth(1))).toBe(1)
    expect(await colourCount(pictures.nth(2))).toBe(2) // the busy black and white banner
    expect(rom.length).toBe(2097152)
    await team(page, 'Boston Bruins').click()
    expect(await colourCount(pictures.nth(2))).toBeGreaterThan(2)
    expect(await colourCount(pictures.nth(0))).toBeGreaterThan(2) // other teams are untouched
  })

  test('adds score logos for every team, in home and away colours, and takes them out again', async ({ page }) => {
    await openRom(page)
    await team(page, 'Boston Bruins').click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Score logo' }) })
    await section.getByRole('button', { name: 'Add score logos for every team' }).click()
    await expect(section.locator('canvas.preview')).toHaveCount(2)
    await expect(section.getByText('The ROM grew to 2 MB to make room.')).toBeVisible()
    await section.screenshot({ path: 'test-results/shots/genesis-score-logo.png' })
    await section.getByRole('button', { name: "Show Boston's letters instead" }).click()
    await expect(section.locator('canvas.preview')).toHaveCount(0)
    await section.getByRole('button', { name: 'Give Boston a score logo' }).click()
    await expect(section.locator('canvas.preview')).toHaveCount(2)
    await section.getByRole('button', { name: 'Take score logos out of this ROM' }).click()
    await expect(section.getByRole('button', { name: 'Add score logos for every team' })).toBeVisible()
  })

  test('adds head bleeding on the Hacks page and takes it out again', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Hacks').click()
    const main = page.locator('main')
    // A choice in Looks and screens, written by Apply with the rest.
    const looks = main.locator('#hacks-looks')
    await looks.getByLabel('Head bleeding').selectOption('on')
    await expect(main.getByText('Head bleeding: Off to On.')).toBeVisible()
    await expect(main.getByText('which grows it to 2 MB')).toBeVisible()
    await main.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(looks.getByLabel('Head bleeding')).toHaveValue('on')
    await looks.getByLabel('Head bleeding').selectOption('off')
    await main.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(looks.getByLabel('Head bleeding')).toHaveValue('off')
    await expect(main.getByText('Nothing is set to change.')).toBeVisible()
  })

  test("replaces a player's photo, chooses who it is for, and adds one", async ({ page }) => {
    await openRom(page)
    await team(page, 'Anaheim Mighty Ducks').click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Player photos' }) })
    const photos = section.locator('.picture')
    await expect(photos).toHaveCount(6)
    await section.screenshot({ path: 'test-results/shots/photos.png' })
    await expect(photos.nth(1).getByText(/The generic picture/)).toBeVisible()

    // An image of any size: a dark disc on white, 120 by 90.
    const url = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 90
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, 120, 90)
      context.fillStyle = '#202020'
      context.beginPath()
      context.arc(60, 45, 30, 0, Math.PI * 2)
      context.fill()
      return canvas.toDataURL('image/png')
    })
    await section.getByLabel('Import photo 2').setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') })
    await expect(section.getByText(/replaced\. The image was 120 by 90: its middle square was shrunk to 48 by 48\./)).toBeVisible()
    await expect(photos.nth(1).getByText(/The generic picture/)).toBeHidden()
    const exported = await downloadFrom(page, photos.nth(1).getByRole('button', { name: 'Export PNG' }))
    expect(exported.suggestedFilename()).toMatch(/^Anaheim_Mighty_Ducks_.+_photo\.png$/)

    // Moved up while being drawn, it is still the one being drawn.
    const drawn = (await photos.nth(1).locator('strong').textContent())!.replace(/^\d+\. /, '')
    await photos.nth(1).getByRole('button', { name: 'Draw…' }).click()
    await expect(section.getByRole('heading', { name: `Drawing the photo of ${drawn}` })).toBeVisible()
    await section.getByRole('button', { name: 'Move photo 2 up' }).click()
    await expect(section.getByRole('heading', { name: `Drawing the photo of ${drawn}` })).toBeVisible()
    await section.getByRole('button', { name: 'Move photo 1 down' }).click()
    await expect(section.getByRole('heading', { name: `Drawing the photo of ${drawn}` })).toBeVisible()

    // Who it is for, and a seventh player added.
    const who = section.getByLabel('Photo 2 is for')
    const other = await who.locator('option').nth(4).getAttribute('value')
    await who.selectOption(other!)
    await expect(section.getByText(/Photo 2 is now for/)).toBeVisible()
    await section.getByLabel('Add a photo for').selectOption({ index: 1 })
    await expect(photos).toHaveCount(7)
    await photos.nth(6).getByRole('button', { name: 'Remove' }).click()
    await expect(photos).toHaveCount(6)
    await expect(photos.first().getByRole('button', { name: 'Remove' })).toBeDisabled()

    // Downloaded and opened again, the photo and its player are kept.
    const rom = readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())
    await romPicker(page).setInputFiles({ name: 'photos.bin', mimeType: 'application/octet-stream', buffer: rom })
    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(section.getByLabel('Photo 2 is for')).toHaveValue(other!)
    await expect(photos.nth(1).getByText(/The generic picture/)).toBeHidden()
  })

  test('draws a logo pixel by pixel, a stroke at a time', async ({ page }) => {
    await openRom(page)
    await team(page, 'Montreal Canadiens').click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Logos and banners' }) })
    const rink = section.locator('.picture').nth(0)
    await rink.getByRole('button', { name: 'Draw…' }).click()
    const editor = section.getByRole('group', { name: 'Draw the centre-ice logo' })
    const canvas = editor.getByLabel('Centre-ice logo, drawn large')
    const drag = async (from: [number, number], to: [number, number]) => {
      await canvas.scrollIntoViewIfNeeded()
      const box = (await canvas.boundingBox())!
      const at = (x: number, y: number) => [box.x + ((x + 0.5) * box.width) / 48, box.y + ((y + 0.5) * box.height) / 32] as const
      await page.mouse.move(...at(...from))
      await page.mouse.down()
      await page.mouse.move(...at(...to), { steps: 4 })
      await page.mouse.up()
    }
    const colourCount = () =>
      rink.locator('canvas').evaluate((c: HTMLCanvasElement) => {
        const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
        const seen = new Set<number>()
        for (let i = 0; i < data.length; i += 4) if (data[i + 3]) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
        return seen.size
      })
    expect(await colourCount()).toBeGreaterThan(2)

    // A filled rectangle over the whole of it, in one colour: one stroke.
    await editor.getByRole('button', { name: 'Colour 2', exact: true }).click()
    await editor.getByRole('button', { name: 'Filled rectangle' }).click()
    await drag([0, 0], [47, 31])
    expect(await colourCount()).toBe(1)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    expect(await colourCount()).toBeGreaterThan(2)

    // The pencil, mirrored, and the eraser.
    await editor.getByRole('button', { name: 'Pencil' }).click()
    await editor.getByRole('button', { name: 'Colour 3', exact: true }).click()
    await editor.getByLabel('Mirror left and right').check()
    await drag([2, 2], [2, 5])
    await editor.getByRole('button', { name: 'See-through' }).click()
    await drag([10, 20], [10, 20])
    await editor.getByLabel('Mirror left and right').uncheck()
    await editor.getByRole('button', { name: 'Move right' }).click()
    await section.screenshot({ path: 'test-results/shots/draw-logo.png' })
    await editor.getByRole('button', { name: 'Done drawing' }).click()
    await expect(editor).toBeHidden()

    const rom = readRom(new Uint8Array(readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())))
    const montreal = rom.teams.findIndex((t) => t.names.some((name) => name === 'Montreal'))
    const logo = rinkLogo(rom, montreal)
    const pixel = (x: number, y: number) => logo.pixels[y * logo.width + x]
    // Moved one to the right: the strokes at x 2 and 45 are now at 3 and 46, and nothing is at 0.
    for (let y = 2; y <= 5; y++) expect([pixel(3, y), pixel(46, y)]).toEqual([3, 3])
    expect([pixel(11, 20), pixel(38, 20)]).toEqual([0, 0])
    for (let y = 0; y < 32; y++) expect(pixel(0, y)).toBe(0)

    // The Changes page lists the drawn logo.
    await expect(entry(page, /^Changes/)).toHaveText('Changes (1)')
    await entry(page, /^Changes/).click()
    await expect(page.locator('main').getByText('Centre-ice logo changed.')).toBeVisible()
  })

  test('marks jersey numbers two players on a team share', async ({ page }) => {
    await openRom(page)
    await team(page, 'Boston Bruins').click()
    const skaters = rows(page, 'Skaters')
    const number = (row: Locator) => row.getByLabel(/^Jersey number of/)
    await expect(page.locator('input.num.shared')).toHaveCount(0)
    const first = await number(skaters.nth(0)).inputValue()
    const firstName = await nameOf(skaters.nth(0)).inputValue()
    const secondName = await nameOf(skaters.nth(1)).inputValue()
    await number(skaters.nth(1)).fill(first)
    await expect(page.locator('input.num.shared')).toHaveCount(2)
    await expect(number(skaters.nth(0))).toHaveAttribute('title', `${secondName} wears number ${first} too.`)
    await expect(number(skaters.nth(1))).toHaveAttribute('title', `${firstName} wears number ${first} too.`)
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator('input.num.shared')).toHaveCount(0)
  })

  test('copies a player to another team', async ({ page }) => {
    await openRom(page)
    await team(page, 'Boston Bruins').click()
    const source = rows(page, 'Skaters').first()
    const copiedName = await nameOf(source).inputValue()
    await tick(source)
    await page.getByRole('button', { name: 'Copy ticked' }).first().click()
    await expect(page.getByText(`Copied ${copiedName}.`)).toBeVisible()

    await team(page, 'Anaheim Mighty Ducks').click()
    const target = rows(page, 'Skaters').nth(2)
    await tick(target)
    await page.getByRole('button', { name: 'Paste over ticked' }).first().click()
    await expect(page.getByText('Pasted 1 player, with his photo.')).toBeVisible()
    await expect(nameOf(target)).toHaveValue(copiedName)
  })

  test('moves a player to another team', async ({ page }) => {
    await openRom(page)
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    await team(page, 'Boston Bruins').click()
    const source = rows(page, 'Skaters').first()
    const movedName = await nameOf(source).inputValue()
    await tick(source)
    await page.getByLabel('Team to move players to').selectOption({ label: 'Anaheim Mighty Ducks' })
    await page.getByRole('button', { name: 'Move ticked to' }).click()
    await expect(page.getByText('Moved 1 player to Anaheim Mighty Ducks.')).toBeVisible()
    await expect(rows(page, 'Skaters')).toHaveCount(22)

    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(rows(page, 'Skaters')).toHaveCount(17)
    await expect(page.locator(`input.name[value="${movedName}"]`)).toHaveCount(1)
    // Nothing the checker counts as a problem, so the entry carries no number.
    await expect(entry(page, 'Check ROM')).toHaveText('Check ROM')
  })

  test('rates each line and the team, and keeps the ratings up to date as the team changes', async ({ page }) => {
    await openRom(page)
    await team(page, 'Montreal Canadiens').click()
    const lines = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) })
    const overall = async () => Number((await lines.getByText(/^Overall /).textContent())!.replace('Overall ', ''))
    const rating = (l: number) => lines.locator('tbody tr').nth(l).locator('td').last()
    const before = await overall()
    expect(before).toBeGreaterThan(40)
    await expect(rating(1)).toHaveText(/^\d+\.\d$/)
    await expect(rating(1)).toHaveAttribute('title', /^Forwards \d+\.\d, defence \d+\.\d$/)

    // Sc1's centre swapped for the last player on the roster: the line and the team change at once.
    const sc1 = await rating(1).textContent()
    const last = String(await lines.locator('tbody tr').nth(1).locator('select').nth(4).locator('option').last().getAttribute('value'))
    await lines.locator('tbody tr').nth(1).locator('select').nth(4).selectOption(last)
    await expect(rating(1)).not.toHaveText(sc1!)
    await expect.poll(overall).not.toBe(before)

    // So does a change to a player's ratings: every skater's Speed at its lowest.
    const changed = await overall()
    for (const row of await rows(page, 'Skaters').all()) await row.locator('select.attribute').nth(2).selectOption({ index: 0 })
    await expect.poll(overall).toBeLessThan(changed)

    // And the League page shows the same overall.
    const now = await overall()
    await entry(page, 'League').click()
    const table = leagueTable(page)
    const montreal = table.locator('tbody tr').filter({ hasText: 'Montreal Canadiens' })
    await expect(montreal.locator('td').nth(1)).toHaveText(now.toFixed(1))
  })

  test('puts two teams side by side, and shows how balanced the league is', async ({ page }) => {
    await openRom(page)
    await entry(page, 'League').click()
    const matchup = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Two teams side by side' }) })
    await page.getByLabel('First team to compare').selectOption({ label: 'Montreal Canadiens' })
    await page.getByLabel('Second team to compare').selectOption({ label: 'Los Angeles Kings' })
    await expect(matchup.locator('thead')).toContainText('Montreal Canadiens')
    await expect(matchup.locator('thead')).toContainText('Los Angeles Kings')
    // Strength, overall, every line, the goalie, the forwards, the defence and the best goalie.
    await expect(matchup.locator('tbody tr')).toHaveCount(1 + 1 + 8 + 4)
    await expect(matchup.locator('tbody tr').first()).toContainText('Strength')
    const overallRow = matchup.locator('tbody tr').nth(1).locator('td')
    const [montreal, kings, difference] = await overallRow.allTextContents()
    expect(Number(difference)).toBeCloseTo(Number(montreal) - Number(kings), 1)
    // The same overall as the table of every team.
    await expect(leagueTable(page).locator('tbody tr').filter({ hasText: 'Montreal Canadiens' }).locator('td').nth(1)).toHaveText(montreal)

    const balance = page.locator('section').filter({ has: page.getByRole('heading', { name: 'League balance' }) })
    await expect(balance.getByText(/^Average \d+\.\d; the best team is \d+\.\d above the weakest; standard deviation \d+\.\d\./)).toBeVisible()
    const ratings = await balance.locator('tbody tr td:nth-child(2)').evaluateAll((cells) => cells.map((c) => Number(c.textContent)))
    // The two All-Star teams are left out unless asked for.
    expect(ratings).toHaveLength(26)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    await expect(balance.getByRole('button', { name: 'All Stars East' })).toHaveCount(0)
    await expect(balance.locator('td.high').first()).toBeVisible()
    await expect(balance.locator('td.low').first()).toBeVisible()
    await page.getByLabel('Measured by').selectOption({ label: 'First line (without line changes)' })
    await page.getByLabel('Count the All-Star teams').check()
    await expect(balance.locator('tbody tr')).toHaveCount(28)
    await matchup.screenshot({ path: 'test-results/shots/league-matchup.png' })
    await balance.screenshot({ path: 'test-results/shots/league-balance.png' })
  })

  test('changes ticked players with quick edit keys', async ({ page }) => {
    await openRom(page)
    const row = rows(page, 'Skaters').first()
    const agility = row.locator('select.attribute').nth(1)
    const before = Number(await agility.inputValue())
    await page.getByLabel('Quick edit keys').check()
    await tick(row)
    await page.keyboard.press('Digit1')
    await expect(agility).toHaveValue(String(before + 1))
    await page.keyboard.press('Shift+Digit1')
    await page.keyboard.press('Shift+Digit1')
    await expect(agility).toHaveValue(String(before - 1))
  })

  test('sorts and filters the roster without changing it', async ({ page }) => {
    await openRom(page)
    const names = () => rows(page, 'Skaters').locator('input.name').evaluateAll((inputs) => inputs.map((i) => (i as HTMLInputElement).value))
    const original = await names()

    await page.getByLabel('Show in order of').selectOption({ label: 'Name' })
    expect(await names()).toEqual([...original].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())))
    await expect(rows(page, 'Skaters').first().getByRole('button', { name: '↓' })).toBeDisabled()

    await page.getByLabel('Find').fill(original[3].slice(0, 5))
    expect(await names()).toContain(original[3])
    expect((await names()).length).toBeLessThan(original.length)

    await page.getByLabel('Find').fill('')
    await page.getByLabel('Show in order of').selectOption({ label: 'Roster order' })
    expect(await names()).toEqual(original)
    await expect(page.getByText('Not downloaded yet')).toBeHidden()
  })

  test('exports and imports an Excel workbook and a set of CSV files', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Spreadsheet files').click()

    const workbook = await downloadFrom(page, page.getByRole('button', { name: 'Export nhl94.xlsx' }))
    expect(workbook.suggestedFilename()).toBe('nhl94.xlsx')
    await page.locator('input[type=file][accept=".xlsx"]').setInputFiles({
      name: 'Season_9.xlsx',
      mimeType: 'application/octet-stream',
      buffer: readFileSync(await workbook.path()),
    })
    await expect(page.locator('.outcome')).toContainText('Imported Season_9.xlsx')
    await expect(page.locator('.outcome li')).toHaveCount(9)
    await expect(page.locator('.outcome')).not.toHaveClass(/error/)
    await expect(page.locator('input.rom-name')).toHaveValue('Season_9')

    const downloads: Download[] = []
    page.on('download', (download) => downloads.push(download))
    await page.getByRole('button', { name: 'Export all 9 files' }).click()
    await expect.poll(() => downloads.length, { timeout: 15000 }).toBe(9)
    expect(downloads.map((d) => d.suggestedFilename()).sort()).toContain('Season_9_players.csv')

    const files = await Promise.all(
      downloads.map(async (d) => ({
        name: d.suggestedFilename().replace('Season_9_', 'Season_10_'),
        mimeType: 'text/csv',
        buffer: readFileSync(await d.path()),
      })),
    )
    await page.locator('input[type=file][accept*=".csv"]').setInputFiles(files)
    await expect(page.locator('.outcome')).toContainText('Imported 9 files')
    await expect(page.locator('input.rom-name')).toHaveValue('Season_10')
    await page.screenshot({ path: 'test-results/shots/spreadsheets.png', fullPage: true })

    await page.locator('input[type=file][accept*=".csv"]').setInputFiles({
      name: 'Season_10_players.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('Team,Name\r\n1,Bob\r\n'),
    })
    await expect(page.locator('.outcome.error')).toContainText('Nothing was imported')
  })

  test('edits game settings, then checks and compares the ROM', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Game settings').click()
    const overtime = page.locator('tr').filter({ hasText: 'Overtime' }).locator('input')
    await overtime.fill('300')
    await page.screenshot({ path: 'test-results/shots/settings.png', fullPage: true })
    // The title screen credits, a box for each page.
    await expect(page.getByLabel('Credits page 1', { exact: true })).toHaveValue('$ 1993 Electronic Arts\nLicensed by\nSega Enterprises Ltd.')
    await expect(page.getByText('934 of 934 bytes used.')).toBeVisible()
    await page.getByLabel('Credits page 3', { exact: true }).fill('Programmed by\nMark Lesser\nand Our League')
    // A line of 14 letters takes 16 bytes.
    await expect(page.getByText('950 of 934 bytes used. Too long: the credits are not written until they fit.')).toBeVisible()
    // Page 4 (Graphics by, Doug Wike: 26 bytes) emptied to one blank line (2 bytes).
    await page.getByLabel('Credits page 4', { exact: true }).fill('')
    await expect(page.getByText('926 of 934 bytes used.', { exact: true })).toBeVisible()

    // The original game passes the check.
    await entry(page, 'Check ROM').click()
    await expect(page.getByText('Nothing to report.')).toBeVisible()

    // The penalty-kill lines' RW, hidden in the game's Edit Lines, is the short-handed extra skater (Genesis too).
    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(page.getByLabel('RW on line PK2')).toHaveClass('hidden-slot')
    await expect(page.getByLabel('RW on line PP1')).not.toHaveClass('hidden-slot')

    // Anaheim's first line: left wing offers only forwards, and the centre
    // chosen for it swaps places with him rather than being on the line twice.
    await team(page, 'Anaheim Mighty Ducks').click()
    const lines = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) })
    const nlc = lines.locator('tbody tr').first().locator('select')
    // Anaheim's 16 skaters are 9 forwards and 7 defence; the extra attacker is a forward too.
    await expect(nlc.nth(3).locator('option')).toHaveCount(9)
    await expect(nlc.nth(1).locator('option')).toHaveCount(7)
    await expect(nlc.nth(6).locator('option')).toHaveCount(9)
    const [wing, centre] = [await nlc.nth(3).inputValue(), await nlc.nth(4).inputValue()]
    await nlc.nth(3).selectOption(centre)
    await expect(nlc.nth(3)).toHaveValue(centre)
    await expect(nlc.nth(4)).toHaveValue(wing)
    await expect(page.locator('select.shared')).toHaveCount(0)

    // A goalie with no name is a problem.
    await nameOf(rows(page, 'Goalies').first()).fill('')
    await expect(entry(page, /Check ROM/)).toHaveText('Check ROM (1)')
    await entry(page, /Check ROM/).click()
    await expect(page.getByRole('heading', { name: 'Likely to cause trouble in the game (1)' })).toBeVisible()
    await expect(page.getByText('Player 1 has no name.')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/check.png', fullPage: true })
    await page.locator('main').getByRole('button', { name: 'Anaheim Mighty Ducks' }).first().click()
    await expect(nameOf(rows(page, 'Goalies').first())).toHaveValue('')

    await entry(page, 'Compare ROMs').click()
    await page.locator('main input[type=file]').setInputFiles(romPath)
    await expect(page.getByText('Overtime: 600 to 300 seconds.')).toBeVisible()
    await expect(page.locator('main h3')).toHaveText(['For the league', 'Everything, team by team', 'Anaheim Mighty Ducks', 'Clock', 'Title screen credits'])
    await expect(page.getByText(/^Line NLC: LW .* to .*\.$/)).toBeVisible()
    await expect(page.getByText('Page 3: Programmed by / Mark Lesser / and Our League.')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/compare.png', fullPage: true })
  })

  test('copies a playoff draw over another', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Game settings').click()
    const draws = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Playoff draws' }) })
    const drawRows = draws.locator('tbody tr')
    const values = (row: Locator) => row.locator('select').evaluateAll((selects) => selects.map((s) => (s as HTMLSelectElement).value))
    const first = await values(drawRows.nth(0))
    expect(await values(drawRows.nth(1))).not.toEqual(first)

    await tick(drawRows.nth(0))
    await draws.getByRole('button', { name: 'Copy ticked' }).click()
    await drawRows.nth(0).locator('input[type=checkbox]').uncheck()
    await tick(drawRows.nth(1))
    await draws.getByRole('button', { name: 'Paste over ticked' }).click()
    await expect(draws.getByText('Pasted.')).toBeVisible()
    expect(await values(drawRows.nth(1))).toEqual(first)
  })

  test('moves teams, with the menu choices and the team list following', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Game settings').click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Move teams' }) })
    // The original game's teams are in alphabetical order already.
    const sort = section.getByRole('button', { name: 'Put the first 26 teams in alphabetical order' })
    await expect(sort).toBeDisabled()
    await section.getByLabel('Move Boston Bruins to number').selectOption({ label: 'To 5' })
    await expect(section.getByText('Boston Bruins is now team 5. Undo takes it back.')).toBeVisible()
    const nav = page.locator('nav button')
    await expect(nav.filter({ hasText: 'Boston Bruins' })).toHaveCount(1)
    expect(await section.locator('tbody tr').nth(4).locator('td').nth(1).textContent()).toBe('Boston Bruins')
    await section.getByRole('button', { name: 'Move Boston Bruins up' }).click()
    expect(await section.locator('tbody tr').nth(3).locator('td').nth(1).textContent()).toBe('Boston Bruins')
    await section.screenshot({ path: 'test-results/shots/move-teams.png' })
    // Each team is compared with itself as opened: nothing to reset, and no change but the move.
    await team(page, 'Boston Bruins').click()
    await expect(page.getByRole('button', { name: 'Reset whole team' })).toBeDisabled()
    await team(page, 'Calgary Flames').click()
    await expect(page.getByRole('button', { name: 'Reset whole team' })).toBeDisabled()
    await expect(entry(page, /^Changes/)).toHaveText('Changes (1)')
    // Undoing and redoing the move, the page stays on its team.
    await team(page, 'Boston Bruins').click()
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.locator('nav button.active')).toHaveText('Boston Bruins')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(page.locator('nav button.active')).toHaveText('Boston Bruins')
    await entry(page, 'Game settings').click()
    // Sorting puts it back, and so does putting back the ROM's order.
    await sort.click()
    await expect(section.getByText('The first 26 teams are now in alphabetical order.', { exact: false })).toBeVisible()
    expect(await section.locator('tbody tr').nth(1).locator('td').nth(1).textContent()).toBe('Boston Bruins')
    await expect(section.getByRole('button', { name: 'Put the teams back as the ROM had them' })).toHaveCount(0)
    // Moving the All-Star team to the front, then back.
    await section.getByLabel('Move All Stars East to number').selectOption({ label: 'To 1' })
    expect(await section.locator('tbody tr').nth(0).locator('td').nth(1).textContent()).toBe('All Stars East')
    await section.getByRole('button', { name: 'Put the teams back as the ROM had them' }).click()
    expect(await section.locator('tbody tr').nth(0).locator('td').nth(1).textContent()).toBe('Anaheim Mighty Ducks')
    await entry(page, 'Check ROM').click()
    await expect(page.getByText('Nothing to report.')).toBeVisible()
  })

  test('replaces the splash screen with a picture, and puts the original back', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Game settings').click()
    const splash = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Splash screen' }) })
    await expect(splash.getByText("The original game's screen.")).toBeVisible()
    const png = await downloadFrom(page, splash.getByRole('button', { name: 'Export as PNG' }))
    expect(png.suggestedFilename()).toBe('splash_screen.png')
    await splash.locator('input[type=file]').setInputFiles(await png.path())
    await expect(splash.getByText(/is now the splash screen/)).toBeVisible()
    await expect(splash.getByText('A picture of your own.')).toBeVisible()
    await splash.getByRole('button', { name: 'Put back the original' }).click()
    await expect(splash.getByText("The original game's screen.")).toBeVisible()
  })

  test('exports an organ song as MIDI, replaces another with it, and puts the original back', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Game settings').click()
    const songs = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Organ songs' }) })
    const brass = songs.locator('tr').filter({ hasText: 'Brass Bonanza (HFD)' })
    // Who uses each song, and the ones nobody does, to replace first.
    await expect(songs.getByText(/^2 songs are used by no team and not picked by Random, so replacing one changes nothing else: 51, 67\./)).toBeVisible()
    await expect(brass).toContainText('HFD')
    await expect(songs.locator('tr').filter({ hasText: 'Go Team Go [C] (Longer)' })).toContainText('No team: a good one to replace')
    const midi = await downloadFrom(page, brass.getByRole('button', { name: 'Export MIDI' }))
    expect(midi.suggestedFilename()).toBe('song_17.mid')
    await songs.getByLabel('Replace song 2', { exact: true }).setInputFiles(await midi.path())
    await expect(songs.getByText(/^Song 2 is now "Brass Bonanza \(HFD\)", \d:\d\d long, on the organ\./)).toBeVisible()
    const second = songs.locator('tbody tr').nth(1)
    await expect(second).toContainText('Brass Bonanza (HFD) (in place of Here We Go [E-flat] (BOS))')
    // The team pages offer it by its name.
    await team(page, 'Boston Bruins').click()
    await expect(page.getByLabel('Organ song: Home goal').locator('option', { hasText: '2. Brass Bonanza (HFD) (in place of' })).toHaveCount(1)
    await entry(page, 'Game settings').click()
    await second.getByRole('button', { name: 'Put back the original' }).click()
    await expect(second).toContainText('Here We Go [E-flat] (BOS)')
    await expect(second.getByRole('button', { name: 'Put back the original' })).toHaveCount(0)
  })

  test("sets a team's organ songs, and downloads them", async ({ page }) => {
    await openRom(page)
    await team(page, 'Boston Bruins').click()
    const goal = page.getByLabel('Organ song: Home goal')
    await expect(goal).toHaveValue('0')
    // Random has nothing to play; a song does, and Play becomes Stop while it plays.
    const play = page.getByRole('button', { name: 'Play the song: Home goal' })
    await expect(play).toBeDisabled()
    await goal.selectOption({ label: '17. Brass Bonanza (HFD)' })
    await play.click()
    await page.getByRole('button', { name: 'Stop the song: Home goal' }).click()
    await expect(play).toBeEnabled()
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    expect(readRom(new Uint8Array(readFileSync(await download.path()))).teams[1].songs).toEqual([49, 50, 48, 0x40, 90, 49])
  })

  test('copies lines to another team', async ({ page }) => {
    await openRom(page)
    const lines = () => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) })
    const lineRows = () => lines().locator('tbody tr')
    const values = (row: Locator) => row.locator('select').evaluateAll((selects) => selects.map((s) => (s as HTMLSelectElement).value))

    // Anaheim has the shorter roster, so its lines suit any team.
    const copied = [await values(lineRows().nth(0)), await values(lineRows().nth(1))]
    await tick(lineRows().nth(0))
    await tick(lineRows().nth(1))
    await lines().getByRole('button', { name: 'Copy ticked' }).click()
    await expect(lines().getByText('Copied 2 lines.')).toBeVisible()

    await team(page, 'Boston Bruins').click()
    const untouched = await values(lineRows().nth(6))
    expect(await values(lineRows().nth(4))).not.toEqual(copied[0])
    await tick(lineRows().nth(4))
    await tick(lineRows().nth(5))
    await lines().getByRole('button', { name: 'Paste over ticked' }).click()
    await expect(lines().getByText('Pasted.')).toBeVisible()
    expect([await values(lineRows().nth(4)), await values(lineRows().nth(5))]).toEqual(copied)
    expect(await values(lineRows().nth(6))).toEqual(untouched)

    // A line naming a player further down than a team's roster goes is refused.
    const last = String(await rows(page, 'Skaters').count() + await rows(page, 'Goalies').count())
    await lineRows().nth(4).locator('select').nth(1).selectOption(last)
    await lines().getByRole('button', { name: 'Copy ticked' }).click()
    await team(page, 'Anaheim Mighty Ducks').click()
    const before = await values(lineRows().nth(2))
    await tick(lineRows().nth(2))
    await lines().getByRole('button', { name: 'Paste over ticked' }).click()
    await expect(lines().getByText(`A copied line uses roster position ${last}, but this team has`)).toBeVisible()
    expect(await values(lineRows().nth(2))).toEqual(before)
  })

  test('pastes attributes only, repeats a copy over more rows, and refuses a goalie over a skater', async ({ page }) => {
    await openRom(page)
    const attributes = (row: Locator) =>
      row.locator('select.attribute').evaluateAll((selects) => selects.map((s) => (s as HTMLSelectElement).value))
    const paste = (name: string) => page.getByRole('button', { name }).first().click()

    await team(page, 'Boston Bruins').click()
    const source = rows(page, 'Skaters').first()
    const copiedName = await nameOf(source).inputValue()
    const copiedAttributes = await attributes(source)
    await tick(source)
    await page.getByRole('button', { name: 'Copy ticked' }).first().click()

    await team(page, 'Anaheim Mighty Ducks').click()
    const skaters = rows(page, 'Skaters')
    const keptName = await nameOf(skaters.nth(3)).inputValue()
    await tick(skaters.nth(3))
    await paste('Paste attributes only')
    await expect(page.getByText('Pasted the attributes of 1 player.')).toBeVisible()
    await expect(nameOf(skaters.nth(3))).toHaveValue(keptName)
    expect(await attributes(skaters.nth(3))).toEqual(copiedAttributes)

    await tick(skaters.nth(5))
    await tick(skaters.nth(6))
    await paste('Paste over ticked')
    await expect(page.getByText('Pasted 1 player, with his photo, repeating them to fill the rows.')).toBeVisible()
    for (const row of [3, 5, 6]) await expect(nameOf(skaters.nth(row))).toHaveValue(copiedName)

    // A skater cannot be pasted over a goalie.
    const goalie = rows(page, 'Goalies').first()
    const goalieName = await nameOf(goalie).inputValue()
    for (const row of [3, 5, 6]) await skaters.nth(row).locator('input[type=checkbox]').uncheck()
    await tick(goalie)
    await paste('Paste over ticked')
    await expect(nameOf(goalie)).toHaveValue(goalieName)
    await expect(page.getByText(/goalie/i).first()).toBeVisible()
  })

  test('copies between teams when the browser refuses the system clipboard', async ({ page }) => {
    await page.addInitScript(() => {
      const refuse = () => Promise.reject(new Error('denied'))
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: refuse, readText: refuse } })
    })
    await openRom(page)
    await team(page, 'Boston Bruins').click()
    const source = rows(page, 'Skaters').first()
    const copiedName = await nameOf(source).inputValue()
    await tick(source)
    await page.getByRole('button', { name: 'Copy ticked' }).first().click()
    await team(page, 'Anaheim Mighty Ducks').click()
    const target = rows(page, 'Skaters').nth(2)
    await tick(target)
    await page.getByRole('button', { name: 'Paste over ticked' }).first().click()
    await expect(nameOf(target)).toHaveValue(copiedName)
  })

  test('quick edit keys change jersey numbers, respect limits, and stay out of the way of typing', async ({ page }) => {
    await openRom(page)
    const row = rows(page, 'Skaters').first()
    const other = rows(page, 'Skaters').nth(1)
    const agility = (r: Locator) => r.locator('select.attribute').nth(1)
    const jersey = row.locator('input.num').first()
    const before = Number(await agility(row).inputValue())
    const otherBefore = await agility(other).inputValue()

    // Off, the keys do nothing.
    await tick(row)
    await page.keyboard.press('Digit1')
    await expect(agility(row)).toHaveValue(String(before))

    await page.getByLabel('Quick edit keys').check()
    await page.getByLabel('Quick edit keys').blur()
    const number = Number(await jersey.inputValue())
    await page.keyboard.press('NumpadAdd')
    await expect(jersey).toHaveValue(String(number + 1))
    await page.keyboard.press('NumpadSubtract')
    await page.keyboard.press('NumpadSubtract')
    await expect(jersey).toHaveValue(String(number - 1))

    // Typing a digit into a name is typing, not a quick edit.
    await nameOf(row).click()
    await page.keyboard.press('End')
    await page.keyboard.press('Digit1')
    await expect(nameOf(row)).toHaveValue(/1$/)
    await expect(agility(row)).toHaveValue(String(before))
    await page.keyboard.press('Backspace')
    await nameOf(row).blur()

    // A rating stops at the top of its range however often the key is pressed.
    for (let i = 0; i < 20; i++) await page.keyboard.press('Digit1')
    const top = await agility(row).locator('option').last().getAttribute('value')
    await expect(agility(row)).toHaveValue(top!)
    // Players that are not ticked are untouched.
    await expect(agility(other)).toHaveValue(otherBefore)
  })

  test('picks colours with the colour box, from an image, and from the screen', async ({ page }) => {
    // The screen picker shows the operating system's own magnifier, which a
    // test cannot click; this stands in for the user choosing pure green.
    await page.addInitScript(() => {
      ;(window as unknown as { EyeDropper: unknown }).EyeDropper = class {
        open = () => Promise.resolve({ sRGBHex: '#00ff00' })
      }
    })
    await openRom(page)
    const home = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Home colours' }) })
    const word = home.locator('.color-controls span.note').first()
    const swatches = home.locator('button.swatch')

    await swatches.nth(3).click()
    await home.locator('input[type=color]').fill('#ff00ff')
    await expect(word).toHaveText(/0E0E/i)
    // A colour the console cannot show exactly snaps to the nearest it can.
    await home.locator('input[type=color]').fill('#804020')
    const snapped = (await word.textContent())!
    expect(snapped).toMatch(/^0[02468ACE]{3}$/i)
    await expect(swatches.nth(3)).toHaveAttribute('title', new RegExp(snapped, 'i'))

    await swatches.nth(4).click()
    await home.getByRole('button', { name: 'Pick from screen' }).click()
    await expect(word).toHaveText(/00E0/i)

    // An image that is red on the left and blue on the right.
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 200
      canvas.height = 100
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ff0000'
      context.fillRect(0, 0, 100, 100)
      context.fillStyle = '#0000ff'
      context.fillRect(100, 0, 100, 100)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    await home.locator('input[type=file]').setInputFiles({ name: 'two.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
    const image = home.locator('canvas.pick-image')
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((c: HTMLCanvasElement) => c.width)).toBe(200)
    const box = (await image.boundingBox())!
    await swatches.nth(5).click()
    await image.click({ position: { x: box.width * 0.25, y: box.height / 2 } })
    await expect(word).toHaveText(/000E/i)
    await swatches.nth(6).click()
    await image.click({ position: { x: box.width * 0.75, y: box.height / 2 } })
    await expect(word).toHaveText(/0E00/i)
    // Earlier picks stayed where they were put.
    await expect(swatches.nth(4)).toHaveAttribute('title', /00E0/i)
    await expect(swatches.nth(5)).toHaveAttribute('title', /000E/i)
    await home.getByRole('button', { name: 'Close image' }).click()
    await expect(image).toHaveCount(0)
  })

  test('resets one part of a team, then the whole team, leaving other teams alone', async ({ page }) => {
    await openRom(page)
    const reset = (what: string) => page.getByRole('button', { name: `Reset ${what}`, exact: true })
    const location = page.locator('.fields input').first()
    const firstName = nameOf(rows(page, 'Skaters').first())
    const home = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Home colours' }) })
    const word = home.locator('.color-controls span.note').first()

    // Another team's edit, which no reset here may touch.
    await team(page, 'Boston Bruins').click()
    await firstName.fill('Left Alone')
    await team(page, 'Anaheim Mighty Ducks').click()

    for (const what of ['whole team', 'names', 'roster', 'lines', 'home colours', 'away colours']) await expect(reset(what)).toBeDisabled()
    const openedLocation = await location.inputValue()
    const openedName = await firstName.inputValue()
    const openedWord = await word.textContent()

    await location.fill('Somewhere')
    await firstName.fill('New Player')
    await home.locator('input[type=range]').first().fill('7')
    await expect(reset('names')).toBeEnabled()
    await expect(reset('lines')).toBeDisabled()

    await reset('roster').click()
    await expect(firstName).toHaveValue(openedName)
    await expect(location).toHaveValue('Somewhere')
    await expect(reset('roster')).toBeDisabled()
    // A reset can be undone like any other edit.
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(firstName).toHaveValue('New Player')

    await reset('whole team').click()
    await expect(firstName).toHaveValue(openedName)
    await expect(location).toHaveValue(openedLocation)
    await expect(word).toHaveText(openedWord!)
    await expect(reset('whole team')).toBeDisabled()

    await team(page, 'Boston Bruins').click()
    await expect(firstName).toHaveValue('Left Alone')
    await expect(reset('whole team')).toBeEnabled()

    // Settings reset a section at a time.
    await entry(page, 'Game settings').click()
    await expect(reset('playoff draws')).toBeDisabled()
    const draws = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Playoff draws' }) })
    const firstDraw = draws.locator('tbody tr').first().locator('select').first()
    const openedDraw = await firstDraw.inputValue()
    await firstDraw.selectOption({ index: openedDraw === '5' ? 6 : 5 })
    await expect(reset('clock settings')).toBeDisabled()
    await reset('playoff draws').click()
    await expect(firstDraw).toHaveValue(openedDraw)
  })

  test('finds a player anywhere and compares the teams', async ({ page }) => {
    await openRom(page)
    await entry(page, 'League').click()
    await page.getByLabel('Player name to find').fill('gretzky')
    await expect(page.getByText(/^\d+ players? found\.$/)).toBeVisible()
    const found = page.locator('main table').first().locator('tbody tr')
    await expect(found.first()).toContainText('Wayne Gretzky')
    await expect(found.first()).toContainText('Los Angeles Kings')
    // A skater found can be moved to another team from here.
    await expect(found.first().getByLabel('Move Wayne Gretzky to')).toBeVisible()
    await found.first().getByLabel('Move Wayne Gretzky to').selectOption({ label: 'Edmonton Oilers' })
    await expect(page.getByText('Wayne Gretzky moved from Los Angeles Kings to Edmonton Oilers, after its last forward. Undo takes it back.')).toBeVisible()
    await expect(found.first()).toContainText('Edmonton Oilers')
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(found.first()).toContainText('Los Angeles Kings')

    const table = leagueTable(page)
    await expect(table.locator('tbody tr')).toHaveCount(28)
    await expect(table.locator('tfoot')).toContainText('League average')
    // Team, Overall, Strength, then First line.
    const firstLine = () => table.locator('tbody tr td:nth-child(4)').evaluateAll((cells) => cells.map((c) => Number(c.textContent)))
    await table.getByRole('button', { name: /^First line/ }).click()
    const down = await firstLine()
    expect(down).toEqual([...down].sort((a, b) => b - a))
    expect(down[0]).toBeGreaterThan(down[27])
    await table.getByRole('button', { name: /^First line/ }).click()
    expect(await firstLine()).toEqual([...down].reverse())
    await page.screenshot({ path: 'test-results/shots/league.png', fullPage: true })

    // Every line, for leagues with line changes, sorts like the rest and says what makes it up.
    await expect(table.getByRole('button', { name: /^PK2/ })).toHaveCount(0)
    await page.getByLabel(/Show every line/).check()
    for (const label of ['Sc1', 'Sc2', 'Chk', 'PP1', 'PP2', 'PK1', 'PK2']) await expect(table.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible()
    await table.getByRole('button', { name: /^Sc2/ }).click()
    const sc2 = await table.locator('tbody tr td:nth-child(6)').evaluateAll((cells) => cells.map((c) => Number(c.textContent)))
    expect(sc2).toEqual([...sc2].sort((x, y) => y - x))
    await expect(table.locator('tbody tr td:nth-child(6)').first()).toHaveAttribute('title', /^Forwards \d+\.\d, defence \d+\.\d$/)
    await page.screenshot({ path: 'test-results/shots/league_lines.png', fullPage: true })

    await found.first().getByRole('button', { name: 'Los Angeles Kings' }).click()
    await expect(page.locator('input.name[value="Wayne Gretzky"]')).toHaveCount(1)
  })

  test('previews and applies a bulk change, and undoes it in one step', async ({ page }) => {
    await openRom(page)
    const speeds = async () => {
      const all: string[] = []
      for (const row of await rows(page, 'Skaters').all()) all.push(await row.locator('select.attribute').nth(2).inputValue())
      return all
    }
    const before = await speeds()

    await entry(page, 'Bulk changes').click()
    const main = page.locator('main')
    await main.getByLabel('Attribute to change').selectOption({ label: 'Speed' })
    await main.getByLabel('Teams to change').selectOption({ label: 'Anaheim Mighty Ducks' })
    const movable = before.filter((v) => Number(v) < 6).length
    await expect(main.getByRole('button', { name: `Apply to ${movable} players` })).toBeVisible()
    await expect(main.locator('tbody tr')).toHaveCount(movable)
    await page.screenshot({ path: 'test-results/shots/bulk.png', fullPage: true })

    // Narrowing to forwards shows fewer; a cap nobody is above shows none.
    await main.getByLabel('Players to change').selectOption({ label: 'Forwards' })
    expect(await main.locator('tbody tr').count()).toBeLessThan(movable)
    await main.getByLabel('Players to change').selectOption({ label: 'All skaters' })
    await main.getByLabel('Kind of change').selectOption({ label: 'Cap at (lower anyone above)' })
    await main.getByLabel('Value to use').selectOption({ index: 6 })
    await expect(main.getByText('Nobody would change.')).toBeVisible()
    await expect(main.getByRole('button', { name: 'Apply to 0 players' })).toBeDisabled()

    await main.getByLabel('Kind of change').selectOption({ label: 'Raise by' })
    await main.getByRole('button', { name: `Apply to ${movable} players` }).click()
    await expect(main.getByText(`Changed ${movable} players.`)).toBeVisible()
    await team(page, 'Anaheim Mighty Ducks').click()
    expect(await speeds()).toEqual(before.map((v) => String(Math.min(6, Number(v) + 1))))
    await team(page, 'Boston Bruins').click()
    await page.getByRole('button', { name: 'Undo' }).click()
    await team(page, 'Anaheim Mighty Ducks').click()
    expect(await speeds()).toEqual(before)
  })

  test('imports a team from another ROM', async ({ page }) => {
    await openRom(page)
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    await entry(page, 'Import a team').click()
    const main = page.locator('main')
    await main.locator('input[type=file]').setInputFiles(romPath)
    await expect(main.getByText('NHL 94, 28 teams.')).toBeVisible()
    await main.getByLabel('Team to take').selectOption({ label: 'Montreal Canadiens' })
    await expect(main.getByLabel('Team to replace')).toHaveValue('11') // the same team here
    await main.getByLabel('Team to replace').selectOption({ label: 'Anaheim Mighty Ducks' })
    await main.getByLabel('Logos, banners and banner colours').uncheck()
    await main.getByLabel('Names').uncheck()
    await main.getByRole('button', { name: 'Import Montreal Canadiens over Anaheim Mighty Ducks' }).click()
    await expect(main.getByText(/Roster and lines brought in: \d+ players\./)).toBeVisible()
    await expect(main.getByText('Home and away colours brought in.')).toBeVisible()

    // Anaheim keeps its name and has Montreal's players.
    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(nameOf(rows(page, 'Goalies').first())).toHaveValue('Patrick Roy')
    await expect(page.locator('.fields input').first()).toHaveValue('Anaheim')
    await expect(entry(page, 'Check ROM')).toHaveText('Check ROM')

    // With pictures too, each is reported, and the ROM still downloads.
    await entry(page, 'Import a team').click()
    await main.locator('input[type=file]').setInputFiles(romPath)
    await main.getByLabel('Team to take').selectOption({ label: 'Montreal Canadiens' })
    await main.getByLabel('Team to replace').selectOption({ label: 'Boston Bruins' })
    await main.getByRole('button', { name: 'Import Montreal Canadiens over Boston Bruins' }).click()
    await expect(main.getByText('Centre-ice logo brought in.')).toBeVisible()
    await expect(main.getByText(/^In-game banner (brought in\.|left alone:)/)).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/import.png', fullPage: true })
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    expect(download.suggestedFilename()).toBe('nhl94.bin')
  })

  test('writes a change report for the league', async ({ page }) => {
    await openRom(page)
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    await team(page, 'Boston Bruins').click()
    const moved = await nameOf(rows(page, 'Skaters').first()).inputValue()
    await tick(rows(page, 'Skaters').first())
    await page.getByLabel('Team to move players to').selectOption({ label: 'Anaheim Mighty Ducks' })
    await page.getByRole('button', { name: 'Move ticked to' }).click()
    await page.locator('input.rom-name').fill('Season_10')

    await entry(page, 'Compare ROMs').click()
    const main = page.locator('main')
    await main.locator('input[type=file]').setInputFiles(romPath)
    await expect(main.getByText('Changed teams (1)')).toBeVisible()
    await expect(main.getByText(new RegExp(`^${moved}: Boston Bruins to Anaheim Mighty Ducks \\(overall \\d+\\)$`))).toBeVisible()

    const report = await downloadFrom(page, main.getByRole('button', { name: 'Download report' }))
    expect(report.suggestedFilename()).toBe('Season_10_changes.txt')
    const text = readFileSync(await report.path(), 'utf8')
    expect(text).toContain('Changes from nhl94 to Season_10')
    expect(text).toContain('1 player changed teams, 0 new players, 0 players gone, 0 overall ratings changed.')
    expect(text).toContain(`${moved}: Boston Bruins to Anaheim Mighty Ducks`)

    await main.getByRole('button', { name: 'Copy report' }).click()
    await expect(main.getByText('Copied.')).toBeVisible()
    // Windows hands the clipboard's line ends back in its own style.
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied.replace(/\r\n/g, '\n')).toBe(text)
  })

  test('handles a ROM that puts fewer skaters on the ice', async ({ page }) => {
    // A stand-in for the 3 on 3 hacks: the original game with the left
    // defence and right wing emptied on every line of every team.
    const stock = readRom(new Uint8Array(readFileSync(romPath)))
    const teams = stock.teams.map((t) => ({ ...t, lines: t.lines.map((line) => line.map((v, slot) => (slot === 1 || slot === 5 ? 0 : v))) }))
    const rom = Buffer.from(buildRom({ ...stock, teams }))

    await page.goto('/')
    await romPicker(page).setInputFiles({ name: 'three_on_three.bin', mimeType: 'application/octet-stream', buffer: rom })
    await expect(page.locator('nav button')).toHaveCount(28 + 14)
    // Nothing for the checker to complain about.
    await expect(entry(page, /Check ROM/)).toHaveText('Check ROM')

    const lines = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) })
    await expect(lines.getByText('This ROM puts fewer skaters on the ice')).toBeVisible()
    await expect(page.locator('p.notice')).toContainText('keep a copy of the file you opened')
    const first = lines.locator('tbody tr').first().locator('select')
    await expect(first.nth(1).locator('option:checked')).toHaveText('Empty')
    await expect(first.nth(5).locator('option:checked')).toHaveText('Empty')
    await expect(first.nth(4).locator('option:checked')).not.toHaveText('Empty')
    await expect(lines.getByText('Invalid')).toHaveCount(0)
    // Only the first line is played, so the penalty-kill lines' RW is not marked.
    await expect(page.locator('select.hidden-slot')).toHaveCount(0)
    // A position the ROM uses cannot be emptied; one it leaves empty can be filled and emptied again.
    await expect(first.nth(4).locator('option', { hasText: 'Empty' })).toHaveCount(0)
    // A defenceman not at RD already, which would move him.
    const rd = await first.nth(2).inputValue()
    const free = await first.nth(1).locator('option').evaluateAll((options, taken) => options.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== '0' && v !== taken), rd)
    await first.nth(1).selectOption(free[0])
    await expect(first.nth(1).locator('option:checked')).not.toHaveText('Empty')
    await first.nth(1).selectOption({ label: 'Empty' })
    await page.screenshot({ path: 'test-results/shots/fewer-skaters.png', fullPage: true })

    await entry(page, 'League').click()
    await expect(leagueTable(page).locator('tbody tr')).toHaveCount(28)
    await expect(leagueTable(page).locator('tbody tr td:nth-child(3)').first()).not.toHaveText('–')

    // The download opens again with the empty positions as they were.
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    const again = readRom(new Uint8Array(readFileSync(await download.path())))
    expect(again.teams.map((t) => t.lines)).toEqual(teams.map((t) => t.lines))
  })

  test('exports every picture as a zip and imports a changed set', async ({ page }) => {
    await openRom(page)
    await page.locator('input.rom-name').fill('Season_10')
    await entry(page, 'Picture files').click()
    const main = page.locator('main')

    await expect(main.getByText('302 pictures in Season_10_pictures.zip')).toBeVisible()
    const download = await downloadFrom(page, main.getByRole('button', { name: 'Export all pictures' }))
    expect(download.suggestedFilename()).toBe('Season_10_pictures.zip')
    const zip = new Uint8Array(readFileSync(await download.path()))
    const files = await readZip(zip)
    // Four pictures for each of 28 teams, less the centre-ice logo the two All Stars teams share,
    // and 191 player photos in a folder for each team.
    expect(files).toHaveLength(28 * 4 - 1 + 191)
    expect(files.filter((f) => f.name.startsWith('photos/02_Boston_Bruins/'))).toHaveLength(6)
    expect(files.map((f) => f.name)).toContain('02_Boston_Bruins_menu_logo.png')
    for (const file of files) expect([...file.data.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])

    // Brought straight back in, nothing changes.
    const picker = main.locator('input[type=file]')
    await picker.setInputFiles({ name: 'Season_10_pictures.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) })
    await expect(main.getByText('Replaced 0 pictures. 302 files matched what was there already.')).toBeVisible()
    await expect(page.getByText('Not downloaded yet')).toHaveCount(0)

    // A set with one logo painted red, in a folder, with a stray file beside it.
    const red = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 48
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ff0000'
      context.fillRect(0, 0, 48, 48)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    const changed = createZip([
      ...files.map((f) => ({ name: `pictures/${f.name}`, data: f.name === '02_Boston_Bruins_menu_logo.png' ? new Uint8Array(Buffer.from(red, 'base64')) : f.data })),
      { name: 'pictures/readme.txt', data: new Uint8Array([104, 105]) },
    ])
    await picker.setInputFiles({ name: 'edited.zip', mimeType: 'application/zip', buffer: Buffer.from(changed) })
    await expect(main.getByText('Replaced 1 picture. 301 files matched what was there already. 1 file could not be used.')).toBeVisible()
    await expect(main.getByText('pictures/readme.txt: not a PNG file, so it was left out.')).toBeVisible()
    await expect(main.getByText('Boston Bruins: Menu logo')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/picture-files.png', fullPage: true })

    // Loose PNG files work as well as a zip.
    await picker.setInputFiles([
      { name: '03_whatever_menu_logo.png', mimeType: 'image/png', buffer: Buffer.from(red, 'base64') },
      { name: 'not_named_properly.png', mimeType: 'image/png', buffer: Buffer.from(red, 'base64') },
    ])
    await expect(main.getByText('Replaced 1 picture. 0 files matched what was there already. 1 file could not be used.')).toBeVisible()
    await expect(main.getByText('Buffalo Sabres: Menu logo')).toBeVisible()

    await team(page, 'Boston Bruins').click()
    const logo = page.locator('.picture').filter({ hasText: 'Menu logo' })
    await expect(logo.getByRole('button', { name: 'Reset picture' })).toBeEnabled()
    // The downloaded ROM holds the red logo.
    const rom = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    expect(readRom(new Uint8Array(readFileSync(await rom.path()))).graphicsSupported).toBe(true)
  })

  test('letters a banner and copies colours and pictures to another team', async ({ page }) => {
    await openRom(page)
    await team(page, 'Boston Bruins').click()
    const text = page.getByLabel('Banner text')
    await expect(text).toHaveValue('Boston') // what the game's own banner reads
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Banner lettering' }) })

    await text.fill('Montreal Canadiens Hockey Club')
    await expect(section.getByText(/pixels too wide for a banner/)).toBeVisible()
    await expect(section.getByRole('button', { name: 'Use for the menu banner' })).toBeDisabled()
    await text.fill('Bruins ~')
    await expect(section.getByText('There is no lettering for ~, so it is left out.')).toBeVisible()
    await text.fill('Bruins')
    // Too much new lettering for the packed ROM, until the pictures are given room.
    await section.getByRole('button', { name: 'Use for all 2' }).click()
    const done = section.getByText('Lettered the menu banner and the in-game banner "BRUINS".')
    const noRoom = section.getByText(/banners share room for a set number of different squares/)
    await expect(done.or(noRoom)).toBeVisible()
    // New lettering may not fit the packed ROM until the pictures are given room.
    if (await noRoom.isVisible()) {
      await page.getByRole('button', { name: /Give logos and banners more room/ }).click()
      await section.getByRole('button', { name: 'Use for all 2' }).click()
    }
    await expect(section.getByText('Lettered the menu banner and the in-game banner "BRUINS".')).toBeVisible()
    for (const title of ['Menu banner', 'In-game banner']) {
      await expect(page.locator('.picture').filter({ hasText: title }).getByRole('button', { name: 'Reset picture' })).toBeEnabled()
    }
    await section.screenshot({ path: 'test-results/shots/lettering.png' })

    // Copy Boston's colours and pictures over Anaheim's.
    const home = () => page.locator('section').filter({ has: page.getByRole('heading', { name: 'Home colours' }) })
    const swatches = () => home().locator('button.swatch').evaluateAll((buttons) => buttons.map((b) => b.getAttribute('title')))
    const bostonColours = await swatches()
    await page.getByLabel('Team to copy colours and pictures to').selectOption({ label: 'Anaheim Mighty Ducks' })
    await page.getByRole('button', { name: 'Copy from Boston Bruins to' }).click()
    await expect(page.getByText('Home and away colours copied.')).toBeVisible()
    await expect(page.getByText('Menu banner copied.')).toBeVisible()

    await team(page, 'Anaheim Mighty Ducks').click()
    expect(await swatches()).toEqual(bostonColours)
    await expect(nameOf(rows(page, 'Goalies').first())).toHaveValue('Guy Hebert') // the roster is its own
    await expect(page.locator('.picture').filter({ hasText: 'Menu logo' }).getByRole('button', { name: 'Reset picture' })).toBeEnabled()
    await page.getByRole('button', { name: 'Reset whole team' }).click()
    expect(await swatches()).not.toEqual(bostonColours)

    // Another team's banners for this one, with their stripe colours.
    await page.getByLabel('Team whose banners to use').selectOption({ label: 'Detroit Red Wings' })
    await page.getByRole('button', { name: 'Use the banners of' }).click()
    await expect(page.getByText(/^Anaheim Mighty Ducks now has Detroit Red Wings's .*banner.*, and its banner colours\. Undo takes it back\.$/)).toBeVisible()
    await expect(page.locator('.picture').filter({ hasText: 'Menu banner' }).getByRole('button', { name: 'Reset picture' })).toBeEnabled()
  })

  test('previews and makes a trade, and holds a released player as a free agent', async ({ page }) => {
    await openRom(page)
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    await team(page, 'Boston Bruins').click()
    const bruin = await nameOf(rows(page, 'Skaters').first()).inputValue()
    await team(page, 'Anaheim Mighty Ducks').click()
    const duck = await nameOf(rows(page, 'Skaters').nth(3)).inputValue()

    await entry(page, 'Trade').click()
    const main = page.locator('main')
    // The page starts on the team just looked at.
    await expect(main.getByLabel('First side of the trade')).toHaveValue('0')
    await main.getByLabel('Second side of the trade').selectOption({ label: 'Boston Bruins' })
    await expect(main.getByText('Tick the players each side gives up.')).toBeVisible()
    // Every player is listed with his attributes, goalies apart from skaters, and the list can be shortened.
    const boston = main.locator('.trade > section').nth(1)
    await expect(boston.locator('table')).toHaveCount(2)
    await expect(boston.locator('table').first().locator('thead th')).toHaveCount(6 + 14)
    await expect(boston.locator('table').first().locator('thead')).toContainText('GlH')
    await expect(boston.locator('table').last().locator('thead')).toContainText('ShP')
    const cell = boston.locator('table').last().locator('tbody tr').first().locator('td').nth(7)
    await expect(cell).toHaveText(/^\d+-\d+$|^99$/) // a rating, as the game shows it
    await main.getByLabel('as stored values (0–15)').check()
    await expect(cell).toHaveText(/^[0-6]$/)
    await main.getByLabel('as stored values (0–15)').uncheck()
    await main.getByLabel('Show attributes').uncheck()
    await expect(boston.locator('table').first().locator('thead th')).toHaveCount(6)
    await main.getByLabel('Show attributes').check()
    await main.getByLabel(`${bruin} leaves Boston Bruins`).check()
    await main.getByLabel(`${duck} leaves Anaheim Mighty Ducks`).check()
    await expect(main.getByText(`Anaheim Mighty Ducks give ${duck}; Boston Bruins give ${bruin}.`)).toBeVisible()
    await expect(main.getByText(/positions? on the lines (is|are) held by players who would leave/).first()).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/trade.png', fullPage: true })

    // A goalie for a skater cannot be done, and the page says why.
    const goalie = await main.locator('section').nth(1).locator('tbody tr').first().locator('td').nth(2).textContent()
    await main.getByLabel(`${goalie} leaves Boston Bruins`).check()
    await expect(main.locator('p.error')).toContainText('Goalies change places one for one')
    await expect(main.getByRole('button', { name: 'Make this trade' })).toHaveCount(0)
    await main.getByLabel(`${goalie} leaves Boston Bruins`).uncheck()

    await main.getByRole('button', { name: 'Make this trade' }).click()
    await expect(main.getByText(/^Done\./)).toBeVisible()
    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(page.locator(`input.name[value="${bruin}"]`)).toHaveCount(1)
    await expect(page.locator(`input.name[value="${duck}"]`)).toHaveCount(0)
    await expect(rows(page, 'Skaters')).toHaveCount(16)

    // Release him to the free agents, then sign him with Boston again.
    await entry(page, 'Trade').click()
    await main.getByLabel('Second side of the trade').selectOption({ label: 'Free agents (0)' })
    await expect(main.getByText('There are no free agents.')).toBeVisible()
    await main.getByLabel(`${bruin} leaves Anaheim Mighty Ducks`).check()
    await main.getByRole('button', { name: 'Make this trade' }).click()
    await expect(entry(page, /^Trade/)).toHaveText('Trade (1 free)')
    await entry(page, /Check ROM/).click()
    await expect(page.getByText('1 free agent is not on any team, and so not in the ROM.')).toBeVisible()

    await entry(page, /^Trade/).click()
    // A team already on one side cannot be chosen for the other.
    await expect(main.getByLabel('First side of the trade').locator('option', { hasText: 'Boston Bruins' })).toBeDisabled()
    await main.getByLabel('Second side of the trade').selectOption({ label: 'Free agents (1)' })
    await main.getByLabel('First side of the trade').selectOption({ label: 'Boston Bruins' })
    await main.getByLabel(`${bruin} leaves Free agents`).check()
    await main.getByRole('button', { name: 'Make this trade' }).click()
    await expect(entry(page, /^Trade/)).toHaveText('Trade')
    await team(page, 'Boston Bruins').click()
    await expect(page.locator(`input.name[value="${bruin}"]`)).toHaveCount(1)
    // One Undo takes back one trade.
    await page.getByRole('button', { name: 'Undo' }).click()
    await expect(page.locator(`input.name[value="${bruin}"]`)).toHaveCount(0)
  })

  test('saves a project file and opens it again over the ROM', async ({ page }) => {
    await openRom(page)
    await page.locator('input.rom-name').fill('Season_10')
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    const first = nameOf(rows(page, 'Skaters').first())
    const released = await nameOf(rows(page, 'Skaters').nth(2)).inputValue()
    await first.fill('Kept In Project')
    await entry(page, 'Trade').click()
    await page.locator('main').getByLabel('Second side of the trade').selectOption({ label: 'Free agents (0)' })
    await page.locator('main').getByLabel(`${released} leaves Anaheim Mighty Ducks`).check()
    await page.getByRole('button', { name: 'Make this trade' }).click()

    await entry(page, 'Project file').click()
    const main = page.locator('main')
    const saved = await downloadFrom(page, main.getByRole('button', { name: 'Save project file' }))
    expect(saved.suggestedFilename()).toBe('Season_10_project.json')
    const text = readFileSync(await saved.path(), 'utf8')
    const file = JSON.parse(text)
    expect(file.file).toBe('NOSE4Web project')
    expect(file.teams).toHaveLength(28)
    expect(file.freeAgents[0].player.name).toBe(released)
    expect(file.expansions.rosterSpace).toBe(1)

    // Start again from the ROM, as on another computer, and open the project.
    page.on('dialog', (dialog) => void dialog.accept())
    await romPicker(page).setInputFiles(romPath)
    await expect(nameOf(rows(page, 'Skaters').first())).not.toHaveValue('Kept In Project')
    await expect(page.locator('header')).toContainText('0 bytes free')
    await entry(page, 'Project file').click()
    await main.locator('input[type=file]').setInputFiles({ name: 'Season_10_project.json', mimeType: 'application/json', buffer: Buffer.from(text) })
    await expect(main.getByText('The project is open.')).toBeVisible()
    await expect(page.locator('input.rom-name')).toHaveValue('Season_10')
    await expect(entry(page, /^Trade/)).toHaveText('Trade (1 free)')
    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(nameOf(rows(page, 'Skaters').first())).toHaveValue('Kept In Project')
    await expect(page.locator('header')).not.toContainText('0 bytes free') // the roster space was made again

    await entry(page, 'Project file').click()
    await main.locator('input[type=file]').setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') })
    await expect(main.getByText('This is not a project file.')).toBeVisible()
  })

  test('moves around the roster with the arrow keys, and sets stored values by typing', async ({ page }) => {
    await openRom(page)
    const skaters = rows(page, 'Skaters')
    const focused = () => page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.value)
    const names = [await nameOf(skaters.nth(0)).inputValue(), await nameOf(skaters.nth(1)).inputValue(), await nameOf(skaters.nth(2)).inputValue()]

    await nameOf(skaters.nth(0)).click()
    await page.keyboard.press('ArrowDown')
    expect(await focused()).toBe(names[1])
    await page.keyboard.press('Enter')
    expect(await focused()).toBe(names[2])
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp') // already at the top of the skaters
    expect(await focused()).toBe(names[0])

    // Right from the end of a name goes to the jersey number; Left in the middle of a name only moves the cursor.
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowRight')
    expect(await focused()).toBe(await skaters.nth(0).locator('input.num').inputValue())
    await page.keyboard.press('Home')
    await page.keyboard.press('ArrowLeft')
    expect(await focused()).toBe(names[0])
    await page.keyboard.press('ArrowLeft')
    expect(await focused()).toBe(names[0])

    // In a list, the arrows move between boxes and leave the value alone.
    const agility = (row: number) => skaters.nth(row).locator('select.attribute').nth(1)
    const before = [await agility(0).inputValue(), await agility(1).inputValue()]
    await agility(0).focus()
    await page.keyboard.press('ArrowDown')
    await expect(agility(1)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(skaters.nth(1).locator('select.attribute').nth(2)).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(agility(1)).toBeFocused()
    expect([await agility(0).inputValue(), await agility(1).inputValue()]).toEqual(before)

    // Showing stored values, typing a number sets it, two digits together as one number.
    await page.getByLabel('Show attributes as stored values (0–15)').check()
    await agility(1).focus()
    await page.keyboard.press('Digit4')
    await expect(agility(1)).toHaveValue('4')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Digit1')
    await page.keyboard.press('Digit2')
    await expect(agility(2)).toHaveValue('12')
    await expect(agility(1)).toHaveValue('4')

    // Plus and minus step the value in the box, on the main keys or the number pad.
    await agility(1).focus()
    await page.keyboard.press('NumpadAdd')
    await expect(agility(1)).toHaveValue('5')
    await page.keyboard.press('Equal') // the plus key without Shift
    await page.keyboard.press('Shift+Equal')
    await expect(agility(1)).toHaveValue('7')
    await page.keyboard.press('Minus')
    await page.keyboard.press('NumpadSubtract')
    await expect(agility(1)).toHaveValue('5')
    for (let i = 0; i < 20; i++) await page.keyboard.press('NumpadAdd')
    await expect(agility(1)).toHaveValue('15') // stored values go to 15
    await expect(agility(0)).toHaveValue(before[0])
    // Shown as the game's ratings, they stop at the top and bottom of the rating's range.
    await page.getByLabel('Show attributes as stored values (0–15)').uncheck()
    await agility(0).focus()
    for (let i = 0; i < 20; i++) await page.keyboard.press('Minus')
    await expect(agility(0)).toHaveValue('0')
    await page.keyboard.press('NumpadAdd')
    await expect(agility(0)).toHaveValue('1')
    for (let i = 0; i < 20; i++) await page.keyboard.press('NumpadAdd')
    await expect(agility(0)).toHaveValue('6')
    // With the quick edit keys on as well, the box in hand is still the only thing changed.
    await page.getByLabel('Quick edit keys').check()
    await tick(skaters.nth(4))
    const other = await agility(4).inputValue()
    await agility(0).focus()
    await page.keyboard.press('Minus')
    await expect(agility(0)).toHaveValue('5')
    await expect(agility(4)).toHaveValue(other)
    await page.getByLabel('Quick edit keys').uncheck()

    // The lines table moves the same way.
    const lineRows = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) }).locator('tbody tr')
    const centre = (row: number) => lineRows.nth(row).locator('select').nth(4)
    const was = await centre(0).inputValue()
    await centre(0).focus()
    await page.keyboard.press('ArrowDown')
    await expect(centre(1)).toBeFocused()
    await expect(centre(0)).toHaveValue(was)
  })

  test('holds the teams to the league\'s own rules', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Check ROM').click()
    const main = page.locator('main')
    await expect(main.getByText('Nothing to report.')).toBeVisible()
    // The rules are folded away until wanted.
    await expect(main.getByLabel('Players on a team, at most')).toBeHidden()
    await main.getByText("Your league's rules").click()

    // Nobody over 24 players, and at least 20.
    await main.getByLabel('Players on a team, at most').fill('24')
    await expect(main.getByRole('heading', { name: /Against your league's rules \(\d+\)/ })).toBeVisible()
    await expect(main.getByText("Has 25 players; the league's rules allow at most 24.").first()).toBeVisible()
    await main.getByLabel('Players on a team, at least').fill('20')
    await expect(main.getByText("Has 18 players; the league's rules ask for at least 20.")).toBeVisible()
    // The count beside Check ROM in the list takes them in.
    await expect(entry(page, /Check ROM/)).toHaveText(/^Check ROM \(\d+\)$/)
    await page.screenshot({ path: 'test-results/shots/rules.png', fullPage: true })

    // Leaving a team out, and emptying a limit, each take findings away.
    const before = await main.locator('section').first().locator('tbody tr').count()
    await main.getByText('Teams the rules do not apply to').click()
    await main.getByLabel('Anaheim Mighty Ducks', { exact: true }).check()
    await expect(main.getByText("Has 18 players; the league's rules ask for at least 20.")).toHaveCount(0)
    await main.getByLabel('Players on a team, at most').fill('')
    expect(await main.locator('tbody tr').filter({ hasText: "the league's rules" }).count()).toBeLessThan(before)

    // Fixing the team clears its finding: go to it from the list and add players.
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    const florida = main.locator('tbody tr').filter({ hasText: "Has 17 players; the league's rules ask for at least 20." })
    await florida.getByRole('button', { name: 'Florida Panthers' }).click()
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Add player' }).click()
    await entry(page, /Check ROM/).click()
    await expect(main.getByText("Has 17 players; the league's rules ask for at least 20.")).toHaveCount(0)

    // The rules are kept with the work, and can be cleared.
    await expect(main.getByLabel('Players on a team, at least')).toHaveValue('20')
    await main.getByLabel('No two players on a team with the same number').check()
    await main.getByRole('button', { name: 'Clear the rules' }).click()
    await expect(main.getByLabel('Players on a team, at least')).toHaveValue('')
    await expect(main.getByLabel('No two players on a team with the same number')).not.toBeChecked()
    await expect(main.getByRole('heading', { name: /Against your league's rules/ })).toHaveCount(0)
  })

  test('keeps free agents in the spreadsheet files', async ({ page }) => {
    await openRom(page)
    await page.locator('input.rom-name').fill('Season_10')
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    const released = await nameOf(rows(page, 'Skaters').nth(4)).inputValue()
    await entry(page, 'Trade').click()
    await page.locator('main').getByLabel('Second side of the trade').selectOption({ label: 'Free agents (0)' })
    await page.locator('main').getByLabel(`${released} leaves Anaheim Mighty Ducks`).check()
    await page.getByRole('button', { name: 'Make this trade' }).click()

    await entry(page, 'Spreadsheet files').click()
    const row = page.locator('main tr').filter({ hasText: 'Season_10_freeagents.csv' })
    const file = await downloadFrom(page, row.getByRole('button', { name: 'Export CSV' }))
    expect(file.suggestedFilename()).toBe('Season_10_freeagents.csv')
    const text = readFileSync(await file.path(), 'utf8')
    const lines = text.trim().split(/\r?\n/)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Position,Name,Jersey,Overall,League value')
    expect(lines[1]).toContain(released)

    // A pool prepared in a spreadsheet: the one released, and a prospect typed in.
    const prospect = ['G', 'Draft Pick', '30', '', '', ...new Array<string>(14).fill('3')].join(',')
    const edited = [...lines, prospect].join('\r\n') + '\r\n'
    await page.locator('main input[type=file][accept*="csv"]').setInputFiles({ name: 'Season_10_freeagents.csv', mimeType: 'text/csv', buffer: Buffer.from(edited) })
    await expect(page.locator('.outcome')).toContainText('Set 2 free agents.')
    await expect(entry(page, /^Trade/)).toHaveText('Trade (2 free)')
    await entry(page, /^Trade/).click()
    await page.locator('main').getByLabel('Second side of the trade').selectOption({ label: 'Free agents (2)' })
    await expect(page.locator('main').getByLabel('Draft Pick leaves Free agents')).toBeVisible()
  })

  test('releases and signs free agents from a team\'s page, and saves a roster card', async ({ page }) => {
    await openRom(page)
    await page.getByRole('button', { name: 'Add 934 bytes of roster space' }).click()
    await expect(page.getByRole('button', { name: 'Sign', exact: true })).toBeDisabled()
    const skater = rows(page, 'Skaters').nth(3)
    const released = await nameOf(skater).inputValue()
    await tick(skater)
    await page.getByRole('button', { name: 'Release ticked' }).click()
    await expect(page.getByText('Released 1 player to the free agents.')).toBeVisible()
    await expect(rows(page, 'Skaters')).toHaveCount(15)
    await expect(entry(page, /^Trade/)).toHaveText('Trade (1 free)')

    // Signed by another team, from that team's own page.
    await team(page, 'Boston Bruins').click()
    await expect(page.getByLabel('Free agent to sign').locator('option')).toHaveText([new RegExp(`^F ${released} \\(\\d+\\)$`)])
    await page.getByRole('button', { name: 'Sign', exact: true }).click()
    await expect(page.getByText(`Signed ${released}.`)).toBeVisible()
    await expect(page.locator(`input.name[value="${released}"]`)).toHaveCount(1)
    await expect(entry(page, /^Trade/)).toHaveText('Trade')

    // A goalie cannot simply be released: he has to change places with another.
    await tick(rows(page, 'Goalies').first())
    await page.getByRole('button', { name: 'Release ticked' }).click()
    await expect(page.getByText(/Goalies change places one for one/)).toBeVisible()

    // The roster as a picture.
    const card = await downloadFrom(page, page.getByRole('button', { name: 'Roster card (PNG)' }))
    expect(card.suggestedFilename()).toBe('Boston_Bruins_roster.png')
    const png = readFileSync(await card.path())
    expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    const [width, height] = [png.readUInt32BE(16), png.readUInt32BE(20)]
    expect(width).toBeGreaterThan(1500)
    expect(height).toBeGreaterThan(1000)
    writeFileSync('test-results/shots/roster-card.png', png)
  })

  test('lists changes as you go, and starts a new season', async ({ page }) => {
    await openRom(page)
    await page.locator('input.rom-name').fill('Season_12')
    await expect(entry(page, /^Changes/)).toHaveText('Changes')
    await entry(page, /^Changes/).click()
    const main = page.locator('main')
    await expect(main.getByText('Nothing has changed since the ROM was opened.')).toBeVisible()
    await expect(main.getByLabel(/Since the season began/)).toBeDisabled()

    // A rename and a re-rating show up at once.
    await team(page, 'Anaheim Mighty Ducks').click()
    const first = rows(page, 'Skaters').first()
    const player = await nameOf(first).inputValue()
    await first.locator('select.attribute').nth(2).selectOption({ index: 6 })
    await page.locator('.fields input').first().fill('Orange County')
    await expect(entry(page, /^Changes/)).toHaveText('Changes (2)')
    await entry(page, /^Changes/).click()
    await expect(main.getByText('Location: "Anaheim" to "Orange County".')).toBeVisible()
    await expect(main.getByText(new RegExp(`^${player}: Spd .* to 99\\.$`))).toBeVisible()
    await expect(main.getByText('Overall ratings, biggest change first (1)')).toBeVisible()
    const report = await downloadFrom(page, main.getByRole('button', { name: 'Download report' }))
    expect(report.suggestedFilename()).toBe('Season_12_changes.txt')
    expect(readFileSync(await report.path(), 'utf8')).toContain('Changes from the ROM as opened to Season_12')
    await page.screenshot({ path: 'test-results/shots/changes.png', fullPage: true })

    // Start the next season: the old one is saved, the name moves on, and the count starts again.
    await expect(main.getByLabel('Name for the new season')).toHaveValue('Season_13')
    const saved = await downloadFrom(page, main.getByRole('button', { name: 'Start Season_13' }))
    expect(saved.suggestedFilename()).toBe('Season_12_project.json')
    await expect(page.locator('input.rom-name')).toHaveValue('Season_13')
    await expect(main.getByText('Nothing has changed since the season began.')).toBeVisible()
    await expect(entry(page, /^Changes/)).toHaveText('Changes')
    await expect(main.getByLabel(/Since Season_13 began/)).toBeChecked()
    // What was done before the season is still there to see.
    await main.getByLabel('Since this ROM was opened').check()
    await expect(main.getByText('Location: "Anaheim" to "Orange County".')).toBeVisible()

    await team(page, 'Boston Bruins').click()
    await nameOf(rows(page, 'Skaters').first()).fill('New Signing')
    await entry(page, /^Changes/).click()
    await expect(main.getByText(/was renamed New Signing\.$/)).toBeVisible()
    await expect(main.getByText('Location: "Anaheim" to "Orange County".')).toHaveCount(0)
  })

  test('offers to match teams by name, and to convert weights from another era', async ({ page }) => {
    await openRom(page)
    await entry(page, 'Picture files').click()
    const main = page.locator('main')
    await expect(main.getByText('Each file goes to the team at the number in its name.')).toBeVisible()
    await main.getByLabel('Match teams by name').check()
    await expect(main.getByText('Each file goes to the team named in it')).toBeVisible()
    const red = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 48
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ff0000'
      context.fillRect(0, 0, 48, 48)
      return canvas.toDataURL('image/png').split(',')[1]
    })
    // Numbered for Anaheim's place, named for Boston: by name it is Boston's.
    await main.locator('input[type=file]').setInputFiles([
      { name: '01_Boston_Bruins_menu_logo.png', mimeType: 'image/png', buffer: Buffer.from(red, 'base64') },
      { name: '02_Springfield_Atoms_menu_logo.png', mimeType: 'image/png', buffer: Buffer.from(red, 'base64') },
    ])
    await expect(main.getByText('Boston Bruins: Menu logo')).toBeVisible()
    await expect(main.getByText('this ROM has no team called Springfield Atoms.')).toBeVisible()

    await entry(page, 'Project file').click()
    await main.getByLabel('Match teams by name').check()
    await expect(main.getByText("Each team's work goes to the team with the same name in this ROM")).toBeVisible()

    // Spreadsheet rows too: a players file with one team's name changed to another's.
    await entry(page, 'Spreadsheet files').click()
    await expect(main.getByText('Normally each row goes to the team at its team number')).toBeVisible()
    await main.getByLabel('Match teams by name').check()
    const csv = ['Team,Team name,Line,G,LD,RD,LW,C,RW,EA', '1,Springfield Atoms,NLC,#1,#3,#4,#5,#6,#7,#8'].join('\r\n') + '\r\n'
    await main.locator('input[type=file][accept*="csv"]').setInputFiles({ name: 'S_lines.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
    await expect(page.locator('.outcome')).toContainText('this ROM has no team called "Springfield Atoms".')
    const named = csv.replace('1,Springfield Atoms', '1,boston bruins')
    await main.locator('input[type=file][accept*="csv"]').setInputFiles({ name: 'S_lines.csv', mimeType: 'text/csv', buffer: Buffer.from(named) })
    await expect(page.locator('.outcome')).toContainText('Updated 1 line.')
    await team(page, 'Boston Bruins').click()
    const nlc = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) }).locator('tbody tr').first()
    await expect(nlc.locator('select').nth(1)).toHaveValue('3')
    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(nlc.locator('select').nth(1)).not.toHaveValue('3') // numbered 1 in the file, but not named

    await entry(page, 'Bulk changes').click()
    await expect(main.getByLabel('Kind of change').locator('option', { hasText: 'Convert from another era' })).toHaveCount(1) // weight is first
    await main.getByLabel('Kind of change').selectOption({ label: "Convert from another era's weights" })
    await main.getByLabel('Base weight the players were set for').selectOption('148')
    await main.getByLabel('Teams to change').selectOption({ label: 'Boston Bruins' })
    await expect(main.getByRole('button', { name: /^Apply to \d+ players$/ })).toBeEnabled()
    await expect(main.locator('tbody tr').first()).toContainText(/\d+ to \d+/)
    // For anything but weight the choice is not there.
    await main.getByLabel('Attribute to change').selectOption({ label: 'Speed' })
    await expect(main.getByLabel('Kind of change').locator('option', { hasText: 'Convert from another era' })).toHaveCount(0)
    await expect(main.getByLabel('Kind of change')).toHaveValue('raise')
  })

  test('edits the six team ratings and resets them', async ({ page }) => {
    await openRom(page)
    const main = page.locator('main')
    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(main.getByLabel('Offence rating')).toHaveValue('0')
    await expect(main.getByLabel('Defence rating')).toHaveValue('7')
    await expect(main.getByLabel('Away rating')).toHaveValue('3')
    await main.getByLabel('Offence rating').selectOption('4')
    await main.getByLabel('Away rating').selectOption('0')
    await entry(page, /^Changes/).click()
    await expect(main.getByText('Offence rating: 0 to 4.')).toBeVisible()
    await expect(main.getByText('Away rating: 3 to 0.')).toBeVisible()
    await team(page, 'Anaheim Mighty Ducks').click()
    await page.screenshot({ path: 'test-results/shots/team-ratings.png' })
    await main.getByRole('button', { name: 'Reset team ratings' }).click()
    await expect(main.getByLabel('Offence rating')).toHaveValue('0')
    await expect(main.getByLabel('Away rating')).toHaveValue('3')
  })

  test("copies another ROM's hacks, to apply them here", async ({ page }) => {
    await openRom(page)
    const main = page.locator('main')
    await entry(page, 'Hacks').click()
    // A league ROM as the editor makes one: opened, hacked and downloaded.
    const league = buildRom(applyHacks(readRom(new Uint8Array(readFileSync(romPath))), { ...NO_HACKS, passFix: true, faceoffFix: true, goalieHold: 300 }))
    await main.getByLabel('Copy hacks from another ROM').setInputFiles({ name: 'league.bin', mimeType: 'application/octet-stream', buffer: Buffer.from(league) })
    await expect(main.getByText("Set to league.bin's hacks.")).toBeVisible()
    await expect(main.locator('.outcome li')).toHaveText(['Rocket pass fix: off to on.', 'Faceoff spot fix: off to on.', 'Goalie hold time: 2.33 seconds to 5 seconds.'])
    await expect(main.getByLabel('Goalie hold time')).toHaveValue('5')
    await main.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(main.getByText('Done: 3 changes to the game. Undo puts it back.')).toBeVisible()
    const rom = readRom(new Uint8Array(readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())))
    expect(detectHacks(rom.bytes).choices).toMatchObject({ passFix: true, faceoffFix: true, goalieHold: 300 })
  })

  test('turns on the recommended fixes, and copies the hacks for Discord', async ({ page }) => {
    await openRom(page)
    const main = page.locator('main')
    await entry(page, 'Hacks').click()
    await main.getByLabel('Faceoff spot fix').selectOption('on')
    await main.getByRole('button', { name: 'Turn on the recommended fixes' }).click()
    await expect(main.locator('.outcome li')).toHaveText([
      'Second-assist bug fix: off to on.',
      'One-timer assist fix: off to on.',
      'Regained-puck assist fix: off to on.',
      'Weight bug and C-then-B fix: off to everyone checks as the computer.',
      'Aggression bug fix: off to on.',
      'Power play and penalty kill fix: off to on.',
      'Comeback bonus fix: off to on.',
      'Rocket pass fix: off to on.',
      // A choice made already is kept.
      'Faceoff spot fix: off to on.',
      'Runaway speed fix: off to on.',
      'Penalty shot table fix: off to on.',
      'Penalty shot fixes: off to on.',
      'Count stick deflections as shots: off to on.',
    ])
    await expect(main.getByRole('button', { name: 'Turn on the recommended fixes' })).toBeDisabled()
    await main.getByLabel('Goalie hold time').fill('5')
    await main.getByRole('button', { name: 'Apply', exact: true }).click()
    // Each hack explained, as messages Discord takes.
    await main.getByRole('button', { name: "Copy this ROM's hacks for Discord" }).click()
    const messages = main.locator('textarea.discord-text')
    await expect(messages.first()).toHaveValue(/^\*\*Hacks in nhl94\*\* \(NHL '94 for the Genesis\)\n/)
    const texts = await messages.evaluateAll((areas) => areas.map((area) => (area as HTMLTextAreaElement).value))
    for (const text of texts) expect(text.length).toBeLessThanOrEqual(2000)
    const explained = texts.join('\n')
    expect(explained).toContain('- **Rocket pass fix**: Passes travel at their proper speed')
    expect(explained).toContain('- **Goalie hold time**: A goalie may hold the puck 5 seconds before the whistle')
    // Or the names only.
    await main.getByLabel('explain each hack').uncheck()
    await expect(main.getByLabel("This ROM's hacks for Discord")).toHaveValue(
      [
        '**Hacks in nhl94**',
        '- **Weight bug and C-then-B fix**',
        '- **Second-assist bug fix**',
        '- **One-timer assist fix**',
        '- **Regained-puck assist fix**',
        '- **Aggression bug fix**',
        '- **Power play and penalty kill fix**',
        '- **Comeback bonus fix**',
        '- **Rocket pass fix**',
        '- **Faceoff spot fix**',
        '- **Runaway speed fix**',
        '- **Penalty shot table fix**',
        '- **Penalty shot fixes**',
        '- **Count stick deflections as shots**',
        '- **Goalie hold time**: 5 seconds (the original game has 2.33 seconds)',
      ].join('\n'),
    )
    // The hack sheet explains the same hacks for the league's owners.
    const sheet = await downloadFrom(page, main.getByRole('button', { name: 'Download hack sheet' }))
    expect(sheet.suggestedFilename()).toBe('nhl94_hacks.html')
    const html = readFileSync(await sheet.path(), 'utf8')
    expect(html).toContain('<title>Hacks in nhl94</title>')
    expect(html).toContain('<h2>Fixes</h2>')
    expect(html).toContain('no more &quot;rocket passes&quot;')
    expect(html).toContain("A goalie may hold the puck 5 seconds before the whistle, longer than the original game's 2.33.")
    // Undone, the post follows the ROM.
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(main.getByLabel("This ROM's hacks for Discord")).toHaveValue('**Hacks in nhl94**\nNone: it plays as the original game.')
  })

  test('changes how the game plays from the Hacks page', async ({ page }) => {
    await openRom(page)
    const main = page.locator('main')
    await entry(page, 'Hacks').click()
    await expect(main.getByLabel('Goalie hold time')).toHaveValue('2.33')
    await expect(main.getByLabel('Stopping and turning')).toHaveValue('150')
    await main.getByLabel('Goalie hold time').fill('4')
    await main.getByLabel('Goalie range up the ice').fill('224')
    await main.getByLabel('Real-time clock').selectOption('on')
    await main.getByLabel('Rocket pass fix').selectOption('on')
    // A number the game cannot take is marked and not passed on.
    await main.getByLabel('Speed burst').fill('500')
    await expect(main.getByLabel('Speed burst')).toHaveAttribute('aria-invalid', 'true')
    await expect(main.locator('.outcome li')).toHaveText([
      'Rocket pass fix: off to on.',
      'Goalie hold time: 2.33 seconds to 4 seconds.',
      'Goalie range up the ice: 231 to 224.',
      'Real-time clock: off to on.',
    ])
    await page.screenshot({ path: 'test-results/shots/hacks-play.png', fullPage: true })
    await main.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(main.getByText('Done: 4 changes to the game. Undo puts it back.')).toBeVisible()
    await expect(main.getByLabel('Rocket pass fix')).toHaveValue('on')
    await expect(main.getByLabel('Goalie hold time')).toHaveValue('4')
    await expect(main.getByLabel('Speed burst')).toHaveValue('0')
    await expect(main.getByText('The original game has 231, and this ROM has 224.')).toBeVisible()
    await expect(entry(page, /^Changes/)).toHaveText('Changes (4)')
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(main.getByLabel('Goalie hold time')).toHaveValue('2.33')
  })

  test('applies hacks to the game, undoes them, and reopens a hacked ROM', async ({ page }) => {
    await openRom(page)
    const main = page.locator('main')
    const apply = main.getByRole('button', { name: 'Apply', exact: true })
    await entry(page, 'Hacks').click()
    await expect(main.getByText('Nothing is set to change.')).toBeVisible()
    await expect(apply).toBeDisabled()
    await expect(main.getByLabel("smozoma's weight bug fix (legacy)")).toHaveValue('off')
    // The fix for the weight bug comes first; smozoma's is kept at the foot of the page.
    await expect(main.locator('section').filter({ has: page.getByRole('heading', { name: 'Fixes' }) }).locator('.hack b').first()).toHaveText('Weight bug and C-then-B fix')
    await expect(main.locator('section').filter({ has: page.getByRole('heading', { name: 'Legacy hacks' }) }).getByLabel("smozoma's weight bug fix (legacy)")).toBeVisible()
    await expect(main.getByLabel('Base weight')).toHaveValue('140')

    await main.getByLabel('Second-assist bug fix').selectOption('on')
    await main.getByLabel('Rating scale').selectOption('wide')
    // The pairing whose code looks mistaken is not offered.
    await expect(main.getByLabel('Hot and cold bonuses').locator('option[value=linesMatchPlayers]')).toHaveAttribute('disabled', '')
    await main.getByLabel('Rating scale').selectOption('narrow')
    await main.getByLabel('Hot and cold bonuses').selectOption('linesMatchPlayers')
    await main.getByLabel('Rating scale').selectOption('wide')
    await expect(main.getByLabel('Hot and cold bonuses')).toHaveValue('original')
    await main.getByLabel('Hot and cold bonuses').selectOption('disabled')
    await expect(main.getByRole('button', { name: 'Use that season' })).toBeDisabled()
    await main.getByLabel('Season year').fill('2010')
    await main.getByRole('button', { name: 'Use 144 pounds' }).click()
    await expect(main.getByLabel('Base weight')).toHaveValue('144')
    await expect(main.locator('.outcome li')).toHaveText([
      'Second-assist bug fix: off to on.',
      'Rating scale: 0 to 6 to 0 to 15.',
      'Hot and cold bonuses: as the original game has them to no bonuses.',
      'Base weight: 140 pounds to 144 pounds.',
    ])
    await expect(main.locator('.outcome')).toContainText('0, 1, 2, 3, 4, 5, 6 become 0, 3, 5, 8, 10, 13, 15')
    await page.screenshot({ path: 'test-results/shots/hacks.png', fullPage: true })

    // Nothing has happened yet; setting it back leaves nothing to do.
    await expect(page.locator('header')).not.toContainText('0–15 ratings')
    await main.getByRole('button', { name: 'Set back to what the ROM has' }).click()
    await expect(main.getByText('Nothing is set to change.')).toBeVisible()

    await main.getByLabel('Rating scale').selectOption('wide')
    await main.getByLabel('Three stars').selectOption('linesOff')
    await expect(main.locator('.outcome')).toContainText('The improved three stars count bodychecks')
    await main.getByLabel('Bodycheck statistics').selectOption('on')
    await expect(main.locator('.outcome')).not.toContainText('The improved three stars count bodychecks')
    await apply.click()
    await expect(main.getByText('Done: 3 changes to the game. Undo puts it back.')).toBeVisible()
    await expect(page.locator('header')).toContainText('NHL 94, 0–15 ratings')
    await expect(main.getByLabel('Rating scale')).toHaveValue('wide')
    await expect(apply).toBeDisabled()
    // The hacks are the only changes: every player is as he was, on the new scale.
    await expect(entry(page, /^Changes/)).toHaveText('Changes (3)')
    await entry(page, /^Changes/).click()
    await expect(main.getByRole('heading', { name: 'Hacks', exact: true })).toBeVisible()
    await expect(main.getByText('Rating scale: 0 to 6 to 0 to 15.')).toBeVisible()
    await team(page, 'Anaheim Mighty Ducks').click()
    await expect(main.getByText('This ROM has been set up for ratings from 0 to 15')).toBeVisible()
    await expect(entry(page, /Check ROM/)).toHaveText('Check ROM')

    // One Undo takes the hacks out, and Redo puts them back.
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect(page.locator('header')).not.toContainText('0–15 ratings')
    await expect(entry(page, /^Changes/)).toHaveText('Changes')
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    await expect(page.locator('header')).toContainText('NHL 94, 0–15 ratings')

    // The downloaded ROM opens as a hacked ROM, with the hacks shown as there.
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    await romPicker(page).setInputFiles(await download.path())
    await expect(page.locator('nav button')).toHaveCount(28 + 14)
    await expect(page.locator('header')).toContainText('NHL 94, 0–15 ratings')
    await expect(entry(page, /^Changes/)).toHaveText('Changes')
    await entry(page, 'Hacks').click()
    await expect(main.getByLabel('Rating scale')).toHaveValue('wide')
    await expect(main.getByLabel('Three stars')).toHaveValue('linesOff')
    await expect(main.getByLabel('Bodycheck statistics')).toHaveValue('on')
    await expect(main.getByLabel('Second-assist bug fix')).toHaveValue('off')
    // And they come out again, back to the plain game.
    await main.getByLabel('Rating scale').selectOption('narrow')
    await main.getByLabel('Three stars').selectOption('original')
    await main.getByLabel('Bodycheck statistics').selectOption('off')
    await apply.click()
    await expect(page.locator('header .brand').nth(1)).toHaveText('NHL 94')
  })

  test('keeps the work through a reload', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept()) // the "leave site?" prompt
    await openRom(page)
    await page.locator('input.rom-name').fill('My_League')
    await rows(page, 'Skaters').first().locator('input.num').first().fill('88')
    await expect(page.getByText('Not downloaded yet')).toBeVisible()
    await page.waitForTimeout(1500) // the work is stored a moment after the last edit

    await page.reload()
    await expect(page.getByText('with changes not yet downloaded')).toBeVisible()
    await page.getByRole('button', { name: 'Continue editing My_League' }).click()
    await expect(rows(page, 'Skaters').first().locator('input.num').first()).toHaveValue('88')
    await expect(page.locator('input.rom-name')).toHaveValue('My_League')
    await expect(page.getByText('Not downloaded yet')).toBeVisible()
  })
})

// Hacked ROMs on this computer, named in tests/local.json (not part of the
// project). Each is opened and walked through every page, to catch anything
// that breaks the editor on a ROM unlike the original game.
const localPath = resolve(process.cwd(), 'tests', 'local.json')
const local: { league30Rom?: string; otherRoms?: string[]; snesRoms?: string[] } = existsSync(localPath)
  ? JSON.parse(readFileSync(localPath, 'utf8'))
  : {}
const hackRoms = [local.league30Rom, ...(local.otherRoms ?? []), ...(local.snesRoms ?? [])]
  .filter((name): name is string => !!name)
  .map((name) => resolve(process.cwd(), '..', name))
  .filter((path) => existsSync(path))

test.describe('with the hacked ROMs on this computer', () => {
  test.skip(hackRoms.length === 0, 'needs ROMs listed in tests/local.json')

  // Numbered, so that no ROM's name appears in the test results.
  hackRoms.forEach((path, n) => {
    test(`hack ${n + 1} opens and every page works`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))

      const rom = readRom(new Uint8Array(readFileSync(path)))
      const snes = rom.game.platform === 'snes'
      await page.goto('/')
      await romPicker(page).setInputFiles({ name: `hack_${n + 1}.${snes ? 'smc' : 'bin'}`, mimeType: 'application/octet-stream', buffer: readFileSync(path) })
      await expect(page.locator('nav button').first()).toBeVisible()
      await expect(page.locator('header')).toContainText(rom.game.title)
      // Every team is listed, and nothing about the ROM as it stands is a
      // problem, but for a player twice on a line, as some league ROMs have, and
      // the 2-on-2 ROMs' playoff draws, which leave out their first two teams.
      expect(await page.locator('nav button').count()).toBeGreaterThanOrEqual(rom.teams.length + 6)
      const problems = checkProject(rom).filter((finding) => finding.level === 'problem')
      const asMade = /2on2/.test(path) ? ['Playoff draws'] : []
      expect(problems.filter((finding) => !/ at both \w+ and \w+\./.test(finding.message) && !asMade.includes(finding.where))).toEqual([])
      await expect(entry(page, /Check ROM/)).toHaveText(problems.length > 0 ? `Check ROM (${problems.length})` : 'Check ROM')
      await expect(rows(page, 'Goalies').first()).toBeVisible()
      const shot = `test-results/shots/${rom.game.title.replace(/[^A-Za-z0-9]+/g, '_')}`
      await page.screenshot({ path: `${shot}.png` })

      // The last team, and each page in the list that is not a team's.
      const teams = page.locator('nav button[data-team]')
      await expect(teams).toHaveCount(rom.teams.length)
      await teams.last().click()
      await expect(rows(page, 'Skaters').first()).toBeVisible()
      const pages = page.locator('nav button:not([data-team])')
      for (let i = 0; i < (await pages.count()); i++) {
        await pages.nth(i).click()
        await expect(page.locator('main h2').first()).toBeVisible()
        if ((await pages.nth(i).textContent()) === 'League') await page.screenshot({ path: `${shot}_league.png` })
      }
      if (!snes) {
        await teams.first().click()
        await page.locator('h2', { hasText: 'Logos and banners' }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: `${shot}_pictures.png` })
      }

      // An edit, and the ROM still downloads and opens with it. An SNES ROM
      // may have no room to spare, so there the name keeps its length.
      await teams.first().click()
      const length = (await nameOf(rows(page, 'Skaters').first()).inputValue()).length
      const name = snes ? 'Test Player'.padEnd(length, 'x').slice(0, length) : 'Test Player'
      await nameOf(rows(page, 'Skaters').first()).fill(name)
      const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
      const again = readRom(new Uint8Array(readFileSync(await download.path())))
      expect(again.teams[0].players.some((player) => player.name === name)).toBe(true)
      expect(again.teams.slice(1).map((team) => team.players)).toEqual(rom.teams.slice(1).map((team) => team.players))
      expect(errors).toEqual([])
    })
  })
})

// The same site at the widths of a phone, a tablet, a laptop and a large
// monitor. On none of them may the page itself scroll sideways.
const WIDTHS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'monitor', width: 1920, height: 1080 },
]

test.describe('at different window widths', () => {
  test.skip(!hasRom, 'needs ../nhl94.bin')

  for (const size of WIDTHS) {
    test(`every page fits a ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.goto('/')
      await romPicker(page).setInputFiles(romPath)
      const narrow = size.width <= 820
      const fits = async (what: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(overflow, `${what} on a ${size.name} scrolls sideways`).toBeLessThanOrEqual(0)
      }
      const openList = async () => {
        if (narrow) await page.locator('.nav-toggle').click()
      }

      await expect(page.locator(narrow ? '.card' : 'tbody tr').first()).toBeVisible()
      await fits('A team')
      await page.screenshot({ path: `test-results/shots/width-${size.name}-team.png` })

      const count = await page.locator('nav button').count()
      for (let i = 28; i < count; i++) {
        await openList()
        const button = page.locator('nav button').nth(i)
        const name = (await button.textContent()) ?? ''
        await button.click()
        await expect(page.locator('main h2').first()).toBeVisible()
        await fits(name)
        if (/^(Trade|League|Game settings)/.test(name)) {
          await page.screenshot({ path: `test-results/shots/width-${size.name}-${name.split(' ')[0].toLowerCase()}.png` })
        }
      }
      // The nav is out of the way on a narrow window until asked for, and always there on a wide one.
      if (narrow) await expect(page.locator('nav')).toBeHidden()
      else await expect(page.locator('nav')).toBeVisible()
    })
  }

  test('a phone edits a roster with cards, and reaches everything from the folded bars', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await romPicker(page).setInputFiles(romPath)

    // The bar at the top names the page and opens the list of teams.
    const toggle = page.locator('.nav-toggle')
    await expect(toggle).toContainText('Anaheim Mighty Ducks')
    await expect(page.locator('nav')).toBeHidden()
    await toggle.click()
    await expect(page.locator('nav')).toBeVisible()
    await page.locator('nav').getByRole('button', { name: 'Boston Bruins', exact: true }).click()
    await expect(page.locator('nav')).toBeHidden()
    await expect(toggle).toContainText('Boston Bruins')
    // Tapping outside the list shuts it.
    await toggle.click()
    await page.locator('.backdrop').click({ position: { x: 370, y: 400 } })
    await expect(page.locator('nav')).toBeHidden()

    // Players are cards: a line each, opened to edit.
    const skaters = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Skaters', exact: true }) })
    const card = skaters.locator('.card').first()
    await expect(skaters.locator('table')).toHaveCount(0)
    await expect(skaters.locator('.card')).toHaveCount(23)
    await expect(card.locator('.card-body')).toHaveCount(0)
    const name = await card.locator('input.name').inputValue()
    await card.locator('.card-toggle').click()
    await expect(card.locator('.card-body label')).toHaveCount(15) // the number and fourteen attributes
    await page.screenshot({ path: 'test-results/shots/width-phone-card.png' })

    const speed = card.getByLabel(`Speed of ${name}`)
    await speed.selectOption({ index: 0 })
    await card.locator('input.name').fill('Phone Edit')
    await card.locator('input.num').fill('77')
    await expect(page.getByLabel('Speed of Phone Edit')).toHaveValue('0')
    // Moving a player down takes his card with him.
    await card.getByRole('button', { name: '↓' }).click()
    await expect(skaters.locator('.card').nth(1).locator('input.name')).toHaveValue('Phone Edit')

    // Lines are cards too, one position to a row.
    const lines = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) })
    await expect(lines.locator('table')).toHaveCount(0)
    await expect(lines.locator('.card')).toHaveCount(8)
    await expect(lines.locator('.card').first().locator('select')).toHaveCount(7)
    await lines.locator('.card').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: 'test-results/shots/width-phone-lines.png' })

    // The less used buttons are behind More; downloading is always in reach.
    await expect(page.getByRole('button', { name: 'Download patch' })).toBeHidden()
    await expect(page.getByRole('button', { name: 'Download ROM' })).toBeVisible()
    await page.locator('.more-toggle').click()
    await expect(page.getByRole('button', { name: 'Download patch' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Add 934 bytes of roster space/ })).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/width-phone-more.png' })
    await page.locator('.more-toggle').click()

    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    const rom = readRom(new Uint8Array(readFileSync(await download.path())))
    const edited = rom.teams[1].players.find((player) => player.name === 'Phone Edit')
    expect(edited?.jersey).toBe(0x77)
    expect(edited?.attributes[2]).toBe(0)
  })

  test('turning a tablet switches between the table and the cards without losing work', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto('/')
    await romPicker(page).setInputFiles(romPath)
    await nameOf(rows(page, 'Skaters').first()).fill('Turned Over')
    await page.setViewportSize({ width: 768, height: 1024 })
    const skaters = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Skaters', exact: true }) })
    await expect(skaters.locator('.card').first().locator('input.name')).toHaveValue('Turned Over')
    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(nameOf(rows(page, 'Skaters').first())).toHaveValue('Turned Over')
  })
})

// A 32-team SNES build, with score box logos.
const snes32Path = resolve(process.cwd(), '..', 'nhl94_2026.sfc')

test.describe('with a 32-team SNES build', () => {
  test.skip(!existsSync(snes32Path), 'needs ../nhl94_2026.sfc')

  test('replaces a score logo, shows the letters instead, and gives one back', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snes32Path)
    await team(page, 'Boston Bruins').click()
    // Its maker is credited, with a link to its forum post.
    await expect(page.getByRole('link', { name: "McMarkis's post on the NHL94 forum" })).toHaveAttribute('href', /forum\.nhl94\.com.*40498/)
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Score logo' }) })
    await expect(section.locator('canvas.preview')).toBeVisible()
    await section.screenshot({ path: 'test-results/shots/score-logo.png' })
    const exported = await downloadFrom(page, section.getByRole('button', { name: 'Export PNG' }))
    expect(exported.suggestedFilename()).toBe('Boston_Bruins_score_logo.png')
    const png = readFileSync(await exported.path())
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([24, 16])

    await team(page, 'Buffalo Sabres').click()
    await section.getByLabel('Import score logo').setInputFiles({ name: 'boston.png', mimeType: 'image/png', buffer: png })
    await expect(section.getByText('Score logo replaced.')).toBeVisible()
    await section.getByRole('button', { name: "Show Buffalo's letters instead" }).click()
    await expect(section.getByText(/now shows its letters.* in the score box; every other team keeps its logo/)).toBeVisible()
    await expect(section.locator('canvas.preview')).toBeHidden()
    await section.getByRole('button', { name: 'Give Buffalo a score logo' }).click()
    await expect(section.getByText('has a score logo again, made from its team logo')).toBeVisible()
    await expect(section.locator('canvas.preview')).toBeVisible()
    await section.getByRole('button', { name: 'Draw…' }).click()
    await expect(section.getByRole('heading', { name: 'Drawing the score logo' })).toBeVisible()
  })
})

// The original SNES game, named NHL94.smc, in the folder above the project.
const snesPath = resolve(process.cwd(), '..', 'NHL94.smc')

test.describe('with the SNES game', () => {
  test.skip(!existsSync(snesPath), 'needs ../NHL94.smc')

  test("copies another SNES ROM's hacks", async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    const main = page.locator('main')
    await entry(page, 'Hacks').click()
    const league = applySnesHacks(readRom(new Uint8Array(readFileSync(snesPath))), { hotColdFix: true, faceoffFix: true })
    await main.getByLabel('Copy hacks from another ROM').setInputFiles({ name: 'league.smc', mimeType: 'application/octet-stream', buffer: Buffer.from(buildRom(league)) })
    await expect(main.locator('.outcome li')).toHaveText(['Hot and cold bug fix: off to on.', 'Faceoff spot fix: off to on.'])
    await expect(main.getByLabel('Faceoff spot fix')).toHaveValue('on')
    // A Genesis ROM is not taken.
    await main.getByLabel('Copy hacks from another ROM').setInputFiles(romPath)
    await expect(main.getByText(/is NHL 94.*not an SNES ROM/)).toBeVisible()

    // The recommended fixes leave the faceoff spot fix as it was set.
    await main.getByRole('button', { name: 'Set back to what the ROM has' }).click()
    await main.getByRole('button', { name: 'Turn on the recommended fixes' }).click()
    // Nor the hot and cold and Y button fixes, which leagues may not want.
    await expect(main.locator('.outcome li')).toHaveText([
      'Power play and penalty kill fix: off to on.',
      // Not a fix, but recommended for every league (the commissioner's choice).
      'Defence control on: off to on.',
      'Penalty shot fixes: off to on.',
      'Extra attacker fix: off to on.',
      'Comeback bonus fix: off to on.',
      'Second-assist bug fix: off to on.',
      'Count stick deflections as shots: off to on.',
      'Regained-puck assist fix: off to on.',
    ])
    await main.getByRole('button', { name: 'Apply', exact: true }).click()
    await main.getByRole('button', { name: "Copy this ROM's hacks for Discord" }).click()
    await expect(main.getByLabel("This ROM's hacks for Discord")).toHaveValue(/^\*\*Hacks in NHL94\*\* \(NHL '94 for the SNES\)\n.*\n\n__Fixes__\n- \*\*Power play and penalty kill fix\*\*: (.*\n)*- \*\*Second-assist bug fix\*\*: .*\n- \*\*Regained-puck assist fix\*\*: /)
    await main.getByLabel('explain each hack').uncheck()
    await expect(main.getByLabel("This ROM's hacks for Discord")).toHaveValue(
      '**Hacks in NHL94**\n- **Power play and penalty kill fix**\n- **Comeback bonus fix**\n- **Penalty shot fixes**\n- **Extra attacker fix**\n- **Second-assist bug fix**\n- **Count stick deflections as shots**\n- **Regained-puck assist fix**\n- **Defence control on**',
    )
    const sheet = readFileSync(await (await downloadFrom(page, main.getByRole('button', { name: 'Download hack sheet' }))).path(), 'utf8')
    expect(sheet).toContain("NHL '94 for the SNES.")
    expect(sheet).toContain("<dt>Extra attacker fix</dt><dd>In Edit Lines, picking a line's extra attacker")
  })

  test('puts in any skater at any position, which the line editor then allows, and when the computer pulls its goalie', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    const main = page.locator('main')
    await team(page, 'Boston Bruins').click()
    const lines = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) })
    const ld = lines.locator('tbody tr').first().locator('select').nth(1)
    const skaters = await rows(page, 'Skaters').count()
    expect(await ld.locator('option').count()).toBeLessThan(skaters)
    // The penalty-kill lines' RW, hidden in the game's Edit Lines, is the short-handed extra skater.
    await expect(lines.getByLabel('RW on line PK1')).toHaveClass('hidden-slot')
    await expect(lines.getByLabel('RW on line PK1')).toHaveAttribute('title', /pulls its goalie while short-handed/)
    await expect(lines.getByLabel('RW on line Sc1')).not.toHaveClass('hidden-slot')

    // Any skater at any position turns the extra attacker fix on with it; max boost turns the hot and cold fix off.
    await entry(page, 'Hacks').click()
    await main.getByLabel('Hot and cold bug fix').selectOption('on')
    await main.getByLabel('Any skater at any position in Edit Lines').selectOption('on')
    await expect(main.getByLabel('Extra attacker fix')).toHaveValue('on')
    await main.getByLabel('Show the maximum boost in Edit Lines').selectOption('on')
    await expect(main.getByLabel('Hot and cold bug fix')).toHaveValue('off')
    await main.getByLabel('Pull the goalie with L and R').selectOption('on')
    await main.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(main.getByText(/^Done: 4 changes/)).toBeVisible()

    await team(page, 'Boston Bruins').click()
    await expect(ld.locator('option')).toHaveCount(skaters)

    await entry(page, 'Game settings').click()
    await expect(main.getByRole('heading', { name: 'Computer pulls its goalie' })).toBeVisible()
    await expect(main.getByLabel('Most goals behind to pull the goalie')).toHaveValue('2')
    await main.getByLabel('Most goals behind to pull the goalie').fill('3')
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    const again = readRom(new Uint8Array(readFileSync(await download.path())))
    expect(again.settings.cpuPullGoalie).toEqual({ goalsUnder: 4, secondsUnder: 61 })
    const hacks = detectSnesHacks(again.bytes).choices
    expect([hacks.forwardsAndDefence, hacks.extraAttackerFix, hacks.showMaxBoost, hacks.hotColdFix, hacks.manualPullGoalie]).toEqual([true, true, true, false, true])
  })

  test("sets an SNES team's organ songs, named by their data, and downloads them", async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Boston Bruins').click()
    const goal = page.getByLabel('Organ song: Home goal')
    await expect(goal.locator('option:checked')).toHaveText('Random')
    await goal.selectOption({ label: 'Brass Bonanza' })
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    const rom = readRom(new Uint8Array(readFileSync(await download.path())))
    expect(rom.teams[1].snesSongs![3]).not.toBe(0xffffffff)
  })

  test('edits the title screen credits, a box for each title, and downloads them', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await entry(page, 'Game settings').click()
    const first = page.getByLabel('Credits title 1', { exact: true })
    await expect(first).toHaveValue('DESIGN ADAPTED BY\nMICHAEL BROOK')
    await expect(page.getByText('916 of 949 bytes used.', { exact: true })).toBeVisible()
    // Typed in lower case, shown and stored as the game's capitals; a letter it lacks is left out.
    await first.fill('League made by\nOur Commish!')
    await expect(first).toHaveValue('LEAGUE MADE BY\nOUR COMMISH')
    // A title alone is not enough.
    await first.fill('LEAGUE MADE BY')
    await expect(page.getByText(/Every title needs a name under it/)).toBeVisible()
    await first.fill('LEAGUE MADE BY\nOUR COMMISH')
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    const rom = readRom(new Uint8Array(readFileSync(await download.path())))
    expect(rom.settings.credits!.pages[0]).toEqual(['LEAGUE MADE BY', 'OUR COMMISH'])
    expect(rom.settings.credits!.pages[1][0]).toBe('PROGRAMMING')
  })

  test('edits a roster, the overall shown and a colour, and downloads the ROM', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    // Picture files holds its player photos.
    await expect(page.locator('nav button')).toHaveCount(28 + 14)
    await expect(entry(page, 'Picture files')).toHaveCount(1)
    await expect(page.getByText("This ROM is NHL '94 for the SNES.")).toBeVisible()

    await team(page, 'Boston Bruins').click()
    await nameOf(rows(page, 'Skaters').first()).fill('Snes Edit')
    await page.getByLabel('Overall shown').fill('88')
    const home = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Home colours' }) })
    await expect(home.locator('canvas.preview')).toHaveCount(3)
    await home.screenshot({ path: 'test-results/shots/snes-colours.png' })
    await home.locator('.swatch[title^="Jersey and helmet"]').click()
    await home.getByLabel(/^Red/).fill('31')
    // The main menu's starting choices.
    await entry(page, 'Game settings').click()
    await expect(page.locator('main h2')).toHaveText(['Clock', 'Title screen credits', 'Main menu starting choices', 'Rule messages', 'Playoff draws', 'Announcer picture', 'Organ songs', 'Move teams'])
    const choice = (caption: string) => page.locator('tr').filter({ hasText: caption }).locator('select')
    await choice('Home').selectOption({ label: 'Boston Bruins' })
    await choice('Line Changes').selectOption({ label: 'Automatic' })
    await choice('Goalie').selectOption({ label: 'Manual' })
    // A league of 20: the menu offers the first 20 teams, and the playoff draws are made of them.
    await page.getByLabel('Teams in the menu').fill('20')
    await expect(choice('Home').locator('option')).toHaveCount(20)
    await page.getByRole('button', { name: "Fill the draws with the league's teams" }).click()
    await expect(page.getByText('Every draw now has only the first 20 teams.')).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/snes-settings.png', fullPage: true })
    // A rink colour, with the rink drawn from the ROM.
    await entry(page, 'Rink colours').click()
    await expect(page.getByLabel('Rink preview')).toBeVisible()
    const rink = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Rink', exact: true }) })
    await rink.locator('.swatch').nth(1).click()
    await rink.getByLabel(/^Red/).fill('3')
    await expect(rink.getByRole('button', { name: 'Reset rink colours' })).toBeEnabled()
    await page.screenshot({ path: 'test-results/shots/snes-rink.png', fullPage: true })
    await entry(page, 'Hacks').click()
    await page.getByLabel('Hot and cold bug fix').selectOption('on')
    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.getByText('Done: 1 change to the game.')).toBeVisible()
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    expect(download.suggestedFilename()).toMatch(/\.smc$/)
    const rom = readRom(new Uint8Array(readFileSync(await download.path())))
    expect(rom.game.platform).toBe('snes')
    expect(rom.teams[1].players.some((player) => player.name === 'Snes Edit')).toBe(true)
    expect(rom.teams[1].shownOverall).toBe(88)
    expect(rom.teams[1].palette[12] & 0x1f).toBe(31)
    expect(detectSnesHacks(rom.bytes).choices.hotColdFix).toBe(true)
    expect(rom.settings.menuTeams).toEqual({ offered: 20 })
    expect(rom.settings.playoffDraws.flat().every((t) => t < 20)).toBe(true)
    expect(rom.settings.menu.map((item) => item.value)).toEqual([0, 1, 10, 1, 0, 2, 1])
    expect(rom.rinkPalette[1] & 0x1f).toBe(3)
  })

  test("exports and imports every team's logos as picture files, and copies a team's logos and colours", async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    const main = page.locator('main')
    await entry(page, 'Picture files').click()
    const zip = new Uint8Array(readFileSync(await (await downloadFrom(page, main.getByRole('button', { name: 'Export all pictures' }))).path()))
    const files = await readZip(zip)
    const pictures = files.filter((f) => !f.name.startsWith('photos/'))
    expect(pictures.filter((f) => /^\d\d_.*_logo\.png$/.test(f.name))).toHaveLength(28)
    expect(pictures.map((f) => f.name)).toContain('02_Boston_Bruins_centre_ice.png')
    // Brought straight back in, nothing changes.
    await main.locator('input[type=file]').setInputFiles({ name: 'pictures.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) })
    await expect(main.getByText(`Replaced 0 pictures. ${files.length} files matched what was there already.`)).toBeVisible()

    // Boston's colours and logos copied to Buffalo.
    await team(page, 'Boston Bruins').click()
    const copy = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Copy to another team' }) })
    await copy.getByLabel('Team to copy colours and logos to').selectOption('2')
    await copy.getByRole('button', { name: 'Copy from Boston Bruins to' }).click()
    await expect(copy.getByText('Team logo copied.')).toBeVisible()
    const rom = readRom(new Uint8Array(readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())))
    const opened = readRom(new Uint8Array(readFileSync(snesPath)))
    const look = (project: typeof rom, t: number, kind: 'logo' | 'centreIce') => {
      const p = currentSnesPicture(project, t, kind)!
      return [Array.from(p.picture.pixels), p.palette.map((w) => w & 0x7fff)]
    }
    expect(look(rom, 2, 'logo')).toEqual(look(opened, 1, 'logo'))
    expect(rom.teams[2].palette).toEqual(opened.teams[1].palette)
    expect(look(rom, 1, 'logo')).toEqual(look(opened, 1, 'logo'))
    expect(look(rom, 3, 'logo')).toEqual(look(opened, 3, 'logo'))
  })

  test("changes the uniform colours a team's photos show, and resets them", async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Anaheim Mighty Ducks').click()
    const photos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Player photos' }) })
    const reset = photos.getByRole('button', { name: 'Reset uniform colours' })
    await expect(reset).toBeDisabled()
    const firstPhoto = photos.locator('.pictures canvas').first()
    const pixels = () => firstPhoto.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data))
    const before = await pixels()
    // Uniform colour 1, the teal, made red.
    await photos.locator('.swatch').nth(0).click()
    await photos.getByLabel(/^Red/).fill('31')
    await photos.getByLabel(/^Green/).fill('0')
    await photos.getByLabel(/^Blue/).fill('0')
    await expect(reset).toBeEnabled()
    expect(await pixels()).not.toEqual(before)
    const rom = readRom(new Uint8Array(readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())))
    const { snesPhotoPalette } = await import('../src/core/snesphotos')
    expect(snesPhotoPalette(rom, 0)[13] & 0x7fff).toBe(31)
    const opened = readRom(new Uint8Array(readFileSync(snesPath)))
    expect(snesPhotoPalette(rom, 1)).toEqual(snesPhotoPalette(opened, 1))
    await reset.click()
    await expect(reset).toBeDisabled()
    expect(await pixels()).toEqual(before)
  })

  test('exports an SNES organ song as MIDI and puts it in place of another, for the teams that have it', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await entry(page, 'Game settings').click()
    const songs = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Organ songs' }) })
    const brass = songs.locator('tr').filter({ hasText: /^Brass Bonanza/ })
    const midi = await downloadFrom(page, brass.getByRole('button', { name: 'Export MIDI' }))
    expect(midi.suggestedFilename()).toBe('Brass_Bonanza.mid')
    await songs.getByLabel('Replace Jaws Theme', { exact: true }).setInputFiles(await midi.path())
    await expect(songs.getByText(/^"Brass Bonanza" is now in place of Jaws Theme, \d:\d\d long, on the organ\./)).toBeVisible()
    await expect(songs.locator('tr').filter({ hasText: 'Brass Bonanza (in place of Jaws Theme)' })).toHaveCount(1)
    await team(page, 'San Jose Sharks').click()
    const options = await page.locator('select[aria-label^="Organ song"]').first().locator('option').allTextContents()
    expect(options).toContain('Brass Bonanza')
    await entry(page, 'Game settings').click()
    await songs.locator('tr').filter({ hasText: 'Brass Bonanza (in place of Jaws Theme)' }).getByRole('button', { name: 'Put back the original' }).click()
    await expect(songs.getByText('Jaws Theme is back. Undo takes it back.')).toBeVisible()
  })

  test("changes a team's name banner colours and resets them", async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Boston Bruins').click()
    const banner = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Name banner colours' }) })
    await expect(banner.locator('.swatch')).toHaveCount(14)
    // The banner itself, as the menus show it, changing as its colours do.
    const preview = banner.locator('canvas.preview')
    await expect(preview).toHaveCount(1)
    const pixels = () => preview.evaluate((c: HTMLCanvasElement) => Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data))
    const shown = await pixels()
    const reset = banner.getByRole('button', { name: 'Reset banner colours' })
    await expect(reset).toBeDisabled()
    // Colour 3, in the first run of shades (colours 0 and 1 are not offered).
    await banner.locator('.swatch').nth(1).click()
    await banner.getByLabel(/^Red/).fill('31')
    await expect(reset).toBeEnabled()
    expect(await pixels()).not.toEqual(shown)
    await banner.screenshot({ path: 'test-results/shots/snes-banner-colours.png' })
    const opened = readRom(new Uint8Array(readFileSync(snesPath)))
    let rom = readRom(new Uint8Array(readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())))
    const before = snesBlockColours(opened, 1)!
    const after = snesBlockColours(rom, 1)!
    expect(after[3] & 0x1f).toBe(31)
    expect(after.filter((_, i) => i !== 3)).toEqual(before.filter((_, i) => i !== 3))
    // The other teams' are as they were.
    expect(opened.teams.map((_, t) => (t === 1 ? null : snesBlockColours(rom, t)))).toEqual(opened.teams.map((_, t) => (t === 1 ? null : snesBlockColours(opened, t))))
    await reset.click()
    await expect(reset).toBeDisabled()
    rom = readRom(new Uint8Array(readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())))
    expect(snesBlockColours(rom, 1)).toEqual(before)

    // Another team's banner for this one: its colours and the name on it.
    const detroit = opened.teams.findIndex((t) => t.names.join(' ').includes('Detroit'))
    await banner.getByLabel('Team whose banner to use').selectOption(String(detroit))
    await banner.getByRole('button', { name: 'Use the banner of' }).click()
    // Detroit is a letter longer than Boston, and retail's banner names have no room to spare: the name waits, and it says so.
    await expect(banner.getByText(/^This team's banner now has .*Detroit.*'s colours and reads Detroit\. Undo takes it back\. But the banner names have no room for it: they need 1 letter more/)).toBeVisible()
    rom = readRom(new Uint8Array(readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())))
    expect(snesBlockColours(rom, 1)!.slice(2)).toEqual(snesBlockColours(opened, detroit)!.slice(2))
    expect(rom.teams[1].placeName).toBe('Boston')
    expect(snesBlockColours(rom, detroit)).toEqual(snesBlockColours(opened, detroit))
  })

  test('exports a team logo, imports another in its place, and downloads the ROM with it', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Boston Bruins').click()
    const logos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Logos', exact: true }) })
    await expect(logos.locator('canvas.preview')).toHaveCount(2)
    await logos.screenshot({ path: 'test-results/shots/snes-logos.png' })
    const exported = await downloadFrom(page, logos.getByRole('button', { name: 'Export PNG' }).first())
    expect(exported.suggestedFilename()).toBe('Boston_Bruins_logo.png')
    const png = readFileSync(await exported.path())

    await team(page, 'Anaheim Mighty Ducks').click()
    await logos.getByLabel('Import team logo').setInputFiles({ name: 'boston.png', mimeType: 'image/png', buffer: png })
    await expect(logos.getByText('Logo replaced.')).toBeVisible()
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    const rom = readRom(new Uint8Array(readFileSync(await download.path())))
    const original = readRom(new Uint8Array(readFileSync(snesPath)))
    const [got, want] = [snesLogo(rom.bytes, 28, NO_SNES_PICTURE_EDITS, 0), snesLogo(original.bytes, 28, NO_SNES_PICTURE_EDITS, 1)]
    expect(Array.from(got.picture.pixels).map((p) => (p ? got.palette[p] & 0x7fff : -1))).toEqual(
      Array.from(want.picture.pixels).map((p) => (p ? want.palette[p] & 0x7fff : -1)),
    )
  })

  test('makes the white background of a logo saved by MS Paint see-through, or keeps it on request', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Boston Bruins').click()
    const logos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Logos', exact: true }) })
    // A red disc on solid white, filling 56 by 56.
    const url = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 56
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, 56, 56)
      context.fillStyle = '#c00000'
      context.beginPath()
      context.arc(28, 28, 20, 0, Math.PI * 2)
      context.fill()
      return canvas.toDataURL('image/png')
    })
    const file = { name: 'paint.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') }
    await logos.getByLabel('Import team logo').setInputFiles(file)
    await expect(logos.getByText(/Logo replaced\..*the white around the logo was made see-through/)).toBeVisible()
    const corner = () =>
      logos.locator('canvas.preview').first().evaluate((canvas: HTMLCanvasElement) => Array.from(canvas.getContext('2d')!.getImageData(0, 0, 1, 1).data))
    expect((await corner())[3]).toBe(0)
    await logos.getByRole('button', { name: 'Import it with its background instead' }).click()
    await expect(logos.getByText(/Logo replaced\..*no see-through pixels, so the game will show the logo as a solid box/)).toBeVisible()
    await expect(logos.getByRole('button', { name: 'Import it with its background instead' })).toBeHidden()
    expect((await corner()).slice(0, 3)).toEqual([0xff, 0xff, 0xff])
  })

  test('adds score logos to the original game, and takes them out again', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Boston Bruins').click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Score logo' }) })
    await section.getByRole('button', { name: 'Add score logos for every team' }).click()
    await expect(section.locator('canvas.preview')).toBeVisible()
    await expect(section.getByText("NOSE4Web added them to this ROM, with McMarkis's code")).toBeVisible()
    await section.screenshot({ path: 'test-results/shots/score-logo-added.png' })
    // Downloaded and opened again, they are there.
    const rom = readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())
    await romPicker(page).setInputFiles({ name: 'logos.smc', mimeType: 'application/octet-stream', buffer: rom })
    await team(page, 'Boston Bruins').click()
    await expect(section.locator('canvas.preview')).toBeVisible()
    await section.getByRole('button', { name: 'Take score logos out of this ROM' }).click()
    await expect(section.getByRole('button', { name: 'Add score logos for every team' })).toBeVisible()
  })

  test("replaces a player's photo and swaps two players' photos", async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Boston Bruins').click()
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Player photos' }) })
    const photos = section.locator('.picture')
    await expect(photos.first()).toBeVisible()
    await section.screenshot({ path: 'test-results/shots/snes-photos.png' })
    const count = await photos.count()
    expect(count).toBeGreaterThan(20)
    const generic = photos.filter({ hasText: 'A stand-in picture' }).first()
    const name = (await generic.locator('strong').textContent())!.replace(/^G /, '')
    const url = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 80
      const context = canvas.getContext('2d')!
      context.fillStyle = '#d0a080'
      context.fillRect(0, 0, 80, 80)
      context.fillStyle = '#202020'
      context.fillRect(20, 10, 40, 20)
      return canvas.toDataURL('image/png')
    })
    await section.getByLabel(`Import the photo of ${name}`).setInputFiles({ name: 'face.png', mimeType: 'image/png', buffer: Buffer.from(url.split(',')[1], 'base64') })
    await expect(section.getByText(`Photo of ${name} replaced. The image was 80 by 80`)).toBeVisible()
    const card = photos.filter({ has: page.locator('strong', { hasText: new RegExp(`^(G )?${name}$`) }) })
    await expect(card.getByText('A stand-in picture')).toBeHidden()
    const picture = () => card.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    const mine = await picture()
    // Swapped with the first player, his photo moves there.
    const first = (await photos.first().locator('strong').textContent())!.replace(/^G /, '')
    await card.getByLabel(`Swap the photo of ${name} with`).selectOption({ label: `G ${first}` })
    await expect(section.getByText(`The photos of ${name} and ${first} swapped.`)).toBeVisible()
    expect(await photos.first().locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(mine)
  })

  test("draws a team logo and a centre ice logo, counting the logo's tiles", async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Boston Bruins').click()
    const logos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Logos', exact: true }) })
    await logos.locator('.picture').nth(0).getByRole('button', { name: 'Draw…' }).click()
    const editor = logos.getByRole('group', { name: 'Draw the team logo' })
    await expect(editor.getByText(/^Uses \d+ of the 36 squares a logo may have\. /)).toBeVisible()
    const canvas = editor.getByLabel('Team logo, drawn large')
    const dot = async (x: number, y: number) =>
      canvas.click({ position: { x: ((x + 0.5) * Number(await canvas.getAttribute('width'))) / 56, y: ((y + 0.5) * Number(await canvas.getAttribute('height'))) / 56 } })
    // Two dots in the middle of the logo, in colour 1.
    await editor.getByRole('button', { name: 'Colour 1', exact: true }).click()
    await dot(28, 28)
    await dot(29, 28)
    // A dot far out in a corner makes the logo bigger than the original game has room for, and is refused.
    await dot(0, 0)
    await expect(editor.getByRole('alert')).toContainText('Edit rejected:')
    // A colour of its own changed in the editor.
    await editor.locator('.swatch').nth(2).click()
    await editor.getByLabel(/^Red/).fill('31')
    await editor.getByRole('button', { name: 'Done drawing' }).click()

    await logos.locator('.picture').nth(1).getByRole('button', { name: 'Draw…' }).click()
    const ice = logos.getByRole('group', { name: 'Draw the centre ice logo' })
    await expect(ice.getByText('On the rink:')).toBeVisible()
    await expect(ice.getByText(/^Uses \d+ of the \d+ squares it may have\. /)).toBeVisible()
    const iceCanvas = ice.getByLabel('Centre ice logo, drawn large')
    await ice.getByRole('button', { name: 'Filled rectangle' }).click()
    await ice.getByRole('button', { name: 'Row 5 colour 1', exact: true }).click()
    await ice.getByLabel('Zoom').selectOption('8')
    await iceCanvas.scrollIntoViewIfNeeded()
    const iceBox = (await iceCanvas.boundingBox())!
    const width = Number(await iceCanvas.getAttribute('width')) / 8
    await page.mouse.move(iceBox.x + 2, iceBox.y + 2)
    await page.mouse.down()
    await page.mouse.move(iceBox.x + (iceBox.width * 7.5) / width, iceBox.y + (iceBox.width * 7.5) / width, { steps: 3 })
    await page.mouse.up()
    await logos.screenshot({ path: 'test-results/shots/snes-draw.png' })

    const rom = readRom(new Uint8Array(readFileSync(await (await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))).path())))
    const logo = snesLogo(rom.bytes, 28, NO_SNES_PICTURE_EDITS, 1)
    expect([28, 29].map((x) => logo.picture.pixels[28 * 56 + x])).toEqual([1, 1])
    expect(logo.picture.pixels[0]).toBe(0)
    expect(logo.palette[3] & 0x1f).toBe(31) // the third of its own colours, colour 3
    const drawn = snesCentreIce(rom.bytes, 28, NO_SNES_PICTURE_EDITS, 1)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expect(drawn.picture.pixels[y * drawn.picture.width + x]).toBe(81)
  })

  test("copies a team's logo and centre ice logo to another team", async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await team(page, 'Boston Bruins').click()
    const logos = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Logos', exact: true }) })
    await logos.getByLabel('Copy team logo to').selectOption({ label: 'Chicago Blackhawks' })
    await expect(logos.getByText('Logo copied to Chicago Blackhawks.')).toBeVisible()
    await logos.getByLabel('Copy centre ice logo to').selectOption({ label: 'Anaheim Mighty Ducks' })
    await expect(logos.getByText(/^Centre ice logo copied to Anaheim Mighty Ducks/)).toBeVisible()
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    const rom = readRom(new Uint8Array(readFileSync(await download.path())))
    const colours = (picture: { picture: { pixels: Uint8Array }; palette: number[] }) =>
      Array.from(picture.picture.pixels).map((p) => (p ? picture.palette[p] & 0x7fff : -1))
    const chicago = rom.teams.findIndex((t) => t.names[2] === 'Blackhawks')
    expect(colours(snesLogo(rom.bytes, 28, NO_SNES_PICTURE_EDITS, chicago))).toEqual(colours(snesLogo(rom.bytes, 28, NO_SNES_PICTURE_EDITS, 1)))
    expect(colours(snesCentreIce(rom.bytes, 28, NO_SNES_PICTURE_EDITS, 0))).toEqual(colours(snesCentreIce(rom.bytes, 28, NO_SNES_PICTURE_EDITS, 1)))
  })
})
