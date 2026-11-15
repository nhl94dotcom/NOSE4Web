// Per-game settings, ported from NOSE's ini\roms.ini: NHL 94 on the Genesis,
// with the hacks built on it, and NHL '94 on the SNES.

import { weightKind, type AttributeKind } from './attributes'

export interface GameConfig {
  // The SNES game keeps its data in its own way: see snes.ts.
  platform: 'genesis' | 'snes'
  // NHL '95 on the Genesis: the same kind of data as NHL 94, read the way NOSE reads it. The editor's own additions
  // (hacks, pictures, songs and the rest) are made for NHL 94 and are left out.
  edition?: 95
  productCode: string
  title: string
  // Text in the ROM's header that only this game has, where its product code
  // is not enough to tell it from others.
  headerName?: string
  // Address of the 4-byte operand of the "call checksum routine" instruction.
  checksumCallOffset: number
  teamTableOffset: number
  teamCount: number
  // Teams whose location the game replaces with fuller text built into its
  // code, to tell apart two teams from one city.
  teamNameRedirects: { team: number; pointerOffset: number; defaultTextOffset: number }[]
  // Places in the game's code that hold the addresses of the team pictures:
  // tables of one address per team for the logos, and single blocks holding
  // every team's banner.
  graphics: {
    rinkLogoTablePointer: number
    menuLogoTablePointer: number
    // Each team's banner stripe colours on the menus.
    menuLogoPalettePointer: number
    // Each team's 16 menu logo colours.
    menuLogoColorsPointer: number
    // Whether the banners are kept as the original game keeps them. Hacks
    // that draw their banners with code of their own are left alone.
    banners: boolean
    // Every place that holds a banner block's address, or an address a fixed
    // distance into it. The menus show a home team's banner and a visitor's;
    // the original game draws both from one block, some hacks from two.
    bannerReferences: Record<'menu' | 'visitor' | 'game', { at: number; offset: number }[]>
  }
  // Whether the playoff draws, clock, rule messages and main menu are where
  // the original game keeps them. Hacks that rebuild the menus move them.
  settingsSupported: boolean
  // Whether the overall rating is worked out some other way than the original
  // game's, so that the editor can only show a plain average of the ratings.
  overallIsEstimate: boolean
  // Shown at the top of every team's page: what is different about editing
  // this kind of ROM. Empty for the original game.
  notice: string
  // A hack's own name, its maker, and its official forum post, shown with
  // the notice to credit them (as McMarkis suggested).
  credit?: { rom: string; author: string; url: string }
  // Leagues the team list is divided into, in order, where a hack has several.
  teamGroups: { name: string; teams: number }[]
  // Places in the game's code that hold the address of the playoff draw tables.
  playoffDrawPointerOffsets: number[]
  playoffDrawCount: number
  // Places in the game's code that hold the addresses of the opening screen text.
  copyrightTextPointerOffset: number
  introTextPointerOffset: number
  introTextSize: number
  // The 32 colours used to draw the ice and the arena around it.
  rinkPaletteOffset: number
  // What each of a strip's 16 colours is used for, and whether that is known:
  // hacks that repaint the players use the colours their own way.
  stripColorLabels: string[]
  // The order the team page shows a strip's colours in: down the player from
  // helmet and jersey to skates, then the rest. Stored order where absent.
  stripColorOrder?: number[]
  stripColorsKnown: boolean
  // The 16 seedings in a playoff draw, in the order they are stored.
  playoffSlotLabels: string[]
  rulesOffset: number
  ruleCount: number
  // Four period lengths in seconds, and the menu text that goes with each.
  periodLengthSecondsOffset: number
  periodLengthTextOffset: number
  overtimeSecondsOffset: number
  shootoutSecondsOffset: number
  // Places in the game's code that hold the addresses of the main menu's data.
  menuDefaultsPointerOffset: number
  menuCaptionsPointerOffset: number
  menuOptionsPointerOffset: number
  menuItemCount: number
  // Menu items whose choices are the teams, and the one that picks a period length.
  menuTeamItems: number[]
  menuPeriodLengthItem: number
  // Where the starting choices are not one word a row in the rows' order (NHL '95): the word each row's choice is in,
  // and where the code holds the address of the table that turns the play mode (its word) into its row.
  menuDefaultWords?: number[]
  menuPlayModeTablePointer?: number
  // Where new playoffs' last team is kept: the word of a cmp.w #last after a move from Team 1 ($CC50). A Team 1 past
  // it starts them as it (NHL '95: $87A14, retail 25, the WN95HL's 33; Match Viewer).
  playoffLastAt?: number
  lineLabels: string[]
  linePositionLabels: string[]
  teamNameLabels: string[]
  playerAttributeLabels: string[]
  goalieAttributeLabels: string[]
  playerAttributeNames: string[]
  goalieAttributeNames: string[]
  playerAttributeKinds: AttributeKind[]
  goalieAttributeKinds: AttributeKind[]
}

export const NHL94: GameConfig = {
  platform: 'genesis',
  productCode: 'GM T-50656 -00',
  title: 'NHL 94',
  checksumCallOffset: 0x302,
  teamTableOffset: 0x30e,
  teamCount: 28,
  // "New York Islanders" and "New York Rangers".
  teamNameRedirects: [
    { team: 13, pointerOffset: 0xf7ca8, defaultTextOffset: 0xf7cb2 },
    { team: 14, pointerOffset: 0xf7c96, defaultTextOffset: 0xf7cc6 },
  ],
  graphics: {
    rinkLogoTablePointer: 0xfea5a,
    menuLogoTablePointer: 0xf8682,
    menuLogoPalettePointer: 0x17b2a,
    menuLogoColorsPointer: 0xf8694,
    banners: true,
    bannerReferences: {
      menu: [
        { at: 0x17b7e, offset: 0 },
        { at: 0xf84d4, offset: 8 },
      ],
      visitor: [{ at: 0xf84e4, offset: 8 }],
      game: [
        { at: 0x16d26, offset: 0 },
        { at: 0x17672, offset: 0 },
        { at: 0x17b9e, offset: 0 },
        { at: 0x11f24, offset: 8 },
      ],
    },
  },
  settingsSupported: true,
  overallIsEstimate: false,
  notice: '',
  teamGroups: [],
  playoffDrawPointerOffsets: [0x17d26, 0x17d90],
  playoffDrawCount: 32,
  copyrightTextPointerOffset: 0xff226,
  introTextPointerOffset: 0xff292,
  introTextSize: 0x364,
  rinkPaletteOffset: 0x59924,
  stripColorsKnown: true,
  stripColorLabels: [
    'Ice', 'Blade', 'Boot/Gloves', 'Pants (dark)', 'Pants (medium)', 'Pants (light)',
    'Face (light)', 'Face (dark)', 'Body/Leg trim (dark)', 'Body/Leg trim (light)',
    'Shoulder/Trim fill', 'Helmet/Body/Leg (medium)', 'Helmet/Body/Leg (light)',
    'Helmet/Body/Leg (dark)', 'Stick', 'Shadow',
  ],
  stripColorOrder: [12, 11, 13, 10, 9, 8, 5, 4, 3, 2, 1, 6, 7, 14, 15, 0],
  playoffSlotLabels: [
    'East 1', 'East 8', 'East 3', 'East 6', 'East 5', 'East 4', 'East 7', 'East 2',
    'West 1', 'West 8', 'West 3', 'West 6', 'West 5', 'West 4', 'West 7', 'West 2',
  ],
  rulesOffset: 0x18e0c,
  ruleCount: 30,
  periodLengthSecondsOffset: 0x785e,
  periodLengthTextOffset: 0xf7f3c,
  overtimeSecondsOffset: 0x782c,
  shootoutSecondsOffset: 0xeda0,
  menuDefaultsPointerOffset: 0x17c7e,
  menuCaptionsPointerOffset: 0xf807c,
  menuOptionsPointerOffset: 0xf7bb0,
  menuItemCount: 9,
  menuTeamItems: [2, 3],
  menuPeriodLengthItem: 4,
  lineLabels: ['NLC', 'Sc1', 'Sc2', 'Chk', 'PP1', 'PP2', 'PK1', 'PK2'],
  linePositionLabels: ['G', 'LD', 'RD', 'LW', 'C', 'RW', 'EA'],
  teamNameLabels: ['Location', 'Initials', 'Name', 'Stadium'],
  playerAttributeLabels: [
    'Wgt', 'Agl', 'Spd', 'OfA', 'DfA', 'ShP', 'Chk',
    'H/F', 'StH', 'ShA', 'End', 'Rgh', 'Pas', 'Agr',
  ],
  goalieAttributeLabels: [
    'Wgt', 'Agl', 'Spd', 'OfA', 'DfA', 'PkC', 'L@0',
    'GlH', 'L@0', 'L@0', 'StR', 'StL', 'GvR', 'GvL',
  ],
  playerAttributeNames: [
    'Weight', 'Agility', 'Speed', 'Offensive Awareness', 'Defensive Awareness', 'Shot Power', 'Checking',
    'Handed/Fighting', 'Stick Handling', 'Shot Accuracy', 'Endurance', 'Roughness', 'Pass Accuracy', 'Aggression',
  ],
  goalieAttributeNames: [
    'Weight', 'Agility', 'Speed', 'Offensive Awareness', 'Defensive Awareness', 'Puck Control', 'Leave at Zero',
    'Glove Hand', 'Leave at Zero', 'Leave at Zero', 'Stick Right', 'Stick Left', 'Glove Right', 'Glove Left',
  ],
  playerAttributeKinds: [
    'weight', 'rating', 'rating', 'rating', 'rating', 'rating', 'rating',
    'handedFighting', 'rating', 'rating', 'rating', 'rating', 'rating', 'rating',
  ],
  goalieAttributeKinds: [
    'weight', 'rating', 'rating', 'rating', 'rating', 'rating', 'zero',
    'gloveHand', 'zero', 'zero', 'rating', 'rating', 'rating', 'rating',
  ],
}

// The 30-team hack of NHL 94. It keeps the game's layout and adds two teams;
// the editor finds the team data through the team table wherever it has moved.
export const NHL94_30_TEAMS: GameConfig = {
  ...NHL94,
  productCode: 'GM T-50656 -30',
  title: 'NHL 94 (30 teams)',
  teamCount: 30,
}

// NHL 94: EVO, a hack that rebuilds much of the game. It keeps the original
// layout of a team's data, with each of its 64 teams in a place of fixed size,
// and its pictures are found the same way. Its menus, clock and playoffs are
// rebuilt, so those are left alone. Its players use all sixteen values of each
// attribute, with meanings of their own, so attributes are edited as the
// numbers stored; the three goalie values the original game leaves at zero
// are in use, for what the editor does not know.
const stored = (count: number): AttributeKind[] => new Array<AttributeKind>(count).fill('value')
export const NHL94_EVO: GameConfig = {
  ...NHL94,
  // The code is the one smozROM gives any 30-team ROM with 0 to 15 ratings
  // and a base weight of 144, so the name in the header is what marks it out.
  productCode: 'GM T-50656-F3V',
  headerName: 'NHL 94: EVO',
  stripColorsKnown: false,
  stripColorOrder: undefined,
  title: 'NHL 94: EVO',
  teamCount: 64,
  teamNameRedirects: [],
  // One "Home" and one "Visitors" banner serve every team on the menus, and
  // the banners shown during play are found by the hack's own code.
  graphics: { ...NHL94.graphics, banners: false },
  settingsSupported: false,
  overallIsEstimate: true,
  notice:
    'This ROM is NHL 94: EVO, a hack that rebuilds much of the game. The editor can change its rosters, lines, team ' +
    'names, colours and logos. Its game settings and banners are kept in ways the editor cannot follow, and are left ' +
    'alone. Attributes are shown as the values stored, 0 to 15. The game works out overall ratings in its own way, so ' +
    'Ovr here is a plain average for comparing players, not the number the game shows; and what the three goalie ' +
    'values marked G7, G9 and G10 stand for is not known to the editor. Each team has its own fixed room in the ROM. ' +
    'Editing this ROM has been tested less than editing the original game, so keep a copy of the file you opened.',
  credit: { rom: 'NHL 94 EVO', author: 'AdamCatalyst', url: 'https://forum.nhl94.com/index.php?/topic/40320-nhl-94-evo/' },
  teamGroups: [
    { name: 'NHL', teams: 32 },
    { name: 'International', teams: 6 },
    { name: "NHL '94", teams: 26 },
  ],
  goalieAttributeLabels: ['Wgt', 'Agl', 'Spd', 'OfA', 'DfA', 'PkC', 'G7', 'GlH', 'G9', 'G10', 'StR', 'StL', 'GvR', 'GvL'],
  goalieAttributeNames: [
    'Weight', 'Agility', 'Speed', 'Offensive Awareness', 'Defensive Awareness', 'Puck Control', 'Goalie value 7',
    'Glove Hand', 'Goalie value 9', 'Goalie value 10', 'Stick Right', 'Stick Left', 'Glove Right', 'Glove Left',
  ],
  playerAttributeKinds: stored(14),
  goalieAttributeKinds: stored(14),
}

// NHL '94 on the SNES. Its players and lines are kept as the Genesis game
// keeps them, so most of the Genesis settings stand; what it keeps elsewhere
// or not at all (the rink, game settings, pictures) the editor leaves alone.
// What each strip colour is for was found by drawing the game's player
// sprites with one colour at a time changed. The team table is given as a place in the ROM without its
// copier header; see snes.ts.
export const NHL94_SNES: GameConfig = {
  ...NHL94,
  platform: 'snes',
  productCode: 'SNES NHL 94',
  title: "NHL '94 (SNES)",
  checksumCallOffset: 0,
  teamTableOffset: 0xe25e7,
  teamNameRedirects: [],
  // Its settings are read in their own way (see snessettings.ts).
  settingsSupported: false,
  menuTeamItems: [1, 2],
  menuPeriodLengthItem: 3,
  // The game's playoff tree takes a draw's teams in this order.
  playoffSlotLabels: Array.from({ length: 16 }, (_, i) => String(i + 1)),
  overallIsEstimate: false,
  stripColorsKnown: false,
  stripColorLabels: [
    'Not drawn on players', 'Skate blades', 'Skates and stick tape', 'Gloves', 'Pants', 'Socks', 'Shoulder trim',
    'Skin', 'Stripe 1', 'Stripe 2', 'Stripe 3', 'Jersey shading', 'Jersey and helmet', 'Shoulders', 'Stick', 'Shadow',
  ],
  stripColorOrder: [12, 11, 13, 6, 8, 9, 10, 3, 4, 5, 2, 1, 7, 14, 15, 0],
  notice:
    "This ROM is NHL '94 for the SNES. The editor can change its rosters, lines, team names, team ratings, " +
    "colours and logos, the rink's colours and the game settings, and put in the hacks on the Hacks page. SNES " +
    'editing is new, so keep a copy of the file you opened.',
  playoffDrawPointerOffsets: [],
  playoffDrawCount: 0,
  playerAttributeKinds: NHL94.playerAttributeKinds.map((kind) => (kind === 'rating' ? 'snesRating' : kind)),
  goalieAttributeKinds: NHL94.goalieAttributeKinds.map((kind) => (kind === 'rating' ? 'snesRating' : kind)),
}

// An SNES ROM with its team table somewhere else or another number of teams,
// such as one rebuilt from the disassembly with all 32 of today's teams.
// Where its code has been moved too, the hacks are found by the code around
// them (see sneshacks.ts).
const snesVariants = new Map<string, GameConfig>()

export function snesGame(table: { offset: number; count: number }, codeInPlace: boolean): GameConfig {
  if (table.offset === NHL94_SNES.teamTableOffset && table.count === NHL94_SNES.teamCount && codeInPlace) return NHL94_SNES
  const key = `${table.offset}:${table.count}:${codeInPlace}`
  const known = snesVariants.get(key)
  if (known) return known
  const config: GameConfig = {
    ...NHL94_SNES,
    productCode: `${NHL94_SNES.productCode} ${table.count}${codeInPlace ? '' : ' rebuilt'}`,
    title: `NHL '94 (SNES), ${table.count} teams${codeInPlace ? '' : ', rebuilt'}`,
    teamTableOffset: table.offset,
    teamCount: table.count,
    notice: codeInPlace
      ? NHL94_SNES.notice
      : `This ROM is NHL '94 for the SNES, rebuilt with ${table.count} teams and the game's code in new places. ` +
        "The editor can change its rosters, lines, team names, team ratings, colours and logos, the rink's " +
        'colours and the game settings, and put in the hacks on the Hacks page, found where this ROM has the code ' +
        'they change. SNES editing is new, so keep a copy of the file you opened.',
    // ROMs rebuilt with the game's code in new places are McMarkis's builds:
    // his 32-team ROM (2 MB and SA-1), his 28-team one with the original
    // game's rosters (SA-1), and the same with other teams.
    credit: codeInPlace
      ? undefined
      : table.count === 28
        ? { rom: 'SNES NHL 94: Fighting + 60 FPS', author: 'McMarkis', url: 'https://forum.nhl94.com/index.php?/topic/40596-snes-nhl-94-fighting-60-fps/' }
        : {
            rom: table.count === 32 ? 'SNES NHL 94: 32 Team + 60 FPS + Fighting' : `a ${table.count}-team build of SNES NHL 94: 32 Team + 60 FPS + Fighting`,
            author: 'McMarkis',
            url: 'https://forum.nhl94.com/index.php?/topic/40498-snes-nhl-27-fighting-60-fps/',
          },
  }
  snesVariants.set(key, config)
  return config
}

// NHL '95 on the Genesis, from NOSE's roms.ini (GM T-50856 -00). Its teams, players and lines are kept as NHL 94
// keeps them; two attributes differ: the shooting hand and fighting as NHL '93 keeps them (an odd value a
// left-handed shot), and stick handling in sixteen steps (0 to 15) where the other ratings have seven. The overall
// rating is NHL 94's with stick handling folded to seven steps, as NOSE worked it out; the NHL94 Match Viewer project
// confirmed all of it in the game (every overall on the roster screen matching).
export const NHL95: GameConfig = {
  ...NHL94,
  edition: 95,
  productCode: 'GM T-50856 -00',
  title: "NHL '95",
  checksumCallOffset: 0x692,
  teamTableOffset: 0x772,
  teamCount: 28,
  // "New York Islanders" and "New York Rangers".
  teamNameRedirects: [
    { team: 13, pointerOffset: 0x86570, defaultTextOffset: 0x86578 },
    { team: 14, pointerOffset: 0x8655e, defaultTextOffset: 0x8658c },
  ],
  graphics: { ...NHL94.graphics, banners: false },
  playoffDrawPointerOffsets: [0x87a04, 0x87a6e],
  copyrightTextPointerOffset: 0xa1444,
  introTextPointerOffset: 0xa14f8,
  introTextSize: 0x656,
  rinkPaletteOffset: 0xc8506,
  // What each strip colour is for, as the NHL94 Match Viewer project found by recolouring each in the game; shown
  // down the player as NHL 94's are. Not NHL 94's order, so
  // the strip checks, which go by NHL 94's, are left out (stripColorsKnown).
  stripColorsKnown: false,
  stripColorLabels: [
    'Ice', 'Stick and skate blades', 'Helmet/Body/Leg (light)', 'Helmet/Body/Leg (dark)', 'Helmet/Body (main)',
    'Face (light)', 'Face (dark)', 'Goalie pads and mask (light)', 'Goalie pads and mask (dark)', 'Gloves and boots',
    'Shoulders and sleeves', 'Pants (light)', 'Pants (dark)', 'Shoulder and waist stripe', 'Stick shaft', 'Shadow',
  ],
  stripColorOrder: [4, 2, 3, 10, 13, 9, 11, 12, 7, 8, 1, 5, 6, 14, 15, 0],
  rulesOffset: 0x89c2e,
  periodLengthSecondsOffset: 0x7d4da,
  periodLengthTextOffset: 0x86d92,
  overtimeSecondsOffset: 0x7d4b8,
  shootoutSecondsOffset: 0x9e6e8,
  menuDefaultsPointerOffset: 0x866f0,
  menuCaptionsPointerOffset: 0x865d4,
  menuOptionsPointerOffset: 0x864bc,
  // Play Mode, Team 1, Team 2, Per. Length, Goalies, User Records, Penalties, Line Changes.
  menuItemCount: 8,
  menuTeamItems: [1, 2],
  menuPeriodLengthItem: 3,
  // The game copies nine words to $FFCC4C at start-up (at $866E8); the menu takes its rows from words 2 to 8 (at
  // $86716), and the play mode from word 0 through the table at $8676A (movea.l #table,a0 at $8671A).
  menuDefaultWords: [0, 2, 3, 4, 5, 6, 7, 8],
  menuPlayModeTablePointer: 0x8671c,
  playoffLastAt: 0x87a14,
  notice:
    "This ROM is NHL '95. The editor reads it the way NOSE did: rosters, lines, team names, colours and the game " +
    "settings. The pictures, songs, hacks and other additions made for NHL 94 are not offered for it. NHL '95 editing " +
    'is new, so keep a copy of the file you opened.',
  playerAttributeKinds: [
    'weight', 'rating', 'rating', 'rating', 'rating', 'rating', 'rating',
    'handedFighting93', 'stickHandling95', 'rating', 'rating', 'rating', 'rating', 'rating',
  ],
  goalieAttributeKinds: [
    'weight', 'rating', 'rating', 'rating', 'rating', 'rating', 'zero',
    'gloveHand', 'zero', 'zero', 'rating', 'rating', 'rating', 'rating',
  ],
}

// NHL '95 with 34 teams, as the WN95HL's ROMs are (GM T-50856 -34): the team table made longer in the same place, the
// teams moved to the second megabyte, the self-check already taken out.
export const NHL95_34_TEAMS: GameConfig = {
  ...NHL95,
  productCode: 'GM T-50856 -34',
  title: "NHL '95 (34 teams)",
  teamCount: 34,
}

// Whether this ROM is NHL 94 on the Genesis (the original or a hack of it), for which the editor's own additions are made.
export const isGenesis94 = (game: GameConfig): boolean => game.platform === 'genesis' && game.edition !== 95

export const SUPPORTED_GAMES = [NHL94, NHL94_30_TEAMS, NHL94_EVO, NHL94_SNES, NHL95, NHL95_34_TEAMS].map((game) => game.title)

// ---------------------------------------------------------- product codes
// The hack program smozROM marks a ROM's product code to say how it is set
// up, and NOSE reads the marks. After "GM T-50656" come four characters:
//
//   " -" for the original 0 to 6 ratings, or "-F" for 0 to 15;
//   "0" for the original 28 teams, or "3" for the 30-team ROM;
//   a letter for the weight a player's lowest weight value stands for, A for
//   102 pounds up to Z for 152 in twos, or "0" for the original 140 (as is T).

const HEADER_NAME_AT = 0x120
const SMOZROM_CODE = /^GM T-50656( -|-F)([03])([0A-Z])$/

const variants = new Map<string, GameConfig>()

function variant(productCode: string): GameConfig | undefined {
  const known = variants.get(productCode)
  if (known) return known
  const marks = SMOZROM_CODE.exec(productCode)
  if (!marks) return undefined
  const wideRatings = marks[1] === '-F'
  const base = marks[2] === '3' ? NHL94_30_TEAMS : NHL94
  const baseWeight = marks[3] === '0' ? 140 : 100 + 2 * (marks[3].charCodeAt(0) - 64)
  if (!wideRatings && baseWeight === 140) return base

  const details = [...(wideRatings ? ['0–15 ratings'] : []), ...(baseWeight === 140 ? [] : [`base weight ${baseWeight}`])]
  // With 0 to 15 ratings a rating is shown and edited as the number stored.
  const kinds = (list: AttributeKind[]) =>
    list.map((kind) => (kind === 'weight' ? weightKind(baseWeight) : kind === 'rating' && wideRatings ? 'value' : kind))
  const config: GameConfig = {
    ...base,
    productCode,
    title: `${base.title}, ${details.join(', ')}`,
    playerAttributeKinds: kinds(base.playerAttributeKinds),
    goalieAttributeKinds: kinds(base.goalieAttributeKinds),
    overallIsEstimate: wideRatings,
    notice: wideRatings
      ? 'This ROM has been set up for ratings from 0 to 15, in place of the original 0 to 6. They are shown as the ' +
        'numbers stored. With them comes a different way of working out overall ratings, so Ovr here is a plain ' +
        'average for comparing players, not the number the game shows.'
      : '',
  }
  variants.set(productCode, config)
  return config
}

// The game a ROM is, going by its product code and, where that is not enough,
// by its header. Undefined for a ROM the editor does not know.
export function findGame(productCode: string, rom: Uint8Array): GameConfig | undefined {
  if (productCode === NHL94_SNES.productCode) return NHL94_SNES
  if (productCode === NHL95.productCode) return NHL95
  if (productCode === NHL95_34_TEAMS.productCode) return NHL95_34_TEAMS
  const named = [NHL94_EVO].find((game) => {
    const name = game.headerName ?? ''
    return game.productCode === productCode && name.split('').every((char, i) => rom[HEADER_NAME_AT + i] === char.charCodeAt(0))
  })
  return named ?? variant(productCode)
}
