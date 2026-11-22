import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { layOnNhl95, nhl95Rules, type HackDraft } from './hackdraft'
import { PendingBar } from './PendingChanges'
import { HackShortcuts } from './HackShortcuts'
import { NumberBox } from './NumberBox'
import { WEIGHT_BASES } from './core/attributes'
import { baseWeightForYear, HITS_ONLY, holdSeconds, RECOMMENDED_HIT_ENERGY, RECOMMENDED_HOLD_ENERGY, RECOMMENDED_INJURY_BONUS, RECOMMENDED_INJURY_CAP } from './core/hacks'
import { hackSheetDiscord, hackSheetHtml } from './core/hacksheet'
import {
  applyNhl95Hacks,
  detectNhl95Hacks,
  NHL95_HACK_CHOICES,
  NHL95_HACK_RANGES,
  NHL95_HACK_SECTIONS,
  NHL95_HACK_TITLES,
  NO_NHL95_HACKS,
  nhl95BlockedShotsOutdated,
  nhl95GiveawaysOutdated,
  nhl95ShootoutOutdated,
  nhl95HackSheet,
  nhl95HacksForDiscord,
  nhl95HackStateChanges,
  type Nhl95ChoiceHack,
  type Nhl95Hack,
  type Nhl95HackChoices,
  type Nhl95NumberHack,
} from './core/nhl95hacks'
import { clockTime, penaltyLengths } from './core/penaltytime'
import type { RomProject } from './core/rom'

interface Props {
  project: RomProject
  name: string
  onChange: (project: RomProject) => void
  // Choices made here earlier and not applied, kept by the app while other pages were shown (PendingChanges.tsx).
  kept?: HackDraft | null
  onKeep?: (draft: HackDraft | null) => void
}

const SUMMARIES: Record<Nhl95Hack, string> = {
  threeStars: 'How the three stars of the game are picked.',
  bodychecks: "Counts each player's checks and shows them in Player Stats as Chk, where penalty minutes were.",
  timeOnIce: 'A Time On Ice page in Player Stats, from the time on ice the game counts but never shows.',
  giveaways: "Counts each player's giveaways and takeaways, with Player Stats pages and a Game Stats row for them.",
  blockedShots: "Counts each skater's blocked shots, with a Player Stats page for them. Needs Skaters block the puck.",
  realTime: 'The game, penalty and shootout clocks count true seconds.',
  penaltySeconds: 'How long each penalty minute keeps a player in the box, for leagues that play shorter periods.',
  fightSeconds: 'How long a fight keeps each fighter in the box.',
  fightMomentum: 'The team whose player wins a fight gets +2 Agility and +2 Speed for 90 seconds.',
  fightOnce: 'A player who has fought cannot fight again that game.',
  noIcing: 'Icing is never called.',
  hybridIcing: 'Icing decided as the puck crosses the goal line, by who is nearer the end-zone faceoff dots.',
  delayedCalls: 'While one team has a penalty pending, the other can be called too.',
  bCheckPenaltiesOff: 'Whether a B-check trips with penalties off as it does with them on.',
  injuries: 'How often hits injure, and how long an injury lasts.',
  referees: 'How often the referee calls holding, hooking, tripping, charging, roughing and goalie interference.',
  shootoutInjuries: 'In the shootout of a tied regular-season game, a skater injured for the game takes no attempt.',
  fourthPeriodOvertime: 'Adds a period length to Game Setup whose regular-season games get their own overtime, such as 99 minutes.',
  stamina: 'With line changes on, players on the ice do not tire.',
  energyDrain: 'With line changes on, how fast skaters tire on the ice.',
  energyRecovery: 'With line changes on, how fast skaters get their energy back on the bench.',
  noSkatingDrain: 'With line changes on, skating costs no energy; hits, holds and bursts still can.',
  burstEnergy: 'With line changes on, how much energy a C-button speed burst costs.',
  hitEnergy: 'With line changes on, a knocked-down skater loses some energy, so they tire sooner.',
  holdEnergy: 'With line changes on, a skater held or hooked loses some energy.',
  injuryBonus: 'Each knockdown a skater takes makes a later injury a little likelier.',
  injuryCap: 'The most the knockdowns above can add to the injury risk.',
  goalieHold: 'How long a goalie may hold the puck before the whistle.',
  diveHold: 'How long a goalie who catches the puck in a dive may hold it after getting up.',
  goalieWidth: 'How far a goalie you control goes to each side without the puck.',
  goalieOut: 'How far up the ice a goalie you control comes without the puck.',
  goalieLine: 'The line a goalie you control is whistled past.',
  goalieDelay: 'How long B is held before you take control of the goalie.',
  speedBurst: 'How much speed a C-button burst gives.',
  turnRate: 'How sharply skaters stop and turn.',
  puckFriction: 'How quickly a sliding puck slows down.',
  choppyIce: 'The puck slows a little more as each period wears on, and the ice is fresh again after each intermission.',
  fighting: 'Players can fight. Adds a Fighting setting to Game Setup: Off, On, or On - Arcade Mode.',
  threeOnThree: 'Overtime is 3 on 3, as in the NHL; a penalty makes it 4 on 3. Playoff games stay 5 on 5.',
  threeOnThreeAll: 'Every overtime is 3 on 3, playoffs included; a penalty makes it 4 on 3.',
  fightingOff: 'What the Fighting setting on Game Setup is set to when the game is switched on. Players can still change it.',
  fightingArcade: '',
  organResume: 'After a pause the organ carries on with its song from where it was, instead of staying quiet.',
  runawayFix: 'A skater no longer keeps gliding, barely slowing, after a fall into the boards or when you switch to them.',
  goaliePullFix: 'In the last minute the computer pulls its goalie when one or two goals behind, not only when exactly two.',
  snipingFix: "While a team's goalie is off the ice, its shots are only as accurate as the shooter, instead of always going exactly where aimed.",
  penaltyShotTableFix: 'A penalty shot is called for the foul that was committed, not named after a different one.',
  penaltyShotFixes: 'A penalty shot ended by an odd whistle is not taken again, and no "ghost puck" floats through the net and boards.',
  secondAssist: 'When two players pass back and forth before a goal, the second assist is credited.',
  oneTimerAssist: "A one-timer goal keeps its assists when the shooter's stick touched the pass before the shot.",
  regainAssist: 'A player who wins the puck back themselves and passes to the scorer gets their assist.',
  aggressionFix: 'More Aggression always means more penalties; in the original some ratings play like others (a 4 plays like a 1).',
  comebackFix: 'A team tied or behind in the third period gets its small comeback boost late in the period, as meant, not early.',
  openNetFix: 'A one-timer at an open net is aimed at the middle of the net, not just under the crossbar.',
  blindRingFix: 'The goalie can stop a loose puck sliding in near their stick, where the original lets it through untouched.',
  seasonOvertime: 'A tied regular-season game plays overtime after overtime until a goal, as the playoffs do.',
  seasonShootout: 'A regular-season game still tied after overtime is settled by a shootout.',
  nhlShootout: "Shootouts follow today's NHL rule: three rounds, then sudden death, over once a team can't catch up.",
  seasonShootoutNow: 'A regular-season game tied after period 3 goes straight to a shootout, with no overtime.',
  rocketFix: 'No more rocket passes: every pass goes at its normal speed, where the original sends some far too fast.',
  passFix: "Passes go to the teammate you're pointing at, as in NHL 94, instead of sometimes straight across or back behind the passer.",
  ppPkFix: "A team's power play and penalty kill ratings work as set, where the original mixes the two up.",
  faceoffFix: "Every faceoff is on a dot, as today's NHL rules have it, not where play stopped between the dots.",
  awarenessFix: 'Computer wingers and centres on offence use Offensive Awareness, not Defensive.',
  centreDefenceFix: 'A computer centre defending outside their zone covers the right spot at both ends of the rink.',
  goalieTurnFix: 'A computer goalie turning to follow the puck never turns round through their own net.',
  shotScatterFix: 'Shots at the bottom net miss as often as shots at the top net.',
  stickReachFix: 'A stick reaches the puck in a circle, and less far right after a pass.',
  bodyBlockFix: "A puck that hits a skater's body bounces off them.",
  lockedChangeFix: 'B switches skaters while yours is down or busy.',
  stickShots: "A hard low shot knocked away by the goalie's stick counts as a shot on goal.",
  anyPosition: 'Edit Lines lists every skater for every position.',
  baseWeight: 'The weight in pounds a weight rating of 0 stands for (only what the screens show).',
  hotColdRange: "How far hot and cold can move a player's ratings.",
  clutchTime: 'In the last 2:00 of a close third period, everyone on the ice plays half a rating point better.',
}

const FIGHT_START = 'Fighting setting at power-on'

// The line each tested option ends with.
const TESTED = 'Tested in the game by the NHL94 Match Viewer project.'
// NHL 94's fixes, where NHL '95 has the same code.
const FROM_94 = `The same fix as in NHL 94; it works on the WN95HL's ROMs too. ${TESTED}`
// The line each of NHL 94's settings ends with, tested or (UNTESTED) not yet.
const SETTING_TESTED = `The same option as in NHL 94; it works on the WN95HL's ROMs too. ${TESTED}`
const UNTESTED = "The same option as in NHL 94; it works on the WN95HL's ROMs too. Not yet tested in the game."
// Those not played yet.
const NOT_YET: Nhl95Hack[] = ['referees']

const OT3_MORE = (
  <p className="note">
    Each team plays its goalie, centre, left wing and right defenceman. A penalty gives the other team an extra
    skater (4 on 3, or 5 on 3 with two); when it ends the teams play 4 on 4 until the next stoppage, then 3 on 3
    again. A team with three in the box at once still keeps two skaters: the game can't take any more off. A penalty
    from the third period carries into overtime, and the Line Changes setting makes no difference. Only one of the two
    3 on 3 choices can be on. {TESTED}
  </p>
)

const MORE: Partial<Record<Nhl95Hack, ReactNode>> = {
  anyPosition: (
    <p className="note">
      The game's Edit Lines lists only forwards for the forward positions and only defencemen for the defence. With
      this on it lists every skater for every position. A player plays the position the line gives them, with their own
      ratings. Saved lines keep them there, even on a ROM without this. The team page's lines can then take anyone too.{' '}
      {SETTING_TESTED}
    </p>
  ),
  ppPkFix: (
    <p className="note">
      Each team has a power play rating and a penalty kill rating that change its players' ratings when it is on the
      power play or killing a penalty. The original game mixes the two up, so Ottawa, Hartford, Quebec and San Jose,
      set as weak at both, get the best power play. With this on the ratings work as set, and the team page shows them
      to match. If your league set these ratings in the editor before, check them after turning this on. {FROM_94}
    </p>
  ),
  faceoffFix: (
    <p className="note">
      The original game takes a faceoff on a dot only when play stops deep in an end; anywhere else it is taken where
      the puck was, often between the dots. With this on every faceoff is on a dot, as in today's NHL: after a goal at
      centre ice; after a penalty in the offending team's end, on the puck's side; otherwise at the nearest dot in the
      zone where play stopped, right on the dot as drawn. Leave it off to keep the game's own older-style faceoffs.{' '}
      {FROM_94}
    </p>
  ),
  awarenessFix: (
    <p className="note">
      How quickly a computer skater rethinks what to do depends on their awareness. Computer skaters use Offensive when
      their team has the puck and Defensive when it does not, but in the original game computer wingers and centres use
      Defensive on offence too. Whether that was meant is not known. With this on they use Offensive, like the others.
      A small change. {FROM_94}
    </p>
  ),
  centreDefenceFix: (
    <p className="note">
      A computer centre defending outside their own zone is meant to stand between the puck and their net. In the original
      game, at one end of the rink they go the wrong way: they drop back as the puck goes up the ice and come out as it
      nears their blue line. Each team has it every other period. With this on they cover the right spot at both ends.
      In NHL '95 it only matters while the puck is loose: with a player on the puck the centre covers in another way,
      which is right at both ends. Found by chaos. {FROM_94}
    </p>
  ),
  goalieTurnFix: (
    <p className="note">
      A computer goalie turning to follow the puck is meant never to turn round through their own net. At the bottom net
      the original game misses one case, so when the puck goes right to left behind their goal line they turn the long
      way, facing into their net for a moment. With this on they turn the short way, as the top goalie does. Found by
      NOSE4Web and the NHL94 Match Viewer project. {FROM_94}
    </p>
  ),
  shotScatterFix: (
    <p className="note">
      A shot that isn't perfect goes a random amount off target. For shots at the bottom net the original game halves
      part of that, so they miss a little less often. With this on both nets are the same. {FROM_94}
    </p>
  ),
  stickReachFix: (
    <p className="note">
      A bug in NHL '95 makes every stick reach the puck in a square instead of a circle, so it reaches further on the
      diagonals, and the shorter reach meant for just after a pass never applies. Sticks pick up loose pucks
      very easily. With this on they reach in a circle, as NHL 94 has it, so there are fewer quick steals of loose
      pucks. Found by NOSE4Web. {TESTED}
    </p>
  ),
  bodyBlockFix: (
    <p className="note">
      A bug in NHL '95 means a puck never bounces off a skater's body: it passes through them, and only sticks and
      goalies stop it. With this on skaters block shots and passes, as in NHL 94, so a game has more blocks and a
      few fewer shots on goal. Found by NOSE4Web. {TESTED}
    </p>
  ),
  lockedChangeFix: (
    <p className="note">
      While your skater is down on the ice, checking or bursting, pressing B usually does nothing until they are free: they
      are often the one nearest the puck, so the game picks them again. With this on B switches to the next best skater,
      as in NHL 94. Found by a league member and the NHL94 Match Viewer project. {TESTED}
    </p>
  ),
  stickShots: (
    <p className="note">
      A hard low shot that comes off the goalie's stick is a save, but the original game does not count it as a shot on
      goal: only catches and saves with the goalie's body count. With this on it counts, once, for the shooter, their team and
      against the goalie. Only the statistics change. {FROM_94}
    </p>
  ),
  threeOnThree: OT3_MORE,
  threeOnThreeAll: OT3_MORE,
  fightingOff: (
    <p className="note">
      The fighting patch starts the game with Fighting set to On. A league can choose Off instead, so a game has no
      fights unless the players turn them on, or On - Arcade Mode. Players can still change it on Game Setup. Needs
      Fighting. {TESTED}
    </p>
  ),
  fightingArcade: null,
  organResume: (
    <p className="note">
      Pausing the game stops the organ, and in the original it stays quiet after the pause until the next song starts.
      With this on the organ picks its song up where it left off. {TESTED}
    </p>
  ),
  runawayFix: (
    <p className="note">
      Now and then a skater keeps gliding, barely slowing, when they should be slowing down: most often after getting up
      from a fall into the boards, when it can last a second or two. It can also happen when you switch to them as a pass
      comes, or after a one-timer. With this on they skate normally. In NHL '95 a speed burst already ends the glide, so
      it never gets as bad as NHL 94's runaway skater. {FROM_94}
    </p>
  ),
  goaliePullFix: (
    <p className="note">
      In the last minute of the third period the computer pulls its goalie for an extra attacker, but only when exactly
      two goals behind, never when one down. With this on it pulls the goalie when one or two behind, as a real coach would.
      While the goalie is out the computer's shots go exactly where aimed, unless the pulled-goalie sniping fix is on too.{' '}
      {FROM_94}
    </p>
  ),
  snipingFix: (
    <p className="note">
      A matter of taste: some leagues like it as it is. Whenever a team's goalie is off the ice (on a delayed penalty,
      or pulled late in a game), every shot it takes from close enough goes exactly where aimed, whatever the shooter's
      Shot Accuracy. With the fix those shots are as accurate as the shooter's rating makes them. Shots at an empty net
      are not affected. {FROM_94}
    </p>
  ),
  penaltyShotTableFix: (
    <p className="note">
      A foul on a skater on a breakaway can give a penalty shot. The original game names every penalty shot after the
      wrong foul: charging is called slashing, slashing is called roughing, and so on. With the fix each is called for
      the foul committed. Which fouls give penalty shots does not change. {FROM_94}
    </p>
  ),
  penaltyShotFixes: (
    <p className="note">
      Two penalty shot bugs. A penalty shot ended by an odd whistle, such as the puck going over the glass, is taken all
      over again; with the fix play goes on to a faceoff. And a puck shot over the glass just before a penalty shot can
      come back unable to touch anything, floating through the net and the boards (the "ghost puck"); with the fix it
      plays normally. {FROM_94}
    </p>
  ),
  fighting: (
    <p className="note">
      Brings back the fights EA drew for NHL '95 but left out: Vancecookcobxin's fighting patch, with a fix by the NHL94
      Match Viewer project. A hard check can start a fight between two players with Fighting ratings (in
      Handed/Fighting), more often as a game gets rougher. To start one a player needs 71 or more (42 in Arcade Mode),
      and their opponent 14 or more. They trade punches (C high, B low, A grab) until one goes down, and both get five
      minutes. Game Setup gets a Fighting setting: Off, On, or On - Arcade Mode, with more fights. The WN95HL's Season 18
      ROM rates no one for fighting, so give players ratings before anyone can fight. {TESTED}
    </p>
  ),
  secondAssist: (
    <>
      <p className="note">
        When two players pass back and forth before a goal, the original game loses track of the earlier passer, so the
        goal gets only one assist. With the fix the second assist is credited. {FROM_94}
      </p>
    </>
  ),
  oneTimerAssist: (
    <p className="note">
      When the shooter's stick touched the pass just before their one-timer, the original game counts them as their own
      passer, and the goal gets no assists. With the fix the players who passed get their assists. {FROM_94}
    </p>
  ),
  regainAssist: (
    <p className="note">
      When a player wins the puck straight back from the other team and passes to a teammate who scores, the original
      game drops them from the goal, so their assist is lost. With the fix they get it. {FROM_94}
    </p>
  ),
  aggressionFix: (
    <p className="note">
      The original game reads Aggression wrongly, so it wraps round: a 4 plays like a 1, and a 6 or a 3 draws the most
      penalties. With the fix more Aggression always means more penalties. Goalies play as before. {FROM_94}
    </p>
  ),
  comebackFix: (
    <p className="note">
      A team tied or behind in the third period is meant to get a small boost late on, but the original game has it the
      wrong way round: the boost comes in the first half of the period and goes for the second. With the fix it comes in
      the second half. Overtime is not affected: both teams have the boost all through it. {FROM_94}
    </p>
  ),
  openNetFix: (
    <p className="note">
      The game aims one-timers itself. When the goalie has wandered out of position it aims just under the crossbar, and
      from close in many go over or hit the bar. The fix aims at the middle of the net instead, as the game already does
      with no goalie at all. Penalty shots and shootouts are unchanged. An option, not a recommended fix. {FROM_94}
    </p>
  ),
  blindRingFix: (
    <p className="note">
      When a low loose puck comes near the goalie's stick, the original game leaves it to the stick alone, but the stick
      only stops a puck right at its blade. A puck in between touches nothing and slides on, which is how some five-hole
      goals go in; NHL '95's gap is bigger than NHL 94's. The fix lets the goalie's body play those pucks, stopping or
      holding them as the goalie's ratings allow. An option, not a recommended fix. {FROM_94}
    </p>
  ),
  nhlShootout: (
    <p className="note">
      The original game plays every shootout to five rounds, even when one team can no longer catch up. With this on it
      follows today's NHL rule: three rounds, then sudden death, ending as soon as the result is settled. The home team
      shoots first. For Shootout mode on the main menu and the regular-season shootouts above. {TESTED}
    </p>
  ),
  seasonShootout: (
    <p className="note">
      A regular-season game still tied after its overtime goes to a shootout, played as in Shootout mode: five shooters a
      side, then sudden death. The winners get one goal more in the score, so no game ends in a tie; the shootout itself
      counts in no statistics. Playoff games are unchanged. Only one of the three ways of settling a tie can be on.{' '}
      {TESTED}
    </p>
  ),
  seasonShootoutNow: (
    <p className="note">
      A regular-season game tied after period 3 goes straight to a shootout, with no overtime, played and counted as the
      shootout after overtime is. Playoff games are unchanged. Only one of the three ways of settling a tie can be on.{' '}
      {TESTED}
    </p>
  ),
  seasonOvertime: (
    <p className="note">
      In the original game a regular-season game still tied after one overtime ends in a tie, while a playoff game keeps
      playing overtimes until someone scores. With this on the regular season does the same. Each overtime is as long as
      the ROM's own (10 minutes in the original game, 5 in the WN95HL's). {TESTED}
    </p>
  ),
  rocketFix: (
    <p className="note">
      The game sets each pass's speed from how long it should take to reach the receiver, but it works that time out
      wrongly, so some passes go nearly twice as fast as they should and a few far faster: the rocket passes. With the
      fix passes go at their own speed. NHL '95's slow flat pass stays as slow as
      before, and the receiver still waits for it. {FROM_94}
    </p>
  ),
  passFix: (
    <p className="note">
      When you pass, the game looks for a teammate in the direction you're pointing. NHL '95 changed a small part of how
      it works that direction out, so now and then a pass goes straight across instead of to a teammate off at an angle,
      or back to a teammate behind the passer. The fix puts back NHL 94's way. Only the regular pass (B) changes, not
      the soft pass (A). Computer players turn the same way, so they may move a little differently too. An option, not
      a recommended fix: some leagues may prefer passing as NHL '95 has always done it. {TESTED}
    </p>
  ),
}

const N = NO_NHL95_HACKS
const chance = (impact: number) => Math.round((impact / 160) * 100)

// The notes of NHL 94's settings, some with the values chosen; `stock` says what NHL '95 has, and this ROM.
const SETTING_MORE: Partial<Record<Nhl95Hack, (c: Nhl95HackChoices, stock: string) => ReactNode>> = {
  threeStars: () => (
    <>
      The original game picks its three stars very simply. The improved way weighs goals, assists, shots and checks for
      skaters, and goals against, shots faced and shutouts for goalies. Choose it for how the ROM will mostly be played:
      skaters are given a little more with line changes on, when each plays less. It works without Bodycheck
      statistics.
    </>
  ),
  bodychecks: () => (
    <>
      Counts each player's checks while the clock runs and shows them in Player Stats as Chk, where penalty minutes were
      (sorted as Checks For); players' penalty minutes are then not kept. It counts the checks a player gives; unlike
      NHL 94's version, the checks they take are not counted.
    </>
  ),
  timeOnIce: () => (
    <>
      The game counts each player's time on ice but never shows it. This adds a Time On Ice page to Player Stats: press
      right past Penalty Minutes, and the players are sorted by their time on ice, each row showing goals, assists, points
      and the time (m:ss, up to 99:59). Playoff stats are unchanged. With giveaways and takeaways on, it comes after their
      two pages.
    </>
  ),
  giveaways: () => (
    <>
      Counts each player's giveaways and takeaways the way the NHL94 Match Viewer project does: the puck going from one
      team to the other with no whistle between. A takeaway goes to the skater who forced it, with a stick steal or a
      check; any other loss is a giveaway for the player who lost it. Shots, faceoffs, passes and dump-ins don't count,
      nor anything in highlights or a shootout. Game Stats gets a Give/Takeaways row, and Player Stats a page for each,
      past Penalty Minutes (or Checks For), for the game only. A pass at the net counts as a shot, not a giveaway, if
      the other team picks it up after it reaches the goalie or the goal line. A puck picked up after the whistle is not
      counted.
    </>
  ),
  blockedShots: () => (
    <>
      Counts each skater's blocked shots: a shot by the other team that hits their body. Not a goalie's save, a stick
      stopping the puck, or a shot off a teammate; nothing in highlights or a shootout. Player Stats gets a Blocked
      Shots page (BLK), after Giveaways and Takeaways and before Time On Ice (when those are on). Game Stats gets a
      Blocked Shots row with each team's total, but only with giveaways and takeaways off, as the table has room for
      one more row. The counts start again each game. In the original NHL '95 pucks pass through skaters, so this
      needs Skaters block the puck (under Fixes) on.
    </>
  ),
  realTime: () => (
    <>
      The original game's clock runs two and a half times as fast as a real one. This makes the game clock, the penalty
      clock and the shootout clock count true seconds. Periods then last as long as they say, so choose shorter ones.
    </>
  ),
  penaltySeconds: (c, stock) => (
    <>
      How long each penalty minute keeps a player in the box: at 60, as in the original game, a minute is a minute; at 30
      every penalty lasts half as long. Now {penaltyLengths(c.penaltySeconds)}. The penalty minutes in the statistics, which
      penalties are called, and a power-play goal letting a player out early are as before. {stock}
    </>
  ),
  fightSeconds: (c) => (
    <>
      For leagues that play with fighting: how long a fight keeps each fighter in the box, in game-clock seconds, in
      place of its five minutes and whatever Penalty time makes of them ({c.fightSeconds === 0 ? 'now off' : `now ${clockTime(c.fightSeconds)}`}).
      0 is off, as in the original. The fight still counts as 5 penalty minutes, and both fighters get the same time.
    </>
  ),
  fightMomentum: () => (
    <>
      With fighting on: the team whose player wins a fight gets a lift, +2 Agility and +2 Speed for its skaters (not
      the goalie) for 90 seconds of play. The 90 seconds run only while the clock does, and carry over an
      intermission; another fight gives the lift to its winner's team and starts them again. Needs Fighting.
    </>
  ),
  fightOnce: () => <>With fighting on: a player who has fought cannot fight again that game. A hard hit with that player stays a hit. Needs Fighting.</>,
  noIcing: () => <>Icing is never called: the puck plays on, and the goalie plays it as any loose puck. A ROM that already has the forum's version (TheTome's) shows as On.</>,
  hybridIcing: () => (
    <>
      The icing rule the NHL has played since 2013; the original game plays touch icing. With this on, icing is decided as
      the puck crosses the goal line: if a defender is as near the end-zone faceoff dots as any attacker, or nearer, icing
      is called at once; if an attacker is nearer, it is waved off. Goalies do not count, and a short-handed team never
      ices. No effect with No icing on.
    </>
  ),
  delayedCalls: () => (
    <>
      A matter of taste. In the original game, while one team has a penalty pending, the other cannot be called for
      anything until the whistle. With this on it can be; a foul by the team with the puck stops play at once.
    </>
  ),
  bCheckPenaltiesOff: () => (
    <>
      With penalties off, the original game makes your B-check pass an extra test, your Checking against their Agility,
      before it trips a player; with penalties on there is none. <b>As with penalties on</b> drops the test, so B-checks
      trip the same either way. A ROM that has the forum's version (CoachMac's) shows it, and can be set back.
    </>
  ),
  injuries: () => (
    <>
      In the original game a hard hit can injure the player knocked down, for the rest of the period or of the game. With{' '}
      <b>never</b> a hit is only a fall. With <b>the penalty, but no injury</b> the hit is still called but no one is hurt.{' '}
      <b>Every injury for the period</b> and <b>for the game</b> make every injury last that long. With <b>a long fall
      instead</b> the player stays down about 5 seconds, then gets up and plays on: no injury and no penalty. The WN95HL's
      ROMs already have every injury for the game.
    </>
  ),
  referees: () => (
    <>
      How often the referee calls the penalties that are their judgement: holding, hooking, tripping, charging, roughing
      and goalie interference. A player's Aggression still counts as before, for people's players and the computer's
      alike. Offsides, icing and the other calls are unchanged.
    </>
  ),
  shootoutInjuries: () => (
    <>
      With one of the shootouts for tied regular-season games on (above): a skater injured for the game, by a hit or in a
      fight, takes no attempt, and the next healthy player on the team's shootout list shoots in their place. If all five are
      out, the listed players shoot as before. Without a season shootout it does nothing; Shootout mode is as it was.
    </>
  ),
  fourthPeriodOvertime: (c) => (
    <>
      Lets one ROM play two kinds of regular-season game: the usual ones, and ones with an overtime of their own, such as
      99 minutes. Game Setup's Period Length offers three of the game's four lengths; this adds the fourth, in Season
      Setup too (set it and its menu text on the Game settings page; the original game's is 30 seconds). A regular-season
      game played at it gets this many seconds of overtime ({c.fourthPeriodOvertime === 0 ? 'now off' : `now ${clockTime(c.fourthPeriodOvertime)}`}; 5940
      is 99 minutes); 0 is off. The other lengths keep their overtime, and exhibition and season playoffs are as before.
    </>
  ),
  stamina: () => <>With line changes on, players on the ice do not tire, so lines need changing only when you want to.</>,
  energyDrain: (_, stock) => (
    <>
      How fast a player tires on the ice with line changes on. A larger number tires them sooner. At least 16, as in NHL 94:
      below that a player with high endurance can get more back than they lose. {stock}
    </>
  ),
  energyRecovery: (_, stock) => <>How fast a player gets their energy back on the bench. A larger number rests them sooner. {stock}</>,
  noSkatingDrain: () => (
    <>
      With line changes on, skating costs no energy. Players then tire only from hits and holds (below) and speed bursts,
      and rest on the bench as usual. Unlike Unlimited stamina, hits still count.
    </>
  ),
  burstEnergy: (_, stock) => <>The energy a C-button speed burst costs with line changes on, out of 4096 for a fresh player; 0 for none. {stock}</>,
  hitEnergy: (c) => (
    <>
      A skater knocked down by a check or a poke check loses this much energy, out of 4096, so they are slower until they rest
      ({c.hitEnergy === 0 ? 'now none' : `now ${Math.round((c.hitEnergy / 4096) * 1000) / 10}%`}). 0 is the original game. Only with line changes on, and
      nothing after the whistle. Recommended in NHL 94: {RECOMMENDED_HIT_ENERGY} (5%). <b>Energy from hits only</b> turns on Skating costs
      no energy, makes a speed burst cost nothing, and sets a knockdown to {HITS_ONLY.hitEnergy} and a hold to {HITS_ONLY.holdEnergy}.
    </>
  ),
  holdEnergy: () => (
    <>The same for a skater caught by a hold or hook, once each time it catches them in play. Recommended in NHL 94: {RECOMMENDED_HOLD_ENERGY}, half a knockdown's.</>
  ),
  injuryBonus: () => (
    <>
      Each knockdown a skater takes this game makes a later injury a little likelier, and half of it wears off at each
      intermission. 0 is the original game. Only hits that can already injure are affected. The numbers mean the same
      as in NHL 94: about that many more chances in 160 for each knockdown. Recommended in
      NHL 94: {RECOMMENDED_INJURY_BONUS} a knockdown, at most {RECOMMENDED_INJURY_CAP}.
    </>
  ),
  injuryCap: (c) => (
    <>The most the knockdowns can add, as in NHL 94: at {c.injuryCap}, about {chance(c.injuryCap)} in 100 more on a hit that can injure. Used only when the risk above is more than 0.</>
  ),
  goalieHold: () => (
    <>
      How long a goalie may hold the puck before the whistle. The original game allows {holdSeconds(N.goalieHold)} seconds. 0 for no
      whistle at all; a goalie the game controls still gives the puck up on their own.
    </>
  ),
  diveHold: () => (
    <>
      How long a goalie who catches the puck in a dive may hold it after getting up, before the whistle. The original game
      allows only {holdSeconds(N.diveHold)} seconds, so you must pass or drop the puck at exactly the right moment to keep play
      going; a longer time gives you a chance. Every goalie, the computer's too. With no whistle in the goalie hold time
      above, a goalie you control is not whistled for it at all.
    </>
  ),
  goalieWidth: (_, stock) => <>How far a goalie you control may go, without the puck, to either side of the middle of the ice. {stock}</>,
  goalieOut: (_, stock) => (
    <>
      How near centre ice a goalie you control may come without the puck, as their distance from it, so a smaller number lets
      them come farther out. For scale, NHL '95's goal line is about 267 from centre ice and its blue line 86. {stock}
    </>
  ),
  goalieLine: (_, stock) => (
    <>
      The line a goalie you control may not skate past without a whistle, as a distance from centre ice, so a smaller number
      lets them go farther; NHL '95's end-zone faceoff dots are 215 from centre ice. In practice it is the line they may carry
      the puck to. {stock}
    </>
  ),
  goalieDelay: (_, stock) => <>How long a player holds B before they take control of their goalie; in sixtieths of a second: the original 17 is about a quarter of a second. The same for all four controllers. {stock}</>,
  speedBurst: () => (
    <>
      The push the C button gives. 0 for the original game's, which is 32 for a fresh player and less for a tired one. Any
      other number is the push for everybody: 1 as good as takes it away, 16 is half the original's.
    </>
  ),
  turnRate: (_, stock) => <>How quickly a skater stops and turns when they reverse. A larger number stops them sooner. {stock}</>,
  puckFriction: (_, stock) => (
    <>
      How fast the puck slows on the ice. A smaller number slows it faster, and each step is double or half: 6 slows it
      twice as fast as 7, and 8 half as fast. Only the puck changes, so skaters glide as before (in NHL 94 this setting
      moves gliding skaters too). {stock}
    </>
  ),
  choppyIce: () => (
    <>
      From a community idea: the ice wears as each period goes on, so the puck slows a little more, up to a quarter more by
      the period's end, and is fresh again after each intermission. Only the puck. It goes with Puck friction above.
    </>
  ),
  baseWeight: (c) => (
    <>
      A player's weight is one of sixteen steps of 8 pounds, counted up from this. Players have grown heavier over the
      years, so a ROM for another era starts the count elsewhere, to spread its players across the steps: from{' '}
      {c.baseWeight} to {c.baseWeight + 120} pounds as chosen. Only the roster screen, Create Player and the editor show
      the pounds; in play a player is as heavy as their step. Give a season's year for the weight smozROM suggests for it.
      Applying a new one moves every player to the step nearest the pounds they weigh now.
    </>
  ),
  hotColdRange: (_, stock) => (
    <>
      Before each game every player is made a little hot or cold: anything from minus this number to one less than it, so
      the original 9 gives -9 to 8. A smaller number makes the swings smaller. At 2 or less hot and cold no longer
      change how anyone plays, though the roster screen still shows the small values; 0 makes them all 0, so every player
      plays to their ratings every game. {stock}
    </>
  ),
  clutchTime: () => (
    <>
      An option, from a community idea: in the last 2:00 of the third period, with the score tied or within one goal,
      everyone on the ice plays half a rating point better at everything but Aggression. Not in overtime. A goal that
      opens a two-goal lead ends it at the next faceoff, and one that brings a game back within a goal starts it again
      there. The 2:00 is the same at any period length.
    </>
  ),
}

// The words a number is shown with.
const UNITS: Partial<Record<Nhl95Hack, (c: Nhl95HackChoices) => string>> = {
  goalieHold: () => 'seconds',
  diveHold: () => 'seconds',
  penaltySeconds: () => 'seconds in the box for each penalty minute',
  fightSeconds: (c) => `seconds in the box for each fighter (${c.fightSeconds === 0 ? 'off' : clockTime(c.fightSeconds)})`,
  fourthPeriodOvertime: (c) => `seconds of overtime (${c.fourthPeriodOvertime === 0 ? 'off' : clockTime(c.fourthPeriodOvertime)})`,
}

const isNumber = (hack: Nhl95Hack): hack is Nhl95NumberHack => hack in NHL95_HACK_RANGES
const isChoice = (hack: Nhl95Hack): hack is Nhl95ChoiceHack => hack in NHL95_HACK_CHOICES

export function Nhl95HacksPage({ project, name, onChange, kept, onKeep }: Props) {
  const state = useMemo(() => detectNhl95Hacks(project.bytes), [project.bytes])
  // The choices being made, which start again from the ROM whenever it changes.
  // They start from those the app kept, and when the ROM changes they are laid on it as it is now.
  // (After this page's Apply, or once the app has applied them or found nothing left, they start again from the ROM.)
  const [draft, setDraft] = useState(() => ({ rom: project.bytes, choices: layOnNhl95(state.choices, kept) }))
  if (draft.rom !== project.bytes)
    setDraft({ rom: project.bytes, choices: kept ? layOnNhl95(state.choices, { base: detectNhl95Hacks(draft.rom).choices, wanted: draft.choices }) : state.choices })
  const wanted: Nhl95HackChoices = draft.rom === project.bytes ? draft.choices : state.choices
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [year, setYear] = useState('')
  const suggested = /^\d{4}$/.test(year.trim()) ? baseWeightForYear(Number(year)) : null
  const changes = nhl95HackStateChanges(state, { choices: wanted, unknown: state.unknown })
  useEffect(() => onKeep?.(changes.length > 0 ? { base: state.choices, wanted, count: changes.length } : null), [onKeep, changes.length, state.choices, wanted])
  const setBackAll = () => setDraft({ rom: project.bytes, choices: state.choices })
  const unknown = (hack: Nhl95Hack) => state.unknown.includes(hack)
  // The most knockdowns add is kept only with a risk from them (with none, nothing of it is written).
  const noCap = (hack: Nhl95Hack) => hack === 'injuryCap' && wanted.injuryBonus === 0

  const set = (change: Partial<Nhl95HackChoices>) => {
    setNotice('')
    setError('')
    // What one choice turns off with it (ties, 3 on 3, fighting, the body fix, the injury risk): nhl95Rules.
    const others = nhl95Rules(change)
    setDraft({ rom: project.bytes, choices: { ...wanted, ...others, ...change } })
  }
  // "NHL '95 has 150", with what this ROM has if that is different.
  const stock = (hack: Nhl95Hack) =>
    `NHL '95 has ${String(N[hack])}${!unknown(hack) && state.choices[hack] !== N[hack] ? `, and this ROM has ${String(state.choices[hack])}` : ''}.`
  const button = (label: string, change: Partial<Nhl95HackChoices>) => {
    const keys = Object.keys(change) as Nhl95Hack[]
    return (
      <button type="button" disabled={keys.some(unknown) || keys.every((key) => wanted[key] === change[key])} onClick={() => set(change)}>
        {label}
      </button>
    )
  }
  const putInCurrent = (
    <p>
      <b>This ROM has an earlier version of it.</b>{' '}
      <button
        type="button"
        disabled={changes.length > 0}
        title={changes.length > 0 ? 'Apply or set back your other changes first.' : undefined}
        onClick={() => {
          try {
            onChange(applyNhl95Hacks(project, state.choices))
            setNotice("Done: every hack this ROM had an earlier version of is now NOSE4Web's current version. Undo puts it back.")
            setError('')
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e))
          }
        }}
      >
        Put in the current version
      </button>
    </p>
  )
  const BESIDE: Partial<Record<Nhl95Hack, ReactNode>> = {
    hitEnergy: (
      <p>
        {button(`Use the recommended ${RECOMMENDED_HIT_ENERGY}`, { hitEnergy: RECOMMENDED_HIT_ENERGY })} {button('Energy from hits only', HITS_ONLY)}
      </p>
    ),
    // An earlier version of a hack: on, and put in again as the current one.
    giveaways: nhl95GiveawaysOutdated(project.bytes) && putInCurrent,
    blockedShots: nhl95BlockedShotsOutdated(project.bytes) && putInCurrent,
    seasonShootout: nhl95ShootoutOutdated(project.bytes) && putInCurrent,
    seasonShootoutNow: nhl95ShootoutOutdated(project.bytes) && putInCurrent,
    holdEnergy: <p>{button(`Use the recommended ${RECOMMENDED_HOLD_ENERGY}`, { holdEnergy: RECOMMENDED_HOLD_ENERGY })}</p>,
    baseWeight: (
      <span className="by-year">
        or for the season of{' '}
        <input className="num" inputMode="numeric" aria-label="Season year" placeholder="year" value={year} onChange={(e) => setYear(e.target.value)} />{' '}
        <button type="button" disabled={suggested === null || unknown('baseWeight')} onClick={() => suggested !== null && set({ baseWeight: suggested })}>
          {suggested === null ? 'Use that season' : `Use ${suggested} pounds`}
        </button>
      </span>
    ),
    injuryBonus: <p>{button(`Use the recommended ${RECOMMENDED_INJURY_BONUS} and ${RECOMMENDED_INJURY_CAP}`, { injuryBonus: RECOMMENDED_INJURY_BONUS, injuryCap: RECOMMENDED_INJURY_CAP })}</p>,
  }

  // The control for one hack: on or off, a number, or one of a few choices.
  function control(hack: Nhl95Hack): ReactNode {
    const label = hack === 'fightingOff' ? FIGHT_START : NHL95_HACK_TITLES[hack]
    if (hack === 'baseWeight') {
      return (
        <select aria-label={label} disabled={unknown(hack)} value={wanted.baseWeight} onChange={(e) => set({ baseWeight: Number(e.target.value) })}>
          {WEIGHT_BASES.map((base) => (
            <option key={base} value={base}>
              {base} pounds{base === N.baseWeight ? ' (original)' : ''}
            </option>
          ))}
        </select>
      )
    }
    if (isNumber(hack)) {
      return (
        <>
          <NumberBox
            label={label}
            value={wanted[hack]}
            range={NHL95_HACK_RANGES[hack]}
            perUnit={hack === 'goalieHold' || hack === 'diveHold' ? 60 : 1}
            fresh={project.bytes}
            disabled={unknown(hack) || noCap(hack)}
            onChange={(value) => set({ [hack]: value })}
          />
          {UNITS[hack] && ` ${UNITS[hack](wanted)}`}
          {noCap(hack) && ' Set the risk above first.'}
        </>
      )
    }
    if (isChoice(hack)) {
      const choices = NHL95_HACK_CHOICES[hack] as Record<string, string>
      return (
        <select aria-label={label} className="wide" disabled={unknown(hack)} value={wanted[hack]} onChange={(e) => set({ [hack]: e.target.value })}>
          {/* The forum's B-checks are shown only where the ROM has them, to keep or set back. */}
          {Object.keys(choices)
            .filter((choice) => !(hack === 'bCheckPenaltiesOff' && choice === 'forum' && state.choices.bCheckPenaltiesOff !== 'forum'))
            .map((choice) => (
              <option key={choice} value={choice}>
                {choices[choice]}
              </option>
            ))}
        </select>
      )
    }
    return (
      <select
        aria-label={label}
        disabled={unknown(hack) || ((hack === 'fightingOff' || hack === 'fightMomentum' || hack === 'fightOnce') && !wanted.fighting) || (hack === 'blockedShots' && !wanted.bodyBlockFix)}
        value={hack === 'fightingOff' ? (wanted.fightingOff ? 'off' : wanted.fightingArcade ? 'arcade' : 'on') : wanted[hack] ? 'on' : 'off'}
        onChange={(e) => {
          if (hack === 'fightingOff') set({ fightingOff: e.target.value === 'off', fightingArcade: e.target.value === 'arcade' })
          else set({ [hack]: e.target.value === 'on' })
        }}
      >
        <option value="off">Off</option>
        <option value="on">On</option>
        {hack === 'fightingOff' && <option value="arcade">On - Arcade Mode</option>}
      </select>
    )
  }

  function apply() {
    try {
      const next = applyNhl95Hacks(project, wanted)
      onChange(next)
      setDraft({ rom: next.bytes, choices: detectNhl95Hacks(next.bytes).choices })
      setNotice(`Done: ${changes.length === 1 ? '1 change' : `${changes.length} changes`} to the game. Undo puts it back.`)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="team help">
      <h2>Hacks</h2>
      <p className="notice">
        <b>How this page works:</b> choose the hacks you want, then press <b>Apply</b> at the bottom of the page.
        Nothing in the ROM changes until you do, and Undo takes it all back. You can look at other pages before you
        apply: your choices are kept, a bar along the bottom of this page and a reminder on the others show they are
        waiting, and a download offers to apply them first.
      </p>
      <p className="note">
        Fixes, settings and new options for NHL '95, most of them from the NHL94 Match Viewer project. Many are NHL
        94's, brought over where NHL '95 works the same way; NHL 94's other hacks don't fit NHL '95 and are not offered
        here. Each option shows what this ROM has now. Play a game on a hacked ROM before your league does.
      </p>
      <HackShortcuts
        onRecommended={null}
        discordText={() => nhl95HacksForDiscord(project.bytes, name)}
        discordMessages={() => hackSheetDiscord(nhl95HackSheet(project.bytes, name))}
        sheet={() => hackSheetHtml(nhl95HackSheet(project.bytes, name))}
        name={name}
      />
      {NHL95_HACK_SECTIONS.map((section) => (
        <section key={section.id} id={`hacks-${section.id}`}>
          <h3>{section.title}</h3>
          {/* The Fighting setting at power-on is one choice of three, kept as two options (Off, Arcade Mode). */}
          {section.hacks.filter((hack) => hack !== 'fightingArcade').map((hack) => (
            <div className="hack" key={hack}>
              <label>
                <b>{hack === 'fightingOff' ? FIGHT_START : NHL95_HACK_TITLES[hack]}</b> {control(hack)}
              </label>
              {BESIDE[hack]}
              <p className="summary">
                {SUMMARIES[hack]}
                {unknown(hack) && <b> Something else has already changed this part of the ROM, so this option is left exactly as it is.</b>}
              </p>
              <details className="more">
                <summary>More about it</summary>
                {MORE[hack] ?? (
                  <p className="note">
                    {SETTING_MORE[hack]!(wanted, stock(hack))} {NOT_YET.includes(hack) ? UNTESTED : SETTING_TESTED}
                  </p>
                )}
              </details>
            </div>
          ))}
        </section>
      ))}
      <section id="hacks-apply" data-tab-always>
        <h3>Apply</h3>
        <p>
          <button disabled={changes.length === 0} onClick={apply}>
            Apply
          </button>{' '}
          <button disabled={changes.length === 0} onClick={setBackAll}>
            Set back to what the ROM has
          </button>{' '}
          <span className="note">{notice}</span>
        </p>
        {changes.length > 0 && (
          <div className="outcome">
            <p>Applying will make these changes to the game:</p>
            <ul>
              {changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
            {!unknown('baseWeight') && wanted.baseWeight !== state.choices.baseWeight && (
              <p>Every player's weight will be moved to the step nearest the pounds they weigh now, which can be up to 4 pounds out.</p>
            )}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
      <PendingBar count={changes.length} onApply={apply} onSetBack={setBackAll} />
    </main>
  )
}
