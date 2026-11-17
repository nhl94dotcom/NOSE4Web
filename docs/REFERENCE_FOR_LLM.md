# NOSE4Web ROM knowledge: a reference for LLMs

## 1. What this is and how to use it

NOSE4Web is a browser ROM editor for three hockey games: **NHL 94 (Sega Genesis)**, **NHL '94 (SNES)** and
**NHL '95 (Sega Genesis)**. This file is a map of what the code knows about those ROMs, written for another LLM
that is helping someone build features in a *different* program (the first readers work on their own NHL '95
editor). It points you at the right files and gives the facts you need to write your own code.

How to use it:

1. Read sections 1 to 4 (purpose, licence, repo map, conventions). They apply to every game.
2. Find your feature in the status table (section 11). If "Documented here" says yes, read that feature section.
3. Then read the files and tests the section cites. The code is the authority; this document is a guide to it.

Detailed feature sections are added one feature and one game at a time. Today there are six, all NHL '95:
fighting (5), organ/team songs (6), logos and banners (7), overtime and shootouts (8), fixes ported from NHL 94 and
organ after a pause (9), and a room and RAM map (10). Everything else is listed in section 11 with its files only.

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
`$1B3` longs = `$6CC` bytes, two structs of `$366`) to `$FFF002`, then ScoreSumbytes (`$C02C`) to `$FFF6CE`; `bclr
#1,gmode ($BEF0)`; `jsr ClearShootout ($9DA50)`; `Create_HotCold_Table ($83E88)` for `$C288` and `$C5EE`; `rts`.

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
- Not yet game-tested settings that touch the same things: `shootoutInjuries` reads the shootout's kept team structs
  (`$FFF002`, tmpdst `+$68`; NextShooter `$9DD82`), `fourthPeriodOvertime` changes ResetClock's overtime.

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
| `stickShots` | puckstick `.stdef` `$7BA02` | hook on `4EB9 0008 142C 6000 0342` (jsr a2touchpuck / bra.w deflect); code (62 bytes) counts the shot through ChkShotStat's `.addShot` `$8AC7A` (shotplayer `$BAD6`) after tests of gmode `$BEF0` and sflags2 `$BEF4`, then a2touchpuck and `jmp deflect ($7BD4C)` | a save off the goalie's stick isn't a shot | `$151D6` |
| `blindRingFix` | checkpuckcoll `$7B6B8` | hook on `6100 024A 6000` + edit `$7B6BE` `0052` -> `6650`; code (46 bytes) with puckc `$B3C2`, gmode `$BEF0`, puckstick `$7B904` | dead area round the goalie's stick (8 to ~20 units in NHL '95) | `$14EC8` |

Faceoff around checks: `$8901C`, `$890D0` (jsr limitfo), `$88F56`. Stick around: `$7B9F8`, `$8AC66`. Ring around:
`$7B6B2`, `$7B6C0`. Others: `AROUND` in `nhl95hacks.ts`.

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
| Hook and in-place sites | sections 5, 8, 9 tables; pointers in section 7 | |

Freed room in the middle is tagged `NOSEFREE` + start address (`releaseSpace`).

### RAM

| Range | Used by | Status | Source |
|---|---|---|---|
| `$FFCC62` word / `$FFCC63` | Fighting row setting (0 Off, 1 On, 2 Arcade) | tested | `nhl95hacks.ts` fighting comment |
| `$FFE800`-`$FFE879` | fighting patch engine | tested | comment above `SHOOTOUT_MARK` |
| `$FFEA00`-`$FFEA8F` | giveaways/takeaways: `$FFEA00`-`$FFEA05` carrier's and forcer's spots and places, counts at `$FFEA10` and `$FFEA50` (the code clears 32 longs from `$FFEA10`) | **not yet game-tested** | giveaways comment, `GT_BODY95` |
| `$FFEB00`-`$FFEB03`, `$FFEE66`-`$FFEE69` | giveaways' team totals ("team struct +$2878 / +$287A"; the code uses `lea ($EB00).w` and `lea ($EE66).w` and clears a long at each) (inferred from the code bytes) | **not yet game-tested** | `GT_BODY95` |
| `$FFF000`-`$FFF6CF` | season shootout: mark `$FFF000`, team structs `$FFF002`-`$FFF6CD`, ScoreSumbytes `$FFF6CE` | tested | section 8 |
| `$FFF700`-`$FFF73F` | knockdown counts for the injury risk: a byte a player, 32 a team (cleared each game: 64 bytes) | **not yet game-tested** | comment above `COUNT_OF_A2_95`, `GAME_CODE95` |
| `$FFF800`-`$FFF815` | organ after a pause: kept song slot (22 bytes) | tested | comment above `ORGAN_SAVE_HOOK` |
| `$FFDC84`-`$FFFC03` | the whole range Match Viewer found unused (retail and W18) that these sit in | | same comments |

NOSE4Web's NHL '95 code also reads (does not own) game RAM such as gmode `$BEF0`, gmode2 `$BF00`, sflags7 `$BF02`,
GameFlags `$BF08`, gsp `$C020`, team structs `$C288` / `$C5EE`, OptPlayMode `$CC4C`, and the sound driver's
slot arrays from SndSeqPtr `$FFFDFE` to SndSeqState `$FFFE7E` (section 9, organ).

### Not yet game-tested (not documented in detail)

NHL 94's settings on NHL '95 (statistics: three stars, bodychecks, time on ice, giveaways; rules: real-time clock,
penalty time, fighting penalty time, no icing, hybrid icing, delayed calls, B-checks with penalties off, injuries,
shootout injuries, extra period length; energy and injury risk; goalies; skating and the puck) and Any skater at any
position: `Nhl95HacksPage.tsx` `UNTESTED` ("Not yet tested in the game.").

## 11. Feature status

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
| Organ after a pause | `nhl95hacks.ts` (`ORGAN_*`) | Yes | **Yes (9)** |
| Any skater at any position | `nhl95hacks.ts` | **Not yet** | No (pending; RAM in 10) |
| NHL 94's settings: three stars, bodychecks, time on ice, giveaways, real-time clock, penalty time, fighting penalty time, no icing, hybrid icing, delayed calls, B-checks, injuries, shootout injuries, extra period length, energy (7), goalie (5), skating/puck (4) | `nhl95hacks.ts` | **Not yet** | No (pending; RAM in 10) |

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

## 12. How to extend this document

Add one section per feature per game, numbered after the last feature section, and add a "Yes" in section 11.
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
