import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'
import { buildRom, openRom as readRom } from '../src/core/rom'
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
    await expect(page.locator('main h3')).toHaveText(['For the league', 'Everything, team by team', 'Anaheim Mighty Ducks', 'Clock'])
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
    await lineRows().nth(4).locator('select').nth(3).selectOption(last)
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
    await expect(page.getByText('Pasted 1 player, repeating them to fill the rows.')).toBeVisible()
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

    const table = page.locator('main table').last()
    await expect(table.locator('tbody tr')).toHaveCount(28)
    await expect(table.locator('tfoot')).toContainText('League average')
    const firstLine = () => table.locator('tbody tr td:nth-child(2)').evaluateAll((cells) => cells.map((c) => Number(c.textContent)))
    await table.getByRole('button', { name: /^First line/ }).click()
    const down = await firstLine()
    expect(down).toEqual([...down].sort((a, b) => b - a))
    expect(down[0]).toBeGreaterThan(down[27])
    await table.getByRole('button', { name: /^First line/ }).click()
    expect(await firstLine()).toEqual([...down].reverse())
    await page.screenshot({ path: 'test-results/shots/league.png', fullPage: true })

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
    // A position the ROM uses cannot be emptied; one it leaves empty can be filled and emptied again.
    await expect(first.nth(4).locator('option', { hasText: 'Empty' })).toHaveCount(0)
    await first.nth(1).selectOption({ index: 5 })
    await expect(first.nth(1).locator('option:checked')).not.toHaveText('Empty')
    await first.nth(1).selectOption({ label: 'Empty' })
    await page.screenshot({ path: 'test-results/shots/fewer-skaters.png', fullPage: true })

    await entry(page, 'League').click()
    await expect(page.locator('main table').last().locator('tbody tr')).toHaveCount(28)
    await expect(page.locator('main table').last().locator('tbody tr td:nth-child(2)').first()).not.toHaveText('–')

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

    await expect(main.getByText('111 pictures in Season_10_pictures.zip')).toBeVisible()
    const download = await downloadFrom(page, main.getByRole('button', { name: 'Export all pictures' }))
    expect(download.suggestedFilename()).toBe('Season_10_pictures.zip')
    const zip = new Uint8Array(readFileSync(await download.path()))
    const files = await readZip(zip)
    // Four pictures for each of 28 teams, less the centre-ice logo the two All Stars teams share.
    expect(files).toHaveLength(28 * 4 - 1)
    expect(files.map((f) => f.name)).toContain('02_Boston_Bruins_menu_logo.png')
    for (const file of files) expect([...file.data.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])

    // Brought straight back in, nothing changes.
    const picker = main.locator('input[type=file]')
    await picker.setInputFiles({ name: 'Season_10_pictures.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) })
    await expect(main.getByText('Replaced 0 pictures. 111 files matched what was there already.')).toBeVisible()
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
    await expect(main.getByText('Replaced 1 picture. 110 files matched what was there already. 1 file could not be used.')).toBeVisible()
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
    const noRoom = section.getByText(/more tiles than the ROM has room for/)
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
    await expect(boston.locator('table').first().locator('thead th')).toHaveCount(5 + 14)
    await expect(boston.locator('table').first().locator('thead')).toContainText('GlH')
    await expect(boston.locator('table').last().locator('thead')).toContainText('ShP')
    const cell = boston.locator('table').last().locator('tbody tr').first().locator('td').nth(6)
    await expect(cell).toHaveText(/^\d+-\d+$|^99$/) // a rating, as the game shows it
    await main.getByLabel('as stored values (0–15)').check()
    await expect(cell).toHaveText(/^[0-6]$/)
    await main.getByLabel('as stored values (0–15)').uncheck()
    await main.getByLabel('Show attributes').uncheck()
    await expect(boston.locator('table').first().locator('thead th')).toHaveCount(5)
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
    expect(lines[0]).toContain('Position,Name,Jersey,Overall')
    expect(lines[1]).toContain(released)

    // A pool prepared in a spreadsheet: the one released, and a prospect typed in.
    const prospect = ['G', 'Draft Pick', '30', '', ...new Array<string>(14).fill('3')].join(',')
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
    await expect(entry(page, /^Changes/)).toHaveText('Changes (1)')
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
    await expect(main.getByText('Each team in the project goes where this ROM has a team of the same name.')).toBeVisible()

    // Spreadsheet rows too: a players file with one team's name changed to another's.
    await entry(page, 'Spreadsheet files').click()
    await expect(main.getByText('Rows go to the team at their team number.')).toBeVisible()
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

  test('changes how the game plays from the Hacks page', async ({ page }) => {
    await openRom(page)
    const main = page.locator('main')
    await entry(page, 'Hacks').click()
    await expect(main.getByLabel('Goalie hold time')).toHaveValue('2.33')
    await expect(main.getByLabel('Stopping and turning')).toHaveValue('150')
    await main.getByLabel('Goalie hold time').fill('4')
    await main.getByLabel('Goalie range up the ice').fill('224')
    await main.getByLabel('Real-time clock').selectOption('on')
    // A number the game cannot take is marked and not passed on.
    await main.getByLabel('Speed burst').fill('500')
    await expect(main.getByLabel('Speed burst')).toHaveAttribute('aria-invalid', 'true')
    await expect(main.locator('.outcome li')).toHaveText([
      'Goalie hold time: 2.33 seconds to 4 seconds.',
      'Goalie range up the ice: 231 to 224.',
      'Real-time clock: off to on.',
    ])
    await page.screenshot({ path: 'test-results/shots/hacks-play.png', fullPage: true })
    await main.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect(main.getByText('Done: 3 changes to the game. Undo puts it back.')).toBeVisible()
    await expect(main.getByLabel('Goalie hold time')).toHaveValue('4')
    await expect(main.getByLabel('Speed burst')).toHaveValue('0')
    await expect(main.getByText('The original game has 231, and this ROM has 224.')).toBeVisible()
    await expect(entry(page, /^Changes/)).toHaveText('Changes (3)')
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
    await expect(main.getByLabel('Weight bug fix')).toHaveValue('off')
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
const local: { league30Rom?: string; otherRoms?: string[] } = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : {}
const hackRoms = [local.league30Rom, ...(local.otherRoms ?? [])]
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
      await page.goto('/')
      await romPicker(page).setInputFiles({ name: `hack_${n + 1}.bin`, mimeType: 'application/octet-stream', buffer: readFileSync(path) })
      await expect(page.locator('nav button').first()).toBeVisible()
      await expect(page.locator('header')).toContainText(rom.game.title)
      // Every team is listed, and nothing about the ROM as it stands is a problem.
      expect(await page.locator('nav button').count()).toBeGreaterThanOrEqual(rom.teams.length + 6)
      await expect(entry(page, /Check ROM/)).toHaveText('Check ROM')
      await expect(rows(page, 'Goalies').first()).toBeVisible()
      const shot = `test-results/shots/${rom.game.title.replace(/[^A-Za-z0-9]+/g, '_')}`
      await page.screenshot({ path: `${shot}.png` })

      // The last team, and each page in the list after the teams.
      await page.locator('nav button').nth(rom.teams.length - 1).click()
      await expect(rows(page, 'Skaters').first()).toBeVisible()
      const pages = page.locator('nav button')
      for (let i = rom.teams.length; i < (await pages.count()); i++) {
        await pages.nth(i).click()
        await expect(page.locator('main h2').first()).toBeVisible()
        if ((await pages.nth(i).textContent()) === 'League') await page.screenshot({ path: `${shot}_league.png` })
      }
      await page.locator('nav button').first().click()
      await page.locator('h2', { hasText: 'Logos and banners' }).scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${shot}_pictures.png` })

      // An edit, and the ROM still downloads and opens with it.
      await page.locator('nav button').first().click()
      await nameOf(rows(page, 'Skaters').first()).fill('Test Player')
      const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
      const again = readRom(new Uint8Array(readFileSync(await download.path())))
      expect(again.teams[0].players.some((player) => player.name === 'Test Player')).toBe(true)
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

// The original SNES game, named NHL94.smc, in the folder above the project.
const snesPath = resolve(process.cwd(), '..', 'NHL94.smc')

test.describe('with the SNES game', () => {
  test.skip(!existsSync(snesPath), 'needs ../NHL94.smc')

  test('edits a roster, the overall shown and a colour, and downloads the ROM', async ({ page }) => {
    await page.goto('/')
    await romPicker(page).setInputFiles(snesPath)
    await expect(page.locator('nav button')).toHaveCount(28 + 10)
    for (const name of ['Rink colours', 'Game settings', 'Hacks', 'Picture files']) await expect(entry(page, name)).toHaveCount(0)
    await expect(page.getByText("This ROM is NHL '94 for the SNES.")).toBeVisible()

    await team(page, 'Boston Bruins').click()
    await nameOf(rows(page, 'Skaters').first()).fill('Snes Edit')
    await page.getByLabel('Overall shown').fill('88')
    const home = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Home colours' }) })
    await expect(home.locator('canvas.preview')).toHaveCount(3)
    await home.screenshot({ path: 'test-results/shots/snes-colours.png' })
    await home.locator('.swatch').nth(12).click()
    await home.getByLabel(/^Red/).fill('31')
    const download = await downloadFrom(page, page.getByRole('button', { name: 'Download ROM' }))
    expect(download.suggestedFilename()).toMatch(/\.smc$/)
    const rom = readRom(new Uint8Array(readFileSync(await download.path())))
    expect(rom.game.platform).toBe('snes')
    expect(rom.teams[1].players.some((player) => player.name === 'Snes Edit')).toBe(true)
    expect(rom.teams[1].shownOverall).toBe(88)
    expect(rom.teams[1].palette[12] & 0x1f).toBe(31)
  })
})
