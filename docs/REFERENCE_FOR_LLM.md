# NOSE4Web ROM knowledge: a reference for LLMs

## 1. What this is and how to use it

NOSE4Web is a browser ROM editor for three hockey games: **NHL 94 (Sega Genesis)**, **NHL '94 (SNES)** and
**NHL '95 (Sega Genesis)**. This file is a map of what the code knows about those ROMs, written for another LLM
that is helping someone build features in a *different* program (the first readers work on their own NHL '95
editor). It points you at the right files and gives the facts you need to write your own code.

How to use it:

1. Read sections 1 to 4 (purpose, licence, repo map, conventions). They apply to every game.
2. Find your feature in the status table (section 7). If "Documented here" says yes, read that feature section.
3. Then read the files and tests the section cites. The code is the authority; this document is a guide to it.

Detailed feature sections are added one feature and one game at a time. Today there are two, both NHL '95:
fighting (section 5) and organ/team songs (section 6). Everything else is listed in section 7 with its files only.

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
  - The NHL '95 fighting patch is **Vancecookcobxin's** (`src/core/nhl95fightdata.ts`: "included with
    credit"). The README's licence list does not mention it; its terms are whatever Vancecookcobxin set.
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
| `src/core/photos.ts`, `genesisscorelogos.ts`, `genesisblood.ts`, `splash.ts`, `menupicture.ts`, `announcer.ts`, `credits.ts`, `scouting.ts` | Player photos, score box logos, head bleeding, splash screen, menu picture, announcer, credits, scouting text. |
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
- Otherwise the block must equal the fixed code except the start word; the start word must be 0, 1 or 2.

### Interactions

- `claimSpace95` keeps `$1E0000`-`$1E0F4C` free while unused, so other code never blocks fighting (4.5).
- **Extra period length** (`fourthPeriodOvertime`): raises the Per. Length row's choice count at `$85EAD`
  and `$8F786`, and, when fighting is in, the patch's copy at `$1E0E73` (`OT4_FIGHT_COUNT95`,
  `setPeriodChoices95`), which the patch's menu reads. It is applied after fighting for that reason.
- **Fighting penalty time** (`fightSeconds`): hooks `$89448` (`3582 0068 0242 EFFF`); its code tests the penalty
  byte for `$26` and `$28` (`fightTimeCode95`). That these are the fighting penalties is inferred from the
  option's purpose.
- **Ratings**: Fighting shares a nibble with the shooting hand (`handedFighting93`, player attribute 8 of 14 in
  `NHL95.playerAttributeKinds`; an **odd** value is a left-handed shot, the reverse of NHL 94). Shown fighting
  is `[0,14,28,42,57,71,85,100][value >> 1]` (`attributes.ts`). In the ROM each player record is the name text,
  a jersey byte, then 7 bytes of 14 nibbles (`team.ts`, `parseTeams`), so this is the low nibble of the 4th
  attribute byte (inferred from that loop). A `+$74` RAM player offset was not found in the code.
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
with `TESTED`). `fightSeconds` is marked "Not yet tested in the game."

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

## 7. Feature status

"Game-tested" follows the page texts ("Tested in the game by the NHL94 Match Viewer project" vs. "Not yet tested
in the game"). For NHL 94 Genesis and SNES, each option on `HacksPage.tsx` / `SnesHacksPage.tsx` carries its own
line; check there.

### NHL '95 Genesis

| Feature | NOSE4Web files | Game-tested? | Documented here? |
|---|---|---|---|
| Rosters, ratings, lines, team names, team and rink colours, playoff draws, period lengths, rules, menu defaults | `team.ts`, `attributes.ts`, `settings.ts`, `games.ts` | Checked against the game by Match Viewer (HelpPage) | No |
| Menu logos, centre-ice logos | `graphics.ts`, `games.ts` (`NHL95.graphics`) | Yes (HelpPage) | No |
| Banners (menu, in-game, pause) | `graphics.ts`, `games.ts` (`bannerReferences`, `gameBannerRoom`) | Yes (HelpPage) | No |
| Organ songs and team songs | `nhl95music.ts`, `teamsongs.ts` | Yes | **Yes (6)** |
| Fighting (+ power-on setting) | `nhl95fightdata.ts`, `nhl95hacks.ts` | Yes | **Yes (5)** |
| Overtime until a goal, season shootouts, NHL shootout | `nhl95hacks.ts` | Yes | No |
| 3 on 3 overtime | `nhl95hacks.ts` (`OT3_*`) | Yes | No |
| Fixes: assists x3, aggression, comeback, rocket pass, open net, blind ring, runaway, goalie pull, sniping, penalty shot x2, pass direction, ppPk, faceoff, awareness, stick shots | `nhl95hacks.ts`, `hacks.ts` | Yes | No |
| Organ after a pause | `nhl95hacks.ts` (`ORGAN_*`) | Yes | No |
| Any skater at any position | `nhl95hacks.ts` | **Not yet** | No |
| NHL 94's settings: three stars, bodychecks, time on ice, giveaways, real-time clock, penalty time, fighting penalty time, no icing, hybrid icing, delayed calls, B-checks, injuries, shootout injuries, extra period length, energy (7), goalie (5), skating/puck (4) | `nhl95hacks.ts` | **Not yet** | No |

Note: `HelpPage.tsx` says every NHL '95 Hacks option is tested; the page itself marks the rows above as not yet
tested. The page text is newer (inferred).

### NHL 94 Genesis

| Feature | NOSE4Web files | Documented here? |
|---|---|---|
| Rosters, ratings, lines, team colours, settings | `team.ts`, `attributes.ts`, `settings.ts` | No |
| Logos, banners, lettering, photos, score logos, splash, menu picture, announcer, credits | `graphics.ts`, `pictureset.ts`, `lettering.ts`, `photos.ts`, `genesisscorelogos.ts`, `splash.ts`, `menupicture.ts`, `announcer.ts`, `credits.ts` | No |
| Organ songs and team songs | `genesismusic.ts`, `teamsongs.ts` | No |
| Hacks (fixes, statistics, rules, energy, goalies, skating, ...) | `hacks.ts`, `hackgroups.ts` | No |
| Fighting (chaos, MIT) | `fight.ts`, `fightdata.ts` | No |

### NHL '94 SNES

| Feature | NOSE4Web files | Documented here? |
|---|---|---|
| Rosters, lines, team names, ratings, colours, settings, menu, rink | `snesteam.ts`, `snessettings.ts`, `snesmenu.ts`, `snesrink.ts`, `snesplacenames.ts` | No |
| Logos, centre ice logos, name blocks, photos, score logos | `snespictures.ts`, `huffman.ts`, `lz.ts`, `snesblock*.ts`, `snesphotos.ts`, `snesscore*.ts` | No |
| Songs and team songs | `snesmusic.ts`, `snessongs.ts` | No |
| Hacks, fighting (McMarkis) | `sneshacks.ts`, `snesfight.ts`, `snesfightdata.ts` | No |

### Planned / not built

- NHL '95 title, menu and end-of-period music: research done, not built (from the project owner; nothing in the
  code yet).

## 8. How to extend this document

Add one section per feature per game, numbered after the last feature section, and add a "Yes" in section 7.
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
