import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'

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
  await expect(page.locator('nav button')).toHaveCount(28 + 6)
}

async function downloadFrom(page: Page, button: Locator): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
  return download
}

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
    await expect(page.getByText('This file is not a Sega Genesis ROM.')).toBeVisible()
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

    // The first swatch is the ice behind the skater. Make it pure red.
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
    await expect(section.getByText(/The menu banners need \d+ more tiles/)).toBeVisible()
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
    await expect(page.getByText('Pasted 1 player.')).toBeVisible()
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
    await expect(page.locator('.outcome li')).toHaveCount(8)
    await expect(page.locator('.outcome')).not.toHaveClass(/error/)
    await expect(page.locator('input.rom-name')).toHaveValue('Season_9')

    const downloads: Download[] = []
    page.on('download', (download) => downloads.push(download))
    await page.getByRole('button', { name: 'Export all 8 files' }).click()
    await expect.poll(() => downloads.length, { timeout: 15000 }).toBe(8)
    expect(downloads.map((d) => d.suggestedFilename()).sort()).toContain('Season_9_players.csv')

    const files = await Promise.all(
      downloads.map(async (d) => ({
        name: d.suggestedFilename().replace('Season_9_', 'Season_10_'),
        mimeType: 'text/csv',
        buffer: readFileSync(await d.path()),
      })),
    )
    await page.locator('input[type=file][accept*=".csv"]').setInputFiles(files)
    await expect(page.locator('.outcome')).toContainText('Imported 8 files')
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

    // The original game passes the check.
    await entry(page, 'Check ROM').click()
    await expect(page.getByText('Nothing to report.')).toBeVisible()

    // Put the first goalie at left wing on Anaheim's first line.
    await team(page, 'Anaheim Mighty Ducks').click()
    const lines = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Lines', exact: true }) })
    await lines.locator('tbody tr').first().locator('select').nth(3).selectOption('1')
    await expect(entry(page, /Check ROM/)).toHaveText('Check ROM (1)')
    await entry(page, /Check ROM/).click()
    await expect(page.getByRole('heading', { name: 'Likely to cause trouble in the game (1)' })).toBeVisible()
    await expect(page.getByText("Line NLC has a goalie in a skater's position.")).toBeVisible()
    await page.screenshot({ path: 'test-results/shots/check.png', fullPage: true })
    await page.locator('main').getByRole('button', { name: 'Anaheim Mighty Ducks' }).first().click()
    await expect(nameOf(rows(page, 'Goalies').first())).toHaveValue('Guy Hebert')

    await entry(page, 'Compare ROMs').click()
    await page.locator('main input[type=file]').setInputFiles(romPath)
    await expect(page.getByText('Overtime: 600 to 300 seconds.')).toBeVisible()
    await expect(page.locator('main h3')).toHaveText(['Anaheim Mighty Ducks', 'Clock'])
    await expect(page.getByText(/^Line NLC: LW .* to Guy Hebert\.$/)).toBeVisible()
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
