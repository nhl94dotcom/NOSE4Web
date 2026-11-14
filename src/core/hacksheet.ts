import { clockTime, penaltyLengths } from './penaltytime'
import { GENESIS_HACK_GROUPS, SNES_HACK_GROUPS } from './hackgroups'
import { HACK_PARTS, HACK_TITLES, holdSeconds, NO_HACKS, type HackChoices, type HackState, fewerSkaterLinesText } from './hacks'
import { snesCodeInPlace } from './snes'
import { detectSnesHacks, SNES_HACK_TITLES, snesHackInPlaceOnly, type SnesHack } from './sneshacks'
import type { RomProject } from './rom'
import { snesScoreLogo, snesScoreLogosSupported } from './snesscorelogos'
import { genesisScoreLogo, hasGenesisScoreLogos } from './genesisscorelogos'
import { hasGenesisBlood } from './genesisblood'

// A page for a league's owners: what each hack in the league's ROM means for
// how the game plays, in plain words. Only what differs from the original
// game is listed.

export interface HackSheet {
  name: string
  game: string
  sections: { heading: string; items: { title: string; text: string }[] }[]
  // Hacks whose code the editor does not know.
  unread: string[]
}

type Explain = (choices: HackChoices) => string

const more = (value: number, original: number, bigger: string, smaller: string) => (value > original ? bigger : smaller)
// An amount of energy as a share of full energy ($1000).
const energyText = (units: number) => `${Math.round((units / 4096) * 1000) / 10}%`
// Seconds as the game's clock shows them, minutes and seconds.
const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// What each Genesis hack means for a player, as it is set.
const GENESIS: Record<keyof HackChoices, Explain> = {
  checkFix: (c) =>
    c.checkFix === 'all240'
      ? 'Every check is judged as if a person made it (an earlier version of this fix), so a light checker knocks down much heavier players.'
      : 'Checks are judged the same way for everyone, so a heavier checker does better, as in real hockey, and pressing C and then B to switch away just before a hit no longer helps.',
  secondAssist: () => 'When two players pass back and forth before a goal, the second assist is now credited.',
  oneTimerAssist: () => "A one-timer goal keeps its assists when the shooter's stick touched the pass before he shot.",
  regainAssist: () => 'A player who wins the puck back himself and passes to the scorer gets his assist.',
  aggressionFix: () => 'Aggression works as the rating reads: a higher rating means more penalties, where the original game mixes the values up (a 4 plays like a 1).',
  ppPkFix: () => "Each team's power play and penalty kill ratings work the way the rosters give them.",
  comebackFix: () => 'A team tied or behind in the third period gets its comeback boost in the second half of the period, as intended, not the first.',
  passFix: () => 'Passes travel at their proper speed: no more "rocket passes" that fly off at up to twice the speed.',
  penaltySeconds: (c) =>
    `Penalties last ${c.penaltySeconds < NO_HACKS.penaltySeconds ? 'less' : 'longer'} than they say: each penalty minute is ${c.penaltySeconds} seconds in the box, so ${penaltyLengths(c.penaltySeconds)}. The penalty minutes in the statistics are as before.`,
  shootoutInjuries: () => 'In the shootout of a tied regular-season game, a skater injured for the game takes no attempt: the next on the list shoots.',
  fightSeconds: (c) => `A fight keeps each fighter in the box ${clockTime(c.fightSeconds)}, whatever its minutes; the penalty minutes in the statistics are as before.`,
  headBleeding: () => 'A player hurt for the game bleeds from the head as he lies on the ice, as in NHLPA 93; only the look changes.',
  seasonTies: (c) =>
    c.seasonTies === 'shootoutNow'
      ? 'A regular-season game tied after period 3 goes straight to a shootout, with no overtime, the winners getting one goal more, so it never ends in a tie.'
      : c.seasonTies === 'shootout'
      ? 'A regular-season game tied after overtime is settled by a shootout, the winners getting one goal more, so it never ends in a tie.'
      : 'A regular-season game tied after overtime plays more overtime until a goal, as the playoffs do, so it never ends in a tie.',
  fighting: (choices) =>
    `Players can fight, as in NHLPA 93 (chaos's fighting patch): the main menu has a Fighting line, starting at ${choices.fighting === 'off' ? 'Off' : choices.fighting === 'arcade' ? 'On - Arcade Mode (more fights)' : 'On'}.`,
  repeatCheckFix: () =>
    'A player can check the same opponent again once that opponent has got up, where the original game ignored the pair until some other check landed.',
  openNetFix: () => 'A one-timer at an open net, with the goalie out of position, is aimed at the middle of the net, not just under the crossbar, where it often sailed over.',
  faceoffFix: () =>
    "Every faceoff is on one of the nine dots, as in today's NHL: at centre after a goal, in the offending team's end after a penalty, and otherwise past a blue line at that end's dot on the puck's side, and in the neutral zone at the nearest neutral dot.",
  runawayFix: () => 'A skater no longer keeps gliding after a fall into the boards, a missed one-timer, or being taken over as a pass comes to him, and so no longer shoots off at up to twice top speed.',
  penaltyShotTableFix: () => 'A penalty shot is named and recorded for the foul that caused it.',
  penaltyShotFixes: () => 'A penalty shot stopped by an outside whistle is not taken all over again, and the puck can no longer float through the net.',
  snipingFix: () => 'With your own goalie off the ice (a delayed penalty or a pull), your shots are no longer always dead on target: they are as accurate as any other shot.',
  goaliePullFix: () => 'Late in the third period the computer pulls its goalie when one or two goals behind, not only when exactly two.',
  blindRingFix: () => "The goalie's body now stops flat pucks that used to slide through his legs.",
  awarenessFix: () => "Computer forwards on offence react by their Offensive Awareness, as intended, not their Defensive.",
  crowdFix: () => "The crowd's speed boost comes only while the crowd is loud, so skaters are a little slower in quiet spells.",
  stickShots: () => "A hard low shot the goalie's stick knocks away now counts as a shot on goal, as one he catches already does: about 2 more a game.",
  bodychecks: () => "Each player's bodychecks are counted and shown in Player Stats as Chk, in place of penalty minutes.",
  clutchTime: () => "In the last 2:00 of a close third period (the score within a goal), everyone on the ice plays half a rating point better.",
  choppyIce: () => "The puck slows a little more as each period wears on, up to a quarter more by its end, and the ice is fresh again after each intermission.",
  nhlShootout: () => "Shootouts are three rounds, then sudden death, as in today's NHL, and end as soon as one team cannot catch up.",
  timeOnIce: () => 'Player Stats has a Time On Ice page (right past Penalty Minutes), sorted by each player\'s time on ice.',
  plusMinus: () => 'Plus-minus is kept for every player (the game does not show it).',
  threeStars: (c) => `The three stars are chosen by a fuller formula that counts bodychecks, made for line changes ${c.threeStars === 'linesOn' ? 'on' : 'off'}.`,
  wideRatings: () => 'Ratings run from 0 to 15 instead of 0 to 6, so players can differ more finely.',
  bonuses: (c) =>
    ({
      original: '',
      disabled: 'No hot and cold: every player plays to his ratings every game.',
      hidden: 'Players are still hot or cold each game, but Edit Lines does not show it.',
      playersMatchLines: 'The hot and cold bonuses Edit Lines shows are the ones players really have.',
      linesMatchPlayers: 'Edit Lines shows the hot and cold bonuses players really have.',
    })[c.bonuses],
  baseWeight: (c) => `Player weights are set for another era: the lightest weight stands for ${c.baseWeight} pounds, where the original game has 140.`,
  goalieHold: (c) =>
    c.goalieHold === 0
      ? 'A goalie may hold the puck as long as he likes: there is no whistle for it.'
      : `A goalie may hold the puck ${holdSeconds(c.goalieHold)} seconds before the whistle, ${more(c.goalieHold, NO_HACKS.goalieHold, 'longer', 'shorter')} than the original game's ${holdSeconds(NO_HACKS.goalieHold)}.`,
  goalieWidth: (c) =>
    `A goalie you control may go ${more(c.goalieWidth, NO_HACKS.goalieWidth, 'wider', 'less far')} to either side of the net than in the original game (${c.goalieWidth}, where the original has ${NO_HACKS.goalieWidth}).`,
  goalieOut: (c) =>
    `A goalie you control may ${more(c.goalieOut, NO_HACKS.goalieOut, 'not come as far out of his net', 'come farther out of his net')} without the puck (to ${c.goalieOut} from centre ice, where the original has ${NO_HACKS.goalieOut}).`,
  goalieLine: (c) =>
    `A goalie you control may carry the puck ${more(c.goalieLine, NO_HACKS.goalieLine, 'less far', 'farther')} up the ice before the whistle (to ${c.goalieLine} from centre ice, where the original has ${NO_HACKS.goalieLine}).`,
  stamina: () => 'With line changes on, players on the ice never tire, so lines change only when you want them to.',
  injuries: (c) =>
    c.injuries === 'never'
      ? 'Hits never injure: a player knocked down gets up as from any other check.'
      : c.injuries === 'longFall'
        ? 'A hit that would injure has the player stay down about 5 seconds and then get up and play on: no injury, and no penalty.'
      : c.injuries === 'penaltyOnly'
        ? 'A hit that would injure still draws the penalty, but nobody is hurt: the player lies on the ice for about ten seconds and then skates on.'
        : `Every injury keeps the player out for the ${c.injuries === 'game' ? 'rest of the game' : 'rest of the period'}, whoever made the hit.`,
  hotColdRange: (c) =>
    c.hotColdRange <= 2
      ? 'Hot and cold no longer change how anyone plays (Edit Lines may still show small differences).'
      : `Hot and cold swing a player's ratings less than in the original game: values from -${c.hotColdRange} to ${c.hotColdRange - 1}, where the original has -9 to 8.`,
  noIcing: () => 'Icing is never called.',
  hybridIcing: () => 'Hybrid icing: decided as the puck crosses the goal line, by which team has a skater nearer the end-zone faceoff dots.',
  delayedCalls: () => 'While one team has a penalty pending, the other can be called too.',
  threeOnThree: (c) =>
    `Overtime is 3 on 3 (each line's LW, C and RD)${c.threeOnThree === 'season' ? ' in the regular season' : ', playoffs included'}; a power play adds a skater.`,
  hitEnergy: (c) =>
    `With line changes on, a skater knocked down by a check or a poke check loses ${energyText(c.hitEnergy)} of his energy, so he slows and tires sooner; the original game takes none.`,
  injuryBonus: (c) =>
    `Each knockdown a skater takes adds ${c.injuryBonus} to the impact of a hit that can injure him, its own included (at most ${c.injuryCap}, about ${Math.round((c.injuryCap / 160) * 100)} in 100 more), and half of it wears off at each intermission; only the few hits that can injure in the original game are affected.`,
  injuryCap: (c) => `The injury risk knockdowns add is at most ${c.injuryCap} impact, about ${Math.round((c.injuryCap / 160) * 100)} in 100 more on a hit that can injure.`,
  holdEnergy: (c) => `With line changes on, a skater caught by a hold or hook loses ${energyText(c.holdEnergy)} of his energy; the original game takes none.`,
  anyPosition: () => "The game's Edit Lines offers every skater for every position, and keeps such lines when they are saved; a player plays the position the line gives him.",
  fourthPeriodOvertime: (c) =>
    `The main menu offers an extra period length, and a regular-season game played at it has ${clockText(c.fourthPeriodOvertime)} of overtime; the other lengths keep theirs, and playoff overtime is as long as a period.`,
  introWait: (c) => `The two intro screens are ${c.introWait < NO_HACKS.introWait ? 'shorter' : 'longer'} than in the original game, where each lasts about 5 seconds (a button skips them).`,
  puckFriction: (c) =>
    `The puck slows ${c.puckFriction < NO_HACKS.puckFriction ? 'faster' : 'more slowly'} on the ice than in the original game (and so do gliding skaters: a player receiving a pass, or sliding after a fall).`,
  netColours: (c) => `The nets are drawn in the ${c.netColours === 'crowd' ? "crowd's" : c.netColours === 'home' ? "home team's" : c.netColours === 'away' ? "visitors'" : "rink's"} colours.`,
  puckColours: (c) => `The puck is drawn in the ${c.puckColours === 'crowd' ? "crowd's" : c.puckColours === 'home' ? "home team's" : c.puckColours === 'away' ? "visitors'" : "rink's"} colours.`,
  greenFan: () => 'The fan in green in the stands has his arm and leg back.',
  fewerSkaterLines: (c) => `Edit Lines and Team Rosters show only the positions this ROM plays, ${fewerSkaterLinesText(c.fewerSkaterLines)}, so they no longer crash.`,
  bCheckPenaltiesOff: (c) =>
    c.bCheckPenaltiesOff === 'forum'
      ? "B-checks with penalties off trip as they do with penalties on; with penalties on, the computer's B-checks trip less often (the forum's version)."
      : 'With penalties off, B-checks trip as they do with penalties on.',
  goalieDelay: (c) =>
    `B is held ${more(c.goalieDelay, NO_HACKS.goalieDelay, 'longer', 'for less time')} before a player takes the goalie: about ${(c.goalieDelay / 34).toFixed(2)} seconds, where the original game takes about 0.5.`,
  energyDrain: (c) => `Players tire ${more(c.energyDrain, NO_HACKS.energyDrain, 'faster', 'more slowly')} on the ice (${c.energyDrain}, where the original has ${NO_HACKS.energyDrain}).`,
  noSkatingDrain: () => 'With line changes on, skating costs no energy: players tire only from what else is set to cost it, such as hits and speed bursts, and rest on the bench as usual.',
  burstEnergy: (c) =>
    c.burstEnergy === 0
      ? 'A speed burst costs no energy.'
      : `A speed burst costs ${c.burstEnergy} energy (${Math.round((c.burstEnergy / 4096) * 100)}% of full), where the original costs ${NO_HACKS.burstEnergy}.`,
  energyRecovery: (c) =>
    `Players get their energy back ${more(c.energyRecovery, NO_HACKS.energyRecovery, 'faster', 'more slowly')} on the bench (${c.energyRecovery}, where the original has ${NO_HACKS.energyRecovery}).`,
  speedBurst: (c) => `The C-button speed burst gives every player the same push, ${c.speedBurst}, tired or not; the original gives a fresh player 32 and a tired one less.`,
  turnRate: (c) =>
    `Skaters ${more(c.turnRate, NO_HACKS.turnRate, 'stop and turn more sharply', 'take a longer, sliding stop')} when they reverse (${c.turnRate}, where the original has ${NO_HACKS.turnRate}).`,
  realTime: () => 'The clocks count real seconds, so a period lasts as long as it says.',
  weightFix: (c) =>
    c.weightFix === 'simple'
      ? "An early version of smozoma's weight bug fix: in a check the two players' weights are swapped round."
      : "smozoma's weight bug fix, an older hack: both players' checking ratings count in every check, and the lighter checker does better.",
}

// The page's sections (core/hackgroups.ts), so a hack is in the same place on both.
// A sentence on what each Genesis hack does, whatever it is set to: the Hacks page's summary. Where the sheet's
// text depends on the setting, its own words; else the sheet's.
const GENESIS_SUMMARY: Partial<Record<keyof HackChoices, string>> = {
  checkFix: 'Checks are judged fairly: a heavier checker does better, and switching away with C then B just before a hit no longer helps.',
  weightFix: "An earlier fix of the same weight bug (smozoma's); the one above replaces it.",
  penaltySeconds: 'How long each penalty minute keeps a player in the box, for leagues that play shorter periods.',
  fightSeconds: 'How long a fight keeps each fighter in the box.',
  seasonTies: 'What happens to a regular-season game still tied: a tie, overtime until a goal, or a shootout.',
  threeStars: 'How the three stars of the game are picked.',
  bonuses: 'Turns the hot and cold swings in player ratings on or off.',
  baseWeight: 'The weight in pounds a weight rating of 0 stands for (only what the screens show).',
  goalieHold: 'How long a goalie may hold the puck before the whistle.',
  goalieWidth: 'How far the goalie goes to each side to play the puck.',
  goalieOut: 'How far up the ice the goalie comes out to play the puck.',
  goalieLine: 'Where a goalie holding the puck brings the whistle.',
  injuries: 'How often hits injure, and how long an injury lasts.',
  hotColdRange: "How far hot and cold can move a player's ratings.",
  threeOnThree: 'Overtime played 3 on 3, as the NHL does, with a skater more for a power play.',
  hitEnergy: 'With line changes on, a knocked-down skater loses some energy, so he tires sooner.',
  injuryBonus: 'Each knockdown a skater takes makes the next injury a little likelier.',
  injuryCap: 'The most the knockdowns above can add to the injury risk.',
  holdEnergy: 'With line changes on, a skater held or hooked loses some energy.',
  fourthPeriodOvertime: "Adds a period length to the main menu whose regular-season games get their own overtime, such as 99 minutes.",
  introWait: 'How long the intro screens wait before moving on.',
  puckFriction: 'How quickly a sliding puck, and a gliding skater, slows down.',
  netColours: 'The colour of the nets.',
  puckColours: 'The colour of the puck.',
  fewerSkaterLines: 'Fits Edit Lines to a ROM that plays fewer than five skaters (such as 2 on 2).',
  bCheckPenaltiesOff: 'Whether a B-check trips with penalties off as it does with them on.',
  goalieDelay: 'How long B is held before you take control of the goalie.',
  energyDrain: 'With line changes on, how fast skaters tire on the ice.',
  burstEnergy: 'With line changes on, how much energy a C-button speed burst costs.',
  energyRecovery: 'With line changes on, how fast skaters get their energy back on the bench.',
  speedBurst: 'How much speed a C-button burst gives.',
  turnRate: 'How sharply skaters stop and turn.',
}
export const genesisHackSummary = (key: keyof HackChoices): string => GENESIS_SUMMARY[key] ?? GENESIS[key](NO_HACKS)

const GENESIS_SECTIONS: [string, (keyof HackChoices)[]][] = GENESIS_HACK_GROUPS.map((group) => [group.title, group.hacks])

export function genesisHackSheet(state: HackState, name: string): HackSheet {
  const unread: string[] = []
  const sections = GENESIS_SECTIONS.map(([heading, keys]) => ({
    heading,
    items: keys.flatMap((key) => {
      if (state.unknown.includes(HACK_PARTS[key])) {
        if (!unread.includes(HACK_TITLES[key])) unread.push(HACK_TITLES[key])
        return []
      }
      return state.choices[key] === NO_HACKS[key] ? [] : [{ title: HACK_TITLES[key], text: GENESIS[key](state.choices) }]
    }),
  })).filter((section) => section.items.length > 0)
  return { name, game: "NHL '94 for the Genesis", sections, unread }
}

const SNES: Record<SnesHack, string> = {
  hotColdFix: 'Hot and cold work as intended: each rating plays as set, a point or so up or down, where the original puts about half of every player\'s ratings at the maximum.',
  ppPkFix: "Each team's power play and penalty kill ratings work the way the rosters give them.",
  comebackFix: 'A team tied or behind in the third period gets its comeback boost in the second half of the period, as intended, not the first.',
  penaltyShotFixes: 'A penalty shot whistled dead because the net came off or the puck stopped is not taken all over again.',
  extraAttackerFix: "In Edit Lines, picking a line's extra attacker for one of its positions swaps the two, instead of dropping a player from the line.",
  yButtonFix: 'A skater who is down or tied up can no longer hook or hold with Y.',
  faceoffFix:
    "Every faceoff is on one of the nine dots, as in today's NHL: at centre after a goal, in the offending team's end after a penalty, and otherwise past a blue line at that end's dot on the puck's side, and in the neutral zone at the nearest neutral dot.",
  awarenessFix: 'Computer forwards on offence react by their Offensive Awareness, as intended, not their Defensive.',
  secondAssist: 'When two players pass back and forth before a goal, the second assist is now credited.',
  stickShots: "A hard shot the goalie's stick or glove knocks away now counts as a shot on goal, as one he catches already does: up to about 4 more a game.",
  bodychecks: "Each player's bodychecks given and taken are counted, for nhl94online.com, which reads them from save states.",
  clutchTime: "In the last 2:00 of a close third period (the score within a goal), everyone on the ice plays half a rating point better.",
  choppyIce: "The puck slows a little more as each period wears on, up to a quarter more by its end, and the ice is fresh again after each intermission.",
  nhlShootout: "Shootouts are three rounds, then sudden death, as in today's NHL, and end as soon as one team cannot catch up.",
  timeOnIceShown: 'Player Stats has a Time On Ice page (right past Penalties), sorted by each player\'s time on ice.',
  timeOnIce: "Each player's time on ice is counted, a second at a time while he is on the ice and the clock runs, for reading from save states.",
  bodychecksShown: "Player Stats shows each player's bodychecks as Cf, in place of penalty minutes, and sorts that column by them.",
  defenceControl: 'Defence control is on for both teams from the start of every game.',
  oneMinutePenalties: 'Minor penalties last one minute instead of two.',
  thirtySecondPeriods: 'The main menu also offers 30-second periods.',
  noInterference: 'Interference is never called.',
  shootoutInjuries: 'In the shootout of a tied regular-season game, a skater injured for the game takes no attempt: the next on the list shoots.',
  lockedChangeFix: "B during your own skater's check or speed burst now switches to another skater, where it often did nothing.",
  lockedDefenceFix: 'L and R take a defenceman even while your skater is checking, bursting, down or otherwise busy, where the press was lost.',
  shotFix: 'A shooter who gathers the puck again during his wind-up, after it was knocked loose, now still shoots.',
  oneTimerFix: 'A one-timer whose pass comes too late no longer leaves the player swinging with the puck and never shooting: he skates on with it.',
  creaseIcing: 'A puck that crosses the goal line within the width of the crease is not icing, as on the Genesis.',
  hybridIcing: 'Hybrid icing: decided as the puck crosses the goal line, by which team has a skater nearer the end-zone faceoff dots.',
  noPenaltyShots: 'A foul on a breakaway is an ordinary penalty: there are no penalty shots.',
  noGoalPosts: 'A puck between the posts is always a goal: it never rings off the post or the crossbar.',
  skipEaIntro: 'The game starts without the EA logo.',
  skipPucksIntro: 'The game starts without the flying pucks.',
  forwardsAndDefence: 'In Edit Lines, any skater can be put at any position: forwards on defence and defencemen up front.',
  showMaxBoost: 'Edit Lines and the team roster show a rating the hot and cold bug puts at the maximum as 100, as it plays.',
  manualPullGoalie: 'During play, pressing L+R pulls your goalie for an extra attacker, or puts him back, with a beep.',
  regainAssist: 'A player who wins the puck back himself and passes to the scorer gets his assist.',
  hitEnergy: 'With line changes on, a skater knocked down by a check or a poke check loses some of his energy, so he slows and tires sooner; the original game takes none.',
  holdEnergy: 'With line changes on, a skater caught by a hold or hook loses some of his energy; the original game takes none.',
  noSkatingDrain: 'With line changes on, skating costs no energy: players tire only from hits (if set) and speed bursts, and rest on the bench as usual.',
  freeBurst: 'A speed burst costs no energy.',
  seasonOvertime: 'A regular-season game tied after overtime plays more overtime until a goal, as the playoffs do, so it never ends in a tie.',
  fighting: "Players can fight, as in NHLPA 93 (McMarkis's port of its fights): a fight can start after enough hard checks between two players with high enough fighting ratings, and both get fighting majors.",
  injuries: 'Injuries work differently from the original game.',
  seasonShootout: 'A regular-season game still tied is settled by a shootout, the winners getting one goal more, so it never ends in a tie.',
  threeOnThree: "Overtime is 3 on 3, each team's goalie and its line's LW, C and RD; a power play adds a skater (4 on 3, 5 on 3).",
  fightTime: 'A fight keeps each fighter in the box a set time, whatever its minutes; the penalty minutes in the statistics are as before.',
  penaltyTime: 'Penalties last a different time from what they say: each penalty minute is a set number of seconds in the box. The penalty minutes in the statistics are as before.',
  goaliePoke: "A goalie's poke check (X) straight up or down the ice now reaches the puck on the ice and knocks it loose, as one to the side already does.",
  energySpeed: "With line changes on, a tired skater loses all of his speed rating as his energy runs out, as on the Genesis: an empty one skates at the slowest speed there is, where the original game keeps half.",
  injuryBonus: 'Each knockdown a skater takes makes a hit a little more likely to injure him, its own included (up to five knockdowns count), and half of it wears off at each intermission; only the few hits that can injure in the original game are affected.',
  fourthPeriodOvertime: 'Adds a period length to the main menu whose regular-season games get 99 minutes of overtime; the other lengths keep theirs, and playoff overtime is as long as a period.',
}

// A sentence on what each SNES hack does: the Hacks page's summary.
export const snesHackSummary = (hack: SnesHack): string => SNES[hack]

const SNES_SECTIONS: [string, SnesHack[]][] = SNES_HACK_GROUPS.map((group) => [group.title, group.hacks])

export function snesHackSheet(rom: Uint8Array, name: string): HackSheet {
  const { choices, unknown, amounts } = detectSnesHacks(rom)
  const inPlace = snesCodeInPlace(rom)
  const unread: string[] = []
  // The energy hacks say how much: units and a share of full energy.
  const textOf = (hack: SnesHack) =>
    (hack === 'hitEnergy' || hack === 'holdEnergy') && amounts
      ? SNES[hack].replace('some of his energy', `${amounts[hack]} units of his energy (${energyText(amounts[hack])})`)
      : hack === 'seasonShootout' && amounts
        ? `A regular-season game tied ${amounts.seasonShootout === 2 ? 'after period 3 goes straight to a shootout, with no overtime' : 'after overtime is settled by a shootout'}; the winners get one goal more, so it never ends in a tie.`
      : hack === 'injuries' && amounts
        ? [
            '',
            'Hits never injure: a player knocked down gets up as from any other check.',
            'A hit that would injure still draws the call, but nobody is hurt: the player lies down and then plays on.',
            'Every injury keeps the player out for the rest of the period.',
            'Every injury keeps the player out for the rest of the game.',
            'A hit that would injure has the player stay down about 5 seconds and then get up and play on: no injury, and no penalty.',
          ][amounts.injuries] || SNES[hack]
      : hack === 'fighting' && amounts
        ? `${SNES.fighting} Each player's fighting rating counts ${amounts.fighting} more${amounts.fighting === 2 ? " (the patch's default)" : ''}.`
        : hack === 'fightTime' && amounts
        ? `A fight keeps each fighter in the box ${clockTime(amounts.fightTime)}, whatever its minutes; the penalty minutes in the statistics are as before.`
        : hack === 'penaltyTime' && amounts
        ? `Penalties last ${amounts.penaltyTime < 60 ? 'less' : 'longer'} than they say: each penalty minute is ${amounts.penaltyTime} seconds in the box, so ${penaltyLengths(amounts.penaltyTime)}. The penalty minutes in the statistics are as before.`
        : SNES[hack]
  const sections = SNES_SECTIONS.map(([heading, hacks]) => ({
    heading,
    items: hacks.flatMap((hack) => {
      if (unknown.includes(hack)) {
        // Hacks offered only where the code is in place are not missed where it has moved.
        if (inPlace || !snesHackInPlaceOnly(hack)) unread.push(SNES_HACK_TITLES[hack])
        return []
      }
      return choices[hack] ? [{ title: SNES_HACK_TITLES[hack], text: textOf(hack) }] : []
    }),
  })).filter((section) => section.items.length > 0)
  return { name, game: "NHL '94 for the SNES", sections, unread }
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// The sheet as a page of its own, to open, print or pass round.
export function hackSheetHtml(sheet: HackSheet, made: Date = new Date()): string {
  const body =
    sheet.sections.length === 0
      ? '<p>None: this ROM plays as the original game.</p>'
      : sheet.sections
          .map(
            (section) =>
              `<h2>${escape(section.heading)}</h2>\n<dl>\n${section.items.map((item) => `<dt>${escape(item.title)}</dt><dd>${escape(item.text)}</dd>`).join('\n')}\n</dl>`,
          )
          .join('\n')
  const unread =
    sheet.unread.length > 0
      ? `<p class="note">Also changed, in code NOSE4Web does not know, so not described here: ${escape(sheet.unread.join(', '))}.</p>`
      : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hacks in ${escape(sheet.name)}</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; color: #1c1c1c; background: #fff; max-width: 44rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.6rem; margin-bottom: 0.2rem; }
  h2 { font-size: 1.15rem; margin-top: 1.6rem; border-bottom: 1px solid #ccc; padding-bottom: 0.2rem; }
  dt { font-weight: 600; margin-top: 0.7rem; }
  dd { margin: 0.1rem 0 0 0; }
  .note, footer { color: #555; font-size: 0.9rem; }
  footer { margin-top: 2rem; border-top: 1px solid #ccc; padding-top: 0.5rem; }
  @media print { body { margin: 0; max-width: none; } h2 { break-after: avoid; } dt { break-after: avoid; } }
</style>
</head>
<body>
<h1>Hacks in ${escape(sheet.name)}</h1>
<p>${escape(sheet.game)}. How this ROM differs from the original game; everything not listed plays as the original does.</p>
${body}
${unread}
<footer>Made with NOSE4Web, https://nhl94dotcom.github.io/NOSE4Web/, on ${made.toISOString().slice(0, 10)}.</footer>
</body>
</html>
`
}

// Discord takes at most 2,000 characters a message; this leaves room for the part count.
const DISCORD_MOST = 1900

// The sheet as Discord messages, ready to paste one after another: each under
// Discord's limit, split only between lines, a section's heading repeated
// where it goes on into the next message.
export function hackSheetDiscord(sheet: HackSheet): string[] {
  const head = [`**Hacks in ${sheet.name}** (${sheet.game})`, 'Everything not listed plays as the original game does.']
  if (sheet.sections.length === 0) return [`**Hacks in ${sheet.name}** (${sheet.game})\nNone: it plays as the original game.`]
  const messages: string[][] = [head.slice()]
  const size = (lines: string[]) => lines.join('\n').length
  for (const section of sheet.sections) {
    const heading = `\n__${section.heading}__`
    let first = true
    for (const item of section.items) {
      const line = `- **${item.title}**: ${item.text}`
      const current = messages[messages.length - 1]
      const adding = first ? [heading, line] : [line]
      if (size([...current, ...adding]) > DISCORD_MOST) messages.push([`__${section.heading}__${first ? '' : ' (continued)'}`, line])
      else current.push(...adding)
      first = false
    }
  }
  if (sheet.unread.length > 0) {
    const line = `\nAlso changed, in code NOSE4Web does not know: ${sheet.unread.join(', ')}.`
    const current = messages[messages.length - 1]
    if (size([...current, line]) > DISCORD_MOST) messages.push([line.trim()])
    else current.push(line)
  }
  const texts = messages.map((lines) => lines.join('\n'))
  return texts.length === 1 ? texts : texts.map((text, i) => `${text}\n(${i + 1}/${texts.length})`)
}

// ------------------------------------------------------------- pictures

// What a league's owners see differently in the ROM's pictures: score box
// logos where the game would print letters. (Player photos are not counted:
// the original game has them too, and the editor cannot tell the game's own
// from new ones.)
export function pictureItems(project: RomProject): { title: string; text: string }[] {
  const items: { title: string; text: string }[] = []
  const teams = project.teams.length
  if (snesScoreLogosSupported(project)) {
    const count = project.teams.filter((_, team) => snesScoreLogo(project, team) !== null).length
    if (count > 0) {
      items.push({
        title: 'Score box logos',
        text:
          `${count === teams ? 'Each team shows' : `${count} of the ${teams} teams show`} a small logo in the score box, and in the clock box on a power play, where the original game prints its three letters` +
          (count === teams ? '.' : '; the rest show their letters.'),
      })
    }
  }
  if (hasGenesisScoreLogos(project)) {
    const count = project.teams.filter((_, team) => genesisScoreLogo(project, team) !== null).length
    if (count > 0) {
      items.push({
        title: 'Score box logos',
        text:
          `${count === teams ? 'Each team shows' : `${count} of the ${teams} teams show`} a small logo in the score box, where the original game prints its three letters` +
          (count === teams ? '.' : '; the rest show their letters.'),
      })
    }
  }
  if (hasGenesisBlood(project)) {
    items.push({ title: 'Head bleeding', text: "A player hurt for the game bleeds from the head as he lies on the ice, as in NHLPA '93." })
  }
  return items
}

// A sheet with its Pictures section, where the ROM has anything to say there.
export function withPictures(sheet: HackSheet, project: RomProject): HackSheet {
  const items = pictureItems(project)
  return items.length === 0 ? sheet : { ...sheet, sections: [...sheet.sections, { heading: 'Pictures', items }] }
}
