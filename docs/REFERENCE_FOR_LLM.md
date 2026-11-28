# NOSE4Web ROM knowledge: a reference for LLMs

## 1. What this is and how to use it

NOSE4Web is a browser ROM editor for three hockey games: **NHL 94 (Sega Genesis)**, **NHL '94 (SNES)** and
**NHL '95 (Sega Genesis)**. This file is a map of what the code knows about those ROMs, written for another LLM
that is helping someone build features in a *different* program (the first readers work on their own NHL '95
editor). It points you at the right files and gives the facts you need to write your own code.

How to use it:

1. Read sections 1 to 4 (purpose, licence, repo map, conventions). They apply to every game.
2. Find your feature in the status table (section 19). If "Documented here" says yes, read that feature section.
3. Then read the files and tests the section cites. The code is the authority; this document is a guide to it.

Detailed feature sections are added one feature and one game at a time. Today there are thirteen. NHL '95: fighting (5),
organ/team songs (6), logos and banners (7), overtime and shootouts (8), fixes ported from NHL 94 and organ after a
pause (9), a room and RAM map (10), NHL 94's settings and Any skater at any position (11), and its game music (13).
NHL 94 Genesis: game music (12), in-game banner colours (15). NHL '94 SNES: game music and the real-sample player (14). Both: giveaways and takeaways (16). NHL 94 Genesis and SNES: blocked shots (17). Everything else is listed
in section 19 with its files only.

Notation: `$XXXXXX` is a ROM offset (file offset in a headerless `.bin`, which is also the 68000 address for
these 2 MB-or-smaller cartridges); `$FFxxxx` is 68000 RAM. "(inferred)" marks a statement that is my reading,
not something the code or its comments state outright.

## 2. Licence

- NOSE4Web is **GPL-3.0-or-later** (README.md "Licence", LICENSE). Copying NOSE4Web's code into another
  program brings the GPL's obligations with it.
- Using the **facts** documented here (addresses, byte values, data formats) to write your own code is the
  intended use of this guide.
- Third-party parts keep their own terms:
  - chaos's NHL 94 Genesis fighting patch (`src/core/fightdata.ts`) is under the **MIT** licence,
    Copyright (c) 2025 Chaos81 (README.md).
  - The NHL '95 fighting patch is **Vancecookcobxin's** (`src/core/nhl95fightdata.ts`), supplied to NOSE4Web by
    the WN95HL commissioner and included with credit to him. Its terms are his (README.md's licence list); anyone
    reusing the patch should have his OK.
  - Many NHL 94 Genesis hacks are ported from smozoma's smozROM (GPL v3 or later); SNES hacks are McMarkis's
    (README.md).
- No ROM is included or may be distributed. You need your own.

This is a summary of the repo's own statements, not legal advice.

## 3. Repo map

All game logic is in `src/core` (no UI). Pages are `src/*.tsx`. Tests are `tests/*.test.ts(x)` and need the
ROMs on disk (see 4.1); they are skipped without them.

### Shared by all three games

| File | Holds |
|---|---|
| `src/core/games.ts` | `GameConfig` per game (offsets, team table, menu pointers, graphics pointers); `NHL94`, `NHL94_30_TEAMS`, `NHL94_EVO`, `NHL94_SNES`, `NHL95`, `NHL95_34_TEAMS`; `findGame` (detection by header product code). |
| `src/core/rom.ts` | `openRom` (SMD to BIN, game detection, `disableSelfCheck`, parse teams, read team songs), `buildRom` (write teams, songs, settings, graphics, header ROM end `$1A4` and header checksum `$18E`), `buildPatch` (IPS). |
| `src/core/space.ts` | Free room: `claimSpace`, `claimBeforeTail`, `claimSpace95`, `releaseSpace`, `NHL95_FIGHT_ROOM`, `LARGEST_ROM` (2 MB). |
| `src/core/team.ts` | Genesis team block layout (palette, team bytes, goalie bytes, lines, roster, names); used by NHL 94 and NHL '95. |
| `src/core/attributes.ts`, `rating.ts`, `lines.ts`, `roster.ts` | What each stored rating value means; overall rating; line positions; roster limits. |
| `src/core/settings.ts` | Game-wide data outside team blocks: playoff draws, rules text, period lengths, menu defaults (Genesis). |
| `src/core/bytes.ts`, `ips.ts`, `csv.ts`, `workbook.ts`, `projectfile.ts` | Big-endian helpers, IPS, spreadsheets, project files. |

### NHL 94 Genesis

| File | Holds |
|---|---|
| `src/core/hacks.ts` | All NHL 94 Genesis code hacks; also the shared hook helpers `Hook`, `hooked`, `writeHook`, `hookedFix`, `switchPart`, `numberPart`. |
| `src/core/fight.ts`, `fightdata.ts` | chaos's fighting patch (MIT). |
| `src/core/genesismusic.ts`, `teamsongs.ts` | Organ song streams, MIDI in/out (`readMidi`, `songToMidi`); team song table (shared with NHL '95). |
| `src/core/graphics.ts`, `pictureset.ts`, `lettering.ts`, `paint.ts` | Team logos (centre ice, menu), banners, image import/export. |
| `src/core/photos.ts`, `genesisscorelogos.ts`, `genesisblood.ts`, `splash.ts`, `menupicture.ts`, `titlepicture.ts`, `announcer.ts`, `credits.ts`, `scouting.ts` | Player photos, score box logos, head bleeding, splash screen, menu picture, title picture, announcer, credits, scouting text. |
| Pages | `HacksPage.tsx`, `PicturesPage.tsx`, `GraphicsEditor.tsx`, `OrganSongsSection.tsx`, `TeamSongsSection.tsx`, `SettingsEditor.tsx`. |

### NHL '94 SNES

| File | Holds |
|---|---|
| `src/core/snes.ts` | SNES ROM layout, team table search, checksum (`fixSnesChecksum`), the 32-team / SA-1 builds. |
| `src/core/snesteam.ts`, `snessettings.ts`, `snesmenu.ts`, `snesplacenames.ts`, `snesrink.ts` | Team blocks, settings, Game Setup menu, place names, rink colours. |
| `src/core/sneshacks.ts`, `snesfight.ts`, `snesfightdata.ts` | SNES hacks (McMarkis's NHL94SNESVault patches and others); McMarkis's fighting. |
| `src/core/snespictures.ts`, `huffman.ts`, `lz.ts`, `snesblock*.ts`, `snesscore*.ts`, `snesphotos.ts` | Packed pictures (EA Huffman, LZ), name blocks, score logos, photos. |
| `src/core/snesmusic.ts`, `snessongs.ts` | SNES songs and MIDI; team song table. |
| Pages | `SnesHacksPage.tsx`, `SnesPicturesEditor.tsx`, `SnesRinkEditor.tsx`, `SnesPhotosEditor.tsx`, etc. |

### NHL '95 Genesis

| File | Holds |
|---|---|
| `src/core/games.ts` (`NHL95`, `NHL95_34_TEAMS`) | Product codes `GM T-50856 -00` (retail) and `GM T-50856 -34` (WN95HL 34-team ROMs); self-check call at `$692`; team table `$772`; menu, period-length, rules, graphics pointers; attribute kinds (`handedFighting93`, `stickHandling95`). |
| `src/core/nhl95hacks.ts` | Every NHL '95 option: detect (`detectNhl95Hacks`), apply (`applyNhl95Hacks`), titles, texts, page sections; `placeCode` (uses `claimSpace95`). |
| `src/core/nhl95fightdata.ts` | Vancecookcobxin's fighting patch data: 13 hooks, the code block at `$1E0000`. |
| `src/core/nhl95music.ts` | SoundBanks reader, song stream reader/writer, NOSE4Web's override bank for new songs. |
| `src/core/teamsongs.ts` | Team song table (`findSongTable`, `readTeamSongs`, `writeTeamSongs`), slot meanings (`SONG_SLOTS`), `NHL95_SONG_NAMES`, `NHL95_SONGS`. |
| `src/core/genesismusic.ts` | MIDI reading/writing and note planning (`planOrganNotes`) reused by NHL '95. |
| Pages | `src/Nhl95HacksPage.tsx` (option texts, "Tested" / "Not yet tested" lines), `src/OrganSongsSection.tsx`, `src/TeamSongsSection.tsx`, `src/HelpPage.tsx` (section `help-nhl95`). |
| Tests | `tests/nhl95hacks.test.ts` (incl. fighting vs. the patch's own IPS), `tests/nhl95settings.test.ts`, `tests/nhl95music.test.ts`, `tests/songtables.test.ts`, `tests/teamsongs.test.ts`, `tests/nhl95.test.tsx`, `tests/nhl95logos.test.ts`, `tests/nhl95banners.test.ts`, `tests/nhl95cross.test.ts`, `tests/space.test.ts`. |

## 4. Conventions

### 4.1 Supported ROMs

- Detection is by the header product code at `$180` (14 chars), via `findGame` (`games.ts`). NHL '95:
  `GM T-50856 -00` (retail USA) and `GM T-50856 -34` (the WN95HL's 34-team league ROMs). NHL 94 Genesis uses
  `GM T-50656 ...` with smozROM's marks; the SNES game is found by its team table (`snes.ts`).
- The tests look for ROMs one folder above the repo: NHL '95 at `NHL95/NHL_95.bin`, league ROMs listed in
  `tests/local.json` as `nhl95Roms` (on the maintainer's machine: `NHL95/W18.bin` and `NHL95/W18p.bin`, the
  WN95HL's Season 18 ROMs). README.md "tests" section.
- Never distribute ROMs.

### 4.2 Opening a ROM

`openRom` (`rom.ts`) converts SMD to BIN, then `disableSelfCheck`: the `jsr` at `checksumCallOffset - 2` is
replaced by three NOPs and the checksum routine (starting `$700091C8`) is turned into an endless loop and
cleared. If the call is already NOPs (as in the 34-team ROMs, per `games.ts`), it is left alone. `buildRom`
writes the header ROM-end long at `$1A4` and the header checksum at `$18E`.

### 4.3 Finding things: fixed offsets and patterns

- **Fixed offsets** come from `GameConfig` (`games.ts`) and constants in each hack. Each hack checks that the
  bytes at its offset are either the original game's or its own before touching them.
- **Patterns**: where league ROMs move things, the code searches for an instruction sequence and reads its
  operand. Examples: the team song table (`findSongTable`, `teamsongs.ts`: `movea.l #TeamSongs,a0 / movea.l
  #RandomSongs,a1 / move.w (HmTeam).w,d0 / mulu.w #6,d0`); `SndFindBankItem`'s `lea` (`nhl95music.ts`, `FIND`);
  graphics pointers checked against an expected opcode (`pointerOpcode` in `games.ts`).
- Many hacks also check surrounding bytes (`*_AROUND` constants in `nhl95hacks.ts`) so a ROM with different code
  there reads as "unknown".

### 4.4 Hooks

- A hook replaces an instruction (or several) with `jsr target` (`$4EB9` + 32-bit address) and pads the rest of
  the replaced bytes with NOPs (`$4E71`). `writeHook` / `hooked` in `hacks.ts`. Added code usually ends by
  re-running the replaced instructions, then `rts`.
- `hookedFix(hook, code, edits, placeCode)` (`hacks.ts`) builds an on/off part: detect (original bytes and
  original edits = off; hook to exactly `code` and hacked edits = on; else unknown), remove (erase the code,
  restore bytes), apply (place code, write the hook, write edits).
- The NHL '95 fighting patch uses its own fixed hooks (`jsr`/`jmp` into `$1E0000`), not `writeHook`; see 5.

### 4.5 Where added code goes

- `claimSpace` (`space.ts`): after the last non-`$FF` byte, word-aligned, with a 4-byte gap; it may grow a
  512 KB/1 MB ROM by doubling, never past 2 MB (`LARGEST_ROM`; save RAM is at `$200001`). NOSE's end mark
  `$60 $FE` is kept (`keepMark`).
- `claimBeforeTail`: the WN95HL's NHL '95 ROMs keep data (tiles and text) at the very end, so room is taken at the
  start of the last run of at least `$4000` unused bytes before that tail.
- `claimSpace95`: `claimSpace`, falling back to `claimBeforeTail`, but **never over `NHL95_FIGHT_ROOM`
  (`$1E0000`-`$1E0F4C`)** while that room is unused, so fighting can always be added later.
- `releaseSpace` gives room back; room freed in the middle is tagged `NOSEFREE` + start address.

### 4.6 Detecting options

Every option reads as **off** (original bytes), **on** (exactly the hack's bytes) or **unknown** (anything
else). Unknown options are listed in `Nhl95HackState.unknown`, shown on the page, and never changed
(`applyNhl95Hacks` throws if asked to change one).

### 4.7 Applying

`applyNhl95Hacks` (`nhl95hacks.ts`), like NHL 94's: detect current choices, merge the wanted ones, then **remove
every known option, then apply every wanted one**, in a fixed step order, on a copy of the ROM. Removing and then
re-applying the same choices gives the same bytes; the tests check that turning everything off gives back the
original ROM byte for byte (`expectSameBytes`).

Project files (`projectfile.ts`) keep `nhl95Hacks` (`detectNhl95Hacks(...).choices`) and `nhl95Unknown` (its
`unknown`: hacks whose choices are only the defaults). Opened over another ROM, the hacks in `nhl95Unknown` are left
out (older files without it: all are put in, as before), and a value out of its range or not one of its choices
(`nhl95BadValue`) is left out with a note; the rest go in through `applyNhl95Hacks`.

## 5. NHL '95: fighting

### What it does (for the player)

A hard check between two players with Fighting ratings can start a fight, more often as a game gets rougher.
To start one a player needs a Fighting value of 71 or more (42 in Arcade Mode), his opponent 14 or more. They
trade punches (C high, B low, A grab) until one goes down; both get five minutes. Game Setup gets a Fighting row:
Off, On, On - Arcade Mode. (`Nhl95HacksPage.tsx`, `MORE.fighting`; `NHL95_HACK_TEXTS.fighting`.)

NOSE4Web options: `fighting` (on/off), and the power-on setting as `fightingOff` / `fightingArcade` (default On).

### Origin and credit

Vancecookcobxin's fighting patch for NHL '95 (FIGHTING_ROM_PATCH.md, a port of the NHL 2026 - 94 Edition's fight
engine; it brings back EA's unused fight frames). NOSE4Web's data is taken from the patch's IPS for the original
game (`nhl95_fighting.ips`) where it differs from that ROM, minus the header checksum and the original game's own
ROM check sum. The NHL94 Match Viewer project found and fixed a bug in it (below). (`nhl95fightdata.ts` header,
`nhl95hacks.ts` "fighting" comment.)

### Where it lives

- **RAM**: Fighting setting at `$FFCC63` (the row's word at `$FFCC62`); the engine's RAM at `$FFE800`
  (`nhl95hacks.ts` comments). Other NOSE4Web NHL '95 code avoids it: `$FFF000`-`$FFF6CF` season shootout,
  `$FFF700` injury counts, `$FFF800` organ, `$FFEA00` giveaways (comment above `COUNT_OF_A2_95`).
- **Code block**: `FIGHT95_AT = $1E0000`, `FIGHT95_BLOCK`, `$F4C` bytes, so `$1E0000`-`$1E0F4B`. It must be at
  that address: its jumps and pointers are absolute. It is free in retail, the 34-team and the WN95HL ROMs.
- **Game Setup tables inside the block**: `FIGHT95_CHOICES_AT = $1E0E70` (choices per row: 8 copied from the
  ROM's `$85EAA`, then the Fighting row's 3) and `FIGHT95_LABELS_AT = $1E0E7A` (16-byte row labels: 8 copied
  from the ROM's `$86BE8`, then "Fighting"). `fightCode` does the copying, as the patch's own build does.
- **Power-on setting**: `setup_defaults` at `$1E0E2E` calls the game's own defaults then `move.w #1,($FFCC62).w`
  (`31FC 0001 CC62` at `$1E0E34`). The immediate word at `FIGHT_START_AT = $1E0E36` is `0` Off, `1` On, `2`
  On - Arcade Mode.
- **The 13 hooks** (`FIGHT95_HOOKS`, whole instructions; original -> patched):

| Address | Original | Patched |
|---|---|---|
| `$00074C` | `4EB9 0008 66DE` | `4EB9 001E 0E2E` (jsr setup_defaults) |
| `$00A24E` | `BCFC BC1E 6600 0006` | `4EF9 001E 0D20 4E71` |
| `$00A536` | `4A6B 0058 6600 0010` | `4EF9 001E 006C 4E71` |
| `$07AC92` | `6100 1768 6100 00B8` | `4EB9 001E 02DA 4E71` |
| `$07FD84` | `302B 0036 4241` | `4EF9 001E 061C` |
| `$084002` | `3A38 B3C2 BA6B 0052` | `4EF9 001E 0A9C 4E71` |
| `$085EB2` | `227C 0008 5EAA` | `227C 001E 0E70` (choices table) |
| `$085ED4` | `227C 0008 5EAA` | `227C 001E 0E70` (choices table) |
| `$085F36` | `0008` | `0009` (9 rows, inferred) |
| `$0864BA` | `227C 0008 6C68 D2F1 2000` | `4EB9 001E 0E58 4E71 4E71` |
| `$0865D2` | `227C 0008 6BE8` | `227C 001E 0E7A` (labels table) |
| `$08675E` | `11F8 CC5D D289` | `4EB9 001E 0E3C` |
| `$0868E8` | `11E9 0007 CC5D` | `4EB9 001E 0E4A` |

- **ROM check sum**: the patch's IPS also writes `$1A72DC` (the original game's own ROM check sum) and the header
  checksum `$18E`. NOSE4Web skips both: its self-check is already off (4.2), and `buildRom` writes `$18E`
  (`tests/nhl95hacks.test.ts`, "puts the fighting patch into %s as its own IPS patch does").

### Match Viewer's d1/d2 fix

The willingness test builds the opponent's hits term in `d1` (-2 x his hits), then calls the routine at
`$1E04D2` (8 or 16 by period length), which loads the period length into `d1` and overwrites it. Result: on 5-
and 10-minute periods no fight could ever start; on 20-minute periods hits played no part. The fix makes that
routine use `d2`, which neither caller has live (`FIGHT_FIX`, `nhl95hacks.ts`):

| Address | Original | Fixed |
|---|---|---|
| `$1E04D2` | `3238` (move.w (PeriodLength).w,d1) | `3438` (,d2) |
| `$1E04D6` | `0C41` (cmpi.w #$4B0,d1) | `0C42` |
| `$1E04E0` | `0C41` (cmpi.w #$1A4,d1) | `0C42` |
| `$1E04EA` | `0C41` (cmpi.w #$78,d1) | `0C42` |

### Applying and removing

- `applyFight`: every byte of `$1E0000`-`$1E0F4B` must be `$FF`, else it throws ("Fighting needs a part of the
  ROM that this ROM already uses..."). Writes `fightCode(rom, fixed=true, start)`, then the 13 patched hooks.
- `removeFight`: restores the 13 original hooks and fills the block with `$FF`.
- `fightingOff` / `fightingArcade` need `fighting`; only one of them at a time (`applyNhl95Hacks` checks).

### Detecting

`fightMode` (`nhl95hacks.ts`):

- ROM shorter than the block's end: unknown.
- All 13 hooks original: off (`null`).
- Not all 13 patched: unknown.
- Hooks patched and the block equals the **unfixed** patch (`fightUnfixed`, i.e. a ROM made with the patch's own
  IPS): reads as **on, start On**. When the hacks are next applied with fighting on, it is re-applied with the
  fix (`applyNhl95Hacks` pushes `fighting` into the change list).
- Otherwise the block must equal the fixed code except the start word; the start word must be 0, 1 or 2. The 6
  bytes at `$1E0980` (the knockout's `move.w #$FFFF,$44(a3)`, `FIGHT95_WINNER_AT`) are skipped too when they are
  fight momentum's jsr to its code (`momentumWinnerHooked`; section 11).

### Interactions

- `claimSpace95` keeps `$1E0000`-`$1E0F4C` free while unused, so other code never blocks fighting (4.5).
- **Extra period length** (`fourthPeriodOvertime`): raises the Per. Length row's choice count at `$85EAD`
  and `$8F786`, and, when fighting is in, the patch's copy at `$1E0E73` (`OT4_FIGHT_COUNT95`,
  `setPeriodChoices95`), which the patch's menu reads. It is applied after fighting for that reason.
- **Fighting penalty time** (`fightSeconds`): hooks `$89448` (`3582 0068 0242 EFFF`); its code tests the penalty
  byte for `$26` and `$28` (`fightTimeCode95`): NHL '95's penalty list has `$26` "Fighting" and `$28`
  "Fighting *" (5 minutes), the two the patch logs (read from the NHL '95 disassembly); `$2A`, the instigator's
  2 minutes, is left alone.
- **Ratings**: Fighting shares a nibble with the shooting hand (`handedFighting93`, player attribute 8 of 14 in
  `NHL95.playerAttributeKinds`; an **odd** value is a left-handed shot, the reverse of NHL 94). Shown fighting
  is `[0,14,28,42,57,71,85,100][value >> 1]` (`attributes.ts`). In the ROM each player record is the name text,
  a jersey byte, then 7 bytes of 14 nibbles (`team.ts`, `parseTeams`), so this is the low nibble of the 4th
  attribute byte (inferred from that loop). In RAM during play the NHL94 Match Viewer project found the player's
  Fighting rating at player struct `+$74` (the Handed/Fighting nibble) and aggressiveness at `+$73`; NOSE4Web's
  code does not use those offsets.
- The WN95HL's Season 18 ROM rates no one for fighting, so nobody fights until ratings are raised
  (`Nhl95HacksPage.tsx`, HelpPage).

### Gotchas

- The block is position-dependent; you cannot relocate it.
- An IPS-patched ROM is unfixed; treat it as "on" and upgrade it, don't call it unknown.
- The choices/labels copies must come from the target ROM's own `$85EAA` / `$86BE8`, not from retail.
- If you change a Game Setup choice count, change the patch's copy too (the `$1E0E73` case).

### Files and tests

`src/core/nhl95fightdata.ts`; `src/core/nhl95hacks.ts` (section "fighting", `fightCode`, `fightMode`,
`applyFight`, `removeFight`, `setPeriodChoices95`, `fightSeconds95`); `tests/nhl95hacks.test.ts` (compares with
`nhl95_fighting.ips` and `w18_fighting.ips` where present); `tests/nhl95settings.test.ts` ("keeps the extra
period length's count in the fighting patch's copy").

### Status

Tested in the game by the NHL94 Match Viewer project (`Nhl95HacksPage.tsx`: `fighting` and `fightingOff` end
with `TESTED`). `fightSeconds` is now tested too (it ends with `SETTING_TESTED`; it is not in `NOT_YET`); see section 11.
(Corrected: this line used to say `fightSeconds` was not yet tested.)

## 6. NHL '95: organ songs and team songs

### What it does (for the player)

Each team has six organ song slots. NOSE4Web lets you play any of the 36 organ songs, export it as MIDI, replace
it with a MIDI file (organ only, at most 7 notes at once) and restore the original; and choose each team's six
songs. (`OrganSongsSection.tsx`, `TeamSongsSection.tsx`.)

### Origin and credit

The sound driver format comes from the NHL95Genesis disassembly; "every part of it confirmed in the game by the
NHL94 Match Viewer project" (`nhl95music.ts` header). Song names come from the NHL 94 forum list by Jkline3 and
Tony Ouradnik, mapped to NHL '95 by matching notes (`teamsongs.ts`).

### Where it lives: SoundBanks

`SoundBanks` at `$D8EC` (retail and WN95HL alike):

- word: item count; then 4 bytes per item: type (byte), id (byte), size (word); then each item's data back to
  back in header order (so an item may start at an odd address).
- Types: `0` FM patch, `1` sample, `3` song, `$B` load list.
- Organ songs are type 3, ids `$32`-`$55` (36 songs; `NHL95_FIRST_SONG`, `NHL95_LAST_SONG`).
- `SndFindBankItem` (`$BACA`) searches each bank in the RAM list at `SndBanks` (`$FFFF36`), via
  `movem.l d1-d4/a1-a2,-(sp) / lea (SndBanks).l,a1 / move.w #3,d2`; the `lea` operand is at `$BAD0`
  (`FIND`; test constant `OPERAND`).
- Names: `NHL95_SONG_NAMES` (`teamsongs.ts`): each is the NHL 94 song it matches (`NHL95_AS_NHL94`); `$3A` is a
  tune new in NHL '95, `$3C` is claps alone, `$32` is Rally Time [F] with claps. Shown numbered 1-36. E.g.
  `$3D` = 12. Brass Bonanza.

### The song stream (`readNhl95Stream`)

- word: loop point count; a word per loop point (organ songs have none).
- Then events: **wait** (frames at 60/s; one byte, or two if bit 7 of the first is set: `(b0 & $7F) << 7 | b1`;
  the first event's wait is unused), a **status** byte only when it changes (running status, `>= $80`), then data:
  - `$9x` note: note number, velocity, length (a wait-format value). No note-offs.
  - `$Bx` controller: number, value (`$75` = loop).
  - `$Cx` program (patch), one byte. `$Ex` pitch bend, one byte.
  - `$FF` end.
- Organ: channel 0, patch `$19`. Claps: channel 7, patch `$0C`, note 105.
- **Notes are 12 higher than NHL 94's** and played an octave lower, so they sound the same (`PITCH = 12`).
- `nhl95StreamBytes` writes the same format; the test rewrites all 67 loop-free songs in the bank byte for byte.

### Voice limit

`NHL95_SONG_VOICES = 7`: as many as NHL '95's own organ songs hold (most 6 or 7; NHL 94's hold 4). The
driver's list of notes waiting to end holds 32, is shared with sound effects, and does not check for overflow,
so staying at the game's own maximum is the safe limit. MIDI import keeps the highest notes when more sound at
once, drops drums, and moves notes by octaves into MIDI 24-84 (`LOWEST`/`HIGHEST`), velocity clamped 90-110.

### How a new song is added

`withNhl95Song` -> `withOwnSongs` (`nhl95music.ts`):

1. NOSE4Web keeps its own bank, in free room claimed by `claimSpace95`, laid out like SoundBanks but holding
   only replaced songs (type 3, unique ids in `$32`-`$55`).
2. Before the bank is a 16-byte list: `{own bank address, $0000D8EC, $FFFFFFFF, $FFFFFFFF}`; the own bank follows
   at list + 16.
3. `SndFindBankItem`'s operand at `$BAD0` is pointed at the list, so the game finds a replaced song first and
   everything else in SoundBanks as before.
4. Each new song's stream is followed (after `$FF`) by `N4W1` (`4E 34 57 31`) and its name (ASCII, max 40,
   0-terminated). That marks it as NOSE4Web's (`readNhl95Song` sets `custom`).
5. Replacing again rebuilds the whole bank (old one released first).

### Restoring the original

`withOriginalNhl95Song` drops the song from the own bank; when none is left, the operand goes back to
`$FFFFFF36` (`SndBanks`). An empty bank must not be left: the search would walk 65,536 items of whatever
follows. The test checks restore gives the original ROM byte for byte.

### MIDI entry points

`readMidi`, `songToMidi` (`genesismusic.ts`); `nhl95SongFromMidi`, `nhl95SongBytes`, `readNhl95Song`
(`nhl95music.ts`); `NHL95_SONGS` bundles them for the UI (`teamsongs.ts`). Project files: `nhl95CustomSongBytes`,
`withNhl95SongBytes` (accepts only streams with the `N4W1` mark).

### Team song table

- Found by pattern (`findSongTable`, `teamsongs.ts`), so league ROMs that move it are handled. Retail: TeamSongs
  at `$67A20`, 28 teams x 6 bytes; RandomSongs (8 bytes) at `$67AC8` (`tests/nhl95music.test.ts`). The W18
  address is not stated in code or tests.
- `ChooseSong` plays `TeamSongs[home team x 6 + slot]`; value `0` = one of the 8 RandomSongs at random.
- Slots (`SONG_SLOTS`): 0 Period start; 1 Home team on the power play; 2 Faceoff (once a period, and the
  shootout); 3 Home goal; 4 Home team on the penalty kill; 5 Late in the third period.
- NHL '95 slots offer only `0` or `$32`-`$55`: "Other values play sound effects or the title music"
  (`NHL95_SONGS.isSong`).
- Read in `openRom`, written in `buildRom` (`readTeamSongs` / `writeTeamSongs`). `withRoomForTeamSongs` moves
  the table when a ROM has more teams than room (built for NHL 94 30-team ROMs).

### Gotchas

- The 32-note pending list is shared with SFX and unchecked: more voices can break sound.
- Item data is not word-aligned; read it byte by byte.
- The driver (`sound95.asm`) sequences songs on the 68000 in eight slots (`SndSeqPtr $FFFDFE` ... `SndSeqState
  $FFFE7E`) and sends the Z80 each event; the playing song id is at `$FFCFD8`. Pausing reloads the Z80 program,
  which is why the "Organ after a pause" option exists (`nhl95hacks.ts`, comment above `ORGAN_SAVE_HOOK`). Song
  replacement itself only changes ROM data and the `$BAD0` operand; no Z80 code is touched.
- Free RAM Match Viewer found unused: `$FFDC84`-`$FFFC03` (same comment); NOSE4Web's NHL '95 options use parts of
  it (see 5, RAM).
- Releasing the own bank just before a long `$FF` run (the WN95HL tail case) only clears it (`release`), so
  `claimBeforeTail` finds the same room again.

### Files and tests

`src/core/nhl95music.ts`, `src/core/teamsongs.ts`, `src/core/genesismusic.ts`; `src/OrganSongsSection.tsx`,
`src/TeamSongsSection.tsx`; `tests/nhl95music.test.ts`, `tests/songtables.test.ts` (NHL '95 block),
`tests/teamsongs.test.ts`.

### Status

Tested in the game by the NHL94 Match Viewer project (page texts in `OrganSongsSection.tsx` and
`TeamSongsSection.tsx`).

## 7. NHL '95: menu logos, centre-ice logos and banners

### What it does (for the player)

Each team's menu logo (48 x 48 pixels), centre-ice logo (48 x 32, in the home team's strip colours), menu banner
(88 x 16, the location on Game Setup), in-game banner (88 x 16, the location with the stripes drawn in, on the line
change, stats, standings and other screens) and pause screen banner (96 x 16, the nickname) can be exported,
drawn and imported, and the menu banner's two colours changed. **Give logos and banners more room** moves packed
pictures to free room so detailed ones fit. (HelpPage `help-nhl95`, "Logos" and "Banners"; `GraphicsEditor.tsx`
button text `Give ${hasBanners ? 'logos and banners' : 'the logos'} more room`.)

### Origin and credit

NHL 94's picture code (`graphics.ts`) pointed at NHL '95's tables. The layout comes from the NHL95Genesis
disassembly names in the `games.ts` comment above `NHL95.graphics` (TeamLogoBitmaps, TeamLogoPalettes,
TeamGfxList, TeamBitmaps, Teamblocksmap, PauseTeamBlocksMap). The playoff-tree tile limit was found by the NHL94
Match Viewer project ("at 616 the tree's top rows were garbage", `games.ts`, `gameBannerRoom` comment).

### Where it lives

**Picture block** (all kinds; header comment of `graphics.ts`, `readBlock`):

| Offset | Size | Content |
|---|---|---|
| +0 | long | offset of the palette from the block start (0 = none) |
| +4 | long | offset of the tile map (0 = none) |
| +8 | word | tile count (`gameBannerMost` masks it with `$7FFF`) |
| +10 | 32 x count | 8 x 8 tiles, 4 bits per pixel |
| ... | | palette, then map: word width, word height (tiles), then one word per position: tile number `$07FF`, H flip `$0800`, V flip `$1000`, palette line bits 13-14 (`bannerPalette` reads `(entry >> 13) & 3`) |

Identical tiles are stored once (also mirrored ones, `encodeTogether`), so a picture's size depends on its content.
"Capacity" (`Block.capacity`) is the room before the palette/map; a block given more room has capacity > count.

**Pointers** (`NHL95.graphics`, `games.ts`). Each is the 32-bit operand of an instruction; `pointer()` checks the
word just before it (`at - 2`) equals the opcode, else the ROM's graphics are not read (`graphicsSupported` false;
`tests/nhl95logos.test.ts` "is left alone where the code that finds it is not the original game's" pokes `$7D3EC`).

| What | Operand at | Opcode before it | Points to |
|---|---|---|---|
| Menu logo table (GetTeamLogo, inferred) | `$7D3EE` | `$207C` (movea.l #,a0) | table of one long per team -> logo block (6 x 6 tiles, with map) |
| Menu colours (DrawTeamLogo, inferred) | `$7D486` | `$207C` | 16 words per team (`menuPaletteColors: 16`); same table for `menuLogoPalettePointer` and `menuLogoColorsPointer` |
| Centre-ice logo table (LoadHomeTeamGfx `movea.l #TeamGfxList,a2`, instruction at `$7DEA6`) | `$7DEA8` (`rinkLogoTablePointer`) | `$247C` (`rinkLogoPointerOpcode`) | one long per team -> block, 24 tiles, no palette, no map |
| Menu banners (TeamBitmaps) | `$86F6C` (offset 0) and `$86A4C` (offset +8, the tiles) | `$207C`, `$247C` | one block, 11 x 2 map rows per team |
| In-game banners (Teamblocksmap) | 25 places, below | as listed | one block, 11 x 2 per team |
| Pause banners (PauseTeamBlocksMap) | `$7EA14` | `$23FC` (move.l #,(teamblocksmapptr)) | one block, 12 x 2 per team |

In-game banner references (`bannerReferences.game`): opcode `$23FC` at `$84FF8`, `$8AD6A`, `$8AEFE`, `$8B3AA`; `$227C`
at `$87F86`, `$A196A`; `$207C` at `$8D2DE`, `$90328`, `$9153A`, `$91B78`, `$93BB0`, `$940EE`, `$94DF4`, `$962CC`,
`$9758A` (all offset 0); `$247C` with offset +8 at `$87C46`, `$8B09A`, `$8B22A`, `$8D1DC`, `$9045A`, `$91232`,
`$919E8`, `$97524`, `$97D3E`, `$A1814`. `visitor: []`: NHL '95 has no visitors' set; the menu banners serve both
(`layout`).

**Menu logos and their palette** (`graphics.ts` constants; `games.ts` comment):

- 16 colours per team, **one set** in NHL '95 (NHL 94 has 32: a second set for a team listed second; `paletteColors`,
  `menuLogoFromImage` "NHL '95 has the one set").
- Slots 1 and 2: the team's menu banner stripes (`BANNER_COLOR_SLOTS`). Slot 5 = white `$0EEE`, slot 6 = black
  `$0000` (`LOGO_FIXED_COLORS`), shared by every team; a logo may use them but NOSE4Web always rewrites them to those
  values. Slots 7-15 (`LOGO_FIRST_COLOR = 7`, `LOGO_COLORS = 9`) are the logo's own.
- `menuLogoFromImage(rgba, w, h, palette)`: pixels with alpha < 128 become colour 0; other pixels are rounded to
  Genesis colour words (`nearestColorWord`); white and black are not counted; the 9 most used other words go to
  slots 7-15 (unused slots keep what they held); 5/6 forced to white/black; then every pixel is matched to the
  nearest allowed colour (5, 6, 7...) by RGB distance (`pictureFromImage`). Returns `colorsFound` so the caller can
  say colours were merged (`pictureset.ts`, `withPictureFromImage`).
- Paintable colours for a menu logo: 5, 6, 7-15 (`paintableColours`). Test: every retail/W18 logo has `$EEE, $000`
  at 5, 6 (`tests/nhl95logos.test.ts`).
- Writing (`writeMenuLogos`): if every logo block already has a tile per position (`isFullSize`; the WN95HL's ROMs),
  each is rewritten in place at full size. Otherwise the logos are repacked one after another in the span from the
  first to the last block (tiles shared), the rest filled `$FF`, and the table rewritten; if they don't fit it
  throws `NoRoomError`. A gap between logos that is not all `$00` or all `$FF` stops it ("not stored together").
- In NHL '95 the stripe colours and the logo colours are the same table (`$7D486` for both pointers), so an edited
  team palette is written whole (`writeGraphics`; the extra logo-colour write applies only to a team whose logo is
  replaced as well).

**Centre-ice logos**: 6 x 4 tiles, read and written by tile position with no map (`rinkLogo`, `writeGraphics`); a
block holds room for all 24 even if its count were lower. Written in place, the block unchanged: the test expects
header bytes `00 00 00 00 00 00 00 00 00 18` after a replace ("LoadHomeTeamGfx loads exactly $18 before the next
characters"). Colours 1-15 of the home strip (`withPictureFromImage`: "Matched to the home colours"). Teams that share
one block (same table entry) change together (`rinkLogoSharedWith`). Not compressed (NHL '95 has no decompressor,
`games.ts`).

**Menu banner colours**: the two stripe colours are slots 1 and 2 of the team's 16 menu colours (`bannerColors`,
`withBannerColors`; NHL 94's second set slots 3, 4 do not exist in NHL '95). A menu banner may be painted only in
1, 2, 5, 6 (`MENU_BANNER_COLORS_95`, `pictureset.ts`: "Game Setup sets 1, 2 and 5 in the line it draws each team's
in, and the rest of that line is the screen's own"). Test "changes a team's menu banner colours in the original
game: its menu colours 1 and 2, the logo's left as they were" (`tests/nhl95banners.test.ts`).

**In-game and pause banner colours**: one palette for every team, from the block's own palette at the map's palette
line (`bannerPalette`); tests: in-game colour 1 is `$CCC`, pause colours 1-3 are `$EEE, $EEC, $CCC`, and team 0 and
team 1 have the same palette. Any colour 1-15 may be used (`ALL_COLORS`).

**Banner writing** (`writeBanners`): all teams' banners of a kind are re-encoded together with shared tiles; the
tiles are written into the block's existing capacity (zeroed first), the count becomes max(new, old), and every map
entry is rewritten. Too many tiles -> `NoRoomError`. Each block keeps its size and position, so no reference moves.

**Playoff-tree cap** (`gameBannerRoom`, `gameBannerMost`): the playoff tree loads the in-game banners' tiles from
character 1 (`firstChar`), then the small font, big font, arrows, background and playoff picture, all below its
first map at `$B000` (character `$580`, `endChar`). The cap is `endChar - firstChar - (sum of the five others' tile
counts)`, each count read through:

| Operand at | Opcode | Count at | Graphic |
|---|---|---|---|
| `$87C52` | `$23FC` | +8 | SmallFontMap |
| `$87C78` | `$247C` | +0 | BigFontMap2+8 |
| `$87C84` | `$247C` | +0 | Arrowsmap+8 |
| `$87CA0` | `$207C` | +8 | ScoutMap |
| `$87CC0` | `$227C` | +8 | PlayoffSprite |

Retail: **565** tiles (it uses 502; `tests/nhl95banners.test.ts` expects `gameBannerMost(...) === 565`). The WN95HL's
smaller playoff picture leaves more (`games.ts` comment); the code computes it per ROM, no W18 number is stated in
code or tests. If any of the five opcodes differs, the cap is 0 (banners cannot grow). The cap is applied only when
the new tile count exceeds both the cap and the block's current count; the error mentions "the playoff tree".

**Which kinds a ROM offers** (`bannersPerKind: true`, `layout`, `bannerKindsOf`): each kind separately, if its first
reference has the right opcode and its block has a map of at least `teamCount x 2` rows. Retail: menu, in-game,
pause. WN95HL ROMs: in-game and pause only; their menu banners point at a 1 x 1 dummy (`tests/nhl95logos.test.ts`
`pictureKinds`; `tests/nhl95banners.test.ts`). A kind can be changed only if **every** reference points at the block
(`bannersAsExpected`, `bannersEditable`).

### "Give logos and banners more room" (`expandPictureSpace`, `planSpace`)

- `planSpace`: the banner kinds that are as expected and have capacity < map positions, plus the logos if any logo
  block is not full size. Returns null if nothing needs room (WN95HL ROMs: logos already full size, test
  `pictureSpace(opened) === null` for non-retail).
- Room: `claimPictureSpace` -> for NHL '95 `claimSpace95(rom, size, keepMark=false, beforeTail=false)`: after the
  last used byte, never over the fighting room `$1E0000`-`$1E0F4B` while it is free; not before a WN95HL tail. In
  retail the test finds the moved banners at or above `$1A72C0` ("the unused space from the self-check NOSE4Web takes
  out").
- Each banner block is rebuilt with a tile slot for every map position: header (palette offset, map offset, same
  tile count), old tiles, the old palette bytes, the old map; every reference of that kind is repointed (`at +
  ref.offset`; opcodes unchanged, checked by the test).
- Each logo becomes a full-size block (one tile per position, unshared, `logoBlock(..., false)`) and the logo table
  is rewritten.
- The pictures look the same afterwards (test compares every banner and logo).

### Applying and removing

Edits are kept as `GraphicsEdits` (per team: `rinkLogos`, `menuLogos`, `menuPalettes`, `menuBanners`,
`gameBanners`, `pauseBanners`) and written by `writeGraphics` in `buildRom`; nothing changes without edits. Order:
centre-ice logos, colours, banners (menu, in-game, pause), then menu logos last (they may move). There is no
"remove"; the ROM's own picture stays until replaced. The room expansion is recorded in project files
(`projectfile.ts`, `expansions.pictureSpace`).

### Detecting

`graphicsSupported(rom, game)`: `layout` must succeed (opcodes, pointers inside the ROM, rink blocks with no map and
<= 24 tiles, logo blocks with maps). Banners per kind as above.

### Interactions

- Picture room avoids the fighting patch's place (`claimSpace95`); fighting needs that place free (section 5).
- `importTeam` brings an NHL 94 team's menu and centre-ice logos into NHL '95 (test "comes across from NHL 94 with a
  team, centre-ice logo too").
- NHL 94's score logos, banner lettering and moving teams are not offered for NHL '95 (HelpPage "Not offered";
  `canAddGenesisScoreLogos` false in the test).

### Gotchas

- Check the opcode before trusting any pointer; league ROMs repoint these places.
- Menu banners and the menu logo share one 16-colour table per team in NHL '95; don't assume NHL 94's 32.
- Keep white and black at 5 and 6; other teams' logos and the banner lettering use them.
- The in-game banners have two limits: their block's capacity and the playoff-tree cap.
- Centre-ice logos must stay 24 tiles in place.

### Files and tests

`src/core/graphics.ts` (`layout`, `readBlock`, `writeGraphics`, `writeMenuLogos`, `writeBanners`, `gameBannerMost`,
`menuLogoFromImage`, `planSpace`, `expandPictureSpace`), `src/core/games.ts` (`NHL95.graphics`),
`src/core/pictureset.ts` (`MENU_BANNER_COLORS_95`, `paintableColours`, `withPictureFromImage`),
`src/GraphicsEditor.tsx`; `tests/nhl95logos.test.ts`, `tests/nhl95banners.test.ts`.

### Status

Tested in the game by the NHL94 Match Viewer project (HelpPage: logos "Both tested in the game by the NHL94 Match
Viewer project."; banners "Tested in the game by the NHL94 Match Viewer project.").

## 8. NHL '95: overtime until a goal, shootouts, 3 on 3 overtime

### What it does (for the player)

- `seasonOvertime`: a tied regular-season game plays overtime after overtime until a goal (each as long as the ROM's
  own overtime: 10 min retail, 5 in the WN95HL's).
- `seasonShootout`: a regular-season game still tied after overtime goes to a shootout (as Shootout mode: five a
  side, then sudden death); winners get one goal more; the shootout counts in no statistics.
- `seasonShootoutNow`: the same straight after period 3, no overtime.
- `nhlShootout`: three rounds, then sudden death, over as soon as one team can't catch up; home team shoots first;
  for Shootout mode and the season shootouts.
- `threeOnThree` (regular season only) / `threeOnThreeAll` (every overtime): each team plays goalie, C, LW and RD; a
  penalty gives the other team a skater more (4 on 3, 5 on 3 with two); when it ends 4 on 4 to the next stoppage,
  then 3 on 3. "A team with three in the box at once still keeps two skaters: the game can't take any more off." A
  third-period penalty carries into overtime; Line Changes makes no difference.

(`Nhl95HacksPage.tsx` `MORE`, `OT3_MORE`; `NHL95_HACK_TEXTS`.) Only one of the three tie options may be on, and only
one 3 on 3 choice (`applyNhl95Hacks` throws).

### Origin and credit

NHL 94's options (`hacks.ts`: `seasonTies` 'overtime' / 'shootout' / 'shootoutNow', `nhlShootout`, `threeOnThree`),
put in with NHL '95's addresses from the NHL95Genesis disassembly; Match Viewer played overtime until a goal on both
retail and W18 (comment above `PERIOD_OVER`, "a961bb7").

Both games' season shootout start code also sets both teams' tmap (team struct `+$24`, players on the ice) to 6, as
restoreteams does, and empties the penalty box: each tmpdst word (26, NHL 94 `+$66`, NHL '95 `+$68`) of 0 or more
becomes `$FFFE` (the bench) and the box list (`+$9A` / `+$9C`) ends at once (`st`). With the visitors a man short, or
a player of either team in the box, when it began, NHL 94's attempts crashed (address errors in setplayer, `$15B9E`,
and at `$12E20`) and NHL '95's hung on a black screen (Match Viewer, 2026-11-20). The end code's restore puts both
back. NHL 94 tmap `$C6F2` / `$CA56` (`SHOOTOUT_START`), NHL '95 `$C2AC` / `$C612`; the two bne at the top are bne.w.
The earlier versions (none of it; tmap only, 11b5e39) are recognised (`shootoutOutdated`, `nhl95ShootoutOutdated`) and the pages offer "Put in the current version". A save state
holds the whole game's stats from the first frame of the game-over screens (the end code's restore), not during the
shootout or its winner's banner (MV, all three games). The SNES needs neither change (PlayShootout's StartGame_go
sets the teams up again). The SNES's Stars of the Game come only from PenEOG, which clockcont_0 queues as a period's
clock ends with the score not tied, so after a season shootout they never showed; since 2026-11-21 its RUN code, after
the restore and the winners' goal, calls ShowThreeStars (from InProgress's jsl for PenDataEOG; retail `$9C:9BAB`, SA-1
`$9C:9C7D`), QueueTextDMA (`$9F:BF75` / `$9F:C035`) and WaitFrames (X 180, Y 1; `$80:858F` / `$80:85E1`) before its
jml PeriodOver (MV-tested 2026-11-21 on retail and SA-1, both choices: 180 frames, from the restored stats). The version without is
recognised as earlier (`sneshacks.ts`, `seasonShootout`, `withStars`).

### Where it lives: the three tie options (one shared step)

All three use the same four places (`tiesState`, `removeTies`, `applyTies`), with surroundings checked by
`TIES_AROUND` (`$8CB94`, `$8CCD2`, `$8CCDC`, `$9DD3E`):

| Place | Original | overtime | shootout | shootoutNow |
|---|---|---|---|---|
| PeriodOver `.0` `$8CB9E` (game over: `move.w #4,(gsp).w`) | `31FC 0004 C020` | `4E71 4E71 4E71` | `jsr start` | original |
| End of a period, `clockcont_0 .10` `$8CCDA` (`beq.s .eog`) | `67AC` | `4E71` | `4E71` | original |
| PeriodOver tie test `.1` `$8CBA4` (`move.w (HmGoals).w,d0 / sub.w (AwGoals).w,d0`) | `3038 C294 9078 C5FA` | original | original | `jsr now` + `4E71` |
| NextShooter's `jmp ExitToOpening` `$9DD48` | `4EF9 0008 CD02` | original | `jsr end` | `jsr end` |

Detection: exactly one of those four column patterns, else unknown. A `jsr` counts only if the code at its target
equals the expected code (`calls`, `nowAt`).

**start code** (`SHOOTOUT_START_95`, placed by `placeCode`): if `HmGoals ($C294) == AwGoals ($C5FA)` and not already a
shootout (gmode2 `$BF00` bit 0): set gmode2 bit 0, `st` the mark `$FFF000`, save both team structs (`$C288`,
`$1B3` longs = `$6CC` bytes, two structs of `$366`) to `$FFF002`, then ScoreSumbytes (`$C02C`) to `$FFF6CE`; `move.w
#6` to both teams' tmap (`$C2AC`, `$C612`: with the visitors a man short the first attempt hung, MV 2026-11-20; the
first version without it is recognised, `nhl95ShootoutOutdated`); `bclr #1,gmode ($BEF0)`; `jsr ClearShootout ($9DA50)`; `Create_HotCold_Table ($83E88)` for `$C288` and `$C5EE`; `rts`.

**end code** (`SHOOTOUT_END_95`): drops its return address; if the mark is clear or `gsp ($C020) != 3`, `jmp
ExitToOpening ($8CD02)` (Shootout mode's own end); else clear the mark, restore the structs and ScoreSumbytes, compare
the shootout goals `$D180` / `$D182` and add 1 to `HmGoals` or `AwGoals`, `andi.b #$F4,gmode2`, `gsp = 4`, `jsr
forceblack ($7A02A)`, `jmp PeriodOver_sp ($9D18)`.

**now code** (`nowCode95(start)`, `$2E` bytes; the start address is the long at now + `$20`): in a regular-season
game (`OptPlayMode $CC4C` = 0, and not a season's playoff game: GameFlags `$BF08` bit 3 with `$D1A7` bit 5) with
`gsp == 3`, `jsr start`; then the original `move.w HmGoals,d0 / sub.w AwGoals,d0` so the following `beq` sees it.

**RAM**: `$FFF000` mark (byte), `$FFF002`-`$FFF6CD` team structs, `$FFF6CE`-`$FFF6CF` ScoreSumbytes: in
`$FFDC84`-`$FFFC03`, which Match Viewer found unchanged through whole games, shootouts and season screens on retail
and W18, and `$FFF000`-`$FFF6CF` untouched outside the shootout. NHL 94's `$FFF082` could not be reused: "NHL '95
keeps a copy of its save RAM in main RAM" (comment above `SHOOTOUT_MARK`).

### Where it lives: NHL shootout (`nhlShootout`)

`hookedFix(NHL_SO_HOOK, NHL_SO_CODE, NHL_SO_EDITS)` in CountShootoutGoals (`$9DD94`):

| Address | Original | Hacked |
|---|---|---|
| `$9DD98` | `0838 0000 D1A1` (btst #0,(shootoutteam+1).w) | `jsr code` |
| `$9DD9E` | `6700 0028` (beq.w .switch) | unchanged |
| `$9DDA2` | `0C78 0005 D184 6D00 001E 3038 D180 B078 D182 6700 0012` | 11 x `4E71` |

Must follow: `$9DDB8` = `08F8 0003 BF00 4EB9` (bset #3,(gmode2).w / jsr EndShootout; `NHL_SO_AFTER`). The code is
NHL 94's `NHL_SHOOTOUT_CODE` with four words replaced at fixed offsets; `nhlSoCode` throws if NHL 94's word is not
at the offset (`NHL_SO_ADDRESSES`):

| Offset in code | NHL 94 | NHL '95 | Meaning |
|---|---|---|---|
| 2 | `$D578` | `$D184` | shootoutround |
| 10 | `$D574` | `$D180` | home shootout goals |
| 14 | `$D576` | `$D182` | away shootout goals |
| 20 | `$D595` | `$D1A1` | shootoutteam low byte |

Test: `tests/nhl95hacks.test.ts` "plays %s's shootouts to the NHL's rule".

### Where it lives: 3 on 3 overtime (`threeOnThree` / `threeOnThreeAll`, one step)

Eight hooks (`OT3_*_HOOK`), each `hookedFix` to code that begins with `btst #1,(sflags7 $BF02).w` (overtime) and
`btst #0,(gmode2 $BF00).w` (not in a shootout); the 'season' versions also test `OptPlayMode $CC4C` and the season
playoffs (GameFlags `$BF08` bit 3, `$D1A7` bit 5). Outside those cases each code runs the replaced instructions.

| Hook | Original bytes | Length | Routine | What the code does (from NHL 94's notes in `hacks.ts`, same code per `nhl95hacks.ts`) |
|---|---|---|---|---|
| `$8966A` | `207C 0008 3E16` | 6 | releasepl | priolist (`$83E16`) reader: in overtime returns a0 pointing at its own list, bytes `00 04 03 02 01 05 06 FF` (NHL 94's notes give the order as G, C, LW, RD, LD, RW, extra attacker) |
| `$8A392` | same | 6 | getlinee | same |
| `$83790` | same | 6 | SetPlList | same |
| `$894C6` | `347C C288 6100 0048 D4FC 0366 6100 0040` | 16 | InProgress's two calls of InProgress_ap (`$89514`) | at each whistle sets each team's tmap (players fielded, goalie included, 6 at full strength; team struct +`$24`): 4 each, one more per penalty the other team has beyond its own (at most 2); no team given more than 6 less its boxed players nor fewer than 3, nor more than two skaters ahead; outside overtime the original two calls |
| `$9DCC` | `08F8 0001 BF02` | 6 | end of PeriodOver_sp before StartPer (the overtime mark; NHL 94's is in StartPer) | sets the mark, counts the same way for the opening faceoff; for a shootout puts both teams back to 6 (`31FC 0006 C2AC`, `31FC 0006 C612`: tmap) |
| `$888E8` | `4444 5C44 E744` | 6 | faceoff `.apl` row | in overtime `moveq #0,d4` (the full row: each player on his own spot) |
| `$9F560` | `0C6B 0006 0024` | 6 | GetLowestPen's tmap test | in overtime asks the box list (team struct +`$9C`) whether the team has anyone in it |
| `$83754` | `D6FC 0080 4A2B 0061 5BCB FFF6 6A00 0004 304B 4A6B 0034 5ACB FFE8` | 26 | setpersonel's second pass | in overtime skips sort objects of boxed players (tmpdst `+$68` > 0) |

NHL '95 values used: sflags7 `$BF02`, gmode2 `$BF00`, team structs `$C288` (+`$366` each), tmap `$C2AC` / `$C612`,
tmpdst `$68`, box list `$9C`, InProgress_ap `$89514`, priolist `$83E16` (comment above `OT3_PRIO_HOOKS`). Detection
(`ot3State`): all 8 off = off; all 8 equal to the season (or all) code = that choice; else unknown. The test checks
each hook is `4EB9` + NOPs and how each target begins.

**The two-skater case**: with three of a team in the box it plays goalie, C and LW (two skaters); the page says "the
game can't take any more off", and NHL 94's notes give the cause (6 sort objects per team; each boxed player keeps
his). Left as it is.

### Applying and removing

`applyNhl95Hacks` steps: `seasonOvertime` (one step for all three: `removeTies` erases the start/end/now code to
`$FF` and restores the four places; `applyTies` places end, then start, then now, before writing the jsrs),
`nhlShootout`, `threeOnThree` (one step for both). Code goes through `placeCode` (section 10).

### Interactions

- `nhlShootout` works with Shootout mode and the season shootouts together (test "With a regular-season shootout too").
- 3 on 3 is tested together with `seasonShootout`, `nhlShootout`, `fighting`, `fightingOff` (test).
- Settings that touch the same things (section 11; corrected: this line used to call them not yet game-tested):
  `shootoutInjuries` reads the shootout's kept team structs (`$FFF002`, tmpdst `+$68`; NextShooter `$9DD82`),
  `fourthPeriodOvertime` changes ResetClock's overtime.

### Gotchas

- The four tie places must be treated together; detect by combination, not one place at a time.
- `$FFF000`-`$FFF6CF` holds two full team structs during a season shootout; keep other code out of it.
- `gmode2` bit 0 means "shootout"; 3 on 3 code must stand aside then.

### Files and tests

`src/core/nhl95hacks.ts` (`PERIOD_OVER`, `END_OF_OVERTIME`, `TIES_AROUND`, `SHOOTOUT_START_95`, `SHOOTOUT_END_95`,
`nowCode95`, `tiesState`, `removeTies`, `applyTies`, `NHL_SO_*`, `nhlSoCode`, `OT3_*`, `ot3State`); `src/core/hacks.ts`
(`NHL_SHOOTOUT_CODE`, 3 on 3 notes); `tests/nhl95hacks.test.ts` ("lets a tied regular-season game ... play overtime
until a goal", "settles a tied regular-season game ... by a shootout", "plays %s's shootouts to the NHL's rule", "puts 3
on 3 overtime into %s at its eight places").

### Status

All tested in the game by the NHL94 Match Viewer project: `seasonOvertime`, `seasonShootout`, `seasonShootoutNow`,
`nhlShootout` and both 3 on 3 choices end with `TESTED` in `Nhl95HacksPage.tsx`.

## 9. NHL '95: fixes ported from NHL 94, the pass direction fix, organ after a pause

### What it does (for the player)

Each fix's text is in `NHL95_HACK_TEXTS` and `Nhl95HacksPage.tsx` `MORE`. One line each in the table below.

### Origin and credit

NHL 94's fixes (`hacks.ts`; many found by the NHL94 Match Viewer project, some smozoma's), where NHL '95's code is
the same instruction for instruction (NHL95Genesis disassembly). The pass direction fix is Match Viewer's reading
of NHL '95's own `vtoa`. Each fix checks surrounding bytes (`AROUND`, `*_AROUND`), so other code reads as unknown.

### Where it lives

"In place" = bytes changed at the address. "Hook" = `hookedFix`: the original bytes become `jsr code` + NOPs, the
code is placed by `placeCode` (section 10). NHL 94 address given briefly for reference.

| Option | Place(s) in NHL '95 | Original -> hacked, or hook + code | What it fixes | NHL 94 (`hacks.ts`) |
|---|---|---|---|---|
| `secondAssist` | a2touchpuck `$81476` and onetimershot `$82F28` (`move.w tmtouch2(a0),tmtouch3(a0)`) | hooks on `3168 001A 001C`, both to one code `B068 001A 6700 0008 3168 001A 001C 4E75` (`ASSIST_CODE`) | the earlier passer of a give-and-go loses his assist | `$10188`, `$F6CE4` |
| `oneTimerAssist` | `$82F28` | hook on `3168 001A 001C 3168 0018 001A 3140 0018` to a2touchpuck's list update (`listUpdate`, 42 bytes; 48 with the second-assist check) | shooter whose stick touched the pass gets no assists | `$F6CE4` |
| `regainAssist` | `$81464` (`cmp.w tmtouch1(a0),d0 / beq.w .same`), `.same` `$81492` | hook on `B068 0018 6700 0028`; code `B068 0018 660C 08A8 0003 0030 2EBC 0008 1492 4E75` | player who wins the puck back and passes loses his assist | `$10176` / `$101A4` |
| `aggressionFix` | setplayer `$83C7C` | `1743 0073 022B 000F 0073` -> `6100 000A E20B 1743 0073` (bsr ClampNibble, halve, store) | rating wraps (a 4 plays like a 1) | `$15D78` |
| `comebackFix` | setplayer `$83A2C` | `6E00 0026` -> `6D00 0026` (bgt -> blt) | comeback boost in the wrong half of the period | `$15B70` |
| `openNetFix` | shotdiradj `$84ED2` | `4240 B87C 002C` -> `7008 B87C 002C` (clr.w d0 -> moveq #8,d0) | open-net one-timer aimed under the bar | `$C5FC` |
| `goaliePullFix` | CPgoalie `$83674` | `6B00 E3E6 B07C 0002 6600 E3DE` -> `6F00 E3E6 B07C 0002 6E00 E3DE` | computer pulls only when exactly 2 behind | `$F758` |
| `snipingFix` | doshot `$84CCC` | `6B00 008C` -> `4E71 4E71` | perfect aim with own goalie off the ice | `$C422` |
| `penaltyShotTableFix` | PenShotPenalties (`$89FFC`) words at `$8A010` | `0038 003C 0036 003A 002E 0030 0034 FFFF` -> `FFFF 0038 003C 0036 003A 002E 0030 0034` | each penalty shot named after the wrong foul | `$1914E` |
| `penaltyShotFixes` | puckshootout `.initflags` `$9E64E`; SetupPenaltyShot `$9ED52` | in place `08B8 0002 BEF8 08B8 0004 BEF8 08B8 0005 BEF8 08B8 0006 BEF8` -> `0238 0083 BEF8` + 9 NOPs; hook on `366A 0022 7805`, code `366A 0022 7805 08B8 0002 B3C4 4E75` (clears pfnc) | repeated penalty shot after an odd whistle; ghost puck | `$ED0E`; `$15930` |
| `rocketFix` | passtoa0 `$847BA` (74 bytes) | hook; code = NHL 94's `PASS_CODE` bytes `$00`-`$47` + NHL '95's slow-pass (GameFlags `$BF08` bit 1) and lift (`$B38E`) steps + the receiver's wait: the original's where that is over 127, else the exact one, at most 127; edits `$84804` `3002 E740 0440 000A` -> 4 NOPs, `$8481C` `E280`->`E880`, `$8482C` `E281`->`E881`, `$8483A` `C4FC 0078`->`C4FC 000F` | time-to-receiver rounded down: passes up to 2x speed or more | `$BF40` (NHL 94's option is named `passFix`, title "Rocket pass fix") |
| `passFix` (pass direction) | vtoa `$7C586`, at `$7C5B8` | `E248` (lsr.w #1,d0) -> `E548` (asl.w #2,d0); checks vtoa from `$7C586` and `B240 6200 0006 08C2 0003` after | 8 pass directions split 26 degrees where NHL 94 has 63; changes all 36 callers | NHL '95 only |
| `runawayFix` | asspassrec `$81974`; fall ends `$A5C6`, `$A5F2`, `$A60E`; EndOneTimer `$82F64` | in place `FBEA` -> `00C8` (branch to `.exit` `$81A3C`); three hooks on `08AB 0005 0064` to `08AB 0005 0064 6706 08AB 0000 0062 4E75`; hook on `08AB 0003 0064` to `08AB 0003 0064 08AB 0000 0062 4E75` | pfdoff (glide) left on | `$EBA0`, `$AF76` (one fall place), `$FEFF4` |
| `ppPkFix` | setplayer `$839D8` (28 bytes) | `11E8 0001 CAF0 0238 000F CAF0 6000 000E 1028 0001 E808 4400 11C0 CAF1` -> `1028 0001 E808 11C0 CAF0 4E71 6000 000E 700F C028 0001 4400 11C0 CAF1` | PPBonus `$CAF0` / PKBonus `$CAF1` read from the wrong halves of team byte 1 | `$15B1E` |
| `faceoffFix` | Stop4Pen, `$8907A` (86 bytes, `movem.w d0-d1,-(sp)` to `addq.w #4,sp`); limitfo `$88F5C` | hook to `FACEOFF_CODE` (146 bytes: PenBuf `$BFCE`, SortCords `$AC62`, fox/foy `$BB9A`/`$BB9C`; end dots x +-`$4D`, y +-`$D7`; blue lines y +-`$56`; neutral dots x +-`$53` (83), y +-`$41`); edit `303C 0046` -> `303C 0053` | faceoffs between the dots; neutral-zone drop 13 px inside the drawn dot | `$12504` |
| `awarenessFix` | asswingo `$80C2F`, asscentero `$80F37` (low byte of an operand) | `6B` -> `6A` at both (aidef -> aioff) | computer wingers/centres use Defensive Awareness on offence | `$D0E1`, `$D2D9` |
| `centreDefenceFix` | asscenterd, `$80E14` (around `$80E0A`, `$80E18`) | `D278 B376` -> `D242 4E71` (add.w (pucky).w,d1 -> add.w d2,d1 / nop) | computer centre on defence covers a mirrored spot at one end (see below) | `$D27A` (`D278 B75E` -> `D242 4E71`) |
| `goalieTurnFix` | AdjustFacingDirection, `$80444` (around `$8043A`, `$80448`) | `033C 0042` -> `033C 0044` (btst d1,#$42 -> #$44) | bottom computer goalie turns through his own net (see below) | `$DB86` (the same bytes) |
| `stickReachFix` | checkpuckcoll, `$7B6A2` (around `$7B694`, `$7B6A8`) | `223C FFFF DC76` -> `7200 3238 DC76` (move.l #ChkStickSqP -> moveq #0 / move.w (ChkStickSqP).w) | '95 only: the stick circle test reads the address, so the reach is a box and the post-release half reach never applies (tested in the game 2026-11-19) | none (NHL 94 is right) |
| `bodyBlockFix` | checkpuckcoll, `$7B6F6`-`$7B707` (around `$7B6EE`, `$7B708`) | `3238 DC70` -> `B278 DC70` and `B0B8 DC74` -> `B078 DC74` (move -> cmp; cmp.l -> cmp.w) | '95 only: the skater body y test is a move, so puckbody is never reached and pucks pass through skaters (tested in the game 2026-11-19: about 12 more blocks a game) | none (NHL 94 is right) |
| `lockedChangeFix` | chgplayer, `$AC0A` (around `$ABFA`, `$AC0E`) | `6700 000C` -> `4E71 4E71` (beq.w .2 past the lock test for the pad's own skater -> NOPs) | '95 only: B keeps choosing the pad's own skater while he is locked (down, checking, bursting) and `.same` does nothing while locked, so the press is lost; NHL 94 tests the lock for every skater. `.pass2`'s copy (`$AD08`) runs only with no skater on the pad, so it is left. Tested in the game 2026-11-19 (switches during a burst, a check and a fall; with nobody choosable d6 is the own skater, so the press is lost as in NHL 94; penalty shots not reached) | none (NHL 94 is right) |
| `shotScatterFix` | doshot, `$84D38` (around `$84D2C`, `$84D42`) | `4A6F 0004 6A00 0004 E248` -> `... 4E71` (lsr.w #1,d0 -> nop) | bottom net's y aim adjustment halved (tested in the game in '95 by Match Viewer 2026-11-19: top net's 900 results identical, bottom net's wides 1.9% -> 3.0%) | `$C48A` (the same bytes) |
| `stickShots` | puckstick `.stdef` `$7BA02` | hook on `4EB9 0008 142C 6000 0342` (jsr a2touchpuck / bra.w deflect); code (62 bytes) counts the shot through ChkShotStat's `.addShot` `$8AC7A` (shotplayer `$BAD6`) after tests of gmode `$BEF0` and sflags2 `$BEF4`, then a2touchpuck and `jmp deflect ($7BD4C)` | a save off the goalie's stick isn't a shot | `$151D6` |
| `blindRingFix` | checkpuckcoll `$7B6B8` | hook on `6100 024A 6000` + edit `$7B6BE` `0052` -> `6650`; code (46 bytes) with puckc `$B3C2`, gmode `$BEF0`, puckstick `$7B904` | dead area round the goalie's stick (8 to ~20 units in NHL '95) | `$14EC8` |

Faceoff around checks: `$8901C`, `$890D0` (jsr limitfo), `$88F56`. Stick around: `$7B9F8`, `$8AC66`. Ring around:
`$7B6B2`, `$7B6C0`. Others: `AROUND` in `nhl95hacks.ts`.

### Computer centres' defence fix (`centreDefenceFix`; added 2026-11-18, tested in the game by Match Viewer 2026-11-18)

Genesis NHL 94 (`hacks.ts`, Fixes, off by default, not recommended) and NHL '95 (`nhl95hacks.ts`, `SWITCHES` /
`AROUND`, Fixes section next to `goaliePullFix`; in NHL '95 asscenterd takes its own `.cover` path whenever someone carries the puck, as HmDefMode / AwDefMode are always 1, so the fixed line only runs while the puck is loose (Match Viewer)). Reported by chaos (forum.nhl94.com topic 35236, "Player
Assignments - Center"; he blamed the zone check, the slip is the add). asscenterd (NHL94Genesis `logic94.asm`;
NHL95Genesis `logic95.asm`): with the other team on the puck (or nobody), the computer centre skates to x = puckx / 2
and a y worked out with his own end negative: d2 = pucky, negated when pfgoal is clear (pfgoal set = shooting at
the top net, +y; his own net is then at -y). d1 = -128 (-$7E in NHL '95), his own high slot. If d2 < -88 (-$56 in
'95; puck in his zone) he keeps -128; else `add.w (pucky).w,d1 / asr.w #1,d1`, then d1 is negated back when pfgoal is
clear. The add takes the raw pucky, not d2. Shooting at the top net that is right, (pucky - 128) / 2, halfway between
the puck and his slot. Shooting at the bottom net (own net at +y) he gets (128 - pucky) / 2 where it should be
(128 + pucky) / 2: the spot is mirrored about y 64. Puck at centre ice: 64 either way. Puck near his blue line (y
+80): should be 104, is 24 (he stands out by centre). Puck at the far blue line (y -88): should be 20, is 108 (he is
back near his own slot). Puck deep in the far end (y -200): should be -36, is 164 (between his slot and his goal
line). So he backs off as the puck goes away and comes out as it comes at him. Teams change ends each period, so it
is each team in alternate periods. x needs no turn. The fix: `add.w d2,d1 / nop`. NHL 94 Genesis: `7280 B47C FFA8
6D00 0008 D278 B75E E241` at `$D270`, once in the ROM, at `$D270` in every league ROM tried (not EVO, which has
already changed this code to `add.w d2,d1` with -80 for the zone: `D242 E241 4E71`, so the option reads as unknown
there; NHL '93 has the same code at `$B032`). NHL '95 and W18: `7282 B47C FFAA 6D00 0008 D278 B376 E241` at `$80E0A`.
NHL '95's team defence mode 1 path (`.cover`) does not reach this code. SNES (NHL94SNES `asscenterd.asm`): the two
ends are written out separately, `$80`/`$FF80` plus pucky halved for each, both right, so there is no SNES option.
Tests: `tests/readings.test.ts` (nhl94.bin and the league ROMs), `tests/nhl95hacks.test.ts`.

### Fight momentum (`fightMomentum`; added 2026-11-19, tested in the game by MV 2026-11-20)

Genesis NHL 94 with chaos's fighting (`hacks.ts`, Rules, after Fighting penalty time; applied after the fight block goes in). The
fight winner's team gets +2 Agility and +2 Speed for its skaters (not the goalie) for 90 seconds of play, on top of
any crowd boost (which is global, and always on unless `crowdFix`). One code block (`momentumCode`, 178 bytes):
- **Winner:** chkhit's .FightFall is the only place a fight gets its winner (a0) and loser (a3) (Match Viewer, from
  chaos's fight_patch.asm). Its `move.w #$FFFF,$44(a0)` at `$2007E4` (in the fight block; `fight.ts` skips it when
  recognising the block) becomes a jsr that stores the winner's pflags team bit ($00 / $40) at `$FFF750`, sets the
  timer `$FFF752` to 90 and does the move last.
- **Timer:** updatepentime's `jsr updatePPTeamTime` at `$128DA` runs once a second of the clock and never while it
  is stopped; it becomes a jsr to code that counts the timer down and jumps on to the original target.
- **Boost:** playeracc's crowd boosts (agility `$10C02`, speed `$10C86`: btst #1,sflags8 / bne / btst #6,sflags7 /
  beq / addq.b #2,d2) become a jsr doing the same, then `bra.w` past the rest ($10C18, $10CA8). The code adds 2 more
  while the timer runs and the clock runs (gmclock, `$C2EA` bit 0) for a non-goalie of the stored team; speed is
  clamped at $1E as before (past 31 the MaxSpeed index wraps).
- **Clear:** StartGame's `clr.w $C466 / clr.w $C46E` at `$77C0` (after giveaways' `$77B8`) also clears both words.
- RAM `$FFF750-$FFF753`: Match Viewer found `$FFE000-$FFFEBF` never written apart from NOSE4Web's blocks. A second
  fight hands the boost on and restarts it; the timer carries over intermissions. Without fighting nothing goes in.
  Tests: `tests/fightmomentum.test.ts`.

SNES (`sneshacks.ts`, `fightMomentumPlaces`, `fmCode`; added 2026-11-20, tested in the game by MV 2026-11-20): +1 Agility and +1
Speed (the SNES rates 0-15, so the Genesis's +2 halved, as clutch time halves its). The SNES has no crowd boost; the
lift goes where playeracc reads the two ratings. One block (header: getpde, updatePPTeamTime, InitScores, legspd and
the winner operand, then the code), every place found by code:
- **Winner:** F_fightfall (X lost to Y; McMarkis's fights.asm, which NOSE4Web's fights are built from). NOSE4Web's
  fights (1 MB game, `snesfight.ts`): `lda #$FFFF / sta temp3,y` after `lda #$3C / sta Pencntdwn` (block offset found
  by `a93c008d....a9ffff99....af`; `snesFightState` skips those 6 bytes) becomes `jsl` + 2 nop: `cpy #$0C / lda #0 /
  rol` (0 home, 1 visitors), team and timer (90) stored, then the lda / sta. McMarkis's 2 MB and SA-1 builds (their
  own fights, winner in direct page `$89`): `ldx $89 / lda #$FFFF` before `sta temp3,x`
  (`c8c8c0400090..a6..a9ffff9d....bd`) becomes `jsl` + nop doing the same with X.
- **Timer:** updatepentime's `jsl updatePPTeamTime` after `lda #$20 / tsb sflags3 / jsl chkatop` (the box's second,
  only while the clock runs and no penalty shot is on; real time keeps it at 60 frames) becomes `jsl` to a countdown,
  then `jml updatePPTeamTime`.
- **Lift:** playeracc's factor (`clc / adc legstr,x / sta d2 / lda legstr,x / lsr / adc d2 / sta d2`, after `adc
  #$20`): its first 6 bytes become `jsl` / `bra +8`, code doing the same with legstr + 1. Its top speed's `jsl getpde
  / lda legspd,x` (before `pha / lda.l OptLine / cmp #2`) becomes `jsl` + 3 nop: the same, legspd + 1, at most 15
  (MaxSpeed has 16 entries). The +1 (a `jsr` in the block) only while the timer is not 0, gmclock (`$15D6`) is 0, the
  player is not a goalie (position) and his object's team (`cpx #$0C`) is the stored one.
- **Clear:** StartGame_go's `jsl InitScores` (also in a shootout: no lift there).
- RAM: team and timer words at `$7E:FDF8` (after giveaways' `$FD10-$FDF7`, before the shootout's fightinj copy at
  `$FE00`), SA-1 builds `$40:55E8` (after giveaways' `$40:5500-$55E7`). Not yet confirmed unwritten by Match Viewer.
- In-place ROMs need NOSE4Web's fighting on (`applySnesHacks` refuses otherwise; turning fighting off turns it off;
  while the fights change it comes out and goes back in after them). Detected off, not unknown, without the fights.
  Tests: `tests/snesmomentum.test.ts`.

### One fight a game (`fightOnce`; added 2026-11-21, not yet tested in the game)

All three games, needs fighting on (the pages turn it off with fighting). Text: "A player who has fought cannot fight
again that game. A hard hit with that player stays a hit." Once either player of a would-be fight has fought that game, the
fight check takes its own way out before the willingness test: no fight, no fighting majors, no instigator; the hit and
any penalty for it stay. Marks: one bit a roster place (roster index, low 5 bits), home team first, 8 bytes. Places
from Match Viewer's reading of each fight engine.

| Game | Test (jsr/jsl at) | Mark (where the fight is on) | Clear (each game's start) | RAM |
|---|---|---|---|---|
| NHL 94 Genesis (`hacks.ts`, `onceCode`, `$60` bytes) | checkfight's `movea.l #puckx,a0` `$20025E` (`207C FFFF B74A`, just after its movem push): a3, a2 tested, then the movea; fought: `addq.l #4,sp / jmp $2003BA` (.exit) | .cwd's `addi.w #$3E8,(crowdlevel).w` `$20030C` (`0678 03E8 B89C`): marks a3, a2, then the addi | StartGame's `jsr $F6E8A` `$77D8` retargeted: `clr.l $F754 / clr.l $F758`, `jmp` the jsr's own target | `$FFF754`-`$FFF75B` (bit = `$66(aN)`, +32 when pflags `$62` bit 6) |
| NHL '95 (`nhl95hacks.ts`, `onceCode95`, `$5C` bytes) | `moveq #0,d0 / bsr.w $1E04D2` `$1E03A4` (`7000 6100 012A`): a4, a5 tested; not fought: `moveq #0,d0 / jmp $1E04D2`; fought: `addq.l #4,sp / rts` (out of the check at `$1E031E`) | `addi.w #$3E8,(crowdlevel).w` `$1E03EC` (`0678 03E8 B4B4`, after the fight's `clr.w ChkCnt` at `$1E03E8`) | StartGame's `jsr $67938` `$9CB6` retargeted, as on NHL 94 | `$FFF754`-`$FFF75B` |
| SNES (`sneshacks.ts`, `fightOncePlaces`, `foCode`) | the puck-at-faceoff `lda asscur+puckobj / cmp #$1B` (`ad....c91b00`, then `d0016b` in NOSE4Web's 1 MB fights, `b0..af......f0..c90200` before McMarkis's OptFights split) becomes `jsl` + 2 nop: X and Y tested; fought: `lda #$1B / cmp #$1B` (Z and C set, out either way); else the lda / cmp | after `bit #pffight / bne / jmp out` (`bd....890004d0034c....`): NOSE4Web's `stz ChkCnt / ldy #$16` (6 bytes) or McMarkis's `lda #0 / sta.l ChkCnt` (7) becomes `jsl` + nops: marks X and the direct page's a2 (`$91`), then the bytes | FightGameStart's `sta.l fightinjany` (A = 0, after the fightinj loop) becomes `jsl`: the store, then 4 `sta.l` to the marks | `$7E:FEC0`-`$FEC7` (LoROM builds), `$40:5840`-`$5847` (SA-1); bit = `pnum,x` & `$1F`, objects `$0C` up +32 |

The 1 MB SNES places are in NOSE4Web's fight block: `snesFightState` skips them (`once` in `snesfight.ts`), and the
option comes out and goes back in while the fights change (`FIGHT_HOOKERS`, with fight momentum). Genesis 94: `fight.ts`
`SKIPPED` holds `$20025E` and `$20030C`; NHL '95: `fightMode` skips them when they are the option's jsrs. With or
without fight momentum (separate hooks). Tests: `tests/fightonce.test.ts`.

### Referee strictness (`referees`; added 2026-11-19; Genesis NHL 94 tested in the game by Match Viewer 2026-11-19)

Match Viewer, 40 computer games a level (5-minute periods, penalties on except offsides, line changes off): calls a
game (roughing after an injury excluded) original 2.93, very lenient 1.88 (64% +- 9), lenient 2.73 (93% +- 12),
strict 4.13 (141% +- 17), very strict 7.08 (242% +- 27), each within about 1.5 standard errors of the expected 50 /
76 / 144 / 217%; every caller scales (charging/slashing and roughing/cross-checking are each one call named by
HVcount & 2); interference too rare to judge (0.12 a game). SNES and NHL '95 not yet tested.


Genesis NHL 94 (`hacks.ts`, Rules, five levels, default `original`). The judgement penalties all roll checkagr
(collide94): d0 = randomd0(((40 - Agr) / 2) x 13), doubled for a pad player and halved within $28 of the puck, and
the caller calls the penalty when d0 is small (holding/hooking after a hold <= 6, tripping after a B-check <= 4,
charging <= 4, roughing <= 3). A call is about (threshold + 1) / range, so the level sets the `mulu.w #$D,d0`
multiplier (word at `$13E32`, after `303C 0028 902B 0073 E208 C0FC` at `$13E26`): very lenient 26 (about 50%), lenient
17 (76%), original 13, strict 9 (144%), very strict 6 (217%). Goalie interference (.ci) rolls randomd0($28 - Agr) <= 4
(`cmp.w #4` word at `$13CAA`, after `303C 0028 902B 0073 6100 D3E0 B07C` at `$13C9C`), so its threshold moves to match:
2, 3, 4, 6, 10 ((t + 1) / 5 of the calls: 60, 80, 100, 140, 220%; a whole threshold can't give 50%). Not scaled: a
penalty on a breakaway, where checkagr replaces the range with 8 / 7 / 4 / 3 (Match Viewer). Every league ROM tried has both at those places; EVO v0.4.0 replaced the
interference roll with a jsr to its own code, so there only the multiplier changes. Offsides, icing, fights and
penalty shots are untouched. Tests: `tests/readings.test.ts`.

NHL '95 (`nhl95hacks.ts`, `referees95`, Rules, same five levels, `REFEREE_TEXTS`): checkagr (penalty95) is d0 =
randomd0(((50 - Agr) / 2) x 13), the same callers; the `mulu.w #$D,d0` word is at `$8997A` (after `303C 0032 902B 0073
E208 C0FC` at `$8996E`), set to NHL 94's 26 / 17 / 13 / 9 / 6. Goalie interference (collide95 .ci) is randomd0($1E -
Agr) <= 5 (`cmp.w #5` word at `$7C4D8`, after `303C 001E 902B 0073 4EB9 0007 C63A B07C` at `$7C4C8`), about (t + 1) / 6,
so 2 / 4 / 5 / 8 / 12 (50 / 83 / 100 / 150 / 217%). NHL_95.bin and the WN95HL's W18 / W18p have both at those places.
Tests: `tests/nhl95hacks.test.ts`.

SNES (`sneshacks.ts`, `referees`, an amount 0-4 = very lenient to very strict, `SNES_REFEREE_TEXTS`, off = 2; Rules):
checkagr is `lda.w #$0014 / sec / sbc.w aggress,x / asl a x4 / sta.b d0`, so (20 - Agr) x 16, doubled for a pad player
and halved near the puck, then jml randomd0. There is no multiplier, so the four `asl a` (`0A0A0A0A`) become a jsl
(withFarCode: bank $9B, $80 or the site's) to 13 bytes (NOPs after the rtl, the same length at every level) that
multiply the 16-bit A by 32 (`asl` x5), 21 (`sta d0 / asl / asl / clc / adc d0 / asl / asl / clc / adc d0`), 11 (`sta
d0 / asl / asl / clc / adc d0 / asl / clc / adc d0`) or 7 (`sta d0 / asl` x3 `/ sec / sbc d0`): 50 / 76 / 145 / 229%
(d0 is the sta's own direct-page operand, $A5, overwritten right after). No hardware multiplier (SA-1). Goalie
interference (checkint .ci) is `lda.w #$0014 / sec / sbc.w aggress,x / jsl randoma8 / cmp.w #$0002 / bcs .rtl`: a call
when the roll is under 2, so only whole steps: 1 / 2 / 2 / 3 / 4 (50 / 100 / 100 / 150 / 200%, lenient keeping the
original's 2 as nearer 76% than 1 is). Both found by their code (`a9140038fd....` + 4 bytes + `85..bd....300206..`; `a9140038fd....22......c9..00b0`),
at $9E:C124 / $9E:BAB2 in the original game (file offsets $F4124 / $F3AB2; +$200 with a copier header), $F416C /
$F3AF2 in nhl94snes_2026 and $F418C / $F3B12 in the SA-1 builds (aggress at $7443 there). Tests: `tests/snesreferees.test.ts`.

### Goalie turning fix (`goalieTurnFix`; added 2026-11-18, tested in the game by Match Viewer 2026-11-18)

Genesis NHL 94 (`hacks.ts`, Fixes, off by default, not recommended) and NHL '95 (`nhl95hacks.ts`, `SWITCHES` /
`AROUND`, Fixes section after `centreDefenceFix`). Found by NOSE4Web and Match Viewer.
AdjustFacingDirection (NHL94Genesis `logic94.asm`; NHL95Genesis `logic95.asm`) turns a computer goalie's facedir one
step toward the puck (skipped for a human goalie, pfjoycon). It is meant never to turn him through the facings into
his own net: when the test runs he takes the step, and if the new facing is in his mask (top goalie `$83` = 7, 0, 1;
bottom goalie, pfgoal set, `$38` = 3, 4, 5) he turns the other way instead. The test only runs when the current
facing is in `btst d1,#$42` = 1 or 6. The top goalie needs it from 6 (and has it); the bottom goalie needs it from 2,
the mirror of 6; facing 1 never needs it. So with the puck going right to left behind the bottom goal line the bottom
goalie turns 2-3-4-5-6, through his net. The fix: `#$44` (2 and 6). Match Viewer in the game: bottom goalie
2-3-4-5-6 before, 2-1-0-7-6 after; the top goalie's mirror case 6-5-4-3-2 on both. Bytes `033C 0042 6700 0022`:
NHL 94 at `$DB86` (byte `$DB89`), once in the ROM and at `$DB86` in every league ROM tried, EVO included (NHL '93 has
it at `$B6A6`); NHL '95, W18 and W18p at `$80444` (byte `$80447`), once. SNES not checked. Tests:
`tests/readings.test.ts` (nhl94.bin and the league ROMs), `tests/nhl95hacks.test.ts`.

### The bottom net's goals: stick fix and shot aim fix (`goalieBladeFix`, `shotScatterFix`; added 2026-11-19, both tested in the game by Match Viewer 2026-11-19)

Genesis NHL 94 only (`hacks.ts`, Fixes, both off by default, not recommended: a league picks). Background: the
commissioner's database of Genesis league games (87,260) shows about 3% more goals at the bottom net (Down) than
the top (Up) once the home edge is taken out (home skates up in periods 1 and 3); more on the power play (7.6%, PP2
14%, not explained). What NOSE4Web and Match Viewer found, all small and all leaning Down:

- How a save works: checkpuckcoll `.ccx` touches the goalie when the puck (z 15 or lower) is inside his body circle
  (radius 15 for a pad-controlled goalie, `.cbg` by Agility for the computer; pad stack wider and offset) or (z 5 or
  lower, Zvel `$200` or less) inside 14 of his stick's hot spot (GetHot, HotList). puckgoalie then works out save odds
  from his glove/stick attributes (`.list`) and the frame (`.list2` / `.list3`) and never uses them: every touch is
  a save (bounce or hold).
- `goalieBladeFix`: HotList (two signed bytes per frame, x then y, world y = -y; at `$A44C8`, found through GetHot's
  `movea.l #HotList,a1` at `$106F4`; EVO moved it to `$1F9400`) is not y-mirrored between the goalie's facing-up
  frames (the bottom goalie) and facing-down ones. E.g. turned toward a shooter on screen-right the bottom goalie's
  blade is 4 to that side, the top goalie's 11. The fix sets frames 407-412 and 428-430 (ready, glove right, glove
  left for up, up-right, up-left; goalie frames are 407 + 3 x facing + kind) to (x, -y) of 419, 421, 420, 416, 418,
  417 and 422, 424, 423: a glove frame takes the other hand's, because the goalie's right hand is on screen-right
  facing up and screen-left facing down. Bytes at frame 407: `00F9 07FC FAF8 04FA 0B01 01F7` -> `01FA 04FB FCFF 0BFC
  03FD 01FB`; at 428: `FAFF FBFA F5FB` -> `F9F9 F9F8 F802`. The sideways frames (facing 2 and 6) serve both nets and
  cannot be mirrored this way. Match Viewer's replays of the same shots against the computer goalie: Down/Up 1.03 on
  retail, 1.00 with the ready frames mirrored and with all 9 (the glove frames never came into those shots); the top
  net's 1,061 results unchanged. In 6 computer games each, holds and pass-outs looked normal (the hot spot is also
  where a held puck sits).
- `shotScatterFix`: doshot's random miss for a shot that is not exact adds up to the adjustment across the screen and
  (capped `$3C`) up and down it, but for a shot at the bottom net (dy negative) `tst.w 4(sp) / bpl.w .ycalc / lsr.w
  #1,d0` at `$C48A` halves the up-and-down one. The fix: the `lsr` (`E248` at `$C492`) -> `nop`. Under 1% of the
  bottom net's goals. Match Viewer, 2026-11-19: in the launch replays wides at the bottom net 8.2% -> 8.6% (goals 147
  -> 146 of 1,063); played through the game's own doshot (25 spots x 9 aims x 4 seeds a net) the top net's 900
  results identical, the bottom net's wides 2.7% -> 2.9% (16 results changed). NHL '95 has the same code at `$84D38`
  (offered there too as `shotScatterFix`, added 2026-11-19, tested in '95 by Match Viewer); the SNES halves too (but the SNES's league records lean Up, 0.976).
- Other end differences found, not offered: rebounds off the bottom goalie are about 5% faster (a `move.b` keeps the
  old low byte); the glass behind the top net is taller (wallcollb `$14BE0`, Ypos `$118`), which stops far shots but
  barely changes goals; the shoulder-save fumble (ghighr/ghighl hold points behind the top goalie) adds Up goals; the
  one-timer target (an A-tap spot pass) never feeds a one-timer; D-pad shot height is fixed to the screen, and flat
  shots knocked away by the stick are not counted as shots (the 0.94 shot count at the bottom net).
- The power play (2026-11-19, league data and captures). The league's bigger Down lean on the power play (PP goals
  1.076, PP2 1.14, raw) is more power plays, not better ones: teams attacking Down draw 5.4% more penalties per
  period (home 1.064, away 1.045, so not a period effect; every type about 1.05; interference 1.125, tripping 1.092),
  while goals per power play lean about 1.03, as at even strength. 1.054 x 1.03 = 1.09; two penalties for PP2:
  1.054^2 x 1.03 = 1.14. Match Viewer: chances for a computer defender to hook (within 30 of the carrier, facedir ==
  vtoa) are even by end (1.006) but hooks per chance are 1.45 in people's games and even in computer-only games
  (0.86), so it is how people play, not code: check4check, Acheck, vtoa and the slot rule (sflags6 bit 5, never set)
  are all even. Interference is mostly goalie interference at the top crease: people stand the bottom goalie deeper
  (24.7 out against 19.4), outside the call's crease window ($EF-$10A). Tripping: people's B pokes (1.18). The camera
  (checkwindow, Vpos -$C8..$100) frames both ends alike in the game. Nothing to offer.

#### NHL '95 and the SNES (2026-11-19; code reads and harness tests, nothing offered yet)

- NHL '95 (no league data): the same as NHL 94 for the y-scatter halving (`$84D38`), unused save odds, the rebound
  `move.b` (`$7C258`), the turn guard (`$80444`), the bottom goalie's stopped-puck quirk (`$803D4`, `$807B4`) and a
  smaller top-glass band (wallcollb `$7A9A0`, Ypos `$110`). HotList at `$137B66` (GetHot's `227C 0013 7B66` at
  `$7C686`; ready 606+f, glovel 614+f, glover 622+f, stickl 630+f, stickr 638+f, crouch 904 + 3 x slot for facings
  0, 1, 3, 4, 5, 7). GetHot negates y unless attribute bit 4, never set for goalies, so every goalie hot spot points up
  the screen: in front of the bottom goalie, behind the top one. Match Viewer's frame sheet: the facing-down stick
  frames draw the blade in front of the spot (so the spot is wrong there); the glove frames' spot is the raised glove
  (height, where a caught puck is drawn). Test variant C mirrors facing-down := (x, -y) of facing-up for the ready,
  crouch and stick-save frames only (18 frames, gloves kept): a model gives Down/Up 1.00 in save mode (retail 1.01-1.05,
  turned ready 1.18). Also new in '95: checkpuckcoll's one-timer reach ($12) is reset to $E by each earlier
  non-one-timer in OOlist order, which should favour one-timers at the bottom net; and the stick test loads
  `move.l #$FFFFDC76,d1` at `$7B6A2` (ChkStickSqP's address, not its value), so the stick reach is a box, not a circle (offered as `stickReachFix`); next to it the skater body test's y check is a
  `move` where a `cmp` belongs, so pucks never hit skaters' bodies (offered as `bodyBlockFix`). Match Viewer, 4 computer
  games a ROM: blocks 16 -> 28 a game with the body fix, quick loose-puck steals 33 -> 20 with the stick fix, goalies
  about the same, nothing stuck.
- The SNES (league 0.976: about 2.4% fewer goals at the bottom net, shots 0.989, penalties even): no stick-art,
  turning or shoulder-save faults like the Genesis's. The y-scatter halving is the same (`$9E:E36D`, about 0.5%). The
  goalie body box (checkpuckcoll_ccx .7, `$9E:98FB`, goalie - puck in [-11, 10]) barely matters in the game. puckgoalie
  `.3x` (`$9E:F1AA`): the rebound keeps puck - goalie unless the goalie's Yvel has the same sign, and a still goalie's
  Yvel 0 counts as positive, so every rebound off a still goalie goes toward -y: out of the top net, back toward the
  bottom goal line (Match Viewer: 85 of 112 bottom rebounds goalward against 55 of 138 at the top; `bmi` -> `bra` at
  file `$F71AF` evens it but also changes the top net). But rebound shots are only about 2% of shots in the captures
  and the bottom net does not lose chances after saves, so it is a small part. The main part is people's aiming: shot
  height is fixed to the screen (shotsets), so people shoot high (d-pad up-diagonals) at the top net and sideways, with
  more one-timers, at the bottom, and the goalie's left/right strengths differ by end. Match Viewer's goal-rate map
  weighted by the captures' per-end aim and shot-type mix gives 0.981 per shot in the slot and circles, against the
  league's 0.987 per shot. Pending at Match Viewer: whether the left/right effect follows the goalie's hand
  (attribute `$0800`), and one-timers by net.

Tests: `tests/readings.test.ts` (nhl94.bin, the 9 frames against their partners, and the league ROMs, EVO included).

### Organ after a pause (`organResume`)

Two hooks (`organSave`, `organRestore`), both needed for "on":

| Hook | Original | Code |
|---|---|---|
| `$7E38C` (Pausemode `$7E36C`: `btst #0,(sflags).w` after the vblank wait) | `0838 0000 BEF2` | `ORGAN_SAVE`: with interrupts off, marks `$FFF800` empty (`$FFFF`); if the pause is the player's (sfpz) and sflags9 bit 5 is clear and PlayingSong (`$FFCFD8`) is an organ song `$32`-`$55`, keeps its slot's pointer, position, wait, tempo, fraction and running status (22 bytes at `$FFF800`); then the btst |
| `$7E4BC` (after the fade back in, every way out) | `31F8 AC56 AC58` | `ORGAN_RESTORE`: if a song is kept and the driver is on (`$FFFDFC` = `$1234`), puts it back in its slot (or the first free), sending the Z80 the slot's reset and the song's controllers and program changes up to the kept place via SndPutZ80Cmd (`$B4DC`); then the `move.w (Vcount).w,(OldVcount).w` |

Driver slots: SndSeqPtr `$FFFDFE`, SndSeqPos `$FFFE1E`, SndSeqId `$FFFE3E`, SndSeqWait `$FFFE4E`, SndSeqTempo `$FFFE5E`,
SndSeqFrac `$FFFE6E`, SndSeqState `$FFFE7E`. Around checks: `$7E3A0`, `$7E4B6`, `$7E4C2`, `$B4DC` (`ORGAN_AROUND`).
NHL 94's version: `$7D0C` / `$7DC6` (`hacks.ts`), different driver.

### Applying and removing

Each in-place fix: remove = write original, apply = write hacked (`SWITCHES` loop in `applyNhl95Hacks`). Hooked fixes:
`hookedFix` remove erases the code to `$FF` and restores the bytes. Order (`NHL95_HACKS`): `secondAssist` before
`oneTimerAssist` (the one-timer fix takes over a place the second-assist fix calls from; its code then carries the
second-assist check).

### Detecting

`switchState` (around bytes, then hacked = on, original = off), `awareState` (both bytes `$6B` off, both `$6A` on),
`passFixState`, `runawayState` (all 4 hooks + edit together), `organState` (both hooks), `faceoffState`,
`stickState`, `ringState`, `psFixes().detect`, `assist.*.detect`. Anything else: unknown.

### Gotchas

- Name clash: NHL 94's `passFix` is the rocket pass fix; NHL '95's `passFix` is the pass direction fix and its rocket
  fix is `rocketFix`.
- NHL '95 has three fall-end places for the runaway fix; NHL 94 has one.
- NHL '95's speed burst already clears pfdoff (comment above `RUNAWAY_FALL_HOOKS`).
- ppPkFix: a league that set PP/PK ratings around the bug should check them (`MORE.ppPkFix`).

### Files and tests

`src/core/nhl95hacks.ts` (`assist`, `SWITCHES`, `AROUND`, `AWARE_PLACES`, `FACEOFF_*`, `STICK_*`, `RING_*`, `ROCKET_*`,
`VTOA`/`PASS_AT`, `RUNAWAY_*`, `PS_*`, `ORGAN_*`); `src/core/hacks.ts` (`assistFixes`, `PASS_CODE`, NHL 94 places);
`tests/nhl95hacks.test.ts` (assist, rocket, Aggression/comeback/open-net, blind ring, runaway/goalie pull/sniping/penalty
shot, organ, power play/faceoff/awareness/stick-shot, pass direction tests).

### Status

All tested in the game by the NHL94 Match Viewer project: the NHL 94 fixes end with `FROM_94` ("The same fix as in NHL
94; it works on the WN95HL's ROMs too. Tested in the game by the NHL94 Match Viewer project."), `passFix` and
`organResume` with `TESTED` (`Nhl95HacksPage.tsx`).

## 10. NHL '95: room and RAM map

So another editor can avoid clashing with NOSE4Web's NHL '95 features.

### ROM

| Area | Used by | Source |
|---|---|---|
| `$1E0000`-`$1E0F4B` (`NHL95_FIGHT_ROOM` `{start: $1E0000, end: $1E0F4C}`, end exclusive) | fighting patch block, fixed address | `space.ts`, `nhl95fightdata.ts`; section 5 |
| After the last non-`$FF` byte (word-aligned, 4-byte gap; `claimSpace`), else in WN95HL ROMs at the start of the last run of >= `$4000` unused bytes before their tail (`claimBeforeTail`); never over the fight block while it is all `$FF` | all hook code (`placeCode` = `claimSpace95(rom, size, keepMark=true, beforeTail=true, inPlace=true)`); the own SoundBank (`claimSpace95(next, length)`, defaults keepMark and beforeTail true; section 6) | `nhl95hacks.ts`, `nhl95music.ts`, `space.ts` |
| After the last used byte, no tail fallback (`claimSpace95(bytes, size, true, false)`); WN95HL ROMs keep their teams from `$1A7300`, retail's room is unused from `$1A72C0` | **Add roster space**: the teams moved from the first megabyte with `$4000` bytes more (`NHL95_TEAM_ROOM`), once; not for a ROM whose teams are already at or past `$100000` | `expand.ts` (`nextExpansion`, comment above `NHL95_TEAM_ROOM`) |
| After the last used byte, no tail fallback (`claimSpace95(rom, size, false, false)`); retail: at or above `$1A72C0` (the self-check's freed room) | moved logo and banner blocks | `graphics.ts` `claimPictureSpace`; `tests/nhl95banners.test.ts` |
| ROM size | a 512 KB / 1 MB ROM may double; never past 2 MB (save RAM at `$200001`) | `space.ts` `LARGEST_ROM` |
| Header `$18E` checksum, `$1A4` ROM end; `$692` self-check call NOPed | `buildRom`, `openRom` | section 4.2 |
| Hook and in-place sites | sections 5, 8, 9, 11 tables; pointers in section 7 | |

Freed room in the middle is tagged `NOSEFREE` + start address (`releaseSpace`).

### RAM

| Range | Used by | Status | Source |
|---|---|---|---|
| `$FFCC62` word / `$FFCC63` | Fighting row setting (0 Off, 1 On, 2 Arcade) | tested | `nhl95hacks.ts` fighting comment |
| `$FFE800`-`$FFE879` | fighting patch engine | tested | comment above `SHOOTOUT_MARK` |
| `$FFEA00`-`$FFEA8F` | giveaways/takeaways: `$FFEA00`-`$FFEA05` carrier's and forcer's spots and places, counts at `$FFEA10` and `$FFEA50` (the code clears 32 longs from `$FFEA10`) | tested | giveaways comment, `GT_BODY95`; section 11 |
| `$FFEB00`-`$FFEB03`, `$FFEE66`-`$FFEE69` | giveaways' team totals ("team struct +$2878 / +$287A"; the code uses `lea ($EB00).w` and `lea ($EE66).w` and clears a long at each) (inferred from the code bytes) | tested | `GT_BODY95` |
| `$FFF000`-`$FFF6CF` | season shootout: mark `$FFF000`, team structs `$FFF002`-`$FFF6CD`, ScoreSumbytes `$FFF6CE` | tested | section 8 |
| `$FFEA90`-`$FFEACF` | blocked shots: a byte a roster place, 32 a team, home first (the code clears 16 longs) | MV-tested 2026-11-20 | comment above `BLK_CODE95`; section 11 |
| `$FFEB04`-`$FFEB05`, `$FFEE6A`-`$FFEE6B` | blocked shots' team totals ("team struct +$287C"; `lea ($EB04).w` / `lea ($EE6A).w`) | MV-tested 2026-11-20 | `BLK_CODE95` |
| `$FFF700`-`$FFF73F` | knockdown counts for the injury risk: a byte a player, 32 a team (cleared each game: 64 bytes) | tested | comment above `COUNT_OF_A2_95`, `GAME_CODE95`; section 11 |
| `$FFF750`-`$FFF753` | fight momentum: the winner's team bit (byte `$FFF750`, `$00` / `$40`), the timer word `$FFF752` (game seconds left) | MV-tested 2026-11-20 | comment above `FIGHT95_WINNER_AT`; section 11 |
| `$FFF754`-`$FFF75B` | one fight a game: a bit a roster place, home `$FFF754`-`$FFF757`, visitors `$FFF758`-`$FFF75B` (cleared each game) | not yet tested | comment above `FIGHT95_ONCE_TEST_AT`; section 9 |
| `$FFF800`-`$FFF815` | organ after a pause: kept song slot (22 bytes) | tested | comment above `ORGAN_SAVE_HOOK` |
| `$FFDC84`-`$FFFC03` | the whole range Match Viewer found unused (retail and W18) that these sit in | | same comments |

NOSE4Web's NHL '95 code also reads (does not own) game RAM such as gmode `$BEF0`, gmode2 `$BF00`, sflags7 `$BF02`,
GameFlags `$BF08`, gsp `$C020`, team structs `$C288` / `$C5EE`, OptPlayMode `$CC4C`, and the sound driver's
slot arrays from SndSeqPtr `$FFFDFE` to SndSeqState `$FFFE7E` (section 9, organ).

### All of it now tested

Every RAM range above but fight momentum's and blocked shots' (section 11, added 2026-11-20) is used by an option that is now tested in the game by the NHL94 Match Viewer project:
NHL 94's settings and Any skater at any position are documented in section 11 (`Nhl95HacksPage.tsx`: every setting
outside `NOT_YET` ends with `SETTING_TESTED`). Any skater at any position uses no RAM. Clutch time (section 11,
Ratings; not yet tested in the game) only reads game RAM and writes the players' working ratings.

## 11. NHL '95: NHL 94's settings, and Any skater at any position

### What it does (for the player)

NHL 94's statistics, rules, energy, goalie and skating settings, in NHL '95. Each option's plain-words text is in
`NHL95_HACK_TEXTS` (`nhl95hacks.ts`; a function of the choices for a setting) and the longer note in
`SETTING_MORE` / `MORE` (`Nhl95HacksPage.tsx`). Page sections (`NHL95_HACK_SECTIONS`): Statistics (`bodychecks`,
`timeOnIce`, `giveaways`, `blockedShots`, `threeStars`, with the assist fixes of section 9), the rules list (`shootoutInjuries`,
`fourthPeriodOvertime`, `penaltySeconds`, `realTime`, `noIcing`, `hybridIcing`, `delayedCalls`,
`bCheckPenaltiesOff`, `injuries`, with section 8's options), Fighting (`fightSeconds`, `fightMomentum`, with section 5's), Energy and
injury risk, Goalies, Skating and the puck, and Edit Lines (`anyPosition`: "Edit Lines lists every skater for every
position, so a defenceman can play forward or a forward defence.").

### Origin and credit

- NHL 94's numbers, switches and hooks (`hacks.ts`) "where NHL '95 has the same instructions at other places: a
  research reading of the NHL95Genesis disassembly, each place's bytes the same in the original game and the WN95HL's
  ROMs (but the injuries, below)" (`nhl95hacks.ts`, comment heading "NHL 94's settings"). NHL 94's credits
  (`hacks.ts` comment above `NumberSite`): goalie hold time clockwise and smozoma; energy, the speed burst, stopping
  and turning wboy, with Tony H; the clocks Brodeur30, smozoma, kingraph and AverageRangersFan.
- The code put in is NHL 94's with NHL '95's addresses: gmode `$BEF0`, sflags7 `$BF02`, OptLine `$CC5C`, OptPlayMode
  `$CC4C`, gsp `$C020`, gameclock `$C022`, PerTimeTotal `$C026`, getpde `$7CAD0`, setpde `$7DBCA`, SetSPA `$8BC9A`,
  tmpde (a player's energy) `$34` (NHL 94's is `$32`) (same comment).
- The test's expected bytes are "the research's (port95: play95_sites, codes95, rules95_hex, nhl95_stats_hex), written
  out here, not taken from the source" (`tests/nhl95settings.test.ts` header).
- The NHL94 Match Viewer project found that the first build of `delayedCalls` changed only one of NHL '95's two tests,
  "changing only the first left the other team never called" (comment above `DELAYED_SITES95`); both are changed now.

### Values, ranges and defaults

`NO_NHL95_HACKS` holds NHL '95's own values, "read from its code"; `NHL95_HACK_RANGES` is NHL 94's `HACK_RANGES`
(`hacks.ts`) for every number. `badValue` rejects a number outside its range or not whole, and a choice not in
`NHL95_HACK_CHOICES`.

| Option | Kind | Range | NHL '95's own (`NO_NHL95_HACKS`) |
|---|---|---|---|
| `threeStars` | `'original' \| 'linesOff' \| 'linesOn'` | | `'original'` |
| `bodychecks` | `'off' \| 'on'` ("NHL '95 has no earlier bodycheck counts to keep") | | `'off'` |
| `timeOnIce`, `giveaways`, `realTime`, `noIcing`, `hybridIcing`, `delayedCalls`, `shootoutInjuries`, `stamina`, `noSkatingDrain`, `choppyIce`, `anyPosition` | on/off | | off |
| `penaltySeconds` | seconds in the box for a minor | 1-255 | 60 |
| `fightSeconds` | seconds; 0 = off | 0-2047 | 0 |
| `bCheckPenaltiesOff` | `'original' \| 'asPenaltiesOn' \| 'forum'` (`BCHECK_TEXTS`) | | `'original'` |
| `injuries` | `'original' \| 'never' \| 'penaltyOnly' \| 'period' \| 'game' \| 'longFall'` (`INJURY_TEXTS`) | | `'original'` (the WN95HL's ROMs: `'game'`, below) |
| `fourthPeriodOvertime` | seconds of overtime; 0 = off | 0-5999 | 0 |
| `energyDrain` | | 16-999 | 33 |
| `energyRecovery` | | 0-999 | 9 |
| `burstEnergy` | | 0-4096 | 204 |
| `hitEnergy`, `holdEnergy` | energy units (full = `$1000`, `energyText`) | 0-4096 | 0 |
| `injuryBonus` | NHL 94's units | 0-10 | 0 |
| `injuryCap` | NHL 94's units | 1-60 | 10 |
| `goalieHold` | frames (`holdSeconds` = frames / 60); 0 = no whistle | 0-3600 | 140 |
| `diveHold` | frames a goalie who caught the puck in a dive may hold it once up (`holdSeconds`) | 1-3600 | 5 |
| `goalieWidth` | | 0-124 | 36 |
| `goalieOut` | | 0-255 | 231 |
| `goalieLine` | | 0-255 | 170 |
| `goalieDelay` | | 1-128 | 17 |
| `speedBurst` | 0 = the original game's | 0-95 | 0 |
| `turnRate` | | 1-999 | 150 |
| `puckFriction` | | 1-12 | 7 |

The `energyDrain` minimum: "Below 16, a player's endurance bonus ... can outweigh the loss: his energy climbs past full
until a fast skater's speed wraps round to the slowest (Match Viewer, in the game ...)" (`HACK_RANGES` comment).

**The WN95HL's ROMs ship with injuries for the game**: the test "reads %s as the original game but its injuries,
which the WN95HL sets for the game" expects every W18 / W18p choice to equal `NO_NHL95_HACKS` except
`injuries: 'game'` (retail: `'original'`).

### Where it lives: how a number is kept

- `site(at, lead, negative)` (`hacks.ts`): the 16-bit word at `at`, valid only if the bytes just before it equal
  `lead` (the instruction's opcode words). A `negative` site holds minus the value (the other end of the ice).
  `numberPart(sites, original)`: every site must read the same value, else unknown.
- `switchPart(at, original, hacked)`: bytes are the original (off), the hack's (on), else unknown.
- Hooks: `hookTo` places the code (`placeCode`, section 10) then `writeHook` (`jsr` + NOPs, 4.4); `hookTarget` reads
  where a hook calls. A number inside hooked code is read from the code at a fixed offset (`valueAt`, e.g.
  `HIT_VALUE95`), and the code must then equal the code rebuilt with that number.
- `within(part, around)`: the part reads as unknown unless the listed surrounding bytes are NHL '95's.

### Where it lives: statistics

| Option | Place | Original | Hacked |
|---|---|---|---|
| `threeStars` | CalcTeamStarScores `$95C8A` (whole routine rewritten in place) | `STARS95.original` | `starsCode95(assist, shotFor, goal, check, shutout, shotsAgainst)`: `linesOff` (7000, 500, 11000, 500, 16000, 900), `linesOn` (9100, 650, 14300, 650, 20800, 1170); ends `FFFF FFFF FFFF`. The first version (to 2026-11-26) had 4000 / 4500 for a shot faced (`STARS95_EARLIER`): it reads as on, `nhl95ThreeStarsOutdated`, and is replaced at any Apply |
| `bodychecks` | FallDown's `.AddChktoPlayerStats` `$7B164` (16 bytes) | `5268 0010 4240 102B 0066 D0C0 5228 011E` | hook to `CHECK_CODE95`: the same 8 words, then `0839 0000 00FF BEF0 6604 5228 0104 4E75` (adds 1 to the checker's `+$104`, his penalty minutes, "while the clock runs") |
| | the penalty's add to PIM `$8941E` | `D532 0000` | `4E71 4E71` (around: `$8941A` `0640 0104`, `$89422` `0440 0104`) |
| | Player Stats texts `$92B01`, `$92B76` | `PIM`, `Penalty Minutes` | `Chk`, `   Checks For  ` |
| `timeOnIce` | five hooks (`TOI_HOOKS95`): col `$926F2` (12 bytes), title `$92826` (16), head `$927F4` (6), get `$92A32` (6), row `$92980` (8) | `B07C FFFF 6DF0 B07C 0004 6EEA`; `43FA 02DC 7001 D078 D276 4EB9 0007 CB38`; `4EB9 0007 C6E6`; `3400 301F B042`; `7204 4EB9 0007 D154` | each `hookedFix` to its `TOI_CODES95` code; time on ice read from player `+$138`, capped at `$176F`; the page's sort/print variables `$D276`, `$AC40`, `$AC44` |
| `giveaways` | fifteen hooks (`GT_HOOKS95`; entry offsets into the code in `GT_VERSIONS95[0].entries`): puckglue `$7BAB6` (+0), the steals `$7B9E6` and `$7C220` (+4), FallDown's `st (puckc).w` `$7B446` (+8), doshot `$84BE8` (+`$C`), StartGame's `.noso` `$9CA0` (+`$10`), DisplayStats' rows/tables `$922C2` (+`$14`) and `$922D0` (+`$18`), dopass `$84502` (+`$1C`), FallDown's stumble `bsr.w DropPuck / bra.w .hitter` `$7B142` (+`$190`), puckgoalie's `bclr #2,(sflags4).w` `$7C1BE` (`08B8 0002 BEFA`, +`$1B8`), dopass's `.notgoalie` `move.w (puckvx).w,d0 / move.w (puckvy).w,d1` `$846A0` (`3038 B38A 3238 B38C`, +`$1CE`), pucknorm's `jsr (PuckIChk).l` `$8129E` (`4EB9 0008 9ADA`, +`$2AA`, which goes on to +`$250`), a2touchpuck's `move.w (a2),(ltx).w / move.w Ypos(a2),(lty).w` `$8142C` (`31D2 BB82 31EA 0014 BB84`, +`$226`), checkgoal's `st (collflag).w / cmpi.w #$D,OldZpos(a3)` `$7BDD0` (`50F8 BBA6 0C6B 000D 0024`, +`$280`) | as in `GT_HOOKS95` | one code block: `GT_BODY95` (a jump table, then the code; its +0 `bra.w` goes to +`$28E`), then a copy of the ROM's stats table at `$9240E` (15 rows) and of `$924FC` (11 rows), each followed by the row `0010` "Give/Takeaways" `2878 287A`; the two `lea (pc)` words at code +`$182` / +`$18C` point at the copies |
| | scroll limits `$92120`, `$9212E` | `$0070`, `$0030` | `$0080`, `$0040` |

A stats table row is a length word (even, 2-40), that many bytes of label, then two offset words (`gtTable95`).
NHL '95 values the giveaway code uses: puckc `$B3C2`, lastplayer `$BAD8`, gmode `$BEF0`, gmode2 `$BF00`, sflags2
`$BEF4`, sflags3 `$BEF6`, SortCords `$AC62`, team structs `$C288` / `$C5EE`; RAM in section 10. The stumble hook is
"One more than NHL 94: NHL '95's FallDown drops the puck of a carrier who stumbles from a hit ... without the st
(puckc).w the others pass through" (comment above `GT_BODY95`).

**A pass at the net** (added 2026-11-18, tested in the game by Match Viewer on NHL_95.bin and W18.bin; as NHL 94's, section 16): a pass picked up by
the other team after it reaches the goalie or the goal line is no giveaway; picked off before then, it is one (Match
Viewer: "a pass shot has to reach the mouth or the goalie"). The cause word `$FFEA02`: `$FFFF` none, `$FFFE` a pass,
`$FFFD` / `$FFFC` a pass at the net toward the top's goal line (y `$10B`) / the bottom's (`-$10B`) (the passer kept as
carrier at `$FFEA00`), else the forcer's spot. dopass's `.notgoalie` hook (+`$1CE`) marks it when the pass is
released past the blue line (y `$56` toward the net the passer shoots at, pfgoal), 20 or more in front of the goal
line, moving toward it, and its line crosses the goal line within 40 of the middle: `$FFFD` when the puck's y is
positive, else `$FFFC` (`moveq #-3,d0 / tst.w (pucky).w / bpl.s / subq.w #1,d0 / move.w d0,cause`). Carrier and cause
go to `$FFFF` once the pass has got there:
- pucknorm's hook (+`$250`), each frame before PuckIChk: pucky `$10B` or more for `$FFFD`, `-$10B` or less for
  `$FFFC` (only the net it was aimed at; one that crossed and came back out has been seen as it crossed);
- checkgoal's hook (+`$280`): `st (collflag).w`, then the same forgetting as a2touchpuck's (+`$236`), then its own
  `cmpi.w #$D,OldZpos(a3)` (the flags kept for the `blt.w .nod` after the hook's NOPs). The puck under the crossbar
  touching a net, a post hit or the net's front, puts the puck back where it was, which can be short of the line. NHL
  '95's nets (SCnum 12 / 13, display95's object table): y `$112` / `-$112`, x 0; checkgoal's box is x within `$C` +
  the puck's x radius and y within 6 + its y radius (the puck's radius 5 both ways), so the net's front is at y `$10C`
  and the puck touches it from y `$107`, 4 short of the goal line;
- a2touchpuck's hook (+`$226`): its two moves, then, for a goalie (`tst.w position(a2)`, `$34`, 0), a `$FFFD` /
  `$FFFC` cause forgotten. a2touchpuck's callers: puckgoalie (`$7C1BE` is before its jsr), puckstick's `.stdef` (the
  puck off the goalie's stick, which does not go through puckgoalie; the `stickShots` hook there calls a2touchpuck too),
  puckbody's `.hit`, and pucknorm for the carrier;
- puckgoalie's hook (+`$1B8`, every touch, as NHL 94's and Match Viewer's): a `$FFFE` pass's carrier forgotten.

puckglue takes any cause below `$FFFF` as a pass (`cmpi.w #$FFFF,d1 / beq / tst.w d1 / bmi`, code +`$68`; NHL 94 has
`tst.w / bpl / not.w / beq / bra`, the same test). NHL 94's rule with NHL '95's lines (NHL 94: blue `$58`, goal
`$108`); the 20 and 40 as NHL 94's. NOSE4Web's earlier versions are recognised as on (`gtIn95`, `GT_VERSIONS95`;
`nhl95GiveawaysOutdated`), replaced whenever the hacks are applied with giveaways on, and the Hacks page offers "Put in
the current version" for them: 17 November 2026 (63b2559, ten hooks, puckglue testing `$FFFE` alone) and 18 November
2026 (28d6450, thirteen hooks at entries +`$1B8`, +`$1D6`, +`$226`: one mark, `$FFFD`, for either net, forgotten at
either goal line or by the puckgoalie hook alone, so not off the goalie's stick or body nor at a post), and later on
18 November 2026 (02b6053, `GT_BODY95_18B`: all fifteen hooks, the frame at +`$250`, without the stoppage parts below).

**No whistle between** (added 2026-11-18, tested in the game; as NHL 94's, section 16): from the whistle to
the end of the ref's sequence (gmpen, gmode `$BEF0` bit 2) the carrier and the cause `$FFEA00` / `$FFEA02` are
forgotten (`move.l #-1,($EA00).w`) at every pickup, which is not counted (+`$28E`: `btst #2,(gmode).w / beq.w` to
the count at +`$20`; else puckglue's two moves, the forgetting, `rts`), and each frame (+`$2AA`: the same test and
forgetting, then `bra.w` to +`$250`).

**Giveaways with time on ice**: with `giveaways` on, the Player Stats pages are one code block (`GP_CODES95`, with or
without the Time On Ice page) at the five time-on-ice hooks, entries +0 col, +4 title, +8 head, +`$C` get, +`$10`
row (`applyPages95`, `gpPages95`). Giveaways and Takeaways pages come after Penalty Minutes (or Checks For).

### Where it lives: rules

| Option | Place | Original | Hacked |
|---|---|---|---|
| `realTime` | game clock `subi.w` `$7A384` (lead `0478`), penalty clock `addi.w` `$89568` (lead `0678`), shootout clock `subi.w` `$7A3CC` (lead `0478`) | `$0AAA`, `$0018`, `$0AAA` | `$0444`, `$003C`, `$0444` (all three or unknown) |
| `penaltySeconds` | penalty95's `ext.w d2 / mulu.w #60,d2 / bset #13,d2`: the word at `$8942C` (checks `$89428` `4882 C4FC`, `$8942E` `08C2 000D`) | `$003C` (60) | the seconds |
| `fightSeconds` | `.3`'s `move.w d2,tmpdst(a2,d0.w) / andi.w #$EFFF,d2` `$89448` (8 bytes; tmpdst `$68`) | `3582 0068 0242 EFFF` | hook to `0C10 0026 6706 0C10 0028 6608 0242 3000 0042 ssss 3582 0068 0242 EFFF 4E75` (30 bytes; seconds `& $FFF` at code +`$12`; penalties `$26` and `$28` only, section 5) |
| `noIcing` | a2touchpuck's `bset #ifok,(iflags).w` `$81538` (around: `$8153E` `4E75`) | `08F8 0002 BB86` | `6004 0002 BB86` (bra.s to the rts); the forum's `6002 0002 BB86` also reads as on |
| `hybridIcing` | PuckIChk's `bset #ifcgl,(iflags).w` `$89B32` (around: `$89B38` `4E75`) | `08F8 0000 BB86` | `hookedFix` to `HYBRID_CODE95` (end-zone dots y +-`$D7`, SortCords `$AC62`, iflags `$BB86`, AddPenalty `$89140`) |
| `delayedCalls` | checkagr's two tests of the checker's team's delayed-penalty flag: sflags9 bit 2 at `$89A10`, bit 1 at `$89A1E` | `0838 0002`; `0838 0001` | `6000 001A`; `6000 000C` (each a `bra.w` to the rts at `$89A2C`). Around: `$89A14` `BF06 6600 0010`, `$89A22` `BF06 6700 0006`, `$89A28` `303C 007F 4E75`. Both or unknown |
| `bCheckPenaltiesOff` | Bcheck's `bne.w` / `beq.w .checkdir` at `$7AF3C`, `$7AF46` | `original`: `6600 0030`, `6700 0026` | `asPenaltiesOn`: `6000 0030`, `6700 0026`; `forum`: `6700 0030`, `6600 0026` |
| `shootoutInjuries` | NextShooter's `move.w 0(a0,d0.w),(BA_Skater_Offset).w` `$9DD82` | `31F0 0000 D00E` | `hookedFix` to `SHOOTOUT_INJURY_CODE95`: only with the season shootout's mark `$FFF000` set and gsp `$C020` = 3; skips a shooter whose kept team struct (`$FFF002`, tmpdst `+$68`, the visitors' `+$366` on) marks him injured for the game |
| `fourthPeriodOvertime` | ResetClock's `tst.w (OptPlayMode).w / bne.w .set` `$7D4AE` (8 bytes; around: `$7D4B6` `303C`, the `move.w #600,d0`) | `4A78 CC4C 6600 0006` | hook to `4A78 CC4C 661C 0838 0003 BF08 6708 0838 0005 D1A7 6610 0C78 0003 CC54 6608 303C ssss 5C97 4E75 4E75 4E34 bbbb` (`$2C` bytes; seconds at +`$20`; after the code `'N4'` and the row's count before, at +`$2A`) |
| | the Per. Length row's choice count: Game Setup `$85EAD`, Season Setup `$8F786`, and with fighting in, the fighting patch's copy `$1E0E73` (`OT4_FIGHT_COUNT95` = `FIGHT95_CHOICES_AT` + (`$85EAD` - `$85EAA`)) | 3 | 4 (`setPeriodChoices95`; remove writes back the count kept after the code) |

`fourthPeriodOvertime`'s code: in a regular-season game (OptPlayMode `$CC4C` = 0, not a season playoff game:
GameFlags `$BF08` bit 3 with `$D1A7` bit 5) whose `$CC54` is 3 it sets the overtime to the seconds; other lengths and
the playoffs keep theirs (comment above `OT4_HOOK95`). That `$CC54` is the Per. Length choice, the fourth being 3, is
inferred from the code and the page text.

**Injuries** (`INJURY_SITES95`, `INJURY_BYTES95`): six places, FallDown's `btst #gmclock / bne.w` `$7B48A`,
setInjuryType's three tests (`$9F078` sflags13, `$9F088` `.not0`, `$9F0A0` the game's), FallDown's
`jsr setInjuryType` `$7B49C` and `move.w #4,(InjCntDown).w` `$7B4C8`:

| Choice | `$7B48A` | `$9F078` | `$9F088` | `$9F0A0` | `$7B49C` | `$7B4C8` |
|---|---|---|---|---|---|---|
| `original` | `6600 006E` | `6600 0022` | `6600 0012` | `6700 0018` | `4EB9 0009 F012` | `31FC 0004 C016` |
| `never` | `6000 006E` | `6600 0022` | `6600 0012` | `6700 0018` | `4EB9 0009 F012` | `31FC 0004 C016` |
| `penaltyOnly` | `6600 006E` | `6600 0022` | `6600 0012` | `6700 0018` | `4E71 4E71 4E71` | `4E71 4E71 4E71` |
| `period` | `6600 006E` | `4E71 4E71` | `4E71 4E71` | `6700 0018` | `4EB9 0009 F012` | `31FC 0004 C016` |
| `game` | `6600 006E` | `6600 0022` | `6000 0012` | `6000 0018` | `4EB9 0009 F012` | `31FC 0004 C016` |
| `longFall` | `6600 006E` | `6600 0022` | `6600 0012` | `6700 0018` | `6000 005C 4E71` (bra.w .snd `$7B4FA`) | `31FC 0004 C016` |

`longFall` also rewrites SPAinjuryfall (`$7E88`) from its flags word at **`$7E98`** (50 bytes: the flags word, then
two lists of 12 words at `$7E9A` and `$7EB2`) into "a back fall that gets up after 300 ticks" (`FALL95`):

- original: `0303 00E3 0006 00E4 0006 00E5 0008 037A 0006 037B 0006 037C FFFA 00F7 0006 00F8 0006 00F9 0008 037E 0006 037F 0006 0380 FFFA`
- longFall: `0000 00E3 0006 00E4 0006 00E5 0008 00E6 012C 00E7 0008 0041 FFF8 00F7 0006 00F8 0006 00F9 0008 00FA 012C 00FB 0008 0045 FFF8`

Applying `longFall` throws if `$7E98` is not the original ("something else has already changed this ROM's injury
fall"); the six places at `longFall` with the block not changed read as unknown (test "sets the injuries six ways").

### Where it lives: energy and injury risk

| Option | Place | Original | Hacked |
|---|---|---|---|
| `stamina` | setpde's store `$7DBD2` | `3580` | `6002` |
| `energyDrain` | `.sube`'s drain each 128 frames on the ice: word at `$8C1C2` (lead `0440`, subi.w) | 33 | the number |
| `energyRecovery` | the bench's `addi.w`: word at `$7DB62` (lead `0672`) | 9 | the number |
| `noSkatingDrain` | `.sube`'s `tst.w OptLine / bne.w` at `$8C1A8` | `6600` | `6000` |
| `burstEnergy` | burst's `subi.w`: word at `$AA96` (lead `0440`) | 204 | the number |
| `hitEnergy` | FallDown's `.cont2` `tst.w position(a3) / beq.w .chkpos` `$7B14A` (8 bytes) | `4A6B 0034 6700 0034` | hook to `hitCode95(amount)`, or `countingHitCode95(amount)` when `injuryBonus` > 0 (it then also counts the knockdown); the code calls getpde `$7CAD0`, `subi.w #amount`, setpde `$7DBCA`, and returns to `.chkpos` `$7B184` for a goalie hitter |
| `holdEnergy` | holdcheck's `move.w #SPAflail,d1 / jsr SetSPA` `$7B02C` (10 bytes) | `323C 1F68 4EB9 0008 BC9A` | hook to `holdCode95(amount)`, ending `323C 1F68 4EF9 0008 BC9A` |
| `injuryBonus` / `injuryCap` | the roll: FallDown's `cmp.w impact(a2),d0 / bgt.w .snd` `$7B47C` (8 bytes) | `B06A 0032 6E00 0078` | hook to `rollCode95(bonus, cap)` |
| | each game: StartGame's `jsr clearTeamStats` `$9C34` | `4EB9 0000 AE48` | hook to `48E7 8080 41F8 F700 703F 4218 51C8 FFFC 4CDF 0101 4EF9 0000 AE48` (clears 64 bytes at `$FFF700`) |
| | each intermission: PeriodOver's `addq.w #1,(gsp).w / bchg #1,(gmode).w` `$8CB64` (10 bytes) | `5278 C020 0878 0001 BEF0` | hook to `PERIOD_CODE95` (halves each of the 64 counts, then the original two instructions) |

The hit and hold codes take no energy when gmode `$BEF0` bit 0 is set (the clock stopped, inferred from the
bodychecks comment "while the clock runs" on the same test), when OptLine `$CC5C` is non-zero, or when sflags7 bit 4
is set (`CLOCK95`, `ENERGY_TESTS95`).

**Injury risk, scaled x 2.5**: the count of a player's knockdowns is a byte at `$FFF700` + his number (`+$66`), +32
for the team whose player has bit 6 of `+$62` set (`COUNT_OF_A2_95`); the knockdown hook adds 1 (held at 255). The
roll code computes `min(count x bonus, cap)`, then `mulu.w #5,d2 / addq.w #1,d2 / lsr.w #1,d2` (x 2.5, rounded), adds
it to the hit's impact and compares as the original. "NHL '95 rolls 0 to 399 against the impact where NHL 94 rolls 0 to
159, so a bonus and a cap mean what they do in NHL 94: the code adds them x 2.5 ... the same extra chance (bonus /
160) a knockdown" (comment above `COUNT_OF_A2_95`). So the numbers you store are NHL 94's; the test "scales the
injury risk to NHL 95's roll of 0 to 399, and reads NHL 94's numbers back" checks bonus/cap pairs (1,1), (5,25),
(7,33), (10,60) and that `(min(count x bonus, cap) x 5 + 1) >> 1` over 400 is within half an impact of NHL 94's
`min(...)` over 160. The page's chance is `impact / 160 x 100` in 100 (`chance`).

### Where it lives: goalies

| Option | Place | Notes |
|---|---|---|
| `goalieHold` | the hold count's start: word at `$7BB46` (lead `357C`); 0 = no whistle: assgoaliectrl's count down at `$830FA` `9F6B` -> `6002` | stored as frames; 0 is never written to `$7BB46` (`frames === 0` reads unknown). The computer goalie's count (`$7FF5C`) is left as in NHL 94 |
| `diveHold` | puckglue's `move.w #5,temp5(a2)` after `cmpi.w #SPAgdive` (`$1D4E`): word at `$7BB56` (lead `357C` at `$7BB54`) | stored as frames; every goalie (assgoaliectrl and the computer's count both read it); with `goalieHold` 0 a person's goalie has no count at all, so only the computer's is whistled. Not yet tested in the game |
| `goalieWidth` | `$8B8EA` (lead `0C53`) and `$8B908` (lead `0C53`, negative) | the box a goalie a person controls keeps to without the puck |
| `goalieOut` | `$8B922` (lead `0C6B`) and `$8B92C` (lead `0C6B`, negative) | |
| `goalieLine` | `$8301E` (lead `B27C`) and `$83026` (lead `B27C`, negative) | the line he is whistled past |
| `goalieDelay` | the B-hold count's start (bholdtimer `$FFBB04`, pads 3 and 4 `$FFBB06`): both bytes of the words at `$A1E4`, `$A1EA` (after `31FC`, move.w #$1111) and the bytes at `$83F07`, `$83F11`, `$84115`, `$8411F`, `$84143`, `$8416B` (after `11FC 00`, move.b #$11) | all ten bytes equal, 1-`$80`; original `$11` (17) |

### Where it lives: skating and the puck

| Option | Place | Original | Hacked |
|---|---|---|---|
| `speedBurst` | burst's `lsr.w #7,d0` `$AAAC` | `EE48` | `70nn` (`moveq #n,d0`); 0 = original |
| `turnRate` | words at `$8BB28` (lead `066B`), `$8BB36` (`046B`), `$8BB50` (`066B`), `$8BB5E` (`046B`) | 150 | the number at all four |
| `puckFriction` | `move.w #7,d2` at `$8BBC6`: word at `$8BBC8` (lead `343C`) | 7 | 1-12 |
| `choppyIce` | updateplayers' 76 bytes from the X slowing `$8BBCA` | `CHOPPY_HOOK95.original` | `hookedFix` to `CHOPPY_CODE95`, which returns past them to `$8BC16` |

`puckFriction`: "NHL '95 gives the puck its own ... (1/128 of its speed a frame), where NHL 94's moveq #9,d2 is shared
with every gliding skater; NHL '95's gliders keep their own moveq #9 (`$8BBBA`). So this changes the puck alone"
(comment above `FRICTION_SITE95`; the test checks `$8BBBA` stays `7409`).

### Where it lives: Any skater at any position (`anyPosition`)

| Place | Original | Hacked | Around |
|---|---|---|---|
| SelectLinePlayer (`$952F8`), Edit Lines' list for a slot: `bgt.w .n / add.w d0,d1` at `$95312` | `6E00 000C D240` | `4E71 4E71 4E71` | `$9530A` `0242 0007 B47C 0002` (andi.w #7,d2 / cmp.w #2,d2); `$95318` `4EB9 0008 38F2` (jsr GetPlayerCount) |

The original lists only forwards for a forward slot and only defencemen for a defence one, as NHL 94's (`$83A4`).
"NHL '95 saves a line's raw player bytes (SaveTeamLines $95A90), so unlike NHL 94 nothing else is needed: a defenceman
saved at forward loads as himself" (comment above `SWITCHES.anyPosition`): **no save hooks**. The test changes exactly
6 bytes. `anyPosition(project)` (`src/core/anyposition.ts`) tells the team page's lines that any skater may go
anywhere.

### Applying and removing

`applyNhl95Hacks` (4.7): every setting has a step after section 9's (`settingStep`: the part's `remove`, then its
`apply` with the wanted value), in the order of `NHL95_HACKS`: `threeStars`, `bodychecks`, `realTime`,
`penaltySeconds`, `fightSeconds`, `noIcing`, `hybridIcing`, `delayedCalls`, `bCheckPenaltiesOff`, `injuries`,
`shootoutInjuries`, `fourthPeriodOvertime` (after fighting, "whose copy of the Game Setup choices it sets too"), the
energy numbers, `hitEnergy` with `injuryBonus` (one hook does both; `injuryCap` has no step of its own), `holdEnergy`,
the goalie and skating numbers, `choppyIce`, `giveaways`, then `timeOnIce` (with giveaways on, `applyPages95` puts in
the shared pages). `anyPosition` is in the in-place switch loop with section 9's. An apply with the original value
writes nothing (`value && ...`, `value > 0 && ...`).

### Detecting

`detectNhl95Hacks`: each setting's `detect`; `undefined` means unknown. Special cases:

- `hitEnergy` / `injuryBonus` / `injuryCap`: the knockdown hook must count exactly when the injury risk is in
  (`hit.counting === risk.bonus > 0`), else both injury numbers read unknown. With all three risk hooks original:
  bonus 0, cap 10. So with a bonus of 0 no cap is written: the Hacks page turns the cap's box off while the bonus is 0
  ("Set the risk above first.") and sets the cap back to 10 when the bonus goes to 0.
- `goalieHold`: frames 0 at `$7BB46` reads unknown; `$830FA` hacked reads 0.
- `giveaways`: the counting code with both scroll limits hacked = on; the pages without the counting code = unknown
  (and then `timeOnIce` too).
- `injuries`: the six places must all match one choice's row; `longFall` also needs its block at `$7E98`.

### Interactions

- Fighting: `fourthPeriodOvertime` sets the patch's copy `$1E0E73`; `fightSeconds` hooks penalty code the patch's
  fights pass through (section 5).
- `shootoutInjuries` reads the season shootout's kept structs (`$FFF000`-`$FFF6CF`, section 8); it does nothing
  without a season shootout.
- `threeStars` scores checks from player `+$11E`, "which NHL '95 counts itself (the bodycheck counts below keep them
  so)"; `bodychecks` puts them in Player Stats in place of PIM.
- `giveaways` and `timeOnIce` share the five Player Stats hooks when both are on.
- RAM: giveaways `$FFEA00`-`$FFEA8F` (and the team totals), injury counts `$FFF700`-`$FFF73F` (section 10).

### Gotchas

- `delayedCalls` needs **both** `$89A10` and `$89A1E`; NHL 94 has one test. One changed reads as unknown.
- A WN95HL ROM reads `injuries: 'game'`; "off" for injuries is `'original'`, which differs from that ROM's bytes.
- Store NHL 94's injury numbers; the code does the x 2.5. Don't pre-scale them.
- Goalie width, out and line each have a negative site; write both or the value reads unknown.
- `puckFriction` in NHL '95 is the puck's alone; NHL 94's moves gliders too.
- `goalieDelay` is ten bytes in eight places; write all of them.

### Files and tests

`src/core/nhl95hacks.ts` (section "NHL 94's settings" to `timeOnIce95`, `SETTINGS95`, `detectNhl95Hacks`,
`applyNhl95Hacks`, `NHL95_HACK_TEXTS`, `NO_NHL95_HACKS`, `NHL95_HACK_RANGES`, `SWITCHES.anyPosition`);
`src/core/hacks.ts` (`HACK_RANGES`, `site`, `readSite`, `writeSite`, `numberPart`, `switchPart`, `BCHECK_TEXTS`,
`INJURY_TEXTS`, `holdSeconds`); `src/core/anyposition.ts`; `src/Nhl95HacksPage.tsx` (`SETTING_MORE`, `MORE`,
`NOT_YET`); `tests/nhl95settings.test.ts` (in-place settings, injuries six ways, hooked rules, energy for hits and
holds, injury risk scaling, bodychecks and time on ice, giveaways with and without time on ice, the extra period
length with fighting, every setting at once, the page shows each as tested); `tests/nhl95hacks.test.ts` ("lets Edit
Lines in %s put any skater at any position, a change in place").

### Ratings (added 2026-11-18, not yet tested in the game)

NHL 94 Genesis's Ratings group (`GENESIS_HACK_GROUPS`, `hackgroups.ts`) is `wideRatings`, `baseWeight`, `bonuses`,
`hotColdRange` and `clutchTime`. Three are ported; they sit in NHL '95's Ratings section after section 9's four
rating fixes, and are last in `NHL95_HACKS` (applied after `timeOnIce`).

| Option | Kind | Range | NHL '95's own |
|---|---|---|---|
| `baseWeight` | pounds a weight of 0 stands for | even, 102-152 (`WEIGHT_BASES`; not in `NHL95_HACK_RANGES`, `Nhl95NumberHack` leaves it out, `nhl95BadValue` checks it) | 140 |
| `hotColdRange` | | 0-9 (NHL 94's) | 9 |
| `clutchTime` | on/off | | off |

| Option | Place | Original | Hacked |
|---|---|---|---|
| `baseWeight` | the roster screen's AttribWeight `asl.w #3,d0 / addi.w #140,d0`: word at `$8566C` (lead `0640`); Create Player's FieldWeight: word at `$99450` (lead `0640`) | `$008C` both | the base at both (both or unknown; an odd or out-of-range value reads unknown) |
| `hotColdRange` | Create_HotCold_Table `$83E88`'s `move.w #9,d0` before randomd0s: word at `$83E92` (lead `303C`) | 9 | the number |
| `clutchTime` | AttributeCalc's end `$83D34` (10 bytes) | `0243 00FF 4CDF 0207 4E75` | `jmp` (`4EF9`) to `CLUTCH_CALC_CODE95` + 2 NOPs: `0243 00FF 0C78 000F BB12 672C 0C78 0002 C020 6624 0C78 0078 C022 621C 3038 C294 9078 C5FA 6A02 4440 0C40 0001 620A 5643 0C43 001E 6302 761E 4CDF 0207 4E75` |
| | VBlank's clock tick `subq.w #1,(gameclock).w / cmpi.w #61,(gameclock).w` `$7A392` (10 bytes; VBlank saves every register) | `5378 C022 0C78 003D C022` | `jsr` + 2 NOPs to `CLUTCH_TICK_CODE95` (NHL 94's tick code with SortCords `$AC62`, gsp `$C020`, gameclock `$C022`, scores `$C294` / `$C5FA`; the nine rating offsets `$68 $69 $6C $6D $6E $70 $71 $72 $75` are NHL 94's, as `equals.inc` has them) |

- **The base weight is only what the screens show**, as in NHL 94 (`$8E92`): setplayer stores the step x 8 in
  `weight(a3)`, and the collisions add their own 140 (`$7ACE4`, `0640 008C` / `0641 008C`), left alone. NHL '95 has
  no product-code marks (smozROM's are NHL 94's), so `findGame` (`games.ts`) reads the base from `NHL95_WEIGHT_AT`
  (`$8566C`, after `0640`) for both NHL '95 product codes: a base other than 140 gives a variant (`nhl95Variant`,
  cached by product code + base) titled "NHL '95, base weight 144" (or "NHL '95 (34 teams), base weight 144"), the
  same product code and edition, every `'weight'` kind `weightKind(base)`. `applyNhl95Hacks` returns the project with
  `findGame`'s game, and where the base changes restates every weight with `convertWeight` (teams, free agents and the
  season baseline), as `applyHacks` does for NHL 94: the nearest step, up to 4 pounds out. `nhl95WithHacksOf`
  (used by `App.tsx`'s `withAnyHacksOf`) brings the ROM as opened to the work's base weight, as `withHacksOf` does
  for NHL 94, so Reset and comparisons see the same scale. The CSV tables and the website players file write the
  stored steps, as for NHL 94's variants. The page offers NHL 94's "for the season of" year (`baseWeightForYear`).
- **Hot and cold** are NHL 94's: 16 values a player at team struct `+$1A4` (NHL 94 `+$1A2`); AttributeCalc
  (`$83CDE`) adds the first / 3 (signed) to the rating x 5, so 2 or less changes nothing in play. 0 makes every value
  0, which is NHL 94's "no bonuses" in effect.
- **Clutch time** is NHL 94's (section on `clutchTime` in `hacks.ts`). Aggression is attribute `$F` in TempWord2
  `$BB12`. NHL '95's setplayer runs BoostAttribute (`d3 += (30 - d3) / 4`) after AttributeCalc on speed, shot power,
  checking, stick handling and passing, so on those the +3 at a rebuild comes out about +2, while the 2:00 tick adds
  +3 to the stored values.

Not ported:
- `wideRatings` (0 to 15 ratings): smozROM's code replaces NHL 94's overall routine (`$FA9F8`) and formulas whole.
  NHL '95's CalcAttrib / CalcAttribRating (middle95) is a different routine shared with Create Player (its points and
  0-99 scale; a single rating is shown as rating x 18 plus a bonus, clamped at 99), and stick handling is already
  stored 0-15 and folded to 0-6 by StickHandTable in setplayer and CalcAttribRating. Porting would mean new code for
  those screens, setplayer and Create Player, not NHL 94's.
- `bonuses` (hot and cold shown and played): NHL 94's choices change instructions inside NHL 94's routine. NHL '95
  shows the per-attribute values differently (on a single rating through Create Player's path, which also nudges the
  stored value and CreatePoints when it clamps; on the overall as the average of the attributes' values), so none of
  NHL 94's edits apply. "No bonuses" in play is `hotColdRange` 0.
- smozoma's legacy weight fix (`weightFix`) and the weight bug and C-then-B fix (`checkFix`) are not in NHL 94's
  Ratings group (Fixes, and the legacy list), so they are not part of this port; neither is offered for NHL '95.

Tests (`tests/nhl95settings.test.ts`): `IN_PLACE` has the hot and cold range (4, 0) and base weight (144, 102)
bytes; "puts clutch time into %s" (the jmp and its code, the tick hook's code, out byte for byte, one part alone
unknown); "sets the base weight in %s" (the variant's title, kinds, product code, each player within 4 pounds, a
rebuilt ROM reopened as the same game, the website file's steps, back to 140 gives `NHL95` and the original bytes,
`nhl95WithHacksOf`, a project file, odd and out-of-range bases rejected, the two places disagreeing unknown); every
setting at once includes `baseWeight: 152` and `hotColdRange: 4`, and `clutchTime` with the switches; the page test
expects the three to end with the not-yet-tested line.

### Status

All tested in the game by the NHL94 Match Viewer project, the three Ratings options too (2026-11-18, on NHL_95.bin and
W18.bin: clutch +3 at the 2:00 tick on all 12 players, awareness only at a rebuild (the calc skips only Aggression; the
tick skips awareness too, as NHL 94's), about +2 on NHL '95's five re-boosted ratings at a rebuild; hot/cold range 4
gives -4..3 and 0 all zeros; base weight 144 shows +4 lb, plays frame for frame as the original). The clock hook and
the AttributeCalc jump shift play slightly (NHL '95 steps by vertical blanks since its last step), with no slowdown.
`NOT_YET` in `Nhl95HacksPage.tsx` holds the options not yet played (`referees`, `fightMomentum`, `blockedShots` as
of 2026-11-20); a new option not yet played goes there, and in the test's `notYet` list. Every other setting ends with `SETTING_TESTED` ("The same option as in NHL 94; it works on the WN95HL's ROMs too. Tested in the game by the
NHL94 Match Viewer project."), and `anyPosition`'s note ends with it too. The test "shows every option ... each
setting's note ending as tested" checks it. `delayedCalls` with both places: "Match Viewer's retest passed" (commit
aebaeb9).

### Fight momentum and blocked shots (`fightMomentum`, `blockedShots`; added 2026-11-20; both tested in the game by MV 2026-11-20, with the heading fix f07eab7)

NHL 94's two options (section 9's fight momentum, section 17's blocked shots) in NHL '95, the same bytes in
NHL_95, W18 and W18p (tests `tests/nhl95momentum.test.ts`, `tests/nhl95blocks.test.ts` assert the hook sites, every
byte of the code and each branch target). Texts: "The team whose player wins a fight gets +2 Agility and +2 Speed for
its skaters for 90 seconds of play." and "Each skater's blocked shots (shots by the other team that hit his body) are
counted and shown on a Player Stats page of their own, and Game Stats shows each team's as Blocked Shots" (the last
part only with giveaways off).

**Fight momentum** (`momentumCode95`, `$9A` bytes; needs `fighting`: `applyNhl95Hacks` refuses it without, and the
page turns it off with fighting):

| Place | Original | Hooked | Code entry |
|---|---|---|---|
| playeracc's agility: `add.b legstr(a3),d2 / asr.w #1,d2` `$8C0C2` (around `$8C0BE` `0642 0060`, `$8C0C8` `C1C2 C3C2`) | `D42B 0068 E242` | jsr | +`$34`: the same, `addq.b #2,d2` before the asr when boosted |
| playeracc's speed: `clr.w d2 / move.b legspd(a3),d2` `$8C120` (around `$8C11C` `303C 1000`, `$8C126` `31C2 BB14 E24A`) | `4242 142B 0069` | jsr | +`$44`: the same, +2 when boosted, at most `$1F` |
| updatepentime's `jsr updatePPTeamTime` `$89578` (around `$8956C`, `$8957E`) | `4EB9 0008 ABB4` | jsr +`$5E` | count `$FFF752` down, `jmp` the original target |
| StartGame's `clr.w (gsp).w / clr.w (ChkCnt).w` `$9CA8` | `4278 C020 4278 C028` | jsr + nop | +`$6E`: the same, then clears `$FFF750` / `$FFF752` |
| the fight engine's knockout `move.w #$FFFF,$44(a3)` `$1E0980` (a3 the winner, just after it marks him Fighting * in the penalty list) | `377C FFFF 0044` | jsr | +`$80`: team bit to `$FFF750`, 90 to `$FFF752`, the move |

The test at +0 (Z set = boosted): timer not 0, the clock running (gmode `$BEF0` bit 0 clear), not a goalie (`$34`),
pflags `$62` bit 6 = the stored bit. NHL '95's playeracc has no crowd boost (NHL 94 adds 2 to both where its
crowd meter is full; '95 took it out), so the +2 goes where the ratings are read. Speed: the MaxSpeed index is
`(speed >> 1) x 4 & $3F`, so 32 would wrap to the slowest; 30 and 31 are the same step, so the cap of 31 slows no one.
updatepentime returns before the jsr while the clock is stopped, so the 90 are game-clock seconds (`$18` frames each
in the original; `realTime` changes that). Detecting: the momentum code at the tick's jsr target (with the target it
jumps on to) and all five places to it: on; the five places original and no code: off; else unknown.

**Blocked shots** (`BLK_CODE95`, `$CE` bytes and the two tables; needs `bodyBlockFix`: in retail NHL '95 the body test
never reaches puckbody, so nothing could be counted; `applyNhl95Hacks` refuses it without, and the page turns it off
with the fix):

| Place | Original | Code entry |
|---|---|---|
| puckbody's `btst #pf3onetimer,pflags3(a2)` `$7BCA8` | `082A 0003 0064` | +0 (`bra.w` +`$10`): the count, the btst's flags returned |
| StartGame's `.noso` `jsr restoreteams` `$9CB0` | `4EB9 0008 3D3E` | +4: clear, `jmp $83D3E` |
| DisplayStats' tables `$922C2`, `$922D0` (giveaways' places 6, 7), scroll limits `$92120` / `$9212E` `$70`/`$30` -> `$80`/`$40` | as giveaways' | +8, +`$C`: copies of the ROM's tables with the row `0010` "Blocked Shots " `287C FFFF`; only with giveaways off |

The count: the hit as puckbody's `.hit` takes it (Zpos `$18` above 8, or d0's low four bits 0), sf2shot (sflags2
`$BEF4` bit 4) set, not gmhl (gmode bit 4), not a shootout (gmode2 `$BF00` bit 0), a2 not a goalie, the shooter
(shotplayer `$BAD6`, spots 0-11, struct `$AC62 + spot << 7`) on the other team; then the team total (`$FFEB04` home,
`$FFEE6A` visitors) and the skater's byte (`$FFEA90 + pnum`, visitors +`$20`, to 255). Player Stats: `GP_CODES95` now
has six blocks (`gv`, `blk`, `toi`): the four with the Blocked Shots page are NHL 94's `GP_CODES` translated with the
same address map that turns NHL 94's two giveaway-only blocks into NHL '95's byte for byte (`$954C` -> `$926E8`,
`$D5AC` -> `$D276`, `$B028` / `$B02C` -> `$AC40` / `$AC44`, the print and sort routines, TOI `+$136` -> `+$138`,
`$E810` -> `$EA10`, `$E890` -> `$EA90`, `$C6CE` -> `$C288`). Pages: Giveaways and Takeaways (if on), Blocked Shots
(BLK), Time On Ice (if on). Detecting as NHL 94's (`blkIn95`, `blockedShots95`); giveaways' detection accepts its
Game Stats places holding the blocks' row.

For Match Viewer: the boost only while the clock runs and only for the winner's skaters; the timer down one a game
second and carrying over an intermission; a second fight handing it on. A block: a skater's body stopping the other
team's shot in flight (not a goalie, not a stick, not his own team's shot); the Player Stats page and the Game Stats
row (giveaways off). As in NHL 94, a low puck whose distance squared has low bits set does not reach `.hit` (no
bounce, no block), and a high fast puck that knocks a skater down counts.

## 12. NHL 94 Genesis: game music (title, end of period, scouting report)

### What it does (for the player)

The Organ songs page's Game music section (`GameMusicSection`, `OrganSongsSection.tsx`) lists NHL 94's three pieces
besides the organ. **Play** is "a rough idea of a piece in the browser, without its drums"; **Export MIDI** saves each
part on its own channel and the drums on the drum channel; **Replace** puts in a MIDI file: "you choose a game
instrument for each of its parts (up to six), its drums play as the game's kick and hit, at most five notes sound at
once, and the piece plays again from the start when it ends ...; a file much louder than the game's music is played
more quietly"; **Put back the original**.

### Origin and credit

The sound driver is `src/sound/sound94.asm` of the Genesis disassembly (`genesismusic.ts` header); the three pieces
are ram94.asm's SngTitle, SngEOP, SngScouting. Match Viewer's play of the first test ROMs gave the end's rest, the
loudness limit, the octave patches and the instrument names (commits a9d8bc6, 553371b; comments on `OCTAVE_BELOW`,
`TYPICAL_VELOCITY`, `GAME_INSTRUMENTS`).

### Where it lives

**SoundStreamTable**: found by `soundTable`: the instruction pair `E540 41F9 aaaaaaaa` (`asl.w #2,d0 / lea
(SoundStreamTable).l,a0`) whose table of `$7B` longs (sounds 0 to `$7A`) are all non-zero, even and inside the ROM.
Songs are `$30`-`$7A`; the organ songs end at `$77` (`LAST_TEAM_SONG`).

| Number | `GAME_MUSIC` name | Where it plays | Length (test) |
|---|---|---|---|
| `$78` | Title music | The title screen and the main menu | 73 s |
| `$79` | End of period music | Between periods, the pause menu and the playoff screens | 78 s |
| `$7A` | Scouting report music | The scouting report | 88 s |

**Stream** (`genesismusic.ts` header, `readSong`): 4-byte events: wait in frames (60/s), status (MIDI-like: `$8x` note
off, `$9x` note on (note, volume; 0 = off), `$Bx` controller (only 7, volume, is read), `$Cx` program, `$Ex` pitch bend;
`$Ax`, `$Dx`, `$Fx` skipped), two data bytes. Status 0 ends the stream; its data word, if below `$8000`, starts a long
loop pointer (`loops`). The three pieces loop (test). Notes are MIDI numbers (60 = middle C, up to 95). The pieces play
on five FM voices shared with the sound effects (header).

In the original pieces (comment above `GAME_MUSIC`; test "reads the title, end of period and scouting report music"):
a channel playing one note throughout on an FM patch is a drum, the kick (patch 20, note 21, channel 6); a sampled
patch (`>= $60`, `isSampled`) is the hit (`$6A`, channel 7).

**Game instruments** (`GAME_INSTRUMENTS`, named as Match Viewer heard them) and their MIDI export programs
(`EXPORT_PROGRAM`, General MIDI program numbers counted from 0):

| Patch | Name | Exported as |
|---|---|---|
| 13 | Bass (plucked) | 38 |
| 14 | Round synth lead, like a whistle (the loudest) | 79 |
| 10 | Synth brass | 62 |
| 4 | Soft pad, like strings | 89 |
| 9 | Warm organ pad | 19 |
| 1 | Clavinet, like an electric piano | 7 |
| 3 | Mellow flute lead | 73 |
| 5 | Buzzy sawtooth lead | 81 |
| 11 (`ORGAN`) | Organ (the organ songs) | 16 |

`patchForProgram(program)`: an exact `EXPORT_PROGRAM` match first, else by family: 32-39 -> 13; 56-63 -> 10; 78-80,
82-87 -> 14; 81 -> 5; 64-77 -> 3; 40-55, 88-95 -> 4; 16 -> organ, 17-23 -> 9; 0-15, 24-31 -> 1; else none.

**Octaves**: patches 5, 13 and 14 "sound an octave below the note written for them (Match Viewer measured each
alone)" (`OCTAVE_BELOW`): export and preview give their notes 12 lower; import writes them 12 higher.

### Export (`gameMusicToMidi`) and preview (`gameMusicTune`)

`channelParts` classifies each channel: patch `NOISE_HAT` (`$7F`, NHL '95's noise, section 13) -> closed hi-hat 42;
sampled or channel 9 -> snare 38; one pitch only -> kick 36; else a tune on `EXPORT_PROGRAM[patch]` (or synth bass 38 /
synth brass 62 by average pitch below 50) with -12 for `OCTAVE_BELOW`. NHL '95's pieces (`edition` 95) are classified
otherwise: see section 13. The MIDI file: format 0, division 60, tempo
1,000,000 microseconds a beat (a tick a frame), tunes on their own channels (channel 9 skipped), drums on channel 9,
velocities as they are ("The pieces' velocities are MIDI's already (the organ songs' are a third of it)"), volume
controllers kept for tunes, a note starting and ending in one frame left out, the track ending at `song.seconds` so
the last rest is kept. `gameMusicTune` drops drum channels and applies the octave shift.

### Replacing from MIDI

1. `readMidi` (format 0 or 1) gives the notes, the track name, `end` (the file's last event, so a final rest counts) and
   each channel's program (`programs`). Events are taken in time order as the file has them; a new note on a key
   already sounding ends the one before (whose own off then ends nothing), and a note whose on and off are at one tick
   is a note of length 0 of its own (a tune's is left out later; a drum's is a hit).
2. `musicParts` lists channels with note count, lowest, highest and average. `defaultPartChoices(parts, programs)`:
   channel 9 = `'drums'`; a channel with a program goes on `patchForProgram`; of the rest, the lowest goes on the bass
   (13) if its average is below 55, there is more than one and the bass is free; the others from the highest down get
   the unused patches in `GAME_INSTRUMENTS` order (not bass or organ); past six tunes (`GAME_MUSIC_PARTS`) `'out'`.
   The page lets the user change each choice.
3. `gameMusicFromMidi(notes, choices, end)`:
   - at most 6 tune parts (else `MidiError`), at least one; each on game channel 0-5 in order, a program change at
     frame 0;
   - drums: MIDI notes 35 and 36 -> the kick, note 21 on channel 6 (patch 20); other drums -> the hit, note 76 on channel
     7 (patch `$6A`), both at most 12 frames; the two program changes added only if a drum sounds; a hit still sounding
     is ended at the next hit's frame, as the driver ignores a key-on while the PCM channel is on with the same patch
     (`sound94.asm` `handle_command_10` `.pcm`: `ble rtscmd10`), so hits closer than 12 frames all play;
   - each part moved by whole octaves (+12 first for 5/13/14), down while its highest is above 95 and its lowest stays
     at least 12, up while its lowest is below 12 and its highest stays at most 95; only a part too wide has single
     notes folded into 12-95 (`LOWEST`, `HIGHEST`); `moved` counts notes not where written;
     why 95: NHL 94's driver (`UpdateChannelFrequencyAndVolume` in the Genesis disassembly's `sound94.asm`) takes the
     octave as note / 12 and shifts it into bits 13-11 of the frequency word, so from note 96 (octave 8) it spills
     out and the YM2612 block is 0: the original scouting music's 96-98 play at about 25-28 Hz, a rumble (measured in
     the game by the NHL94 Match Viewer project);
   - a note is at least 2 frames; the same note on the same channel ends the one sounding;
   - at most 5 FM notes at once (`FM_VOICES`; the hit, a sample, is not counted): rank kick 3 > bass 2 > others 1; when
     full, the weakest held (lowest rank, then lowest note) is cut for a stronger note, and a note no stronger is left out
     (`dropped`);
   - loudness: if the median velocity of the kept notes is over 60 (`LOUD_VELOCITY`), every velocity is scaled by
     44 / median (`TYPICAL_VELOCITY`; "Match Viewer heard Brass Bonanza at 96 to 111 do so [clip]"); `quieter` says so;
   - offs before ons at the same frame; a rest at the file's end becomes a final event with **status `$FF`** (data `FF FF`,
     which the driver skips) at the end frame.
4. `withSong(rom, number, events, name)`: `songBytes` with a loop; a piece NOSE4Web made that it replaces gives its
   room back first (`releaseSpace`); then `claimSpace(rom, size + 1)` (NHL 94's free room, 4.5), even address (room
   at an odd address starts on NOSE's end mark: its first byte, which the song does not cover, is set to `$FF`), table
   entry repointed.

**Stream written** (`songBytes`, the looping custom form):

| Part | Bytes |
|---|---|
| first event | `14 FF FF FF` (a 20-frame wait, status `$FF`, as the game's songs start) |
| events | `wait status d0 d1`; a wait over 255 is split with `FF FF FF FF` events |
| end (game music) | `00 00` then the 4-byte loop address = **its own start + 4** (just after the first event): "the end's data and the next word are the address" |
| end (organ song) | `00 00 FF FF` (no loop) |
| mark | `N4W1` (`4E 34 57 31`), the 4-byte address of the song it replaced, the name (at most 40 characters, non-ASCII as `?`), `00`, a pad byte to even |

`readSong` finds the mark at end + 6 for a looping piece (end + 4 otherwise) and returns `custom: {name, replaced}`.

### Applying and removing

`withOriginalSong(rom, number)` points the table entry back at `custom.replaced` and gives the new stream's room back
(`releaseSpace`: filled with `$FF`, NOSE's end mark moved back; room between other things is tagged `NOSEFREE`), with
the unused byte or two between it and a NOSE4Web song that follows it, so that replacing and putting back leaves the
ROM as it was (test "gives back the room of a song it replaces"). A stream another table entry also points at is left.
Replacing a replaced piece keeps the first `replaced` address, and goes where the old one was. The same holds for the
organ songs (same functions) and for `withSongBytes`. Song `$30` (song 1) is replaced without moving its table entry, which stop_current_song uses to tell songs from sounds: its stream's first 6 bytes become `00 00` + the new song's address (an end event with a loop pointer, followed at once), and the 6 bytes as they were follow the new song's name, for putting it back (MV-confirmed 2026-11-27: start, stop, change, pause with and without organ resume, no other route to $30); game music is allowed by
`isGameMusic`.

**Project files**: `savedSongs` (`projectfile.ts`) saves `customSongBytes` for the organ songs and, for NHL 94 (not
NHL '95), the three `GAME_MUSIC` numbers; `withSongBytes` accepts only bytes with the `N4W1` mark, writes this ROM's
own `replaced`, and repoints the loop to the new start + 4. `withSavedSongs` skips a song the ROM already has,
comparing with the loop address set to 0 (`songBytesWithoutLoop`), so the same piece at another address is not put in
again; a piece that cannot go in has a note of its own ("pieces of game music"). **Compare** (`compare.ts`): a "Game music" group lists each
piece whose events changed (`"<name>", from a MIDI file` or "the game's own again"), NHL 94 Genesis only.

### Detecting

`genesisSongsSupported` = the table is found. A piece is NOSE4Web's when the mark follows its end.

### Gotchas

- The table pattern must match exactly; otherwise songs cannot be read or changed.
- Keep the loop pointer at start + 4; a piece without it stops instead of looping like the game's own.
- Five FM voices are shared with sound effects; the game's own pieces sound up to nine notes at once (test comment),
  which the console cuts.
- Write 5/13/14 notes an octave above how they should sound.

### Files and tests

`src/core/genesismusic.ts` (`soundTable`, `readSong`, `songBytes`, `withSong`, `withOriginalSong`, `GAME_MUSIC`,
`channelParts`, `GAME_INSTRUMENTS`, `EXPORT_PROGRAM`, `patchForProgram`, `OCTAVE_BELOW`, `musicParts`,
`defaultPartChoices`, `gameMusicFromMidi`, `gameMusicTune`, `gameMusicToMidi`, `customSongBytes`, `withSongBytes`);
`src/OrganSongsSection.tsx` (`GameMusicSection`); `src/core/projectfile.ts` (`savedSongs`); `src/core/compare.ts`;
`tests/genesismusic.test.ts` ("reads the title, end of period and scouting report music ...", "replaces the title
music with a MIDI file ...", "brings a loud MIDI file down ...", "moves a part by whole octaves into range ...", "puts
the game's own title music back in from its exported MIDI file ...").

### Status

Tested in the game by the NHL94 Match Viewer project (`GameMusicSection`'s NHL 94 text ends "Tested in the game by the
NHL94 Match Viewer project."; commit a54165e "NHL 94's game music replaced from MIDI files: tested in the game").

## 13. NHL '95: game music (title, end of period, scouting report)

### What it does (for the player)

The same Game music section (`GameMusicSection`) shows NHL '95's three pieces with **Play**, **Export MIDI**,
**Replace…** (a MIDI file, each of its parts on one of NHL '95's instruments, chosen in a parts table) and **Put back the
original**. Tested in the game by the NHL94 Match Viewer project (loops on the original's frames, every drum hit back, within the driver's limits).

### Origin and credit

sound95.asm's `song` sends songs 0 to 3 to StartSong; where each plays is read from title95.asm, hockey95.asm,
PeriodOver_sp and scout95.asm (comment above `NHL95_GAME_MUSIC`, `nhl95music.ts`).

### Where it lives

Type-3 items in SoundBanks (`findBankItem(rom, SONG, number)`; bank format in section 6), stream format as the organ
songs' (`readNhl95Stream`, section 6).

| Id | `NHL95_GAME_MUSIC` name | Where it plays | Length (test, retail and W18) |
|---|---|---|---|
| 0 | Title music | The title screen, the credits and the main menu | 70 s (to its `$75`; 6 frames after it never play) |
| 1 | (not listed) | "played by nothing"; `readNhl95Music(rom, 1)` is null | |
| 2 | End of period music | Between periods | 65 s |
| 3 | Scouting report music | The scouting report, the playoff screen and the Stanley Cup screen | 70 s |

They "play on the front end's FM patches and two of the sound chip's square-wave voices: patch `$13` is its noise, the
hi-hats".

`readNhl95Music(rom, number)` returns NHL 94-style events (`songEvents`), every note as written (`asWritten`), each
given an off at its length (at least 1 frame), velocities as they are (divisor 1; the organ songs' are divided by 3),
and patch `$13` turned into `NOISE_HAT` (`$7F`); `loops: true`, `custom` for one NOSE4Web made. Its `seconds` run to
where the loop point plays again: loop point frame + `nhl95LoopFrames(events, made)` (to the `$75`, plus `LOOP_LATE`
= 2 for one NOSE4Web made, below); without a loop point, the last event's frame. `readNhl95Song` (organ songs only)
returns null for these ids (test).

`gameMusicTune(song, 95)` and `gameMusicToMidi(song, name, 95)` (the page passes 95 for NHL '95) classify NHL '95's
channels with none of NHL 94's patch tables: its patch numbers are not NHL 94's. The drums are `$15`, `$0E` and the
noise, each (patch, note) its own General MIDI drum note (`NHL95_DRUM_NOTES`, `genesismusic.ts`; a note not in it takes
the nearest one's of its patch):

| Patch | Note | Sounds like (Match Viewer) | GM drum note |
|---|---|---|---|
| `$15` | 0 | kick | 36 bass drum 1 |
| `$15` | 9 | second kick | 35 acoustic bass drum |
| `$15` | 17 / 18 / 19 | low / mid / high tom | 45 / 47 / 48 |
| `$0E` | 51 | thump | 64 low conga (GM has no thump) |
| `$0E` | 55 / 56 / 57 | snare-like crack | 37 side stick / 38 snare / 40 electric snare |
| `$13` (noise) | 108 | open hat | 46 |
| `$13` (noise) | 120 | closed hat | 42 |

The game's own pieces play `$15` 0, 9, 17, 19; `$0E` 51, 55, 57; the noise 108, 120. Every other channel is a tune on
its patch's GM program (`NHL95_EXPORT_PROGRAM`, `$11` 38, `$18` 62, `$1B` 60, `$0D` 12, `$1D` 81, `$1C` 78, `$14` 80;
others synth bass 38 below an average of 50, else synth brass 62), shifted to the octave it sounds at (`nhl95Shift`);
channel 9 is not taken as the drums (the scouting report music plays a tune on it, patch `$14`, 363 notes). Notes still
sounding where the piece loops are cut there in the file and notes after it left out, so that the file is as long as
the loop.

### The driver's limits (Match Viewer's measurements; the comment above `FM_VOICES` in `nhl95music.ts`)

- 6 FM voices, 3 square-wave voices (patch `$14`), the noise (`$13`); on the front end and between periods nothing
  else takes them.
- **One voice per FM patch**: a note on a patch already sounding cuts the note there, even from another channel. So
  each part gets its own patch (`nhl95MusicFromMidi` throws on a patch chosen twice) and an FM part is monophonic.
- No free voice: the new note takes voice 0 and the stolen note never returns. Kept: at most 6 FM patches sounding
  (drums `$15` and `$0E` count), 3 square notes, 1 noise note (`FM_VOICES`, `SQUARE_VOICES`).
- SndPutZ80Cmd queues at most 16 commands a frame; note-ons, note-offs (SndUpdateNotes) and programs each count.
  Kept: at most 14 (`MOST_COMMANDS`), counting the frame where the piece loops (the notes ending at the end plus
  what the loop point sends).
- SndNotes (32 entries, shared with SFX, unchecked): every note is cut before the next on its voice, so a new piece
  never has more waiting than its 10 voices (test: at most 24).
- Waits and lengths at most `$3FFF` frames; the item under 64 KB (`nhl95MusicBytes` throws).

### How a piece is made (`nhl95MusicFromMidi`)

- Instruments (`NHL95_INSTRUMENTS`, each usable once, named from Match Viewer's listening): `$11` Plucked bass, `$18`
  Brass swell, `$1B` Mellow horn, `$0D` Mallet (short notes only: it falls 18 dB in 1 s, 27 dB in 2 s), `$1D`
  Sustained lead, `$1C` Whistle, `$14` Square (plays chords, three notes). `$0B` and `$16` are left out: none of songs 0, 2, 3 plays them (only the unused song 1 has `$16`),
  so how they sound is not known.
- Notes are written as the note heard less the patch's shift (`nhl95Shift`: `$18`/`$1B` +12, `$1C` +24, `$14` +12
  below 46). Each part moves by whole octaves into its patch's range as heard (`soundingRange`: written 12-95, at most
  108 heard; `$14` 46-96); only notes of a part too wide move one by one.
- Monophony per FM patch: of a chord (same frame) the highest is kept, the lowest on the bass; a note that overlaps the
  previous by more than `LEGATO` (3 frames) is dropped where weaker, else it cuts the held note; a legato overlap cuts.
- Drums (MIDI channel 10, `drumFor`): the table above read back, so a piece's own export comes back drum for drum
  (test: every drum moment of each original, with its patch and note); but 35 is the kick (`$15` 0) where a file has no
  36. Other notes: 39 the snare `$0E` 56, toms 41/43 `$15` 17 and 50 `$15` 19, pedal hat 44 and rides 51/53/59 `$13`
  120, crashes and splash 49/52/55/57 `$13` 108; others left out. FM drums 6-24 frames long, the noise 1-4. Of two hits
  at once on one patch the higher is kept (the game itself sounds only one: the title music has 16 such moments, the
  scouting report's 3).
- Past the voices or the commands a frame, the weakest gives way: drums kept first, then the bass, then the higher notes.
- Velocities as in the file, unless its tune median is past 95: then scaled to 78 (the three pieces' tune median;
  each piece's own: title 79, end of period 81, scouting report 75, so matching the target to the piece replaced
  would change little). Match Viewer measured the end of period piece made from the title's export 18% louder (RMS
  3,611 vs 3,071): its velocities are under the original's, so that is the title's busier arrangement, left as is.
- Layout as the game's own pieces: programs at frame 0, `$B0 $74 0` at frame 1 (the loop point: header loop count 1,
  its offset the `$74` event's wait byte, after the 4-byte header), the notes from frame 1, the file's end rest, then
  `$B0 $75 0` (back to the loop point) and `$FF`. `nhl95StreamBytes(events, firstWait, loopAt)` writes the loop table
  and the loop event's status.
- Loop timing: Match Viewer heard the second pass of a piece laid out so 2 frames after its `$75` (1 on W18), where the
  game's own (loop point at frame 0, programs after it) play again in the `$75`'s frame. SndUpdate (sound95.asm) reads
  as taking no time over the jump (it skips the loop point's wait, as it skips the first event's at the start, and goes
  on in the same frame), so the cause is not in that code. The `$75` (and `$FF`) is written `LOOP_LATE` (2) frames
  before the end, and never before the last note begins: the loop period (`nhl95LoopFrames`) equals the MIDI file's
  length (test, each original's export put back). `nhl95MusicLimits` counts the loop point's commands in the frame
  `LOOP_LATE` after the `$75`.
- Defaults (`nhl95PartChoices`): the drum channel the drums; a part with a GM program on the nearest free patch (the
  export gives each patch its own program, `NHL95_EXPORT_PROGRAM`, so a piece's own MIDI file comes back on its
  patches); then the lowest part on the bass, a part of chords (a quarter of its notes overlapping) on the square wave,
  the rest from the highest down. `$0D` is never a default for a part whose median note is longer than 0.3 s
  (`MALLET_LONGEST`); it can still be chosen.

### Applying and removing

`withNhl95Music(rom, number, made, name)` puts the piece in NOSE4Web's own bank (section 6) as a type 3 item with id 0,
2 or 3, marked `N4W1` + name; the bank may now hold ids 0, 2, 3 beside `$32`-`$55` (`isOwnId`). Restore with
`withOriginalNhl95Song` (byte for byte, test). `readNhl95Music` gives `custom` for a marked one. Project files carry
them (`savedSongs` includes ids 0, 2, 3 for NHL '95; `nhl95CustomSongBytes` / `withNhl95SongBytes`); Compare lists
"Game music" changes for NHL '95 too.

### Gotchas

- Ids 0-3 are not organ songs (`$32`-`$55`); don't read them with the organ reader (`readNhl95Music` has its own cache).
- The game's own pieces put two channels on one patch (title `$18` x2, `$14` x2; scouting `$0D` x2): in the game they
  play as one line. A re-import puts the second on another patch.
- The game's own pieces send 15-20 commands in their first frame; a new piece keeps to 14 by putting its programs a
  frame before its notes.
- The hi-hats are on a PSG noise voice, not FM.

### Files and tests

`src/core/nhl95music.ts` (`NHL95_GAME_MUSIC`, `readNhl95Music`, `songEvents`, `NOISE_PATCH`, `NHL95_INSTRUMENTS`,
`nhl95PartChoices`, `nhl95MusicFromMidi`, `nhl95MusicBytes`, `withNhl95Music`, `nhl95MusicLimits`);
`src/core/genesismusic.ts` (`NOISE_HAT`, `nhl95Shift`, `NHL95_EXPORT_PROGRAM`, `gameMusicToMidi`, `gameMusicTune`);
`src/OrganSongsSection.tsx` (`GameMusicSection`, its `nhl95` branch); `src/core/projectfile.ts`, `src/core/compare.ts`;
`tests/nhl95music.test.ts` (the "NHL '95's other music" and "NHL '95's other music from MIDI files" blocks: each piece
back from its own MIDI file on NHL_95, W18 and W18p, the limits counted by `nhl95MusicLimits`, a hand-made file, a
crowded file, the bank put back byte for byte, a project file); `e2e/app.e2e.ts` ("replaces its title music with the
scouting report's MIDI file, each instrument once").

### Status

Play, export and replace built; replacement tested in the game by the NHL94 Match Viewer project.

## 14. NHL '94 SNES: game music and the real-sample player

### What it does (for the player)

`SnesGameMusicSection` (`OrganSongsSection.tsx`): "Play plays a piece on the game's own instruments. Export MIDI saves
it as a MIDI file, each of its parts on a track of its own named as the game names it, and the drums on the drum
channel. **Replace** puts a MIDI file of your own in its place: you choose one of the game's instruments for each of its
parts, its drums play on the game's drums, and the piece plays again from the start when it ends (or from the file's loop
marker, as the pieces' own MIDI files have). A part on the organ is played twice, a moment apart, as the playoff music
plays its organ. A piece's own MIDI file keeps each part on its own side and as loud as it was. The console has eight voices for the music and its drums, and each instrument only some of them: where an instrument's voices are all taken,
the drums, then the bass, then the higher notes are kept. Tested in the game by the NHL94 Match Viewer project." Its flow mirrors the Genesis's
(section 12): Replace… reads the file, a table of its parts with an instrument select each ("Bass, one note at a time",
"Brass, up to 3 notes at once", ...; after each instrument of more than one entry in `sides` its sides, "Brass
(left)", "Brass (centre)", "Brass (right)": value `sample:entry`, the part's own entry for its side where it is on one,
else the side's first (the single-voice entries come first); the drum channel "The game's drums: kick, snare, hi-hats, toms, crash"), **Put it
in**, a notice ("The playoff music is now "...", m:ss long, playing again from the start when it ends." or "... from
m:ss (the file's loop marker) when it ends." with "Not as in
the file: ..." for notes left out, past the voices, moved by octaves, or "played on another side of their instrument
where its own voice was taken"), **Put back the original**. Replace is offered
only where `snesMusicReplaceable` (the places below found, and the instruments). Play plays the piece now in place
(`snesMusicPointer`). The SNES organ songs' Play uses the same real-sample player with the game set
(`snesMusicSound(project.bytes, pointer, 'game')`).

### Origin and credit

The SNES disassembly's routines/sound (MusicStart, StepTrack, ReadTrackEvent, StartSoundVoice) and the sound CPU
program `data/tables/SoundDriver.asm` (headers of `snesmusic.ts`, `snesaudio.ts`).

### Where it lives: the pieces

`SNES_GAME_MUSIC` (long pointers, LoROM: `loRomOffset(bank, address)`), "at the same places in every SNES ROM the editor
knows":

| Pointer | Name | Where it plays | Sample set | Parts, length (test) |
|---|---|---|---|---|
| `$8FDD32` | Title music (TitleSong) | The title screen | `menu` (see below) | 13, 88 s |
| `$90C20C` | Menu music (MenuSong) | The main menu, and between periods early in the playoffs | `menu` | 14, 70 s |
| `$93ED31` | Playoff music (PlayoffSong) | The playoff screen, and between periods from the second round on | `menu` | 14, 28 s |

**Song format** (`snesmusic.ts` header, `readSnesMusic`): byte 0 must be 1 (checked; its meaning is not stated), byte 1
the tempo, byte 6 the track count (2-17 accepted), from byte 8 a little-endian word per track (offset from the song).
Ticks: `TempoTick = floor($2760 / tempo)` (MusicStart, DivX8U); SequencerTick adds `$40` to TempoAcc each frame and
steps a tick each time it reaches TempoTick, so ticks a second = `60.0988 x $40 / TempoTick` (`snesTicksPerSecond`;
`readSnesMusic`'s preview frames still count 60 a second). TempoTick is 64 (a tick a frame) for tempos 156 and 157, 65
(64 ticks in 65 frames) for 154 and 155: the title music is 156, the menu music 155, the playoff music 154
(`snesMusicTempo`). `readSnesMusic` also gives `tempo`, `ticks` (the end), `loop` (the first `$E2`'s tick, 0 if none) and
each note's `tick` and `ticks`. A track: variable-length wait (7 bits a byte, high bit = more), then a code:

| Code | Meaning | Data after it |
|---|---|---|
| below `$D9` | note (game music: the MIDI number, kept if <= 127; organ songs: MIDI + 104) | velocity byte, variable-length length in ticks (no note off) |
| `$D9`, `$DA` | end of the song (the first track there stops the music) | |
| `$DB` | the loop's end ("then the stop ($D9): the piece plays again from its loop's start") | |
| `$E7` | text: length byte, that many bytes; the first names the part (EA's names, e.g. `BASS #2`, `HORN (L) #16`) | |
| `$DF` | controller: 7 the track volume (read), `$40` sustain, `$0B`/`$0C` left/right, echo ones (skipped) | 2 bytes |
| `$E5` | pitch bend: MIDI's two bytes (low 7 bits, high 7 bits; `$00 $40` none), read into `part.bends` (`SnesMusicBend`: tick, 14-bit `value`, `entry`, its `range` from the entry's byte `$2F`, `notesBefore`) | 2 bytes |
| `$E2` | the loop's start (MusicStart makes the track's start the loop start; the menu and playoff music set it at tick 96, the title music has none) | 1 byte (`$7F`) |
| `$DC` (instrument), `$DD`, `$DE`, `$EA` | (skipped) | 1 byte |

A track named `drums` plays a drum for each note.

### Export (`snesMusicToMidi`) and preview (`snesMusicTune`)

MIDI **format 1**, division 60, a MIDI tick a tick of the piece: the tempo meta is `round(60e6 / snesTicksPerSecond(tempo))`
microseconds a beat (998,356 for the title, 1,013,955 for the menu and playoff music), so the file runs at the console's
speed and goes back to the same ticks. Track 0 has the name, tempo, a marker `FF 06 "loopStart"` (`MIDI_LOOP_MARKER`) at
the loop's start where it is past tick 0, and ends at the piece's end. Then one track per part with notes, named with EA's track name (`FF 03`). Tunes get channels in order (9 skipped, at most
16) and a General MIDI program guessed from the name (`PROGRAMS`, counted from 0): `bass` 38, `horn|bsec|brass` 61,
`orgn|organ` 16, `apower|dist|chug` 30, `orch` 55, `timp` 47, else 62. The `drums` part goes on channel 9 as General MIDI drums (`SNES_DRUM_GM`, below); a
part of one percussion sound goes there as that drum (`SINGLE_DRUMS`: `crash|crsh` 49, `cow` 56, `hat` 46).
An organ part that only doubles one before it (every note the other's within a tick; the playoff music's `orgn (R) #47`,
102 notes a tick after `orgn (L) #31`) is left out: its line is written once and doubled again when put back. Other pairs
a tick apart (chug, apower, bsec left and right) are kept.
`snesMusicTune` gives NHL 94 Genesis-style events without drum parts (velocity / 3) for the rough preview.

### Where it lives: the sound (`snesaudio.ts`)

**Sample sets** uploaded to the sound CPU before music plays: SPCTitleUpload (TitleSampleList, 15 samples) for the title
music; SPCMenuUpload (MenuSampleList, 16) for the menus and the playoff screen; SPCGameUpload (GameSampleList, 20) for
games, where the organ songs play. Each hands SoundInit an instrument table: MenuSfxTable for the first two, GameSfxTable
in games. Test: the menu set's first 12 samples are the title set's.

**Found by code** (`findSnesSound`, `locate`), so no fixed addresses:

| Pattern | Code | Gives |
|---|---|---|
| `UPLOAD` | the upload routines: `lda #table>>16 / sta SoundTable+2 / lda #table / sta SoundTable / jsl SoundInit / ldx #0 / lda.l list,x / ... / jsl SPCUploadBlock / ... / cpx #(4 x count)` | table, sample list, count; count / 4 = 15 title, 16 menu, 20 game (`COUNTS`) |
| `PITCH` | StartSoundVoice: `asl / tax / rep #$20 / lda.l PitchTable,x / ...` | PitchTable |
| `VOLUME` | StartSoundVoice: `ldx EventData1 / lda.l VolumeCurve,x / and #$FF / cmp #$40` | VolumeCurve |
| `NEED_LENGTH` | StartSoundVoice: `beq / sta InstPtr / cmp #a / beq / cmp #b / bne / lda EventData2 / bmi` | the two organ instruments that play no note of length 0 or with bit 15 set (`needLength`; retail `$DF80`, `$DFB0`; WCOH and SA-1 `$E141`, `$E171`; 2026 `$E1A1`, `$E1D1`) |
| `CLAP` | StartSoundVoice: `lda InstPtr / cmp #clap / bne / lda #$2D` | the clap, which plays 45 ticks whatever its length (`clap`; retail `$E130`, WCOH and SA-1 `$E2F1`, 2026 `$E351`) |

The sample list has a 3-byte long pointer every 4 bytes. Checks: every sample header valid; PitchTable note 69 about
twice note 57 and note 1 above note 0. Any failure returns null, and Play "keeps to the rough preview" (test).

**Instrument table**: a word offset from the table for each entry (`entryAt`: `table + word[table + (2 x index & $FF)]`),
entries 48 bytes:

| Byte | Meaning |
|---|---|
| 0 | the voices it may use (a bit each) |
| 2-3 | tuning (added to the pitch) |
| 4 | transpose (added to the note) |
| `$0A`-`$0B` | gain word |
| `$10`-`$11` | release word |
| `$12`, `$13` | left, right volume |
| `$14` | sample |
| `$15`, `$16` | ADSR |
| `$2A` | priority |
| `$2F` | pitch bend range in notes |

Bytes `$18`-`$21` (vibrato) are 0 in the instruments the music uses. Test values: menu instrument 2 (the bass) = sample
1, transpose 21, tuning 0, voices `$20`; game instruments 11 and 12 (the organ, left and right) = sample 10.

**Sample**: a 4-byte header, loop point then length in bytes, both high byte first (length a multiple of 9), then BRR
blocks (`decodeBrr`: 9 bytes, header bits 4-7 shift, 2-3 filter, 1 loop, 0 end; 16 4-bit samples, high nibble first).
Test: the menu bass is 2160 bytes looping from byte 1818; the kick 1350 bytes, no loop.

**Pitch**: `snesNotePitch` = PitchTable word at `(note x 2) & $FF` ("the index's top bit lost as the game's 8-bit index
loses it"); a note's pitch is PitchTable[note + transpose] plus the tuning; rate = `32000 x (pitch & $3FFF) / $1000`
(`snesPitchRate`). Test: note 69's pitch is `$6BA`. Track 9 is the drums: "each note picks the instrument entry (note -
$2F), and plays at note $3F + its transpose".

**`renderSnesMusic(rom, pointer, set, render = true, trace = false, times = 1)`** (`trace`: `frames`, each frame's eight
voices as the DSP is told them, `SnesVoiceFrame` { sample, pitch, left, right, keyOn, released } or null for a silent one,
an emulator register log's view; `times`: round the loop that many times, `$DB` going back to `$E2`'s place, which is
where the track last went on after a wait, as StepTrack stores TrackPtr): runs the sequencer as SoundUpdate does once a frame
(UpdateSfxVoices, SequencerTick, UpdateVoices, StepTrack, FindFreeVoice, VolumeCurve[velocity], pitch bend `$E5`), then
the DSP per voice: BRR at the pitch rate, ADSR or GAIN after release (GAIN `$9F/$99/$8C/$81` by the release word's high
byte), left/right volume, main volume `$50`. Echo off. The Gaussian interpolation is the hardware's (`SNES_GAUSS`, the
512-entry table from fullsnes, and `snesInterpolate`'s integer sums: three products wrapped to 16 bits, the fourth
clamped, `>> 1`; 2026-11-17, replacing a bell-shaped kernel); key-on delays and the envelope counter's phase are not, so
"close but not to the bit"; vibrato, music ducking and PAL timing left out. Plays
once through (to the loop's end or the stop), voices ring up to 2 s after, at most 10 minutes; music that goes 5 s with
no track stepping and no voice sounding is over too. A tick (`$2760 / tempo`, or `$DD`) of 0 or past `$C0`, which the
sequencer's byte cannot count, makes it null (the rough preview plays instead). The two organ instruments skip a note
of length 0 (or with bit 15 set) before a voice is looked for, and the clap plays 45 ticks, as StartSoundVoice does. Returns `notes` (start,
release, end, voice, track, note, sample, rate, volumes, ADSR), `seconds`, and stereo `Float32Array`s at 32000 Hz.

**`src/snesplayer.ts`**: `snesMusicSound(rom, pointer, set)` renders (null on error or no sound) and keeps the last
renders up to about 20 million samples in all (the newest always); `playSnesSound` plays it as one stereo Web Audio buffer at 32000 Hz, gain 0.8 x volume.

### Applying and removing (`src/core/snesgamemusic.ts`)

**Where the pieces are started** (`snesMusicPlaces`, found by code, so no fixed addresses): `lda #bank / sta p0+2 / lda
#address / sta p0 / jsl MusicStart` (`START`: `a9 bb 00 85 zz a9 lo hi 85 zz-2 22 ...`), a match counting where its
pointer is the piece's own or a piece NOSE4Web put in for it (its mark), and all of them calling one routine. The title
music has 1 (TitleScreen), the menu music 4 (Opening, PeriodOver, ReplayMode, SaveRegsStartHL2) and the playoff music 4
(PeriodOver, PlayoffScreen, ReplayMode, SaveRegsStartHL2). "Already playing?" questions: `lda SongPtr / cmp #low /
beq` (`ad .. .. c9 lo hi f0`, SongPtr from MusicStart's `rep #$20 / lda p0 / sta SongPtr / ldx #0 / ldy #8`): Opening
asks about the menu music (`$C20C`), PlayoffScreen about the playoff music (`$ED31`), so that it carries on rather than
restarting. A piece whose places are not exactly 1/4/4 starts and 0/1/1 questions gets null, and is not offered.

| ROM | Title start | Menu starts | Menu question | Playoff starts | Playoff question |
|---|---|---|---|---|---|
| NHL94.smc, Classic, SDL16 (header-less offsets) | `$EB2AD` | `$DB0B6 $F82FB $F8CFD $F9125` | `$F82EE` | `$DB0A5 $E8C04 $F8CEC $F9115` | `$E8BF3` |
| nhl94_2026.sfc | `$EB443` | `$DB03C $F82FB $F8D3B $F9163` | `$F82EE` | `$DB02B $E8BEC $F8D2A $F9153` | `$E8BDB` |
| nhl94snes_2026.sfc | `$EB443` | `$DB0CF $F82FB $F8D01 $F9129` | `$F82EE` | `$DB0BE $E8BEC $F8CF0 $F9119` | `$E8BDB` |
| nhl94snes_SA1.sfc | `$EB43F` | `$DB03C $F82FB $F8D3B $F9163` | `$F82EE` | `$DB02B $E8BEC $F8D2A $F9153` | `$E8BDB` |

(SongPtr is `$07ED`; `$67ED` in nhl94_2026 and SA-1.) **Writing** (`withSnesMusicBytes`): the old NOSE4Web piece, if
any, is filled with `$FF` (its room given back), the new one goes in `freeSpace` within one bank (`keptBanks` kept out),
each start gets its bank byte (`+1`) and address (`+6`, `+7`), each question the new low word. **Growing**: where no
bank has the room and the ROM is under 2 MB, it is grown with `grownSnesRom` (`src/core/snes.ts`), the same growth the
fighting patch uses (`withSnesFight`): a 2 MB copy, the new part `$FF`, the header's ROM size (`$7FD7`) `$0B`; the
checksum is put right by `fixSnesChecksum` when the ROM is built (a power-of-two size now, so SDL16's is fixed too). The
new banks are `$A0` to `$BF` at `$8000`-`$FFFF`; MusicStart's long pointer (`p0`, bank in `p0+2`) and the tracks' word
offsets reach them as any bank, and a piece is still kept within one bank. The 1 MB ROMs have 6,028 bytes free in one
place (bank `$80`): the playoff music's round trip, 3,440 bytes, fits there alone; the title's 7,238 and the menu's
6,845 grow the ROM, once (the title first: `$A0:E3BA`, menu `$A1:E543`, playoff `$A2:F290`; SDL16, whose data runs into
bank `$A2`, `$A3` to `$A5`), as `freeSpace` takes the end of the largest free run. The fights (`freeBank`, the start of
the first bank with 19,599 bytes unused) then go in bank `$A0` (SDL16 `$A3`) beside the music; with the fights in first
the music goes in the next banks and nothing grows again; the fights out leave the ROM 2 MB when the music is past 1 MB
(their mark's length is used only where all past it is `$FF`). **Put back** (`withOriginalSnesMusic`): the room filled
with `$FF` again and the original pointer and low word written back, so the ROM is the same byte for byte (test); a ROM
grown for the music stays 2 MB, as the Genesis game music leaves it (all three put back = `grownSnesRom` of the ROM as
opened, test). Too little room even so (a piece over 32,767 bytes): "The new music takes N bytes, and the most free room
this ROM has in one place, even grown to 2 MB, is M. ..." (without ", even grown to 2 MB," on a 2 MB ROM; the 2 MB
builds put the pieces in bank `$B5`, SA-1 in `$A4`). The notice after Put it in adds "The ROM grew to 2 MB to make room
for it." where it grew.

**The piece** (`snesMusicBytes`): header `01 tempo 01 00 00 00 count 00`, the tempo byte the replaced piece's own
(`snesMusicFromMidi(..., { tempo: snesMusicTempo(rom, index), loop: midiLoopStart(bytes) })`; 157, a tick a frame, where
none is given), notes put on ticks as `round(seconds x snesTicksPerSecond(tempo))`; a word offset a track, 0. Each
track: `$E7` name (e.g. `Brass (MIDI 5)`; track 9 `drums`), in track 0 a second `$E7` with the mark `N4W1`, the
original piece's pointer in hex and the name; `$DC` entry, `$DF 07` volume; notes (wait, code = MIDI note, velocity,
length) with `$E2 7F` (loop start) at the file's loop marker's tick (`midiLoopStart`: a marker or cue point named
`loopStart`, in seconds through the tempo map; 0 = the start); the wait to the piece's end, `$DB`, `$D9`. A piece's own
MIDI file put back has its tempo byte, end tick and loop tick, so its first pass and each loop after are the original's
to the frame (test, counting TempoAcc's frames). Before, a round trip was tempo 157 from tick 0: the same first pass to a
frame, but each loop of the menu and playoff music 98 frames longer (4,193 and 1,658 against 4,095 and 1,560) (their 96-tick intro played again). Every track is the same
length. Track 9 is always the drums (StepTrack treats it so); empty tracks fill up to it where needed; at most 16.

**Voices** (StartSoundVoice, FindFreeVoice): a note takes a free voice of its entry's mask, else steals one of them (the
entries' priorities are all 0, so a note is never left out by the game). So the import uses only **entries of one
voice**, and plans each voice to hold one note at a time: the game then plays exactly the plan (test: the render's note
count equals the plan's). A note's voice: a free voice of its instrument no other part used in the last 2 s
(`RESERVED`) and that no part of one voice only (the organ, bass, timpani, each drum) wants while the note sounds; else the part's own earlier note cut short (a line's notes on one voice); else any free voice; else a
weaker note cut short (drums 3 plus kick .5, snare .4, cymbals .3, cowbell .25, toms .2, hats .1; the bass 2; others 1,
the higher note winning); else it is left out (`dropped`). The notes are planned twice, with and without keeping off the
one-voice parts' voices (with it, a drum hit is also let go when a one-voice part wants its voice, e.g. the crash on
voice 0 before the organ), and the way that keeps more is taken. **The organ** (`doubled` in the kit: the organ's
multi-voice entry the game's pieces play, entry 31, voices 0-2, L97 R97; less voice 0, its single-voice entry 47's):
each organ note goes on entry 47 a tick late and on entry 31 at its time, on a free voice 1 or 2 (rank 0.5: never cuts
a note, the first given up; kept only where the 47 note is), on tracks `Organ (MIDI n)` and `Organ (MIDI n) doubled`.
FindFreeVoice may still put 31's note on voice 0 when voice 0 is free that tick (the game rotates its search start),
and the 47 note then cuts it a tick later, as in the original (the simulator: original 29 of 102 lost so; a round trip 14
of 101). Round trips (notes the game plays, of the original's): title 1,636 of 1,695, menu 1,548 of 1,554, playoff
703 of 704 (before own files were played as the game plays them, below: 1,635, 1,541, 696; before entries were kept:
1,628, 1,539, 695; before the organ's doubling: 1,628, 1,535, 590).

**Entries kept** (a piece's own MIDI file put back): a part's choice may be one entry (`{ sample, entry }`, one of the
instrument's `sides`: every single-voice entry of its sample, with voice and L/R volumes, then each entry of more voices
the game's pieces play but the organ's 31, `voices` its mask's voices; the range is from the single-voice ones only; `snesEntrySide`: centre where
|L - R| < 20% of the louder, else left or right). Such a part takes its entry's voice where free, or cuts its own
earlier note there; else the instrument's other entries by the rules above (`otherEntry` counts those notes). Its notes
to come are among the one-voice parts' (`needs`). Export writes each track's volume as controller 7 (the `$DF 07`/`$DE`
in force at its first note; a `$DC` sets the instrument's own, written 127); `snesOwnVolumes` (the file has a track
name giving an entry) returns the file's controller 7s (`midiPartVolumes`), and with them `snesMusicFromMidi` keeps
the file's velocities (no scaling to the kit's medians) and uses those track volumes. Width (sqrt of side over mid
energy, L - R against L + R, `renderSnesMusic`), original / round trip before / now, NHL94.smc and nhl94_2026.sfc
alike: title 0.069 / 0.084 / 0.076, menu 0.101 / 0.075 / 0.112, playoff 0.236 / 0.087 / 0.225; L and R RMS within
5% of the original's (before, the playoff's L/R pairs were scaled to the kit's volumes 97 and velocities, against no
`$DF 07` and velocities 89-108 in the game's). Non-drum notes on their original entry: title 451 of 999 (was 407),
menu 689 of 1,027 (401), playoff 485 of 505 (338; its pairs 50/51, 48/49, 45/46 all kept).

**Own files as the game plays them** (`ownVolumes` given, a piece's own MIDI file). The game never moves a note to
another entry: FindFreeVoice looks for a free voice (VoiceState 0) of the entry's mask from VoiceRotor + 1, else takes
the one of the highest state, then age, of no higher priority (every music entry has priority 0), so a note on a
one-voice entry always takes that voice, cutting what sounds there. The planner used to send such a note to another
entry of the instrument where the voice was busy (the playoff's brass at frame 1183 onto centre entry 20 while the
power guitars' long notes held voices 3 and 2, the other brass note left out), which the console then played in the
middle: Match Viewer's 48 frames of brass in the middle. Now in an own file a part on one entry takes its voice for
every note, cutting the note there (of two at one tick the lower track's keeps it: SequencerTick steps the tracks from
the last, so the lower is started last); `otherEntry` is 0 for all three pieces. Its drums go back on the very codes
they were (`kit.ownDrums`, the inverse of `SNES_DRUM_GM`; `ownDrumVoices`: the crash in the middle, 61, entry 14, may
take voice 2 or 3, which the game chooses) and as long as they were (no 3-30 frame clamp). A track volume of 127 is
written as none (`$DC` alone sets the instrument's own; `$DF 07 127` is 127/128 of it).

**Instrument changes** (`readSnesMusic`: each note's `entry`, the track's last `$DC`, and `volume`, the `$DF 07`/`$DE`
then, null after a `$DC`). The game's pieces change instrument inside a track: the menu's "crshbkwd/cow #4, #35"
(4, 35 at 2113, 4 at 4056), its three "bsec ... apower" tracks (no `$DC` until 480, then power guitar 43/42/41 and
brass 17/16/40 by turns, ending on the brass), the title's "HORN (M) #25" (30 at 1632). A note before a track's first
`$DC` is never started the first time through (TrackInst is 0: MusicStart's MusicStop clears it, StartSoundVoice
starts nothing), but `$DB` goes back to the loop start with the last instrument kept, so from the loop start on it is
heard on that one each time round after: readSnesMusic gives it that entry (the bsec tracks' notes 96-480 on the
brass), and -1 to one never heard. Export (`snesMusicToMidi`) writes a MIDI track for each entry a part plays on,
named as the game's where its name gives that entry ('#NN' or '*NN', the first; `snesTrackEntry`), else with
' on #NN' added ("HORN (M) #25 on #30", "bsec (R) #17 apower #43 (M) on #43"), with the volume at its first note;
notes of entry -1 left out. `namedEntry` reads ' on #NN' first; an entry that is no side of an instrument of two sides
or more (the organ's 31; the timpani's 22, orchestra hit's 19, bass's 2) puts the part on the entry's sample
(`kit.entrySamples`); in an own file a part on an instrument of one side but the organ is on that side all the same
(`pinnedOf`). A part of one percussion sound on the drum
channel plays each note as the drum of its entry where the drum track has it (`SNES_DRUM_GM[entry + $2F]`: 14 -> 49,
15 -> 57, 4 -> 52, 21 -> 56, 35 -> 67, new: the right cowbell, 82), else as the part's drum (the hat #32 as 46).

Width, original / before / now (NHL94.smc and nhl94_2026.sfc alike): title 0.069 / 0.076 / 0.078, menu 0.101 / 0.112
/ 0.101, playoff 0.236 / 0.225 / 0.236 (L/R RMS 3,574/3,749 original, 3,573/3,750 now). Frames each sample sounds on
each side (`renderSnesMusic` notes, keyed on to let go, by `snesEntrySide`), playoff original / now: brass left 418 /
418, right 410 / 418, middle 0 / 0 (before 87); crash middle 84 / 83, right 71 / 71 (before right 151); crash played
backwards 11 / 11 (before 0); the rest within 2. Menu: right cowbell 182 / 182 (before 0), crash right 629 / 629,
crash played backwards 71 / 71 frames in all (its sides differ: on the drum track a note takes its entry's own
volume, StepTrack, not the track's 79). Then left as they were (fixed since: **Percussion parts kept**, below): a
percussion part's notes played at the drum track's fixed pitch ($3F + transpose), and at its entry's own volume, not
its track's (the title's 'cowbell #21' at 69 was so about 1.85 times as loud, its quiet hits counted left 12 / centre
372 against 24 / 384).

**Entries of more voices kept** (2026-11-18, after Match Viewer's round 7: the playoff matched, width 0.245 / 0.242,
every sample's sides; the menu's power guitar had lost its left, the title's dist sat right). A part named with an
entry of more voices (the title's dist A #27, dist echo #28/#29, voices 0-1; its HORN (M) on #30, voices 2-3, release
1399 so a let-go voice fades about 24 frames; the menu's apower #41, voices 0 and 4) is pinned to it like a
single-voice one, and each note takes the voice FindFreeVoice would give it (`gameVoice` in the planner): from the
rotating start (`rotorOf`: the note's turn among all the piece's note starts, ticks in order, and within a tick the
tracks from the last, by `trackOf`, the tracks the piece will have: tune parts in channel order, an organ part's
copies next, 9 the drums), the first voice of the mask in state 0 (never used, or let go and faded:
`kit.entryReleases`, `floor(gain / release) + 1` frames from the envelope's sustain level, 0 for a gain-mode entry;
`kit.entryStates` 2 or 1 while it sounds); else the highest state (4, let go, then sounding), then the oldest, the age
read from the voices counted the other way, as the game reads it. The note cuts what is there; in an own file always
(of two at one tick the lower track's keeps it), elsewhere only where the voice is free or holds the part's own note,
else it moves to another entry as before. Its notes are one track (`Distorted guitar (MIDI n)` on entry 27), each
note with its planned `voice`. In an own file every drum also takes its voice as the game gives it (the crash in the
middle, 61, by `gameVoice` over voices 2-3), the same-tick rule by track (drums 9) rather than by rank. NHL94.smc and
nhl94_2026.sfc alike, original / before / now: title width 0.069 / 0.078 / 0.069, notes 1,695 / 1,636 / 1,675 (the
missing ones mostly cut the tick they start); dist (sample 13) centre 4,494 / 1,589 / 4,271, left 149 / 56 / 149,
right 272 / 2,520 / 261; brass centre 1,230 / 742 / 1,285; orchestra hit 310 / 226 / 310; crash centre 627 / 559 /
604; timpani 210 / 282 / 210; cowbell 408 / 432 / 384 in all (two hits lost at the tick of a HORN (L) note on voice 4:
the game's own piece has the cowbell on track 3, stepped after the HORN's 7, ours on the drums' 9, stepped before).
Menu width 0.101 / 0.101 / 0.102, notes 1,554 / 1,548 / 1,550; power guitar left 283 / 0 / 283, centre 495 / 656 /
495, right 699 / 720 / 699; every other sample's sides as the original's but the crash played backwards (above).
Playoff unchanged, byte for byte (0.236, 703 of 704 notes). Test: every sample's frames on each side within 5% (or 3)
for all three pieces, the drum-channel percussion by its total.

**Percussion parts kept** (2026-11-18, after Match Viewer's round 8: title width, brass, menu sample 15 and the playoff
matched; "leftovers only in percussion"). The game's pieces play some percussion on tracks of their own, not the drum
track (9): the title's 'cowbell #21' (entry 21, track volume 69, code 68) and 'crash #14' (14, 97, 61); the menu's
'crshbkwd/cow #4, #35' (4 at 79, 35 at 97, 4 at its own; codes 65-68), 'crash #15' (15, 97, codes 60-63) and 'ohat #32'
(32, sample 6, 97, 63); the playoff's 'xtra crsh #15' and 'crshbkwd #4'. On such a track a note sounds at its code's
pitch and at the track's volume ($DC entry, `$DF 07`); on the drum track each note sets its entry's own volume and
plays at one pitch ($3F + transpose), so going through the drum channel lost both (and the hat went on the drums' 56,
entry 9). **Export** (`snesMusicToMidi`): such a part stays one MIDI track on channel 10 (each note the General MIDI
drum of its entry, as before, so a MIDI player plays it as a crash or cowbell), and the track carries a text event (FF
01, which players do not play) of what the game plays each note with (`SNES_NOTES_TEXT`, `snesNotesText`,
`readSnesNotesText`): `SNES notes #4 v79: 66 66 #35 v97: 68 ... #4 v127: 65`, `#NN` the entry from there on, `vNN` the
track volume (127 the instrument's own), each number a note's code, one per note of the track in order. No controller 7
on channel 10: it would set every drum's volume in a player (channel-wide), and a per-track CC7 or pan there would
fight between the drum channel's tracks; velocity scaling was not used either, as the game's velocity curve and 8-bit
volume products cannot be undone exactly. **Import**: `snesOwnMidi(kit, bytes)` (null where `snesOwnVolumes` is null,
i.e. any file whose track names give no entry) returns `{ volumes, parts, percussion, sequence }`; the page's Replace
and `snesMusicFromFile` pass it as `snesMusicFromMidi`'s last argument (which still takes a volumes Map, as before,
without the rest). `percussion`: each
channel-10 track with such a text whose note count matches; its notes (seconds through the tempo map, `midiSeconds`,
shared with `midiLoopStart`) are matched to readMidi's channel-9 notes (same note, start within 1 ms) and, while the
drum channel's choice is the drums, moved to channels of their own (16 on, one per entry of the part) pinned to their
entry (a part instrument made from `kit.entrySides`, the voices and L/R of every entry 0-51, so the hat's sample 6
needs no instrument in the list), at their own codes and volumes; a part not fully matched stays on the drums.
`parts`: channels whose names are one part's but ' on #NN' (the menu's three bsec/apower parts, the title's HORN (M))
go back on **one track**, as the game's are: a made track's notes may carry `entry` and `volume`, and `snesMusicBytes`
writes `$DC` (and `$DF 07` where under 127) before a note where they change, again after the loop start (the track
comes back there with its last). Without this the menu needed 18 tracks (15 is the most beside the drums). The tracks
take the original's places (a percussion track after the tune track before it in the file: title 0 timp ... 3 cowbell,
4 crash ... 8 HORN (M), 9 drums ...; menu 2 crshbkwd/cow, 3 crash, ..., 10 ohat), so the same-tick rule by track is the
game's. `sequence`: each tune channel's notes in file order, so the notes of one track at one tick go in the game's
byte order (chords rise in the title's tracks, fall in the menu's), which readMidi's sorted notes lose. In an own file
the planner now plans in the game's order (`planOrder`: each tick the tracks from the last, the file's order within a
track, an organ note at its copy's turn) rather than time then pitch, and keeps a note another cuts the tick it starts
(written length 1; the game starts it and the other takes the voice at once, and its start moves VoiceRotor on as
`rotorOf` assumed). Other files are untouched (byte-identical output for the three pieces' notes imported without
names, with and without programs). Results, NHL94.smc, nhl94_2026.sfc and nhl94snes_SA1.sfc alike (and NHL94_Classic,
SDL16, nhl94snes_2026), each rendered note (frame, sample, L, R, rate, frames to let go) of the original against the
round trip through `snesMusicFromFile`: percussion notes differing before / now: title crash 17 / 0 (L/R sums 1,044
against 1,385 before, rate 11,984 against 13,453), cowbell 36 / 0 (4 hits lost before; L/R 759/634 against 1,293/1,059,
rate 10,297 against 7,766); menu crash played backwards 3 / 0 (L/R 157/195 against 205/253), crash 25 / 0 (1,054/1,613
against 1,407/2,133), open hat 20 / 0 (255/281 against 482/482, wrong entry), right cowbell 15 / 0 (261/343 against
347/462), snare 2 / 0; playoff crash played backwards 1 / 0 (rate 12,695 against 9,508), crash 3 / 1 (the drums' crash
at frame 1268 let go at once against a frame later: the organ's copies are planned as before). All notes: title 1,695
/ 1,695, every one as the game's but one dist note (2015, 1 frame against 8); dist centre 4,494 / 4,271 before / 4,487,
brass centre 1,230 / 1,285 / 1,230, all brass sides exact; menu 1,554 / 1,554, every note as the game's; playoff as
before (703 of 704). Tests: `snesmusic.test.ts` (the text written and read; each percussion part on channel 10 with its
text, no controller 7 there), `snesgamemusic.test.ts` (title and menu tracks with the game's entries track by track,
every sample's frames on each side within 5%/3 with no percussion exception, the bsec and crshbkwd/cow parts on one
track each, and for every SNES ROM present each piece's percussion note for note through `snesMusicFromFile`).

**Frame by frame, every time round** (2026-11-18, after Match Viewer's round 9 in Snes9x: menu sample 15 at a steady
$0E41/$1965 where the game bends it up 2 notes; title bass at $05FE where the game slides down to $0359; title crash,
timpani at $050A and dist at $0480 short; the playoff brass right 204 against 200). Our tests compared rendered notes
(start, pitch at key-on, frames to let go) once through, so they missed what changes a voice after its key-on and
what happens only the second time round, which Match Viewer's register log sees. The measure now is the DSP's view each
frame (`renderSnesMusic(..., trace, times)`), every voice, three times round. Causes and fixes:
1. **Pitch bends were dropped.** The driver has one pitch command, `$E5` (StepTrack: bends the track's sounding voices,
   `bend = signed high byte of ((high << 8 | (low << 1 & $FF)) - $4000) << 1`, toward PitchTable[note +/- the entry's
   range, byte `$2F`], linear in pitch; StartSoundVoice bends later notes too; `$DC` and each drum note set it back to 0).
   The title's BASS #2 (250 bends, range 12: down an octave and back each phrase) and dist A #27 (18, the ending) and the
   menu's three apower parts (85, 85, 22; range 2) have them. No portamento or vibrato command exists (the music's
   entries' vibrato bytes are 0), and nothing else moves a pitch. Now: `readSnesMusic` reads them; export writes each as
   a MIDI pitch bend of the game's very two bytes on the track of the entry then, ordered among the notes as the game's
   track has them, with registered parameter 0 (CC 101/100 0, CC 6 range, CC 38 0, then 127/127) where the range is not
   2; `midiPitchBends(bytes)` reads any file's (seconds, channel, 14-bit value, the channel's range then, `first`: before
   the channel's notes at that tick); `snesMusicFromMidi(..., { bends })` gives each made track the bends of its channels
   (every track of a part on more voices), scaled `$2000 + (v - $2000) x fileRange / entryRange` (the same bytes where the
   ranges match), and `snesMusicBytes` writes `$E5` before the notes of its tick where `first` (after a `$DC` it needs),
   else after them. The page and `snesMusicFromFile` pass them.
2. **Notes cut short by the plan were written short.** The planner sets a note's `off` where another takes its voice and
   wrote that as its length. The game cuts it there anyway the first time round, but the second time FindFreeVoice's
   rotating start differs, the note lands on a free voice, and it lets go early: the title's crash 7 at $05FE (1,891
   frames in three rounds against 1,929), timpani 12 at $050A (72 against 97), brass 8, dist 13 at $0480 (1,812 against
   1,856). Now a piece's own file writes each note as long as the file has it (`Planned.end`); other files as before.
3. **The same-key rule** (a part's note ends the same note sounding) is not the game's on an entry of more voices: the
   title's dist A plays note 82 at 2015 and 2016 on voices 0 and 1, both 8 ticks. readMidi also ends the first at the
   second's start; `sequence` now carries each note's length as its track has it (`length`, first off of its key after
   it), and an own file skips the rule.
4. **Drums within a tick**: the drum channel's track kept no order (readMidi sorts by pitch), and the game steps them in
   byte order; a bend takes the tuning of InstPtr, the last instrument the driver read (StepTrack `.6`), so the title's
   bass bent one frame a phrase off ($055D against $05B7). `sequence` now includes the drums' track.
5. **Instrument and volume at the loop.** `snesMusicBytes` set them again at the first note after `$E2`; the game's
   track comes back with its last `$DC`/`$DF 07`. The menu's 'crshbkwd/cow #4, #35' plays its note at 1512 at volume 79
   the first time and its instrument's own after (sample 3: 80/98 against 48/60). Now a track with notes before the loop
   keeps the state on; one with none there (the bsec ... apower tracks, whose `$DC` comes at 480) still sets it.
6. **The playoff organ's copies** (entry 31, voices 0-2) were planned on free voices only, the same-key rule freeing them.
   In an own file each copy now takes the voice FindFreeVoice gives it (`gameVoice` with its own turn, `copyRotorOf`),
   cutting what is there (or cut a tick later by its own note on that voice), on one track before the own notes' (as
   'orgn (L) #31' is before 'orgn (R) #47'). The left-out #47 line has one note shorter than #31's (tick 862, 1 tick
   against 2): export says so on #31's track (`SNES_DOUBLED_TEXT`, `SNES doubled lengths 101:1`, `readSnesDoubledText`;
   `sequence[i].doubled`), and the own note takes that length.
Results (NHL94.smc; NHL94_Classic, SDL16, nhl94_2026, nhl94snes_2026 and SA-1 the same): voice-frames (8 a frame)
differing from the game's over three rounds, before / now: title 2,030 / 0 of 126,728, menu 626 / 0 of 99,080, playoff
1,527 / 0 of 38,232; every track's notes and bends (tick, code, velocity, length) are the game's byte for byte. Before,
per sample, three rounds: bass 1 centred $0359 0 / 384 (the game's 384), $05FE 2,709 / 1,833; power guitar 15 centred
$0E41 396 / 225, $1965 153 / 42, right $0E41 399 / 222, $1965 162 / 51; crash played backwards 3 centred 81 / 131,
right 100 / 50; organ 14 centred 1,895 / 1,970; brass 8 right only (playoff) 1,393 / 1,373. Other files: the four MIDI
files of mv_review_2026-11-17 build byte for byte as before into all three pieces (they have no bends). Test:
`snesgamemusic.test.ts` "plays each piece of %s put back from its own MIDI file frame by frame as the game plays its own,
three times round" (every ROM present), every note as the game's for all three pieces, and a hand-made file's bends.

Match Viewer's round-6 ROMs (mv_review_2026-11-17/round6) were not this round trip: their playoff tracks have
`$DF 07` 97/99/121/89 (the kit's medians) and velocities scaled, as without `snesOwnVolumes`; the renderer gives them
width 0.138, L/R 3,405/3,476 (Snes9x: 0.143, 3,455/3,515), and per-sample frames in step with Match Viewer's (each
about twice its count, a fixed factor between the two ways of counting), so the renderer and the console agree.

The kit (`snesMusicKit`, MenuSfxTable entries 0-51): per
sample the most central entry for each voice. Menu set: Bass voice 5 (entry 2); Brass 4/3/2 (20/17/25); Chugging guitar
0/1/3/2 (18/39/50/51); Orchestra hit 4 (19); Cowbell 4/0 (21/35); Timpani 1 (22); Distorted guitar 3/2/0 (33/34/38);
Organ 0 (47, right side only), doubled on 31 (voices 1, 2); Power guitar 3/2 (42/43); Crash 0 (15);
Crash played backwards 0 (4). The title set the same without the organ and power guitar. Range: the game's own notes
for the sample, an octave more each way, within the pitch table; loudness: each part's median velocity made the game's
median for its sample (Bass 84, Brass 34, ...; drums 53), its track volume the game's median (`$DF 07`).

**Drums** (General MIDI note to drum-track code; code - `$2F` is the entry, checked against its sample): 35/36 -> 48
kick; 37-40 -> 50 snare; 42 (and shakers, tambourine, wood blocks) -> 54 closed hat (voice 6); 44 -> 52 closed hat
(voice 7); 46 -> 56 open hat; 51/53/59 -> 58 open hat; toms 41 -> 53, 43 -> 55, 45 -> 57, 47 -> 59, 48/50 -> 60;
crashes 49/52/55/57 -> 62 (voice 0; 61 has two voices); 56/67/68 -> 68 cowbell (a piece's own file: the very codes,
above). Export (`snesMusicToMidi`) now writes the
drum track's codes as General MIDI drums (`SNES_DRUM_GM`) and ends the first track at the piece's end (its rest kept).

**Defaults** (`defaultSnesPartChoices`): the drum channel drums; a track name giving an entry (`snesTrackEntry`) that
is one of an instrument's `sides` (an instrument of more than one) on that entry, another entry on its sample; else a part's track name as EA names it (`midiPartNames`:
bass, horn/bsec/brass, orgn, apower, dist, chug, orch, timp, cow, crshbkwd, crash) on that sample, so a piece's own
MIDI file goes back on its instruments; else its General MIDI program by family (basses -> Bass, 47 -> Timpani, 55 ->
Orchestra hit, 24-28 -> Chug, 29-31 and leads -> Dist, brass/strings/reeds -> Brass, organs/pianos/pads -> Organ where
the set has it, else Brass); else the lowest (average below 55) on the Bass, the rest Brass, Dist, Organ, Chug by turns.

**Project files**: `songs.snesMusic` (`{ pointer: the original piece's, bytes }`), put back with `withSnesMusicBytes`
(skipped where the same bytes are in place). **Changes**: "Game music" / "Playoff music: "...", from a MIDI file." or
"... the game's own again." (`compare.ts`).

The title music's sounds: TitleScreen calls SPCTitleToMenu (three SPCUnloads drop the title set's last three samples,
then SampleTimp, SampleDist, SamplePlayoffOrgan and SampleAPower are sent, and sndbank = SoundBankMenu) just before
`MusicStart TitleSong`, so the title music plays on the **menu** set (Match Viewer confirmed it in play).
`SNES_GAME_MUSIC` gives it `menu`, for Play, export and the replace kit (whose list then has the Organ and Power guitar
for the title too). `snesaudio.ts` keeps the `title` set. Measured (11.0-12.4 s of the title music, band energies
<1k / 1-2.5k / 2.5-5k / 5-8k / >8k Hz): title set 64.8 / 55.2 / 46.9 / 36.7 / 42.7 dB, menu set 64.9 / 55.2 / 46.9 / 36.9
/ 42.7 dB: the sets sound alike there.

### Gotchas

- Game music note codes are MIDI numbers; organ songs' are MIDI + 104.
- Use the right sample set: all three game music pieces on `menu` (the title music too: SPCTitleToMenu), organ songs on
  `game`.
- TempoTick is `floor($2760 / tempo)`: 154 and 155 are 65, not 64.
- The PitchTable index wraps at `$FF` bytes, as the game's does.
- A percussion part's MIDI track needs its `SNES notes` text (one code per note) to go back on its own track; a file
  edited so that its note count no longer matches puts that part on the drum track, as other files' drums.
- `$DF 07` on a track changes the volume of that track's notes still sounding (`trackVolume`), so a track that changes
  volume on the way does what the game's own does only where its changes come where the game's do (before the note).
- Compare round trips frame by frame and more than once round (`renderSnesMusic(rom, pointer, 'menu', false, true, 3)`):
  a note's start and length once through hide bends, lengths the game cuts the first time only, and the state a track
  carries round its loop.
- A bend adds the tuning of the instrument the driver read last (InstPtr), not the track's: the order of other tracks'
  events within a tick changes a bent pitch.
- `$E2` stores TrackPtr, where the track last went on after a wait, not the place after it: events before it at its tick
  are played again each time round.

### Files and tests

`src/core/snesmusic.ts` (`SNES_GAME_MUSIC`, `readSnesMusic`, `snesMusicTune`, `snesMusicToMidi`, `PROGRAMS`,
`SINGLE_DRUMS`, `SNES_DRUM_GM`, `SNES_NOTES_TEXT`, `snesNotesText`, `readSnesNotesText`, `SNES_DOUBLED_TEXT`,
`readSnesDoubledText`); `src/core/snesgamemusic.ts`
(`snesMusicPlaces`, `snesMusicKit`, `defaultSnesPartChoices`, `snesOwnVolumes`, `snesOwnMidi`, `midiPitchBends`, `snesMusicFromMidi`,
`snesMusicBytes`, `withSnesMusic`, `withOriginalSnesMusic`, `snesCustomMusicBytes`, `snesMusicFromFile`);
`tests/snesgamemusic.test.ts` (places and kit in every ROM, round trips, percussion note for note, a hand-made file with
drums, eight voices, byte-for-byte put back (a 1 MB ROM grown, and a 2 MB one), tempo/length/loop to the frame, the
organ doubled, all three in one ROM grown once, the fights with the music in either order, project file, no room, places not found); `src/core/snesaudio.ts` (`decodeBrr`, `findSnesSound`, `readSnesSample`, `readSnesInstrument`,
`snesNotePitch`, `snesPitchRate`, `renderSnesMusic`); `src/snesplayer.ts`; `src/OrganSongsSection.tsx`
(`SnesGameMusicSection`); `tests/snesmusic.test.ts` ("reads the title, menu and playoff music in %s, and exports each as
MIDI, a track a part"); `tests/snesaudio.test.ts` (BRR filters, sample sets and tables, a ROM whose sound code differs,
a real sample, game music as voice notes, drums and a horn at pitch, an organ song on the game set, render time).

### Status

The real-sample player is a **browser preview, not game-tested**: it imitates the console from the disassembly (and is
"close but not to the bit"); the page text has no "Tested" line. Replacement built (`snesgamemusic.ts`), tested
in the game by the NHL94 Match Viewer project (loops on the original's frames, grown ROMs, put-back, fighting).

## 15. NHL 94 Genesis: in-game banner colours

### What it does (for the player)

Under **Menu banner colours** on a team page, each stripe colour is shown as the in-game banner will draw it
("Top stripe in the game:" and a swatch), with "In the game this shows as grey: the in-game banners share 16 colours
with the crowd, and none is close to this one." when it is far off. **Use this colour in the game too** puts that
colour in arena colour B, with a preview of the lettered in-game banner (`GameBannerColours.tsx`). Undo takes it
back; the user letters the in-game banner again to use it.

### Origin and credit

League feedback (a black and teal menu banner came out grey in the game). Reading the ROM and abdulahmad/NHL94Genesis.

### Where it lives

- The in-game banners (Teamblocksmap, `bannerReferences.game`) are drawn in palette line 1 (their map words' bits
  13-14, kept by `CopyTeamBlockMapData`). During play line 1 is the arena: `setupIceRinkPal` copies the rink map's
  palette lines 0 and 1, the 32 words at `$59924` (`rinkPaletteOffset`; NOSE4Web's `rinkPalette`, 16 to 31). The
  block's own copy of those 16 is never loaded. So `bannerPalette(project, 'game', team)` returns the arena colours
  where `rinkPalette` has 32 (`gameBannersOnArena`, `graphics.ts`).
- The menu stripe colours never reach the in-game banner by themselves: the original banners are fixed pictures.
  Only NOSE4Web's lettering (`letterBanner`, `nearestBannerColour` in `lettering.ts`: nearest of slots 1-15 by RGB
  distance) and image import (nearest of the allowed colours) map them, and that is the grey the league saw.
- The playoff tree draws the same banners with line 1 taken from EASportsBGMap's palette (`$54E24`, palettes at
  +$416 = `$5523A`, a second copy of the arena 16, also the scouting report background). Match Viewer found the tree's
  team blocks take colour 11 from `$55270`; `buildRom` (`writePlayoffTreeArenaColour`, rom.ts) writes the arena's
  colour 11 there too when the ROM's copy matches the arena's. Tested in the game by Match Viewer (2026-11-18) with a
  scratch copy: San Jose teal on the tree, nothing else on that page uses it. The scouting report is not yet checked.
  The arena line's colours 1-15 have eight more copies ($4E2B8, $AF8DE, $B8A2A, $BDB06, $BEE54, $BF102, $BF68C,
  $ED81A), screens unknown; left alone.
- Match Viewer's game test of 21bdc1ed (2026-11-18): San Jose's in-game banner teal on every in-game banner screen
  (pause scoreboard, pre-faceoff, Game Statistics, Scoring and Penalty Summaries, Player Stats, Team Roster, line
  editor, penalty rink, intermission); slot 11 otherwise only New Jersey's stripe and 10-60 crowd pixels; nothing else
  on any screen checked.
- What else uses line 1 during play (decoded from the ROM; `gamebannercolours.ts` header): 1-4 and 7 the frames,
  menus, replay panel; 5-6 replay letters and marker; 8 the score digits (BigFont `$A9A10`); 9 player 1's arrow and
  face-off pad (frames 384-390); 10 pads 3/4 arrows (frames 838-844) and a net/puck in the crowd's colours; 12-13 the
  EA logo, energy bars and the blood (`genesisblood.ts`); 14-15 the referee's face (RefMap2 `$5CF64` line-1 tiles,
  face-off sprites `$A78AE` frames 7-10). Colour 11 (`$020`) is used only by the crowd (rink map rows above the
  replay panel, crowd sprites `$A4B54`), New Jersey's in-game banner, and two pixels of the net/puck frames.
  `SPARE_ARENA_COLOURS = [11]`.
- The change writes one word: `$59924 + 27 * 2 = $5995A` (and the header checksum `$18E`), through `buildRom`'s
  rink colours. Project files carry it as `rinkPalette`.

### Applying and removing

`withArenaColour(project, 11, word)`; Undo or Reset arena colours on the Rink colours page.

### Detecting

`gameBannerColoursShown`: NHL 94 family (`isGenesis94`), 32 rink colours, pictures the editor reads, an in-game
banner set whose map uses line 1. Not offered on the SNES (each team's block has its own 16 colours,
`TeamBlockPalettes`, on every screen) or in NHL '95 (its in-game banners are pictures in colours each screen repeats;
no lettering there).

### Interactions

The Rink colours page edits the same 16. Hacks that repaint the crowd or move sprites into line 1 would need their own
check.

### Gotchas

Changing arena colour B also changes New Jersey's in-game banner green and some crowd pixels.

### Files and tests

`src/core/gamebannercolours.ts`, `src/GameBannerColours.tsx`, `graphics.ts` (`bannerPalette`, `gameBannerLine`),
`lettering.ts`; `tests/gamebannercolours.test.ts`; e2e "shows banner colours as the in-game banners draw them and
gives them a missing one".

### Status

Not yet tested in the game.

## 16. NHL 94 Genesis and NHL '94 SNES: giveaways and takeaways, and the pass at the net

### What it does (for the player)

Counts each player's giveaways and takeaways as the NHL94 Match Viewer project does: the puck carrier changing from
one team to the other with no whistle between. A takeaway for a skater who forced it (a stick steal, or a check that
knocked the carrier down); any other loss a giveaway for the player who lost the puck. Not counted: shots, faceoff
wins, passes between teammates, a pass the other goalie collects, highlights, shootouts. A pass at the net counts as a
shot: picked up by the other team once it has reached the goalie or the goal line, it is no giveaway; picked off before
then (in the slot, say), it is one (Match Viewer: "a pass shot has to reach the mouth or the goalie"). A puck
picked up after the whistle (before the faceoff or the penalty shot) is not counted, and the next one is not counted
against the carrier before the whistle (added 2026-11-18, tested in the game by Match Viewer on all five builds).

### Origin and credit

Match Viewer's definitions and its review of recorded games; the goalie's-touch code at puckgoalie is Match Viewer's.
NOSE4Web's code (comments above `GT_VERSIONS` in `hacks.ts` and `GT_RAM` in `sneshacks.ts`).

### Where it lives: Genesis (`hacks.ts`, `GT_HOOKS`, `GT_VERSIONS`)

One code block (a jump table of `bra.w`, then the code, then copies of the two Game Stats tables with the
"Give/Takeaways" row), hooked by `jsr` (and `nop`s) at: puckglue `$15288` (+0, counts), the steals `$151BC` and `$15548`
(+4), FallDown `$143FA` (+8), doshot `$C340` (+`$C`), StartGame `$77B8` (+`$10`, clears), DisplayStats `$FDE5E` and
`$FDE6C` (+`$14`, +`$18`), dopass `$BC6E` (+`$1C`, a pass: cause `$FFFE`), puckgoalie's `bclr #2,(sflags4).w` `$154EE`
(+`$20`, a goalie's touch forgets the passer of a `$FFFE` pass), dopass's `.notgoalie` `$BDD8` (+`$24`, the pass at the
net), a2touchpuck's first two moves `$1013E` (`31D2 BF7C 31EA 0014 BF7E`, +`$28`) and pucknorm's `bsr.w PuckIChk /
bsr.w ChkOffsides` `$FF86` (`6100 02BE 6100 005E`, +`$2C`; the code calls `$10246` and ends `jmp $FFEA`) and checkgoal's
`st (collflag).w / cmpi.w #$D,OldZpos(a3)` `$14664` (`50F8 BFA0 0C6B 000D 0024`, +`$30`). Scroll limits
`$FDCBC`, `$FDCCA` `$70`/`$30` to `$80`/`$40`.

RAM: last carrier's spot `$FFE800` (`$FFFF` none), cause `$FFE802`, their roster places `$FFE804` / `$FFE805`,
giveaways `$FFE810`, takeaways `$FFE850` (a byte a roster place, 32 a team), team totals at team struct `+$2232` /
`+$2234` (`$FFE900`, `$FFEC64`).

The cause: `$FFFF` none, `$FFFE` a pass, `$FFFD` / `$FFFC` a pass at the net toward the top's goal line (y `$108`) /
the bottom's (`-$108`), else the forcer's spot. puckglue's test (code +`$7C`: `tst.w d1 / bpl forcer / not.w d1 / beq
giveaway / bra pass`) takes every negative cause but `$FFFF` as a pass. The release rule (dopass hook): released past
the blue line (y `$58` toward the passer's net, pfgoal), 20 or more in front of the goal line, moving toward it, its
line crossing the goal line within 40 of x 0 (`muls` / `divs`); it marks `$FFFD` when the puck's y is positive, else
`$FFFC`, the passer kept. The mark is cleared (carrier and cause `$FFFF`) by pucknorm's hook once pucky is `$108` or more
(`$FFFD`) or `-$108` or less (`$FFFC`), each frame of a loose puck, so a pass that crossed the line and came back out
is seen; by the checkgoal hook when the puck touches a net, its top too (a post or the net's front: checkgoal sets
collflag and the puck is put back where it was, which may be short of the line, as the net is at y `$10C`, 2 deep, and
the puck's radius is 5); and by the a2touchpuck hook
when the toucher is a goalie (`position` 0), which covers puckgoalie (it calls a2touchpuck) and the puck off his stick
(puckstick's deflection) or body (puckbody), which do not go through puckgoalie.

**No whistle between** (all three games): after the whistle play goes on until the ref's sequence starts (pucknorm
still runs its collision checks with the clock stopped: `btst #gmclock / bne .end` skips only the still-puck timer),
so skaters can pick up the loose puck; and a penalty shot starts with no faceoff (no sf3fo: `Endfaceoff`'s
`bset #sf3fo` is the only place that sets it, puckglue's `bclr` the only one that clears it). Before this, such a
pickup, or the shooter's, was compared with the carrier before the whistle. The test is gmpen (Genesis gmode `$C2EA`
bit 2, `bset #gmpen` in Stop4Pen, which every stoppage goes through, `bclr` in InProgress as it hands the puck to
puckfaceoff or puckshootout; it is clear during the penalty shot itself, unlike gmclock). Genesis: the jump table's
+0 goes to +`$280` (`btst #2,(gmode).w / beq.w` the count at +`$34`; else puckglue's two moves, `move.l
#-1,($E800).w`, `rts`) and +`$2C` to +`$29C` (the same test and forgetting, then `bra.w` the frame code at +`$23C`). No
new places. Not changed: a pickup in the frame before its whistle (icing is called at the defender's touch, a delayed
penalty at the penalized team's, both by a2touchpuck after the pickup) still counts.

### Where it lives: SNES (`sneshacks.ts`, `gtEnv`, `gtCode`, `giveawayPlaces`)

The places are found by code patterns (`gtEnv`), each a `jsl` to one block in free room (`farRoom`): puckglue,
puckstick's steal, dopass and assdumpin, doshot, FallDown's two drops, StartGame_scout's `jsl Create_HotCold_Table`
(the clear, last in the block), puckgoalie's `.t2 jsl ChkShotStat` (the goalie's touch, `$FFFE` passes), dopass_swing's
`.2 lda puckvx / sta d0` (the pass at the net: as the Genesis, with no divide), a2touchpuck's `ldy a2 / cpy #$0018`
(`touch`, kept last for its `bcc`), pucknorm's `jsl ChkOffsides` (`frame`; the `jsl PuckIChk` before it is hybrid
icing's place) and checkgoal's `lda #$FFFF / sta collflag` (`goal`, the puck in a net's box). RAM at `$7E:FD10` (SA-1 builds: `$40:5500`): +0 carrier object, +2 cause (the same codes), +4
giveaways, +`$6C` takeaways (a word a roster player, the visitors `$34` on), +`$D4` totals, +`$DC` / +`$DE` the carrier's
and forcer's roster places. The pickup: `cmp #$FFFF / beq give / cmp #$8000 / bcs pass`. The pass at the net's mark:
`lda #$FFFD / ldy pucky / bpl / dec / sta cause`. No whistle between (gmode `$15D4` & `$0004`, gmpen, set by Stop4Pen,
cleared by InProgress_exit): two parts after the net's, before the clear (`stopGlue`, `stopFrame`, 50 bytes); puckglue's
and pucknorm's `jsl` go to them: `lda gmode / and #$0004 / bne / jmp` the count, else `ldy a2 / sty puckc / lda #$FFFF
/ sta carrier / sta cause / rtl`; and `lda gmode / and #$0004 / beq / lda #$FFFF / sta carrier / sta cause / jmp` the
frame's part.

### Applying and removing

Genesis: `place` the block, `writeHook` each of `GT_HOOKS`; out: the hooks' original bytes back, the block erased. A
stock 1 MB ROM grows to 2 MB with the counts and their pages. SNES: the `Placed` list of `giveawayPlaces`.

### Detecting

Genesis `gtIn`: the block byte for byte (any of `GT_VERSIONS`, with the ROM's tables), its hooks (the first `hooks` of
`GT_HOOKS`) and the places it has none at as the game has them. Earlier versions: 14 November 2026 (credited the spot),
15 November (no goalie's touch, no pass at the net), 18 November (bfda480: forgot the passer as a pass at the net was
released), later on 18 November (1d24880: no stoppage parts, a pickup after the whistle counted). They read as on;
`giveawaysOutdated` says so, the Hacks page offers "Put in the current version", and any apply with giveaways on puts
it in. SNES: versions 0-4 (`GT_NOW` 4, `GT_NET` 3 the later 18 November one, `GT_WIDE` 2 the first 18 November one);
an earlier one is `earlier` (vault version), replaced when asked.

### Interactions

Time on ice (shared Player Stats pages), hybrid icing (SNES: the `jsl PuckIChk` beside the frame's place; Genesis:
inside PuckIChk, which the frame code calls), the fights and the season shootout (RAM, FallDown).

### Files and tests

`src/core/hacks.ts`, `src/core/sneshacks.ts`, `HacksPage.tsx`, `SnesHacksPage.tsx`; `tests/giveaways.test.ts`,
`tests/snesgiveaways.test.ts`.

### Status

The counts: tested in the game by Match Viewer. The pass at the net as above (reached the goalie, the net or the goal line): tested in the game by Match
Viewer on 2026-11-18 on every system, with both marks, the goalie's stick and the posts. On the retail SNES the
added cycles shift play slightly on identical inputs (the game steps from the beam position); there is no slowdown,
and the SA-1 doesn't drift. NHL '95's version is in section 11.

## 17. NHL 94 Genesis and NHL '94 SNES: blocked shots

### What it does (for the player)

Counts each skater's blocked shots: a shot by the other team that hits his body while it is still a shot (nothing
has touched it since it left the stick). Not counted: a goalie's save, a stick stopping or deflecting the shot, a
shot off a teammate's body (a deflection), a shot that has already hit the boards, a net or anyone, anything in a
highlight or a shootout. Player Stats gets a Blocked Shots page (G, A, Pts, BLK; game stats only) after Giveaways and
Takeaways (if on) and before Time On Ice (if on). Game Stats gets a "Blocked Shots" row with each team's total, **only
with giveaways and takeaways off**: the table takes one more row at most (16), and Give/Takeaways takes it. The counts
start again each game. Option `blockedShots` (Statistics group), off by default, not recommended.

### Origin and credit

The commissioner's definition (shots only, a skater not a goalie, the team that did not shoot); NOSE4Web's code
(comment above `BLK_CODE` in `hacks.ts`). Built 2026-11-19.

### Where it lives (`hacks.ts`, `BLK_CODE`, `BLK_HOOKS`, `GP_CODES`)

- Counting: puckbody (`collide94.asm`, `$153CA`) is reached from the puck's collision check (`.chkbody`) for skaters
  only (position 0 goes to `.chkgoalie`); its `.hit` (`$153E8`) calls a2touchpuck, which clears sf2shot (sflags2
  `$C2EE` bit 4, set by doshot), so a shot counts once. The hook: puckbody's first instruction `btst
  #pf3onetimer,pflags3(a2)` (`082A 0003 0064`) becomes `jsr` code +0, which repeats that test and returns its flags
  (puckbody goes on unchanged), and in between repeats puckbody's own `.hit` test (`cmpi.w #8,Zpos(a3) / bgt`, else
  `d0 & $F` = 0). A block: sf2shot set, not gmhl (gmode `$C2EA` bit 4), not a shootout (gmode2 `$C2FA` bit 0), the
  skater not a goalie, and the shooter (shotplayer `$FFBED8`, the spot doshot writes as it sets sf2shot; spots 0-11)
  on the other team (pflags `$62` bit 6).
- Clear: StartGame's `.noso` `jsr (InitScores).l` (`$77CC`, `4EB9 0001 31F4`) becomes `jsr` code +4: clears the
  counts (keeping d0/a0), then `jmp InitScores`. (Not `$77C0`: the fight momentum hack's place.)
- Game Stats (giveaways off): `$FDE5E` (+8) and `$FDE6C` (+`$C`), the same places and scroll limits (`$FDCBC`,
  `$FDCCA` to `$80`/`$40`) as giveaways' row, code with copies of the two tables and the row `0010` "Blocked Shots "
  `2236 FFFF` after each; the `lea (pc)` extension words at code +`$D2` / +`$DC`.
- Player Stats: the time on ice hack's five places (`TOI_HOOKS`) with a pages block (`GP_CODES`, all from one
  source: `GV`, `BLK`, `TOI` flags; with `BLK` 0 it is the giveaway pages byte for byte). Pages: 5-6 Giveaways /
  Takeaways (with giveaways), then Blocked Shots, then Time On Ice; the blocks page's GetStatColumn column is its page
  number, reading the count byte. The headings: on the blocks page the SOG column's is `' BLK    '` (length `$A`), its
  spaces over the PIM column's, which HEAD skips (as Time On Ice's `'     TOI'` does). The first version's `' BLK'`
  left the page before's heading there (TK, TOI or PIM; MV 2026-11-20): its four codes stay in `GP_CODES` after the
  current ones, recognised, and replaced whenever the hacks are applied (`blockedShotsOutdated` offers it on the page).
  NHL '95's are the same, translated (`nhl95BlockedShotsOutdated`, put in again when blocked shots is asked for on).

RAM: counts `$FFE890`-`$FFE8CF` (a byte a roster place, pnum, 32 a team, home first, to 255); team totals at team
struct `+$2236` (`$FFE904`, `$FFEC68`). Match Viewer found `$FFE000`-`$FFFEBF` unwritten in recorded games apart from
NOSE4Web's own blocks; giveaways ends at `$FFE88F` and its totals at `$FFE903` / `$FFEC67`; the fight momentum hack
uses `$FFF750`-`$FFF753`.

### Applying and removing

`place` the block, `writeHook` both `BLK_HOOKS`; after giveaways (steps order) so the Game Stats places go to
blocked shots only if they are still the game's. The pages go in at the time on ice step (`putPages`). Out: hooks'
original bytes back, block erased, and if it had the row, the two table places and the limits back.

### Detecting

`blkIn`: the block byte for byte (with the ROM's tables), both hooks, the two table places either both pointing at
it (with the limits hacked: "rows") or neither. Off when both places are the game's and giveaways' state is known (an
EVO build, whose own code is at giveaways' places, reads unknown). Giveaways' own detection accepts its table places
being blocked shots' row.

### Interactions

Giveaways (Game Stats row, shared pages), time on ice (shared pages), bodychecks (page 4 may be Checks For).

### Gotchas

- puckbody's `.hit` for a low puck needs `d0 & $F` = 0 (d0 the distance squared): many low touches never reach
  `.hit` and so are no block. Kept as the game has it; to check in play.
- A high fast puck at a skater makes him fall (FallDown): counted as a block.

### SNES (`sneshacks.ts`: `blockedShotsPlaces`, `blockedShotsShownPlaces`, `blkPagePlaces`; added 2026-11-20)

Three options, as giveaways are split: `blockedShots` (the counts), `blockedShotsShown` (Game Stats row) and
`blockedShotPages` (Player Stats page), the last two needing the first. Every place found by code, in every build.
- Counting: puckbody's first `lda puckz / cmp #8` (`ad....c90800100aa5..290f00f0034c....22`; checkpuckcoll_ccx
  calls puckbody for skaters only) becomes `jsl` + 2 nop. The code repeats puckbody's hit test (puckz >= 8, or d0 & $F
  = 0, as `.t2` is reached), then counts where sf2shot (sflags `$15D8` & `$1000`, doshot's `tsb`; a2touchpuck,
  wallcoll and ChkShotStat clear it) is set, gmode `$15D4` & `$0010` (highlight) and shootoutmode `$1D81` are 0, the
  skater's position is not 0, and shotplayer (`$0D29`, doshot's `stx`; checked against doshot's code) is an object
  below `$18` on the other side of `$0C`. Last it does `lda puckz / cmp #8 / rtl` again for puckbody's `bpl`.
- Clear: StartGame_go's second `jsl LoadTeamLines` (`a9020085..22......6885..af`), skipped when shootoutmode is set
  (PlayShootout runs StartGame_go; the season shootout keeps the counts).
- RAM: a byte a roster place (pnum; visitors `+$1A`), to 255, then team totals words at `+$34` / `+$36`: `$7E:FE40`
  (between the season shootout's fightinj copy `$FE00-$FE33` and NOSE4Web's / McMarkis's fightinj `$FE80`), SA-1
  `$40:5600`. Not yet confirmed unwritten by Match Viewer.
- Game Stats: the giveaways row's code made general (`statRowPlaces`, which gives giveaways' block byte for byte):
  the same places, the row `Blocked Shots` with source `$0010, totals, $FFFF`. So `EXCLUDES` holds it with
  `giveawaysShown`; `detect` reads the other one off, not unknown. A single-number row (kind `$x0`) is read at
  DisplayStats `.t1xx` (`lda [a0] / clc / adc a2 / tay / lda $0000,y / sta d0 / jsl PushNumber / jmp .7`), not at `.5`
  as the a/b rows are, so that `tay / lda $0000,y` is also a jsl to the row's read code (a2 = 0 home, 2 visitors).
  The first version (87d2c57) missed it, so the row showed whatever low RAM held (65535, or 0 on SA-1; MV
  2026-11-20): recognised as an earlier version (`earlier` places, `VAULT_VERSION_NOTE`), put in again on request.
- Player Stats: a page chained on what the four places call (the game's code, the time on ice page's, the giveaway
  pages' or McMarkis's), the block starting with a note (`N4WB`, then the places' bytes inverted, so that the code in
  it is not found by the other pages' patterns). Original layout: column 6, or 8 after the giveaway pages; with the
  time on ice page after it, that page is called with statcolumn / d0 / A one less (`dec` / `jsl` / `inc`), so the
  order is GV, TK, BLK, TOI. McMarkis's builds: after the last page (his, or the giveaway pages'). The plain compare
  is emulated (`cmp #5` sets carry, else no swap); McMarkis's returns Z clear to swap. The title before it gets "]"
  (Penalties', Takeaways', or McMarkis's last shortened by `MC_LAST_TITLES`). `detect` and `applySnesHacks` read and
  change the giveaway and time on ice pages with the page taken out (`withoutBlkPages`, `BLK_CHAINED`), putting it
  back after.

### Files and tests

`src/core/hacks.ts`, `HacksPage.tsx`, `HelpPage.tsx`, `hacksheet.ts`, `hackgroups.ts`; `tests/blockedshots.test.ts`.
SNES: `src/core/sneshacks.ts`, `SnesHacksPage.tsx`; `tests/snesblocks.test.ts`.

### Status

Not yet tested in the game.

## 18. All three games: the Real NHL season page (rosters from real seasons)

### What it does (for the player)

The Real NHL season page (`RealSeasonPage.tsx`) fills a ROM's teams with a real NHL season's players, 1967-68 on,
rated from that season's stats: rosters (the most games for each team), new lines, team names, the Offence and
Defence ratings from goals for and against, and from 1977-78 the power play and penalty kill ratings. A choice fills
the All-Star teams with the season's best of each conference. Or it re-rates the players a ROM already has, matched by
name ("Re-rate the players this ROM has", `rerateByName`). It is offered for games whose players have the original
game's attributes (`seasonBuilderSupported`; not NHL 94 EVO, whose overall is an estimate).

### Origin and credit

The stats are the NHL's public stats service (api.nhle.com, api-web.nhle.com), fetched by `scripts/fetch-seasons.mjs`
into `public/seasons/` (one file a season, `index.json`, `franchises.json`); conferences by `scripts/conferences.mjs`
(also `scripts/fetch-conferences.mjs`, which adds them to the files already there). The rating weights were fitted to
EA's own ratings of the 1992-93 season (the original NHL 94's), then changed by hand (2026-11-22). Match Viewer
play-tested the ROMs (2026-11-22/23: 52 computer games).

### Where it lives (`src/core/seasonbuilder.ts`)

- **Season files.** `{ season, teams: [{ code, location, name, franchise, record, special, conference, skaters,
  goalies }] }`; players as arrays (`SKATER_FIELDS`, `GOALIE_FIELDS`); `record` = W, L, T, OTL, GF, GA; `special` =
  [PP, PK] fractions or null before 1977-78; `conference` 'East' / 'West' (Eastern / Western from 1993-94, Wales /
  Campbell 1974-75 to 1992-93, the East and West divisions before; 2020-21 had none, so each team keeps its 2019-20
  one; standings on 1 March, matched by code or full name: the Cleveland Barons are CBN in the standings, CLE in the
  stats); a player's `stint` is the team's order among that player's teams that season. `parseSeason` reads one.
- **Standings, not totals.** Each stat becomes the player's standing among that season's chosen players of the same
  kind (forwards, defencemen, goalies): 0 lowest, 1 highest (`standing`). Per-game rates are drawn toward the group's
  average for few games (`rates`, 20 games); games count up to 70 % of the most (`skaterRaw`, `goalieRaw`).
- **Scores and values.** Each attribute's score is a weighted sum of standings (`WEIGHTS`, per F / D / G; `c` a
  constant; `count` how many of the original game's players have each value). `shareOut` gives the values in those
  proportions. Then, at the top (`rateGroup`): every player whose score reaches the lowest score that earned the top
  value in 1992-93 (`TOP_SCORE`) gets it, however many do; and the season's leader in the attribute's main stat (the
  largest weight >= `LEAD_WEIGHT` 1.2, games left out; `mainStat`, `leaders`) always gets it (Gretzky's 163 assists in
  1985-86 = Pas 6).
- **Hand changes to the fit (2026-11-22).** Agility: height and weight 0 (Weight already slows a heavy player in the
  game), age -0.15; Speed: age -0.1; age 0 for OfA, DfA, ShP, StH, ShA, Pas.
- **Defencemen's offence (`offenceAsForward`, 2026-11-22).** EA rated no defenceman above 4 in Offensive Awareness, so
  `WEIGHTS.D.OfA.count` stops at 4. Each defenceman is also rated against the forwards (`rateAgainst(fAll.group, ...)`):
  a forward's value above 4 replaces theirs; leading the forwards in the main stat (assists) gives the top value.
  Results: Orr 6 (six seasons), Karlsson 6 (2015-16, the league's assist leader); Coffey 5 (1983-86), Potvin 5
  (1978-79), Green 5 (2008-09), Makar 5 (2021-22, 2024-25). 1992-93: none above 4, as EA.
- **Players outside a group** (too few games to make a roster, or defencemen rated as forwards): `rateAgainst` gives
  each the value of the group's player with the highest score not above theirs, or the top value if their own score
  reaches `TOP_SCORE`; never a leader's (margin `Infinity`), as a leader's top value is for their stat, not their score
  (without that, Giordano got a 6 in 2015-16).
- **The overall cap (`capped`).** At most 100 for a skater (Lemieux's), 98 for a goalie (Belfour's): the highest
  attribute comes down a step at a time, ties to the one least above what its value needs (`Rated.margin`); Roughness
  and Aggression are kept.
- **Names (`gameName`, `nameCase`).** Plain letters, 19 at most (longer: first initial); Mc / O' / D' plus a capital,
  Mac only for `MAC_NAMES`; `SPELLED` fixes the NHL's misspellings (Mcllwain).
- **Rosters (`rateSeason`).** A traded player goes to the team with the most games or the last one (`traded`); each
  team's goalies, forwards and defencemen with the most games (2 / 15 / 8 by default). The starting goalie: most
  games, ties to the better overall rating (Irbe ahead of Hackett, San Jose 1992-93; added 2026-11-23). Weight,
  hands and fighting (penalty minutes and size, `handedFighting`) come from the player.
- **Placement (`defaultPlacement`).** Same full name, then franchise (`franchises.json`: the Atlanta Flames go where
  the Calgary Flames are), then nickname; the rest in order to the teams left, never to the All-Star teams
  (`isAllStar`: "All Star(s)" in the names).
- **Into the ROM (`applySeason`).** Rosters, `buildLines` for every line, names (`names` option), room made with
  `expandTeamSpace` or the fewest-games skaters left out (down to 18), then Offence / Defence / PP / PK shared out by
  rank from the values the placed teams had (`projectTeamRatings`, `setTeamRating`; which half of the PP / PK byte is
  which follows the PP / PK fix).
- **All-Star teams (`allStars` option, `allStarSlots`, `allStarRoster`; added 2026-11-23, off by default).** The ROM's
  All-Star teams with no season team put in them, East by "East" / "Wales" in the names, West by "West" /
  "Campbell", else the first East and the next West. Each takes the best goalies, forwards and defencemen of that
  conference's season teams by overall rating, as many as the other teams get (`ownNumbers` for shared numbers), new
  lines, and keeps its names and team ratings.
- **Offer only these teams (`src/core/seasonmenu.ts`: `offerOnly`, `offersOnly`; added 2026-11-25).** After a
  bring-in: `withTeamOrder` puts the placed slots first (in slot order), then All-Star teams (`isAllStarTeam`), then
  the rest; `menuTeams.offered` = placed + All-Stars (team menu lines past it set to the last offered, as Game
  settings does); `leagueDraws` over the placed teams only. Refuses with `teamMoveRange`'s reason, or where the ROM
  has no `menuTeams`. Retail + 1987-88: 21 teams + 2 All-Stars offered, Check ROM clean (tests/seasonmenu.test.ts).
  The page also notes placed slots at or past `menuTeams.offered` before the bring-in (CDL Season 12 placed New
  Jersey and Washington at 27/28 of 24 offered).
- **That season's rules (`src/core/erarules.ts`: `eraRules`, `eraDraft`; added 2026-11-23).** By the season's first
  year: before 2005 a tie after one overtime (Genesis `seasonTies` 'tie', SNES `seasonOvertime` and `seasonShootout`
  off, NHL '95 its three tie choices off); from 2005 a shootout after one overtime plus `nhlShootout`; from 2015
  `threeOnThree` in the regular season only (Genesis 'season', SNES amount 1, '95 `threeOnThree`, not
  `threeOnThreeAll`). Before 2005 `nhlShootout` is left alone (it also plays Shootout mode). The games always play an
  overtime and have no 4 on 4, so pre-1983-84 and 1999-2015 are as near as they go. Overtime length is not touched.
  `eraDraft` makes a Hacks-page draft (`base`/`wanted`, SNES `amounts`) put in with `applyHackDraft`; choices whose
  code the ROM has changed (`unknown`, SNES `notOffered`) are left out and named.

### Gotchas

- The season files are public data, committed; re-running the fetch rewrites them all (keys in the order above).
- `rateAgainst` must never copy a value from a leader (see above).
- The All-Star players also stay on their real teams (as in the original game's All-Star teams).
- Computer play doesn't show passing well: in MV's games Gretzky (Pas 6) led Edmonton in goals, not assists; the
  computer's centres shoot rather than pass.
- A season with fewer teams than the ROM leaves the rest as they are (1985-86: retail's Anaheim, Florida, Ottawa,
  San Jose, Tampa Bay).

### Files and tests

`src/core/seasonbuilder.ts`, `src/RealSeasonPage.tsx`, `scripts/fetch-seasons.mjs`, `scripts/conferences.mjs`,
`scripts/fetch-conferences.mjs`, `public/seasons/`, `src/core/erarules.ts`, `src/core/seasonmenu.ts`; `tests/erarules.test.ts`, `tests/seasonmenu.test.ts`, `tests/seasonbuilder.test.ts` (season files, names, rosters,
leaders, defencemen's offence, goalie ties, EA's 1992-93 ratings given back, placement, All-Stars, re-rate),
`e2e/app.e2e.ts` ("fills the teams from a real NHL season").

### Status

Built 2026-11-21 (a8e97f3), ratings changed 2026-11-22 (85c6cef, 65dbf26), All-Stars and goalie ties 2026-11-23
(b686800). Match Viewer play test 2026-11-22/23: all ROMs play; stars lead scoring; Genesis 1992-93 like retail.
SNES 30 paired games 2026-11-23: goals 2.40 against retail's 3.00 (standard error 0.35), shots alike; the earlier
gap was noise. Season rules added 2026-11-23.

## 19. Feature status

"Game-tested" follows the page texts ("Tested in the game by the NHL94 Match Viewer project" vs. "Not yet tested
in the game"). For NHL 94 Genesis and SNES, each option on `HacksPage.tsx` / `SnesHacksPage.tsx` carries its own
line; check there.

### NHL '95 Genesis

| Feature | NOSE4Web files | Game-tested? | Documented here? |
|---|---|---|---|
| Rosters, ratings, lines, team names, team and rink colours, playoff draws, period lengths, rules, menu defaults | `team.ts`, `attributes.ts`, `settings.ts`, `games.ts` | Checked against the game by Match Viewer (HelpPage) | No |
| Menu logos, centre-ice logos | `graphics.ts`, `games.ts` (`NHL95.graphics`), `pictureset.ts` | Yes (HelpPage) | **Yes (7)** |
| Banners (menu, in-game, pause), more room | `graphics.ts`, `games.ts` (`bannerReferences`, `gameBannerRoom`) | Yes (HelpPage) | **Yes (7)** |
| Organ songs and team songs | `nhl95music.ts`, `teamsongs.ts` | Yes | **Yes (6)** |
| Fighting (+ power-on setting) | `nhl95fightdata.ts`, `nhl95hacks.ts` | Yes | **Yes (5)** |
| Room and RAM map | `space.ts`, `nhl95hacks.ts`, `nhl95fightdata.ts` | n/a | **Yes (10)** |
| Overtime until a goal, season shootouts, NHL shootout | `nhl95hacks.ts` | Yes | **Yes (8)** |
| 3 on 3 overtime | `nhl95hacks.ts` (`OT3_*`) | Yes | **Yes (8)** |
| Fixes: assists x3, aggression, comeback, rocket pass, open net, blind ring, runaway, goalie pull, sniping, penalty shot x2, pass direction, ppPk, faceoff, awareness, stick shots | `nhl95hacks.ts`, `hacks.ts` | Yes | **Yes (9)** |
| Computer centres' defence fix | `nhl95hacks.ts` (`SWITCHES.centreDefenceFix`), `hacks.ts` | No (not yet) | **Yes (9)** |
| Goalie turning fix | `nhl95hacks.ts` (`SWITCHES.goalieTurnFix`), `hacks.ts` | Yes | **Yes (9)** |
| Bottom net shot aim fix | `nhl95hacks.ts` (`SWITCHES.shotScatterFix`), `hacks.ts` | Yes | **Yes (9)** |
| Stick reach fix, skaters block the puck ('95's own bugs) | `nhl95hacks.ts` (`SWITCHES.stickReachFix`, `bodyBlockFix`) | Yes | **Yes (9)** |
| Organ after a pause | `nhl95hacks.ts` (`ORGAN_*`) | Yes | **Yes (9)** |
| Any skater at any position | `nhl95hacks.ts` (`SWITCHES.anyPosition`), `anyposition.ts` | Yes | **Yes (11)** |
| NHL 94's settings: three stars, bodychecks, time on ice, giveaways, real-time clock, penalty time, fighting penalty time, no icing, hybrid icing, delayed calls, B-checks, injuries, shootout injuries, extra period length, energy and injury risk (9), goalie (5), skating/puck (4) | `nhl95hacks.ts`, `hacks.ts` (`HACK_RANGES`) | Yes | **Yes (11)** |
| Game music (title, end of period, scouting report): play, export, replace from MIDI | `nhl95music.ts` (`NHL95_GAME_MUSIC`, `readNhl95Music`, `nhl95MusicFromMidi`, `withNhl95Music`), `genesismusic.ts` | No (not yet) | **Yes (13)** |
| Fight momentum (with fighting), blocked shots (with the body fix) | `nhl95hacks.ts` (`momentumCode95`, `BLK_CODE95`, `GP_CODES95`) | No (not yet) | **Yes (11)** |

### NHL 94 Genesis

| Feature | NOSE4Web files | Documented here? |
|---|---|---|
| Rosters, ratings, lines, team colours, settings | `team.ts`, `attributes.ts`, `settings.ts` | No |
| Logos, banners, lettering, photos, score logos, splash, menu picture, announcer, credits | `graphics.ts`, `pictureset.ts`, `lettering.ts`, `photos.ts`, `genesisscorelogos.ts`, `splash.ts`, `menupicture.ts`, `announcer.ts`, `credits.ts` | No |
| Organ songs and team songs | `genesismusic.ts`, `teamsongs.ts` | No |
| Game music (title, end of period, scouting report): play, export, replace from MIDI (tested in the game) | `genesismusic.ts` (`GAME_MUSIC`, `gameMusicFromMidi`, `gameMusicToMidi`), `OrganSongsSection.tsx` (`GameMusicSection`) | **Yes (12)** |
| In-game banner colours: stripes as the in-game banners show them, arena colour B for a missing one | `gamebannercolours.ts`, `GameBannerColours.tsx` | **Yes (15)** |
| Giveaways and takeaways, the pass at the net | `hacks.ts` (`GT_VERSIONS`, `GT_HOOKS`) | **Yes (16)** |
| Blocked shots (tested in the game by MV 2026-11-20) | `hacks.ts` (`BLK_CODE`, `BLK_HOOKS`, `GP_CODES`) | **Yes (17)** |
| Hacks (fixes, statistics, rules, energy, goalies, skating, ...) | `hacks.ts`, `hackgroups.ts` | No |
| Computer centres' defence fix (tested in the game) | `hacks.ts` (`centreDefenceFix`) | **Yes (9)** |
| Goalie turning fix (tested in the game) | `hacks.ts` (`goalieTurnFix`) | **Yes (9)** |
| Bottom goalie's stick fix, bottom net shot aim fix (both tested in the game) | `hacks.ts` (`goalieBladeFix`, `shotScatterFix`) | **Yes (9)** |
| Goalie hold after a dive catch (`diveHold`, added 2026-11-20; MV-tested 2026-11-20 with a goalie on a pad: the whistle comes hold + 1 frames after he gets up, 47 frames after the catch in 94 and 56 in 95): puckglue's `move.w #5,temp5(a2)` after `cmpi.w #SPAgdive,SPA(a2)` (bytes at `$1530C`: `357C 008C 0048 0C6A 02F4 0058 6600 0008 357C 0005 0048`); the 5 is the word at `$1531E` (lead `357C` at `$1531C`), frames counted once the dive animation ends. Every goalie; with `goalieHold` 0 (`$D4C6` `9F6B` -> `6002`) a person's goalie is never counted, so only the computer's is whistled. 1-3600 | `hacks.ts` (`diveHold`), `tests/divehold.test.ts` | Yes (here) |
| Fighting (chaos, MIT) | `fight.ts`, `fightdata.ts` | No |
| Plus-minus log and three stars, NOSE4Web's versions of smozROM's (2026-11-25, after MV's chunk 2): plus-minus (log at `$FFDEF6`, 14 bytes a goal: flag byte, bit 7 away goal, low bits 2 even / 3 a side short, bit 6 penalty shot; then the 12 roster places on the ice; length in bytes at `$FFDEF4`) skips goals in a highlight (`btst #4,$C2EA` gmhl, at the start of its `$1494A` code), and its clear in clearTeamStats (`$17136`, now a `jsr` + 12 nops after the `movem.l (sp)+,a1-a3`) clears the two team structs, then the log unless the caller is StartHL2 (`cmpi.l #$135D8,8(sp)`: past the two goalie words clearTeamStats pushes). smozROM's cleared the log for an intermission highlight too, and logged its goal. Three stars: a shot faced 900 / 1,170 (smozROM's 4,000 / 4,500: a goalie first star in all 11 MV games), and the check term (+`$102`) weighs 0 unless bodycheck counts are in (`$12302` = `4E71 4E71`), as +`$102` is penalty minutes otherwise. smozROM's versions read as on (`plusMinusOutdated`, `threeStarsOutdated`) and are replaced at any Apply; `applyHacks(..., true)` writes them, for the smozROM hash test | `hacks.ts` (`PLUS_MINUS_CODE`, `CLEAR_CODE`, `starsFor`), `tests/starsplusminus.test.ts` | Yes (here) |
| Real NHL season: rosters and ratings from a real season, All-Star teams, re-rate by name | `seasonbuilder.ts`, `RealSeasonPage.tsx`, `public/seasons/` | **Yes (18)** |
| Clockwise's sprite edit (`clockwiseSprites`, added 2026-11-20, not yet tested in the game; Looks and sound): Clockwise's IPS from the NHL94 forum, pixels only, 3,498 records in the sprite tiles (`$5DE91`-`$9E0FB`; Spritetiles is `$5DE84`, from addframe2's `addi.l #Spritetiles`), the IPS's five header records (title, checksum) left out. Each record alone: apply writes Clockwise's bytes only where the ROM has the original game's, remove writes the original back only where it has Clockwise's, anything else is the league's own art and stays; and every record in a sprite tile (32 bytes from `$5DE84`) holding such league art is left alone both ways (CDL Season 12's nets have, in tile 3886, a record equal to Clockwise's, which off turned original; MV 2026-11-21). Where a ROM had some of Clockwise's records before it went in (NHL2008, nhl94juiced, capitalism2), apply places a block `NOSECLW1` + one bit per record (set: had it before; 446 bytes) and remove keeps those, then erases the block; no block where none were. hackRom also takes head bleeding out and puts it back last at every apply, so other hacks' code doesn't move past it on the next apply. Detect: on when no record is original and one or more are Clockwise's, otherwise off (undefined only for a ROM too short); hackRom takes it out only when the ROM reads on, so a partly patched ROM keeps its part. League ROMs: GDL Season 4 has it all; CDL family 3,449 original / 1 patched / 48 own art; NHL2008, capitalism2, juiced 122 patched. No overlap with the fighting patch (its frames, frame table and the colours at `$9E6A4` lie elsewhere; tiles stay put), head bleeding (tiles at the ROM's end) or goalieBladeFix (HotList). NOSE4Web's additions in Clockwise's style (added 2026-11-20, worked out by Match Viewer with Clockwise's rule: tape = colours 13/14 to 2 at the blade end; eye = a grey face pixel with 5+ skin neighbours to 2), in and out with it, not part of its detection (a ROM made before them reads on and gets them at the next apply if it has any of them, `hasNoseTape`; one with none, Clockwise's own patch as GDL Season 4, gets them only when the edit is turned on: hackRom leaves the edit alone while it stays on there, 2026-11-23): (1) chaos's fight frames 846-869, 38 bytes in 28 records at the patch's fixed offsets `$9E7B4`-`$A0351`, per record, wherever the ROM has chaos's fight frames (`fightFrames`: the patch's frame bytes from `$9E726`, 7,390 bytes, but for the tape's and at most 32 others), so also where the patch was put in by chaos's own tool, whose builds fightState does not know (2026-11-26: GLHL, menu inside the patch at `$20915A`, OptFight still `$FFDF00`, menu code 22 bytes on); a second `clockwiseSprites` step right after `fighting` in hackRom (withoutFight restores the patch's originals, so the tape goes with it); fightState accepts the patch's or the tape's bytes there (`tapedBytes`). (2) The faceoff close-up FaceOffSprites, found from checkfo (`movea.l #anim,a2; adda.l 4(a2),a2; add.w d4,d4; move.w 2(a2,d4.w),d5`, unique; the tiles are loaded by two `movea.l #anim+8,a2` before DecompressGraphicsPlain at `$FB2C` and `$16D00`, never moved): anim +4 long = frames' offset, +8 count word (bit 15 = packed), tiles from +10. The tape is on the toe end of each centre's stick, stopping 2 pixels short of the toe in every frame (2026-11-26, after a league member found the tape to the toe looked broken as the blade moves: 23 records, 39 bytes changed). Plain (`$00B3`, CDL family at `$11EA88`): the 23 records at tiles + offset, per record. Packed (`$80B3`, retail `$A78AE`, stream ends exactly at the frames, `$A878A`): 46 changes to the packed stream (473 bytes), all or none, made by re-encoding at the same length only the stretches of ops around the changed bytes (an optimal parse of EA's ops, forward and backward copies, padded to the stretch's length; a backward copy only as far as the game's 256-byte ring still holds: d + 2(k-1) <= 256, as the game reads past it the bytes just written, which genesisunpack.ts now does too; the earlier tapes' streams broke this, and the game cleared 2 and 4 of their stick pixels: MV 2026-11-26), so the ROM keeps its size and comes back byte for byte; checked after writing by unpacking (`genesisunpack.ts`, a port of DecompressGraphics/DecompressBytecode; retail unpacks to CDL's plain tiles exactly). The first version (15dfee5, whole blades: 81 bytes in 27 records, packed 149 bytes in 29 runs, `FACEOFF_TAPE_FIRST` / `FACEOFF_PACKED_TAPE_FIRST`) and the second (88c8168, to the toe: 50 bytes in 22 records, packed 221 bytes in 19 runs, `FACEOFF_TAPE_TOE` / `FACEOFF_PACKED_TAPE_TOE`) are taken out first whenever the tape goes in or out, so older ROMs get the current tape. `clockwiseOutdated` (an earlier faceoff tape, or chaos's fight frames without the tape) shows the Hacks page's Put in the current version. Data in `tapedata.ts` | `clockwise.ts`, `clockwisedata.ts` (generated), `tapedata.ts`, `genesisunpack.ts`, `tests/clockwise.test.ts` | Yes (here) |

### NHL '94 SNES

| Feature | NOSE4Web files | Documented here? |
|---|---|---|
| Rosters, lines, team names, ratings, colours, settings, menu, rink | `snesteam.ts`, `snessettings.ts`, `snesmenu.ts`, `snesrink.ts`, `snesplacenames.ts` | No |
| Logos, centre ice logos, name blocks, photos, score logos | `snespictures.ts`, `huffman.ts`, `lz.ts`, `snesblock*.ts`, `snesphotos.ts`, `snesscore*.ts` | No |
| Songs and team songs | `snesmusic.ts`, `snessongs.ts` | No |
| Game music (title, menu, playoff): play on the real samples (browser preview, not game-tested), export | `snesmusic.ts` (`SNES_GAME_MUSIC`, `readSnesMusic`, `snesMusicToMidi`), `snesaudio.ts`, `snesplayer.ts` | **Yes (14)** |
| Giveaways and takeaways, the pass at the net | `sneshacks.ts` (`gtEnv`, `gtCode`, `giveawayPlaces`) | **Yes (16)** |
| Hacks, fighting (McMarkis) | `sneshacks.ts`, `snesfight.ts`, `snesfightdata.ts` | No |
| Real NHL season (as on the Genesis) | `seasonbuilder.ts`, `RealSeasonPage.tsx` | **Yes (18)** |
| Fighting penalty time and McMarkis's fight pairing (`fightTime`; `fightTimePlaces`, `syncFightPairing`): InProgress's `clc / adc d0 / tay` (after `lda a2 / beq / lda #$34`) becomes a jsl to code that, for penalties $2A and $2C, puts the set time ORed with $2000 into d2. McMarkis's FightCoincidental (in his 2 MB and SA-1 builds and NOSE4Web's 1 MB fights) pairs the two fighters' majors only at a box time of exactly 5:00: `lda d2 / cmp #$212C / bne / phx / sty / ldx #$34`, then `and #$07FF / cmp #$012C / beq`. After every apply, `syncFightPairing` rewrites both values to the fight time if it is on, else 5 x the penalty time's seconds a minute, so pairing keeps working (at most 2047 s, the mask). A fighting penalty made shorter in the ROM's penalty table by other means (not something NOSE4Web edits) leaves both at 5:00 and the pairing off: on the SNES World Cup league's SA-1 ROM (2026-11-23) a fighter injured for the game came back after the penalty; Match Viewer is still working on it. In SA-1 builds work RAM is in BW-RAM, bank `$40` (McMarkis's fightinj at `$40:E74E`): search there, not `$7E` | `sneshacks.ts` | Yes (here) |
| Blocked shots: counts, Game Stats row, Player Stats page (`blockedShots`, `blockedShotsShown`, `blockedShotPages`; added 2026-11-20, tested in the game by MV 2026-11-20) | `sneshacks.ts` (`blockedShotsPlaces`, `blockedShotsShownPlaces`, `blkPagePlaces`) | **Yes (17)** |
| Fight momentum (`fightMomentum`; added 2026-11-20, tested in the game by MV 2026-11-20): with NOSE4Web's fights or McMarkis's builds' own | `sneshacks.ts` (`fightMomentumPlaces`, `fmCode`), `snesfight.ts` (momentum site skipped) | **Yes (9, Fight momentum)** |
| Computer centres' defence: the SNES code is right at both ends, no option | (none) | **Yes (9)** |
| Open net shot fix (tested in the game 2026-11-19: 37 open-net computer shots replayed, aim 0 -> 8, over the bar 1 -> 0, goals 12 -> 14): shotdiradj (`$9E:DFF7`, aims computer shots only) does `ldx a3 / stz d0` at `$9E:E094` (`A6 95 64 A5`) before its sightline test, so an open net gets aim 0 (high middle); jsl to `A6 95 A9 0800 85 A5 6B` sets 8 | `sneshacks.ts` (`openNetPlaces`), `tests/snesopennet.test.ts` | Yes (here) |
| Real-time clock (`realTime`, added 2026-11-19; MV-tested 2026-11-20: minors 119-120 clock seconds, power-play time and time on ice in clock seconds, penalty shots and the shootout start at 2500): Gameloop (`$9F:85B4`) and the highlights' copy (SaveRegsStartHL2, `$9F:9051`) take `sec / sbc #$0AAA` from gameclock+2 each frame (24 frames a game second); real time makes both `#$0444` (60 frames). Box time is in game-clock seconds, so it follows; the penalty shot's 1000-frame pstimer is left as is. Found by pattern `ad....f0..ad....38e9....8d....b0..ce....` (exactly 2) | `sneshacks.ts` (`RELOCATED.realTime`), `tests/snesrules.test.ts` | Yes (here) Also (2026-11-20, from MV play): updatepentime's own penalty second, `adc #$0018` reloading Penaltytimer (retail file `0xF3F66`; pattern `ad(....)38e5..8d(....)10..69..008d(....)a92000`, same address thrice), becomes `$3C`; the same tick counts attack-zone, power-play and time-on-ice seconds. A ROM with only the clock bytes (the first version) reads on as an earlier version and is updated. And the penalty shot limit: SetupPenaltyShot's `lda #1000 / sta pstimer` (retail file `0xFB062`, pattern `a901008d....a9....8d....22......6b`) becomes 2500, as the Genesis's game-time limit grows 2.5x. Each later place, missing where the clock is in, reads as an earlier version. |
| No icing (`noIcing`, added 2026-11-19, not yet tested in the game; Genesis TheTome): a2touchpuck arms icing at its end with `lda #ifok / tsb iflags / rtl` (`$9E:C5E9`, `A9 0400 0C F10C 6B`); `A9 0000` arms nothing, so PuckIChk, updateplayers' wave-off and assgoalie never see icing. No NEEDS/EXCLUDES with `creaseIcing` / `hybridIcing` (as on the Genesis): they simply have nothing to do | `sneshacks.ts` (`RELOCATED.noIcing`), `tests/snesrules.test.ts` | Yes (here) |
| Three stars (`threeStars`, SnesAmount 0 original / 1 improved for line changes off / 2 for on; MV-tested 2026-11-20 at 900 / 1170: goalie first star 9 of 20, as the original): the SNES has its own Stars of the Game box (ShowThreeStars, bank `$9C`, called from InProgress for one entry of its penalty list, record `$D434`); its `.17` (`$9C:9EC5` retail, `jsl`'d once per player, X 0-51) scores one player. Its first 5 bytes `64 91 A9 0200` (stz a2 / lda #2) become `22 llllll 6B` (jsl new code / rtl). The new code redoes .17 with the Genesis option's weights (hacks.ts `starsCode`): margin; skater: .17's overtime-winner bonus `$B71B0`, goals, assists, shots, checks given (NOSE4Web's bodycheck counts `$168E+s`,x, or the 2 MB builds' own pchf `lda.l`,x, found from ClearPlayerChecks); goalie (X below stargoalieend) only with a shot faced: (shots - 1 if behind) x SA + assists x A/2 + shutout bonus when he and his team let in none, else - GA x 11000; then .17's .3xx packing, rtl. Mul16U (A x X into r2) is the game's, read from .17. Works on all six test ROMs | `sneshacks.ts` (`threeStarsPlaces`, `SNES_STAR_TEXTS`), `tests/snesthreestars.test.ts` (65816 interpreter vs the Genesis formula) | Yes (here) 2026-11-20 (MV play: a goalie first star in all 28 games with the Genesis weights): a shot faced weighed 1500 / 1700 (MV: goalie first star 16 of 20); MV rescored those games (800 matches the original's share, 1000 a little more), so it now weighs 900 (choice 1) / 1170 (choice 2); code with 4000 / 4500 or 1500 / 1700 reads as an earlier version. |
| Goalie settings (`goalieHold`, `goalieWidth`, `goalieOut`, `goalieLine`; added 2026-11-19; hold, width and out MV-tested 2026-11-20; Genesis `goalieDelay` not ported, the SNES has its own goalie button). Hold: puckglue's `lda #$008C / sta temp5,y` (`$9E:9AD9`; a dive catch gets 5) is the frames; 0 (no whistle) hooks assgoalie .15 `BD 8310 38 E5C1` (`$9E:D4A0`, lda temp5,x / sec / sbc d7) with a jsl to code that skips the countdown for a person's goalie (playerpad,x >= 0) while temp5 > 5, so the whistle line (stz temp5) and dive catches still whistle; the computer's counts as before. Line: `cmp #$00BB / bpl / cmp #$FF45 / bmi` (`$9E:D488`, +-187; holding nearer centre is whistled at once), at most 210 because a computer goalie reaching it is always 211+ out. Range: assgoalie .2's box (|x| <= 48, depth >= 228) clears goalieflags bit 1; with it set a person's goalie without the puck has no pad control (doinput .13) and is skated back to his net. `BD 550D C9 D0FF` (`$9E:D368`) and `85 00 C9 E400` (`$9E:D381`) become jsls to code that uses the new width / distance only for a person's goalie (the computer's reads the bit for saves); assgoalietopuck's copy (computer only) untouched. Found by code patterns (`goalieEnv`); works on all six test ROMs, SA-1 RAM read from the code. goaliePoke's puckglue pattern now wildcards the 140 | `sneshacks.ts` (`goalieEnv`, `goalieHoldPlaces`, `goalieWidthPlaces`, `goalieOutPlaces`, `goalieLinePlaces`), `tests/snesgoalies.test.ts` | Yes (here) MV play (2026-11-20): the range can only shrink, as updateplayers also clamps every goalie without the puck to x within 43 and depth 229+ (cmp #$FFD5 / #$002C, #$00E5 / #$FF1B), so ranges are width 0-48 and distance 228-255. A non-zero hold time changes the computer's goalie too (keeps it ~250 frames at 300). |
| Posts for the right team (`postsFix`, added 2026-11-21; MV-tested 2026-11-21: 18 posts in 6 computer games on LoROM 2 MB and SA-1, all to the shooter's team on a shot, to the toucher's after a touch; McMarkis's 2 MB builds only, elsewhere `notOffered`): those builds count posts (tmposts `$7E:E7F0` / SA-1 `$40:E7F0`) in PostCount, from checkgoal's post branch (the post sound). It credits lastplayer's team (`ldx lastplayer / cpx #$0018 / bcs / lda pfteam,x`), but lastplayer (`$0CF3` / `$6CF3`) holds a player number (stored after lsr a), not an offset, so it read the player at half the number (MV: all of Finland's posts went to the Czechs). The ldx / cpx (6 bytes) becomes `jsl` + 2 nop to `lda lastplayer / asl a / tax / cpx #$0018 / rtl`. Pattern `ad....d020da` + `ae....e01800` + `b016bd....f005a20200`; found in nhl94snes_2026, nhl94_2026 and the SA-1 builds. A puck off the net's side or back is no post in the game (no post branch) and stays uncounted | `sneshacks.ts` (`RELOCATED.postsFix`), `tests/snesposts.test.ts` | Yes (here) |
| Goalie hold after a dive catch (`diveHold`, SnesAmount, off 5, 1-3600 frames; added 2026-11-20, MV-tested 2026-11-20 (whistle at 33 frames on 30; the count waits for pfalock, 150 frames after a dive)): puckglue's `lda #5` after `cmp #SPAgdive / bne` (pattern `a491a9....99....b9....c9....d006a9....`, once in every build; retail `$9E:9AE7`, file `0xF1AE7`, the word at `0xF1AE8`; Classic/SDL16 `0xF1CE8`; SA-1/2026 builds `0xF1AF3`). goalieEnv's pattern now leaves this word open, so the other goalie settings still find their places with it changed. With `goalieHold` 0 the assgoalie .15 hook leaves a person's goalie's count alone while above 5, so a dive hold over 5 is never whistled for him; the computer's goalie counts it down | `sneshacks.ts` (`diveHoldPlaces`), `tests/snesdivehold.test.ts` | Yes (here) |
| Skating and the puck (added 2026-11-19, not yet tested in the game; Skating and the puck group, choppyIce moved there from Rules as on the Genesis), amounts (`SnesAmount`), found by code in every build. `turnRate` (off 112, 1-225): stopna's `lda #$0070 / clc / adc legstr,x / ldx timestep / jsl Mul8U` (`$9E:A55E` retail, `A9 7000`), the operand becomes the number; Mul8U is 8-bit, so number + a goalie's doubled legstr (30) < 256. `speedBurst` (off 0, 1-95, same scale as the Genesis: push x dirtab 200): burst's `jsl Mul16U` (`$9E:8228`, energy x $233 >> 16, 35 at full) becomes jsl to `A9 nn00 85 0A 6B 5C <Mul16U>` (r2+2 = the push; the jml is never run, it keeps the address). `puckFriction` (off 9, 1-12, the Genesis's scale: 1/2^n of speed a frame; SNES .22 table $FF a 2-frame step = n 9): updateplayers' `lda.l .22-1,x` (`$9F:8774`, `BF 6E8B9F`) becomes jsl to 41 bytes: `lda.l own table-1,x / pha / lda gameframes / and #mask / beq keep / pla / pla / sep / pla / rep / tyx / jml .10 / keep: pla / rtl`, then the 10-byte table (n < 9: 256 x (1 - 2^-n)^t; n > 9: the original), the lda.l operand and n; n 10-12 skip .1xx's slowing on all but 1 update in 2, 4, 8 (gameframes `$1D6D`, `$7D6D` SA-1, read from Gameloop's `inc`). Choppy ice (hooks .1xx) adds on top. | `sneshacks.ts` (`turnRatePlaces`, `speedBurstPlaces`, `puckFrictionPlaces`), `tests/snesskating.test.ts` | Yes (here) |
| Genesis fixes the SNES does NOT need (Match Viewer's reading, 2026-11-19): pulled-goalie sniping (doshot `$9E:E220` has no goalie test), computer goalie pull (CPgoalie `$9E:D130` already pulls at 1 or 2 behind), rocket pass (dopass `$9E:E9BF`: speed from distance), gliding skater, repeated checks (FallDown `$9E:9B52` has no pair test), crowd bonus (crowd never affects play), Aggression wrap (checkagr `$9E:C124` is 16-bit), five-hole blind spot (checkpuckcoll_ccx `$9E:97DD`), penalty shot foul names (no table), one-timer assist; '95's stick reach and body y bugs are right on the SNES | (none) | Yes (here) |

### Editor-wide tools (added 2026-11-26)

| Feature | NOSE4Web files | Game-tested? | Documented here? |
|---|---|---|---|
| Music editor: `Edit…` on every organ song and piece of game music that can be replaced, all three games. `EditedMusic` (readMidi's notes in seconds, end, loop marker, programs, pitch bends, each channel's track name) edited on a canvas piano roll, written back as a format 0 MIDI file (one track, 960 a beat at 120 a minute, so a frame is 32 ticks; one track keeps the order of notes that start together, which format 1 tracks by channel did not, and which the Genesis game music's conversion depends on), and put in through the section's own Replace path. A SNES game piece's track names (EA's part names) go beside the file, so its parts get their own instruments and sides; its own volumes and percussion tracks do not. `crowded()` marks where more notes sound at once than go in (organ 4, NHL '95 7; NHL 94 game music 5 with the kick; NHL '95 one note a part; SNES 8 voices with drums). Play converts as Replace does (SNES: the ROM built in memory and played on its own instruments). An unedited piece goes in exactly as its own MIDI export would | `midiedit.ts`, `MusicEditor.tsx`, `OrganSongsSection.tsx`, `tests/midiedit.test.ts` | MV 2026-11-26: organ songs on all three; SNES playoff instruments after the track-name fix | Yes (here) |
| Each home team's rink colours (NHL 94; added 2026-11-27, MV-confirmed in the game 2026-11-27 incl. the SetHor/ClrHor build 8FC61E65): setupIceRinkPal (`$16C96`: `movea.l #Rinktilelist,a0; adda.l (a0),a0; moveq #$F,d0; movea.w #palfadenew($BD28),a1; move.l (a0)+,(a1)+; dbf; rts`, the only routine copying the rink palette) gets `jmp` to a copy of itself that then, by HomeTeam (`$C330`) x 4, sets line 0 colour 5 (palfadenew+10: boards trim, bench and box edges) and 9 (+18: red markings) from a table, $FFFF keeping the rink's. MV: every other colour of lines 0-1 is shared (fonts, box frames, EA logo, crowd sprites). Highlights show the highlighted game's home team's colours (StartHL2 sets HomeTeam). MV 2026-11-27 (first build B446AC6C passed in play): colour 5 is also the horizontal scoreboard's frame, clock box border, top trim and glass supports, so SetHor's `bset #sfhor,(sflags).w` (`$12B98`) and ClrHor's `bclr` (`$12B44`), each right after the routine's `movem.l d0-d7/a0-a6`, become `jsr` to code that does the bset / bclr and puts the rink's own 5 and 9 (from Rinktilelist) or the team's back in palfadenew; every call comes between a fade to black and the fade in, so palfadenew is enough | `arenacolours.ts`, `ArenaColoursSection.tsx`, `tests/arenacolours.test.ts` | Yes | Yes (here) |
| Intermission report (NHL 94; MV's routine, 2026-11-28; NOSE4Web's builds MV-confirmed 2026-11-28: retail 4E201C60 same lines as MV's build over 7 period ends, CDL 12 with every hack A5025AE4: 26 intermission menu screens pixel-identical to a control, only the box differs; not tested: Playoffs mode): `hacks.ts` intermissionReport. Intermission's `bsr.w GetShifter; move.w d1,(TickerNum).w` at `$1315C` (`6100512C 31C1CF2C`) becomes `jsr` + nop to MV's position-independent routine (`intreportcode.ts`, 1,934 bytes; source intreport94.asm in MV's repository), which shows up to two pages of two-line facts from the team stat blocks in the ticker box (192 frames a page; START skips report, ticker and highlights; not at gsp 0 or in a shootout) and ends with the two replaced steps. It calls GetGoalieCount $9F40, waitxsr $111D0, Framer $119B8, print $11BA4, ClearTickerArea $134D8, SetTickerAreaPosition $134E4, GetShifter $1828A, GetPlayerNamePointer $18BC8 by absolute address, so detect requires each to start as retail's (all league NHL 94 ROMs on hand do; EVO hooks $1315C itself, so it is not offered there). Stack frame only, no RAM of its own | `hacks.ts`, `intreportcode.ts`, `tests/hacks.test.ts` | Yes | Yes (MV) |
| Intermission report (NHL '94 SNES; MV's routine intreport94s_patch.asm, 2026-11-28; tested in the game by MV on all 7 ROMs below: forced case on each, whole computer games on 4; NOSE4Web's own builds not yet MV-confirmed): `sneshacks.ts` intermissionReport, `snesintreportcode.ts`. Off by default, Statistics group. Two hooks, same sizes as replaced: Intermission's `jsl Intermission_ticker` (hookA) becomes `22 <code>`; IntermissionTick's `lda demoflag / beq IntermissionTick_done` (hookB, `AD 2F0D F0 22`; `AD 2F6D F0 22` on SA-1) becomes `5C <code+$40> EA`. Up to two ticker pages of two-line facts (Genesis scores/wording), $150 frames a page, the pause menu live; not before the game or in a shootout. Three embedded variants, each MV's asar output at `$A0:8000` (2,368 bytes): the 1 MB game (retail, Classic, 2-on-2, pond hockey; hookA `$9F:A2E6`, hookB `$9F:A393`; CRC32 D0705B89), McMarkis's 2 MB LoROM nhl94snes_2026 (`$9F:A2F5` / `$9F:A3A2`; 9EF78B70), SA-1 nhl94_2026 (`$9F:A34F` / `$9F:A3FC`; 20138CE9; nhl94snes_SA1 differs only in NewTicker3Pos, 88C9C4A6). A build is recognised when MV's patterns (Intermission_ticker, IntermissionTick past its first test, Intermission, print, Framer, GetGoalieCount and GetPlayerNamePointer with the team bank) fit at that variant's addresses and the team table's entry bank is its TEAMBANK ($9C / $A1 / $A1); NewTicker3Pos is found by its record (`0500..0217 0500..0217 1C00` + 26 spaces) once in bank $9C and written at +$A6. Placed with `farRoom` (bank $9B, $80, then $9F: one bank); relocated by MV's lists (68 16-bit code fields + (A-$8000), the bank byte of 5 24-bit fields); off restores the hooks and $FF. RAM: $7E:EF00-$EF6B (LoROM) as MV built it; on SA-1 MV's $40:4800-$486B is inside the season shootout's saved-state block ($40:4810 up), so NOSE4Web moves it to $40:5700-$576B (MV's 204 RAM fields + $F00; between blocked shots' $40:5600-$5637 and the shootout fightinj copy $40:5800; MV measured $40:46F4-$60FF never written by the game). Offered too on ROMs whose code is as these builds' (SDL16, the 1996 World Cup ROMs, nhl94_SA1_Original, nhl94_2026_classic); elsewhere (SA1_60fps_league: code moved) `notOffered` | `sneshacks.ts`, `snesintreportcode.ts`, `tests/snesintreport.test.ts` | Yes (MV, its own builds) | Yes |
| Goal sounds (NHL 94 and NHL '95; added 2026-11-28, MV-confirmed 2026-11-28: 94 76EE874B, '95 AFB0F984, 32 goals both gmdir, penalty shots, '95 shootout; goal songs unchanged): checkgoal's siren, `move.w #SFXsiren,-(sp); bsr.w sfx` (NHL 94 `$1484A`, sfx `$11132`) / `jsr (sfx).l` (NHL '95 `$8C3B0`, sfx `$677AC`), found between the vblank wait (`b078....67fa301f`) and `jsr (freezewindow).l; addi.w #$1F4,(Crowdlevel).w`, becomes `jsr` code + nop (NHL '95 two). The siren plays before the scorer is known, so the code works it out as checkgoal does just after: home scored when `tst.w Ypos(a3)` is not negative XOR `btst #gmdir,(gmode).w` (gmode read from that btst: NHL 94 `$C2EA`, NHL '95 `$BEF0`; freezewindow does not touch a3). Code (62 bytes): `movem.l d0/a0,-(sp); tst.w $14(a3); bpl.s .up; btst #1,(gmode).w; bne.s .home; bra.s .away; .up btst #1,(gmode).w; beq.s .home; .away move.w table+64(pc),d0; bra.s .play; .home move.w (HomeTeam).w,d0; add.w d0,d0; lea table(pc),a0; move.w (a0,d0.w),d0; .play move.w d0,-(sp); jsr (sfx).l; movem.l (sp)+,d0/a0; rts`, then 32 home words and the visitors' word. Choices: siren $0, end of period horn $4, crowd cheer $B, crowd boo $C (added after MV's test, same path), none $FFFF (sfx skips a negative number, both games). Penalty shot and shootout goals come through the same place. MV: both games also start their own crowd cheer at every home goal (not controlled here; retail visitors' goals get the siren alone), so home 'none' = that cheer only; horn + cheer ~1.7x the siren's loudness; '95's siren (driver $26) stops a playing song, others don't, but the goal code stops the song a frame earlier anyway | `goalsounds.ts`, `GoalSoundsSection.tsx`, `tests/goalsounds.test.ts` | Yes | Yes (MV) |
| Pre-game songs (NHL 94 and NHL '95; added 2026-11-27, MV-confirmed in the game 2026-11-27: NHL 94 55ACEF90, NHL '95 D64C6B0B, organ $32 and $37): ScoutingReport's `move.w #song,-(sp); jsr (song).l` (NHL 94 `$FCC86`, $7A; NHL '95 `$9F5E4`, song 3, found by the bytes around them) becomes `jsr` code + two nops; the code: `movem.l d0/a0,-(sp); move.w (HomeTeam).w,d0; add.w d0,d0; lea table(pc),a0; move.w (a0,d0.w),d0; bpl.s +6; jsr (p_turnoff).l; move.w d0,-(sp); jsr (song).l; movem.l (sp)+,d0/a0; rts`, a word a team ($FFFF: silence, as song() skips a negative number). MV 2026-11-27: on NHL 94 a negative number left the Game Setup title music playing, so silence first calls p_turnoff (`$1A264`, all sound off, saves its registers); NHL '95's driver restart (SoundCmd 7) before the hook already stops it, so there that jsr is 3 nops. NHL 94 organ songs play once (17-25 s). NHL '95 (MV 2026-11-27): ScoutingReport loads only patch list 0 (front end); organ songs ($32-$38) need patch $19 (and $0C for $32/$35), only in list 1, so they ran silent; its code (56 bytes, MV's tested fix) loads list 1 first for a song $32 and up (`move.w #7,d0; move.w #1,d1; jsr (SoundCmd).l`, SoundCmd `$676D8`, read from the jsr just before the place), saving d0-d2/a0-a2; list 1 on top of list 0 leaves out patch $49 (an effect), unused there. Game music loops until the game start's music (MV-checked on both) | `pregamesongs.ts`, `PregameSongsSection.tsx`, `tests/pregamesongs.test.ts` | Yes | Yes (here) |
| SNES Game Setup background (retail and 32-team SA-1 builds; added 2026-11-27, MV-confirmed in the game 2026-11-27: 3D5CA98C, FB76D82D): setoptions/SetupScreen draws BG2 (mode 1) as MenuBack (shared with other menus: MenuBackTiles LZ from char 0, MenuBackMap with palette 3 added, word bits giving rows 3/4; MenuBackPalette's 32 colours to rows 3-4) with SetupBackTiles (Huffman, char 104 = backchars on) and SetupBackMap (6-byte header 32/28/$308, then 896 words; a non-zero word gets backchars + palette 2, so $0400/$0800 give rows 3/4; 0 keeps MenuBack) over it; SetupBackPalette's first 16 colours are row 2, colour 0 the backdrop $3568. Room: chars to $1FF (VRAM $1680-$2FFF), 408 tiles with tile 0 unused; rows 2-4 never change on the screen. The loaders (`lda #bank; sta; lda #addr; sta`) are found after setoptions' `cmp #setupvis; bcs; jmp; sbc; sta.l` (retail $EDC1F, SA-1 $ED1BB/$ED1BF) and repointed to packed copies in free space (ROM grown to 2 MB if needed). Logo boxes (cols 1-7, 24-30, rows 1-7) and team name blocks (row 11, cols 1-9, 22-30) always cover BG2 | `snessetuppicture.ts`, `SnesSetupPictureSection.tsx`, `tests/snessetuppicture.test.ts` | Yes | Yes (here) |
| Title screen picture (NHL 94 and NHL '95 Genesis; added 2026-11-27, MV-confirmed in the game 2026-11-27: 7DDE850F, 4D676BFD): TitleScreen (title94.asm / title95.asm) draws TitleScreenImg (jim format as GameSetUpMap, 32 x 28, uncompressed; NHL 94 `$4E45C` 526 tiles, NHL '95 `$18DAA8` 1013) with `movea.l #TitleScreenImg,a0` twice (NHL 94 `$FF10C`, `$FF13E`; NHL '95 `$A1374`, `$A13A6`): rows 0-22 into the window, 23-27 on plane B under the credits (heights hard-coded). Tiles from 0, then NHL 94's shield (40), NHLPA logo (39), lettering (151) and the font (94) below plane B at tile $500: room 956 (NHL '95: lettering 76, room 1110), more than 896 cells. Palette: rows 0-3 from the picture, row 3 then the lettering's (TitleImg, `$FF1D4` / `$A13E4`), colour 0 black; row 1 shared with the shield/logo/lettering/credits (credits row 1 colours 1, 13): a picture sets rows 0, 2 and row 1's 11, 12, 14 (NHL '95: all but 1, 7, 13), and may draw squares in row 1's and row 3's fixed colours. A new picture goes in free room with both pointers changed | `titlepicture.ts`, `TitlePictureSection.tsx`, `tests/titlepicture.test.ts` | Yes | Yes (here) |
| Whole Genesis rink, import on NHL '95 (added 2026-11-27, MV-confirmed in the game 2026-11-27, D01E2B17: patches show, reverse identical, logo/EASN/energy/crowd/sprites/fonts tiles identical, priority as retail; MV's measurements 2026-11-27): Rinktilelist `$C4A7C` (468 tiles, palette `$C8506`, map header 48 x 85 at `$C8586`, cells from `$C858A`), all 85 rows shown, no kept cells but the centre ice logo's (last 24 tiles, rows 42-45, cols 21-26); the reverse angle replay is RevRinkTilelist `$16060E`, a bare 48 x 85 map (header there, cells from `$160612`) over the same tiles (found after updatescroll's `movea.l #Rinktilelist,a0; adda.l 4(a0),a0; blt; btst #4,(sflags4).w; beq.w; movea.l #RevRinkTilelist,a0`). `importGenesisRink` takes every map over the tiles together: the edited one from the picture, the other from its own drawing, so the tiles serve both. The rink uses all 444 non-centre tiles, so an edit can only reuse or replace squares (6 more tiles fit in VRAM, but only by moving Rinktilelist; not done) | `genesisrink.ts`, `GenesisRinkPicture.tsx`, `tests/genesisrink95import.test.ts` | Yes | Yes (here) |
| SNES rink import and editing (retail and 32-team builds; added 2026-11-27, MV-confirmed in the game 2026-11-27 on 4 ROMs incl. 68 extra tiles): IceRinkTiles (LZ, 613 tiles) and IceRinkMap (LZ, 48 x 113) re-packed into free space (retail grows to 2 MB), every `lda #bank; sta $0E; lda #addr; sta $0C` of each repointed (tiles: setupice's and the reload's, retail `$FB6F7`/`$FE7AD`, 2026 `$FB797`/`$FE8C1`; map: BuildRinkMap's, `$DC1D5`/`$DC15B`). Kept: rows 85-112 (pause scoreboard rink, replay icon whose tiles must stay >= 256), logo cells (rows 43-48, cols 20-27: both builds' placements), tiles 0-65 and every cell showing 1-65 (showcrowd animates them), each cell's palette row, priority and place. Tiles may grow by 85 (MV: 95 would end exactly at $5FFF on 2026; at +68 the tightest moment, pause item 4, reached $5E4F, 27 tiles spare) | `snesrink.ts`, `SnesRinkEditor.tsx`, `tests/snesrinkimport.test.ts` | Yes | Yes (here) |
| Each home team's crowd colours (NHL '95 and SNES; added 2026-11-27, MV-confirmed in the game 2026-11-27): the rink-only colours there are crowd shirts. NHL '95: setupIceRinkPal (`$7D6F0`) jmp to a copy that sets palfadenew line 1 colours 14, 9, 8, 6 (`$B97E`, `$B974`, `$B972`, `$B96E`) from a table by HomeTeam (`$BF54`), 14-byte blocks (the first build put them 12 apart and hung the game). SNES: setplayercolors' `jsl SetTeamColors` (retail `$FB901`, 2026 `$FB9A9`) jsl's to code calling it then writing palette 1 colours 24-27 into both `$7E35F4` and `$7E36F4` by HomeTeam (`lda.w`); covers setupice, ExitStatsScreen, StartHL2. Two colours a team (each with a darker shade), from the banner (NHL '95 stripes; SNES block ramps' colours 7 and 8) or chosen | `crowdcolours.ts`, `CrowdColoursSection.tsx`, `tests/crowdcolours.test.ts` | Yes | Yes (here) |
| Side-on scoreboard ads (NHL 94 and SNES; added 2026-11-27, MV-confirmed in the game 2026-11-27: 17E6CA14, 4C6FACD4, A78E79ED). NHL 94: IceRinkHorMap (`$BC05C`, jim, 212 raw tiles, 32 x 28 map in lines 0-1, its 64 colours never loaded: SetHor's dobitmap has d5 = 0, so it draws in the rink's palette lines 0-1) pointed to by SetHor's `movea.l #IceRinkHorMap,a1` (`$12BBC`) and `movea.l #IceRinkHorTiles,a2` (`$12BC6`, header + 8); room 454 tiles (ClrHor reloads the vertical rink's after); shown whole rows 0-1, 6-11, 18-27 (boards/glass ~17-21), rows 2-5 under the team blocks/scores/clock, the menu box rows 12-17 cols 5-26, ticker rows 23-27 cols 3-28, penalty bar row 11. A new picture goes in free room, both pointers changed. NHL '95 has no side-on picture. SNES: SetHor_rink shows the rink map's rows 85-112, columns 0-31; a 904-row rink picture may change them (replay icon rows 85-92 cols 32-39 and crowd tiles 1-65 kept) | `horboard.ts`, `HorBoardSection.tsx`, `snesrink.ts`, `tests/horboard.test.ts` | Yes | Yes (here) |
| Rink themes (NHL 94; added 2026-11-27, MV-confirmed in the game 2026-11-27, v3 2F0EBBAA / EB695F19): `rinkthemes.ts` redraws the stands (squares neither ice, by look: see-through or every channel >= 180, nor within two of it, and reachable from the picture's edge, so nothing the boards enclose) of both rinks and the side-on scoreboard's crowd (its rows 12-17 squares in line 1) as Outdoor (snow, pines) or Empty arena (seats, stairs), through the rink import (NHL '95's shared maps at once) and the side-on import. Not offered on NHL '95 (its stands are thin strips). No fans in the stands (`hacks.ts` noFans, MV's patch): showcrowd's `move.b (Crowdframe).w,d0` at `$16216` becomes `rts` (`1038 B89A` -> `4E75 B89A`): no crowd sprites (the goal celebration's and the side-on scoreboard's too); boxed players, crowd level and noise stay; games play out differently after a few hundred frames (beam-position randomness) | `rinkthemes.ts`, `hacks.ts`, `tests/rinkthemes.test.ts` | Yes | Yes (here) |
| Rink tools (2026-11-27, tool only or through the tested import): Make it fit (`importGenesisRink(..., fit)`: where a picture needs too many squares, the squares it adds that differ least from another, times the places showing them, are swapped for the closest, lazily re-costed; the rink's own only if that is not enough, so unedited parts and NHL '95's other map stay); the drawing guide (`genesisRinkGuide`: grid, the band within two squares of the ice bright, centre logo block red); Edit the rink (PixelEditor, each stroke an import with fit 'keep-new': where there is no room, as on NHL '95 (444 of 444 squares used) or after a few new squares on NHL 94 league ROMs (CDL 366 of 371), the rink's own nearly matching squares are merged first so the stroke stays as drawn; every changed place (`RinkImport.at`) is outlined in yellow on the page and in the editor until hidden (2026-11-28, the league's report that editing needed an import with Make it fit first); Copy/Stamp, copies snapped out to the 8 x 8 grid, stamps through afterStroke); a fixed palette for every rink file (rink's own colours, teams 0 and 1 on the benches, no per-team trim; SNES `snesRinkFileColours`), so files round-trip whatever teams the page shows; the branding pack (`screenset.ts`: Picture files' screens/ folder, each screen through its own page's import, files matching the ROM skipped); project files keep the Genesis rinks' tiles and maps (`genesisRinkBytes`); a cell in the rink's own lines (0 or 1) takes whichever of the two its pixels fit better, tie keeps its own (2026-11-28, the user's "zombies": people stamped over a line-0 boards cell lost their skin and clothes colours, which only line 1 has; team lines 2/3 and priority stay; the SNES import does the same between its rows 0 (boards, ice) and 1 (crowd), the same layout) | `genesisrink.ts`, `PixelEditor.tsx`, `screenset.ts`, `projectfile.ts` | n/a | Yes (here) |
| Whole Genesis rink, import (NHL 94; added 2026-11-27, MV-confirmed in the game 2026-11-27 (play and reverse, logos, replay icon, stars box, priority, ~140 reloads); MV's reading 2026-11-27): `importGenesisRink(rom, view, image, palette)` puts a 384 x 680 or 904 picture back into Rinktilelist (`view` 'play') or RevRinkTilelist ('reverse', found from updatescroll's `movea.l #RevRinkTilelist`) in place: the tile count stays (the EA logo at EASNcset and the faceoff close-up follow in VRAM, 2 tiles to spare; the reverse's must not pass the rink's); the last 24 tiles (home centre-ice graphics, loaded by setupice/ClrHor/ReloadRinkGraphics) and the cells showing them are kept, as are the replay icon (cols 32-39, rows 85-88) and on 'play' the three stars box (cols 13-18, rows 91-94) and any rows the picture leaves out; each cell keeps its palette line and priority bit (rows 78-84 boards/glass etc.), its pixels matched to that line (a see-through pixel is colour 0); squares deduplicated with flips; tiles of kept cells pinned. Too many squares: RinkImportError. Changes are ROM bytes (project files carry them in their patch) | `genesisrink.ts`, `GenesisRinkPicture.tsx`, `tests/genesisrinkimport.test.ts` | Yes | Yes (here) |
| Whole Genesis rink, export: `findGenesisRink` from setupIceRinkPal (`movea.l #Rinktilelist,a0; adda.l (a0),a0; moveq #$F,d0`; `$5605A` in NHL 94). Header: palette offset long, map offset long, tile count word (plain), tiles; palette 2 lines; map: width word (48), height word (113, NHL '95 85), cell words as the VDP has them. Lines 2/3 are the teams' (bench players). CDL Season 12 counts 456 tiles, the last two reading the palette's bytes, as the game does. The crowd, boards and benches are all in this map. Import: see the rows above | `genesisrink.ts`, `GenesisRinkPicture.tsx`, `tests/genesisrink.test.ts` | Not needed (read-only) | Yes (here) |
| Real NHL season banners: a season's team placed in another city's slot (location differs) gets its banners lettered with its city on NHL 94 Genesis (`letterBanner`, as the team page's Banner lettering), giving the pictures more room once (`expandPictureSpace`, retail 1 MB to 2 MB) and only keeping it if the lettering then fits; banners shared with another team are left. Notes name teams still with another city's banners (SNES) or another team's logo | `seasonbanners.ts`, `seasonbuilder.ts` (`applySeason`), `tests/seasonbanners.test.ts` | Awaiting MV (nhl94_1987_88_v2.bin) | Yes (here) |
| Page error boundary: each page in `PageErrorBoundary`, keyed by page and by ROM opened; shows the error with Try again and Copy the details, or, for a module that failed to load after a site update, Reload | `PageErrorBoundary.tsx`, `App.tsx` | n/a | Yes (here) |
| SNES energy options on a later SA-1 60 fps build: playeracc's drain there is `lda frames / and #$7F / cmp dp / bcs`, where earlier builds have `and #$3F / bne`; `findDrain` knows both (the skip branch 2 bytes later, everything after it moved 2 bytes), so knockdown and hold energy, injury risk and skating costs no energy are offered there | `sneshacks.ts` (`DRAINS`, `findDrain`), `tests/snesdrain60.test.ts` | Same code paths as tested; build not MV-played | Yes (here) |

### Planned / not built

- (none: the rink import on all three games, per-team rink and crowd colours and pre-game songs are built; see the rows
  above.)

## 20. How to extend this document

Add one section per feature per game, numbered after the last feature section, and add a "Yes" in section 19.
Copy this template; cite file and function names for every fact and mark inferences.

```markdown
## N. <Game>: <feature>

### What it does (for the player)
### Origin and credit
### Where it lives            (addresses as $XXXXXX / $FFxxxx, original and new bytes, table formats)
### Applying and removing
### Detecting                 (off / on / unknown rules; older or third-party versions)
### Interactions              (other options, free room, RAM, menus)
### Gotchas
### Files and tests
### Status                    (game-tested? quote the page text)
```
