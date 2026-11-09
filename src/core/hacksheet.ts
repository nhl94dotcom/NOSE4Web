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

// What each Genesis hack means for a player, as it is set.
const GENESIS: Record<keyof HackChoices, Explain> = {
  checkFix: (c) =>
    c.checkFix === 'all240'
      ? 'Every check is judged as if a person made it (an earlier version of this fix), so a light checker knocks down much heavier players.'
      : 'Checks are judged the same way for everyone, so a heavier checker does better, as in real hockey, and pressing C and then B to switch away just before a hit no longer helps.',
  secondAssist: () => 'When two players pass back and forth before a goal, the second assist is now credited.',
  oneTimerAssist: () => "A one-timer goal keeps its assists when the shooter's stick touched the pass before he shot.",
  aggressionFix: () => 'Aggression works as the rating reads: a higher rating means more penalties, where the original game mixes the values up (a 4 plays like a 1).',
  ppPkFix: () => "Each team's power play and penalty kill ratings work the way the rosters give them.",
  comebackFix: () => 'A team tied or behind in the third period gets its comeback boost in the second half of the period, as intended, not the first.',
  passFix: () => 'Passes travel at their proper speed: no more "rocket passes" that fly off at up to twice the speed.',
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
      : c.injuries === 'penaltyOnly'
        ? 'A hit that would injure still draws the penalty, but nobody is hurt: the player lies down for a few seconds and skates on.'
        : `Every injury keeps the player out for the ${c.injuries === 'game' ? 'rest of the game' : 'rest of the period'}, whoever made the hit.`,
  hotColdRange: (c) =>
    c.hotColdRange <= 2
      ? 'Hot and cold no longer change how anyone plays (Edit Lines may still show small differences).'
      : `Hot and cold swing a player's ratings less than in the original game: values from -${c.hotColdRange} to ${c.hotColdRange - 1}, where the original has -9 to 8.`,
  noIcing: () => 'Icing is never called.',
  introWait: (c) => `The two intro screens are ${c.introWait < NO_HACKS.introWait ? 'shorter' : 'longer'} than in the original game, where each lasts about 5 seconds (a button skips them).`,
  puckFriction: (c) =>
    `The puck slows ${c.puckFriction < NO_HACKS.puckFriction ? 'faster' : 'more slowly'} on the ice than in the original game (and so does a player receiving a pass).`,
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

const GENESIS_SECTIONS: [string, (keyof HackChoices)[]][] = [
  ['Bug fixes', ['checkFix', 'secondAssist', 'oneTimerAssist', 'aggressionFix', 'ppPkFix', 'comebackFix', 'passFix', 'runawayFix', 'penaltyShotTableFix', 'penaltyShotFixes']],
  ['Rules and options', ['faceoffFix', 'snipingFix', 'goaliePullFix', 'blindRingFix', 'awarenessFix', 'crowdFix']],
  ['Statistics', ['stickShots', 'bodychecks', 'plusMinus', 'threeStars']],
  ['Ratings and weights', ['wideRatings', 'bonuses', 'baseWeight']],
  ['How the game plays', ['goalieHold', 'goalieWidth', 'goalieOut', 'goalieLine', 'stamina', 'energyDrain', 'energyRecovery', 'speedBurst', 'turnRate', 'realTime', 'injuries', 'hotColdRange', 'noIcing', 'bCheckPenaltiesOff', 'goalieDelay', 'fewerSkaterLines', 'puckFriction']],
  ['Looks and screens', ['puckColours', 'greenFan', 'introWait']],
  ['Older hacks', ['weightFix']],
]

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
  defenceControl: 'Defence control is on for both teams from the start of every game.',
  oneMinutePenalties: 'Minor penalties last one minute instead of two.',
  thirtySecondPeriods: 'The main menu also offers 30-second periods.',
  noInterference: 'Interference is never called.',
  noPenaltyShots: 'A foul on a breakaway is an ordinary penalty: there are no penalty shots.',
  noGoalPosts: 'A puck between the posts is always a goal: it never rings off the post or the crossbar.',
  skipEaIntro: 'The game starts without the EA logo.',
  skipPucksIntro: 'The game starts without the flying pucks.',
  forwardsAndDefence: 'In Edit Lines, any skater can be put at any position: forwards on defence and defencemen up front.',
  showMaxBoost: 'Edit Lines and the team roster show a rating the hot and cold bug puts at the maximum as 100, as it plays.',
  manualPullGoalie: 'During play, pressing L and R together pulls your goalie for an extra attacker, or puts him back, with a beep.',
  regainAssist: 'A player who wins the puck back himself and passes to the scorer gets his assist.',
}

const SNES_SECTIONS: [string, SnesHack[]][] = [
  ['Bug fixes', ['hotColdFix', 'secondAssist', 'regainAssist', 'ppPkFix', 'comebackFix', 'penaltyShotFixes', 'extraAttackerFix', 'yButtonFix']],
  ['Edit Lines and controls', ['forwardsAndDefence', 'showMaxBoost', 'manualPullGoalie']],
  ['Rules and options', ['faceoffFix', 'awarenessFix', 'defenceControl', 'oneMinutePenalties', 'thirtySecondPeriods', 'noInterference', 'noPenaltyShots', 'noGoalPosts']],
  ['Statistics', ['stickShots']],
  ['Starting up', ['skipEaIntro', 'skipPucksIntro']],
]

export function snesHackSheet(rom: Uint8Array, name: string): HackSheet {
  const { choices, unknown } = detectSnesHacks(rom)
  const inPlace = snesCodeInPlace(rom)
  const unread: string[] = []
  const sections = SNES_SECTIONS.map(([heading, hacks]) => ({
    heading,
    items: hacks.flatMap((hack) => {
      if (unknown.includes(hack)) {
        // Hacks offered only where the code is in place are not missed where it has moved.
        if (inPlace || !snesHackInPlaceOnly(hack)) unread.push(SNES_HACK_TITLES[hack])
        return []
      }
      return choices[hack] ? [{ title: SNES_HACK_TITLES[hack], text: SNES[hack] }] : []
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
