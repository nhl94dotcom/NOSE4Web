# NOSE4Web

A web editor for NHL 94 on the Sega Genesis. Open a ROM in your browser, change
rosters, lines, colours and game settings, and download the result.

Everything happens in the browser tab. Your ROM is never uploaded, and no ROM
is included with this project.

## Credit

NOSE4Web is based on **NOSE, the NHL Old Skool Editor** for Windows, written by
**wboy**. Its knowledge of how these games store their data comes from NOSE's
source code and the notes distributed with it. The colour preview images are
converted from the templates NOSE ships.

## Licence

The code in this repository is released under the [MIT licence](LICENSE).

That licence does not cover:

- the files in `public/templates`, which are derived from the game's own
  artwork by way of NOSE's preview templates;
- NOSE itself, which is wboy's work;
- any ROM. None is included, and you need your own.

## What it edits

- Team names, and each team's home and away colours with a live preview
- Players and goalies: names, jersey numbers and all attributes, with the
  overall rating shown as you edit
- Adding, deleting and reordering players, and the lines they play on
- Rink colours
- Playoff draws, on-screen rule messages, period, overtime and shootout
  lengths, and the main menu's starting choices

It can also:

- make room for longer rosters in the original game by moving other data to
  the end of the ROM
- export everything as an Excel workbook or a set of CSV files, and import
  them again
- move players between teams, keeping both teams' lines in step
- check a ROM for mistakes that cause trouble in the game
- describe the differences between two ROMs
- undo and redo, and keep work in progress in the browser between visits
- copy players, lines and playoff draws between teams, or between two ROMs
  open in separate tabs
- save your changes as an IPS patch, so they can be shared without the ROM

## Supported ROMs

- NHL 94 (product code `GM T-50656 -00`)
- The 30-team hack of NHL 94 (product code `GM T-50656 -30`)

Both `.bin` and `.smd` files can be opened. Downloads are always `.bin`.

## Running it yourself

You need [Node.js](https://nodejs.org) 22 or later.

```
npm install
npm run dev
```

Then open the address it prints. Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the automated tests of the editor's logic |
| `npm run test:browser` | Opens the built site in a real browser and uses it |
| `npm run build` | Builds the site into `dist` |
| `npm run lint` | Checks the code for common mistakes |

The browser tests need a one-off download of the browser they drive:

```
npx playwright install chromium
```

Like the other tests, most of them need your own ROM and skip themselves
without it.

### Tests that need a ROM

Most tests check the editor against a real ROM, and skip themselves when it is
missing. To run them, put your own copy of the NHL 94 ROM, named `nhl94.bin`,
in the folder *above* this project. ROM files are ignored by git, so they
cannot be committed by accident.

To also run the tests for a 30-team ROM, put the ROM in the same folder and
name it in a file called `tests/local.json`, which git also ignores:

```json
{ "league30Rom": "my-league.bin" }
```

Those tests were written against one particular league ROM and check some of
its contents, so a different 30-team ROM will fail a few of them.

## How the code is laid out

- `src/core` reads and writes the ROM and knows nothing about the page. Start
  with `rom.ts` (opening and building a ROM) and `team.ts` (the team data).
- `src/*.tsx` is the page itself, built with React.
- `tests` holds the tests of the logic, and `e2e` the browser tests.
- `scripts/convert-templates.mjs` converts NOSE's preview bitmaps into the
  files in `public/templates`. It only needs running again if those change.
