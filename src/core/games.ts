// Per-game settings, ported from NOSE's ini\roms.ini. Only NHL 94 so far.

import type { AttributeKind } from './attributes'

export interface GameConfig {
  productCode: string
  title: string
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
    menuLogoPalettePointer: number
    // Every place that holds a banner block's address, or an address a fixed
    // distance into it. The first of each is the address of the block itself.
    bannerReferences: Record<'menu' | 'game', { at: number; offset: number }[]>
  }
  // Places in the game's code that hold the address of the playoff draw tables.
  playoffDrawPointerOffsets: number[]
  playoffDrawCount: number
  // Places in the game's code that hold the addresses of the opening screen text.
  copyrightTextPointerOffset: number
  introTextPointerOffset: number
  introTextSize: number
  // The 32 colours used to draw the ice and the arena around it.
  rinkPaletteOffset: number
  // What each of a strip's 16 colours is used for.
  stripColorLabels: string[]
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
    bannerReferences: {
      menu: [
        { at: 0x17b7e, offset: 0 },
        { at: 0xf84d4, offset: 8 },
        { at: 0xf84e4, offset: 8 },
      ],
      game: [
        { at: 0x16d26, offset: 0 },
        { at: 0x17672, offset: 0 },
        { at: 0x17b9e, offset: 0 },
        { at: 0x11f24, offset: 8 },
      ],
    },
  },
  playoffDrawPointerOffsets: [0x17d26, 0x17d90],
  playoffDrawCount: 32,
  copyrightTextPointerOffset: 0xff226,
  introTextPointerOffset: 0xff292,
  introTextSize: 0x364,
  rinkPaletteOffset: 0x59924,
  stripColorLabels: [
    'Ice', 'Blade', 'Boot/Gloves', 'Pants (dark)', 'Pants (medium)', 'Pants (light)',
    'Face (light)', 'Face (dark)', 'Body/Leg trim (dark)', 'Body/Leg trim (light)',
    'Shoulder/Trim fill', 'Helmet/Body/Leg (medium)', 'Helmet/Body/Leg (light)',
    'Helmet/Body/Leg (dark)', 'Stick', 'Shadow',
  ],
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

const GAMES: GameConfig[] = [NHL94, NHL94_30_TEAMS]

export const SUPPORTED_GAMES = GAMES.map((game) => game.title)

export function findGame(productCode: string): GameConfig | undefined {
  return GAMES.find((g) => g.productCode === productCode)
}
