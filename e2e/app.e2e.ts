import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'
import { buildRom, openRom as readRom } from '../src/core/rom'

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
  await expect(page.locator('nav button')).toHaveCount(28 + 9)
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
    await expect(page.locator('nav button')).toHaveCount(28 + 9)
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
