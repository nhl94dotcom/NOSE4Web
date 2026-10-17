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

The hacks it applies to the game are the work of **smozoma** (Michael
Capewell), ported from his program
[smozROM](https://github.com/nhl94dotcom/smozROM) with his permission and
under its licence, the GNU General Public License, version 3 or later.

## Licence

Copyright (C) 2026 Tickenest

NOSE4Web is free software: you can redistribute it and/or modify it under the
terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

NOSE4Web is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
A PARTICULAR PURPOSE. See the [GNU General Public License](LICENSE) for more
details.

Versions up to and including commit `3e6174a` were released under the MIT
licence, and anyone who has one of those may go on using it on those terms.

That licence does not cover:

- the files in `public/templates`, which are derived from the game's own
  artwork by way of NOSE's preview templates;
- NOSE itself, which is wboy's work;
- any ROM. None is included, and you need your own.

## What it edits

- Team names, and each team's home and away colours with a live preview
- Team logos and banners, by exporting and importing PNG images one at a time
  or every team's at once as a zip, and banners lettered for you in the game's
  own style
- Players and goalies: names, jersey numbers and all attributes, with the
  overall rating shown as you edit
- Adding, deleting and reordering players, and the lines they play on
- Rink colours
- Hacks to the game itself, from smozoma's smozROM: the weight bug fix, the
  second-assist fix, bodycheck and plus-minus statistics, the improved three
  stars, 0 to 15 ratings, the hot and cold bonuses, and the base weight for
  another era
- Hacks to how the game plays, from findings on the NHL94 forums: the
  C-then-B check bug fix, the goalie's range and hold time, energy and
  stamina, the speed burst, stopping and turning, and a real-time clock
- Fixes for two bugs found by the
  [NHL94 Match Viewer](https://github.com/nhl94dotcom/NHL94MatchViewer)
  project, Aggression wrapping round and the comeback bonus coming at the wrong
  time, and an explanation of what every rating does in play from the same
  project
- Playoff draws, on-screen rule messages, period, overtime and shootout
  lengths, and the main menu's starting choices

It can also:

- make room for longer rosters in the original game by moving other data to
  the end of the ROM
- export everything as an Excel workbook or a set of CSV files, and import
  them again
- move players between teams, keeping both teams' lines in step
- check a ROM for mistakes that cause trouble in the game, and against limits
  your league sets itself: roster sizes, rating caps, nobody on two teams
- describe the differences between two ROMs, with a summary of player moves
  and rating changes to post for a league
- find a player on any team, compare the teams' ratings side by side, and
  change one attribute for many players at once
- bring a team in from another ROM, or copy one team's colours and pictures to
  another
- reset any one part of a team to how it was in the ROM you opened
- trade players between teams with a preview of what the trade does, and hold
  players as free agents
- list everything changed since the ROM was opened or since a season began,
  as text to pass on, and save a team's roster as a picture
- save all your work as a project file, without the ROM, and open it again on
  another computer or over another copy of the game
- undo and redo, and keep work in progress in the browser between visits
- fit a phone or tablet as well as a monitor, with rosters shown as cards
  where a table would be too wide
- copy players, lines and playoff draws between teams, or between two ROMs
  open in separate tabs
- save your changes as an IPS patch, so they can be shared without the ROM

## Supported ROMs

- NHL 94 (product code `GM T-50656 -00`)
- The 30-team hack of NHL 94 (product code `GM T-50656 -30`), and the league
  and season ROMs built on it
- Hacks of either that put fewer skaters on the ice (3 on 3, 2 on 2, 1 on 1)
- Either of them set up with smozROM for 0 to 15 ratings or for another era's
  player weights (product codes `GM T-50656 -0A` to `-3Z` and `-F0A` to
  `-F3Z`)
- NHL 94: EVO, known by the name in its header: rosters, lines, team names,
  colours and logos. Its game settings and banners are left alone, and its
  attributes are edited as the values stored.

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

Any other ROMs you have can be listed too. Each is opened, rebuilt, checked,
and put through the spreadsheet files and the picture handling, to confirm the
editor reads it and gives back exactly what it was given:

```json
{ "league30Rom": "my-league.bin", "otherRoms": ["a-hack.bin", "another.bin"] }
```

## How the code is laid out

- `src/core` reads and writes the ROM and knows nothing about the page. Start
  with `rom.ts` (opening and building a ROM) and `team.ts` (the team data).
- `src/*.tsx` is the page itself, built with React.
- `tests` holds the tests of the logic, and `e2e` the browser tests.
- `scripts/convert-templates.mjs` converts NOSE's preview bitmaps into the
  files in `public/templates`. It only needs running again if those change.
