import { SNES_FIGHT_BONUS_DEFAULT } from './core/snesfight'
import { HitsTable } from './HitsTable'
import { snesCodeInPlace } from './core/snes'
import { clockTime, penaltyLengths } from './core/penaltytime'
import { SNES_HACK_GROUPS } from './core/hackgroups'
import { useMemo, useState, type ReactNode } from 'react'
import type { RomProject } from './core/rom'
import { CopyHacksButton } from './CopyHacksButton'
import { HackShortcuts } from './HackShortcuts'
import { hackSheetDiscord, hackSheetHtml, pictureItems, snesHackSheet, snesHackSummary, withPictures } from './core/hacksheet'
import { NumberField } from './NumberField'
import { NumberBox } from './NumberBox'
import { holdSeconds } from './core/hacks'
import {
  applySnesHacks,
  detectSnesHacks,
  SNES_HACK_TITLES,
  SNES_HACKS,
  snesHacksCopiedFrom,
  snesHacksForDiscord,
  snesHackInPlaceOnly,
  withRecommendedSnesFixes,
  withSnesHackChoice,
  RECOMMENDED_SNES_HIT_ENERGY,
  RECOMMENDED_SNES_HOLD_ENERGY,
  SNES_AMOUNT_OFF,
  SNES_INJURY_TEXTS,
  SNES_REFEREE_TEXTS,
  SNES_SHOOTOUT_TEXTS,
  SNES_THREE_ON_THREE_TEXTS,
  SNES_STAR_TEXTS,
  snesAmountText,
  SNES_AMOUNT_RANGES,
  RECOMMENDED_SNES_INJURY_BONUS,
  SNES_AMOUNTS,
  SNES_HITS_ONLY,
  type SnesAmount,
  type SnesHack,
  type SnesHackChoices,
} from './core/sneshacks'

const HITS_ONLY_HACKS: SnesHack[] = ['hitEnergy', 'holdEnergy', 'noSkatingDrain', 'freeBurst', 'energySpeed']
const RECOMMENDED_AMOUNTS: Record<SnesAmount, number> = {
  hitEnergy: RECOMMENDED_SNES_HIT_ENERGY,
  holdEnergy: RECOMMENDED_SNES_HOLD_ENERGY,
  injuryBonus: RECOMMENDED_SNES_INJURY_BONUS,
  // Not a recommendation: the original game's.
  penaltyTime: 60,
  // McMarkis's default bonus.
  fighting: SNES_FIGHT_BONUS_DEFAULT,
  // Not a recommendation: the original game.
  injuries: 0,
  referees: 2,
  seasonShootout: 0,
  threeOnThree: 0,
  // Not a recommendation: a fighting major's 5:00.
  fightTime: 300,
  // Not a recommendation: the original game's.
  threeStars: 0,
  // Not recommendations: the original game's.
  goalieHold: SNES_AMOUNT_OFF.goalieHold,
  diveHold: SNES_AMOUNT_OFF.diveHold,
  goalieWidth: SNES_AMOUNT_OFF.goalieWidth,
  goalieOut: SNES_AMOUNT_OFF.goalieOut,
  goalieLine: SNES_AMOUNT_OFF.goalieLine,
  // Not recommendations: the original game's.
  speedBurst: SNES_AMOUNT_OFF.speedBurst,
  turnRate: SNES_AMOUNT_OFF.turnRate,
  puckFriction: SNES_AMOUNT_OFF.puckFriction,
}
// The amounts whose button puts back the original game's.
const ORIGINAL_BUTTON: Partial<Record<SnesAmount, string>> = { penaltyTime: 'Use the original 60', speedBurst: "Use the original game's", turnRate: `Use the original ${SNES_AMOUNT_OFF.turnRate}`, puckFriction: `Use the original ${SNES_AMOUNT_OFF.puckFriction}` }
const SKATING_TEXT: Partial<Record<SnesAmount, (value: number) => string>> = {
  speedBurst: (value) => (value === 0 ? "0: the original game's push, from the player's energy." : `the push for every player, tired or not (the original gives a fresh player 35).`),
  turnRate: (value) => (value === SNES_AMOUNT_OFF.turnRate ? 'the original game.' : value > SNES_AMOUNT_OFF.turnRate ? 'stops sooner than the original game.' : 'a longer, sliding stop than the original game.'),
  puckFriction: (value) => (value === SNES_AMOUNT_OFF.puckFriction ? 'the original game.' : value < SNES_AMOUNT_OFF.puckFriction ? 'the puck slows faster than in the original game.' : 'the puck slides further than in the original game.'),
}
// The goalie settings, a number each as on the Genesis's page: the hold time in seconds, the rest in the game's units.
const GOALIE_AMOUNTS: SnesHack[] = ['goalieHold', 'diveHold', 'goalieWidth', 'goalieOut', 'goalieLine']
const goalieOriginal = (hack: SnesAmount) => (hack === 'goalieHold' || hack === 'diveHold' ? `${holdSeconds(SNES_AMOUNT_OFF[hack])} seconds` : String(SNES_AMOUNT_OFF[hack]))
const FULL_ENERGY = 0x1000
const isAmount = (hack: SnesHack): hack is SnesAmount => (SNES_AMOUNTS as SnesHack[]).includes(hack)
// An energy amount as units and as a share of full energy.
const energyShare = (units: number) => (units === 0 ? 'Off: none taken.' : `${units} of ${FULL_ENERGY}: ${Math.round((units / FULL_ENERGY) * 1000) / 10}% of full energy.`)
// The injury risk: what it adds to a hit that can injure, at most.
const riskShare = (bonus: number) => (bonus === 0 ? 'Off.' : `After five knockdowns, a hit that can injure has about ${Math.round(((bonus * 5) / 300) * 100)} in 100 more chance of doing so.`)
const amountText = (hack: SnesAmount, value: number) =>
  SKATING_TEXT[hack] ? SKATING_TEXT[hack](value) : hack === 'penaltyTime' ? `seconds for each penalty minute: ${penaltyLengths(value)}.` : hack === 'fightTime' ? (value === 0 ? 'seconds: off, a fight is a usual 5-minute major.' : `seconds in the box for each fighter: ${clockTime(value)}.`) : hack === 'injuryBonus' ? riskShare(value) : energyShare(value)

interface Props {
  project: RomProject
  // The ROM's name, for the Discord post.
  name: string
  onChange: (project: RomProject) => void
}

const ABOUT: Record<SnesHack, ReactNode> = {
  hotColdFix: (
    <>
      Before each game the SNES makes every player a little hot or cold in each rating, but a bug puts about half of
      every player's ratings at the maximum, 15, whatever they are in the ROM. This fixes it: hot and cold move a rating
      a point or so either way, and the ratings you set are the ones that play. It changes how every game plays, so try
      it before a league uses it. Without the bug every player plays lower than people are used to, so it suits a league whose ratings are set higher. It is not among the recommended fixes.
    </>
  ),
  ppPkFix: (
    <>
      The game is meant to add a team's power play rating to its players on the power play and take its penalty kill
      rating off them on the penalty kill, but it reads the two the wrong way round. The original rosters were made for the
      intended way, so in play Anaheim, meant to be weak at both, has the best power play and penalty kill. This makes
      the game read them as intended, so rosters play as their makers meant, and the team page shows them that way too.
      A league that set these ratings by what the editor showed before the fix should check them after it.
    </>
  ),
  defenceControl: 'Turns defence control on for both teams at the start of every game, where the original game starts with it off. Not a fix, but among the recommended hacks, as leagues play with it on.',
  oneMinutePenalties: 'Makes every minor penalty one minute long instead of two.',
  thirtySecondPeriods: 'Adds 30 seconds to the period lengths on the main menu. It is in the original game, but hidden.',
  noInterference: 'Interference is never called.',
  referees:
    "How often the referee calls the penalties that are his judgement: holding, hooking, tripping, charging, roughing and goalie interference. A player's Aggression still counts as before, for people's players and the computer's alike. Goalie interference can only change in whole steps: half as often when very lenient, as before when lenient, one and a half times as often when strict, twice when very strict. Offsides, icing and the other calls are unchanged. Works on McMarkis's SA-1 and 32-team builds too. Not yet tested in the game.",
  lockedChangeFix:
    "Pressing B on defence sometimes does nothing at all: no switch and no poke. Right after a check or a speed burst your own skater is usually the one best placed for the puck, so B picks him, but he cannot poke until the move ends, and the press is lost. It happens often during a burst and nearly always during a check. With the fix B passes over your skater while he is busy and switches to the next best one, as on the Genesis. The one trade-off: right after a missed check you get a teammate rather than a poke. Found by a league member and the NHL94 Match Viewer project. Among the recommended fixes. Tested in the game by the NHL94 Match Viewer project.",
  openNetFix:
    "When the goalie is out of position, a computer player's shot at the open net is aimed just under the crossbar, where it often goes over. With this it is aimed at the middle of the net. People's shots follow the D-pad as before. The same bug as on the Genesis, found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  lockedDefenceFix:
    "With defence control on, L and R take the left and right defenceman, but not while your skater is busy (checking, bursting, down on the ice, hooking or holding): the press is lost, though B and X still work. With the fix L and R work while he is busy too. A defenceman another player controls, or one in the penalty box or hurt, still cannot be taken. Found by a league member. Among the recommended fixes. Tested in the game by the NHL94 Match Viewer project.",
  shotFix:
    "Now and then a player winds up a shot and swings with the puck, but no shot comes. It happens when an opponent's stick knocks the puck loose during the wind-up and the shooter gathers it again: the game forgets he was shooting. With this, a person's player who gets the puck back during his wind-up keeps shooting (a computer player has already given up the shot by then, so his is as before). A hold or hook during the wind-up still spoils the shot, as in the original game. It can be used with the one-timer fix below. Found by the NHL94 Match Viewer project. Among the recommended fixes. Tested in the game by the NHL94 Match Viewer project.",
  oneTimerFix:
    "Now and then, rarely, a player calls for a one-timer, starts his swing, and then has the puck without ever shooting. If the pass is a little late, a teammate touches it on the way, or B is pressed, the game stops waiting for the pass but leaves the swing playing, and he carries the puck through it with no shot. With this, a player still winding up when the wait ends goes back to skating, so he takes the puck as from any pass and can shoot it; a one-timer that connects is as before. Found by the NHL94 Match Viewer project. Among the recommended fixes. Tested in the game by the NHL94 Match Viewer project.",
  shootoutInjuries:
    "For use with A shootout for tied regular-season games: a skater injured for the game takes no shot in it, and the next healthy player on the team's shootout list shoots instead, even if he was picked on the shootout screen. (Injuries for the period are over by then.) If all five are out, the listed players shoot as before. Shootout mode from the main menu is unchanged. A player hurt in a fight is kept out too, even while his fighting major has time left, on McMarkis's builds and with NOSE4Web's fighting (apply the hacks again to update a fighting ROM made before 13 November 2026). Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  creaseIcing:
    'As on the Genesis: a puck that crosses the goal line within the width of the crease is not icing (in the original SNES game it is). From the NHL94 Match Viewer project. Among the recommended fixes. Tested in the game by the NHL94 Match Viewer project.',
  hybridIcing:
    "An option: hybrid icing, the rule the NHL has played since 2013, as on the Genesis. The original game plays touch icing: once the puck crosses the goal line, icing is called if a defender touches it first and waved off if an attacker does. With this on it is decided as the puck crosses: if the defending team's nearest skater is as near as or nearer to the end-zone faceoff dots than the icing team's nearest, icing is called right away; if an attacker is nearer, it is waved off and play goes on. Goalies do not count, and only distance counts, not speed. The SNES game's own rules stay: a short-handed team never ices, and icing is waved off early when a defending player, the goalie too, is close to a slow puck along the ice. With No icing within the crease on too, a puck that crosses within the crease's width is not icing at all. Tested in the game by the NHL94 Match Viewer project.",
  noSkatingDrain:
    'With line changes on, skating costs no energy. Players then tire only from hits and holds (if those are set) and speed bursts, and rest on the bench as usual. With Speed bursts cost no energy too, only hits tire a player. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.',
  energySpeed:
    "With line changes on: how much a tired skater slows. In the original game even a skater with no energy left keeps more than half his speed; with this on, energy takes all of it, as on the Genesis, and an empty skater skates at the slowest speed there is. With Energy from hits only, an average skater is then about 14%, 29% and 43% slower after one, two and three knockdowns, where the original gives 8%, 14% and 22%. It needs Skating costs no energy, which turns on with it: goalies never go to the bench, so skating would otherwise slow them more than in the original game. Line changes Auto keeps everyone at full speed. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  seasonOvertime:
    'A regular-season game still tied after its overtime plays another overtime, and another, until someone scores, as a playoff game does, instead of ending in a tie. Each overtime is the regular season\'s 5:00; playoffs are as before. As on the Genesis, where the NHL94 Match Viewer project found it. Tested in the game by the NHL94 Match Viewer project.',
  threeOnThree:
    "As in today's NHL and as on the Genesis: overtime is 3 on 3, each team's goalie and its current line's LW, C and RD (two forwards and a defenceman). A penalty gives the other team a skater more: 4 on 3, or 5 on 3 for a second penalty. When a penalty ends the teams play 4 on 4 until the next whistle, then 3 on 3 again. A team with three players in the box plays two skaters, its C and LW, until one comes out (the game has room for only six players a team, on the ice and in the box together), and the other team then has at most four, as the NHL never gives more than a two-skater advantage. Lines are not changed, so it works with line changes on or off. Choose In the regular season to keep playoff overtime 5 on 5, as the NHL does. Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  seasonShootout:
    "A regular-season game still tied is settled by the game's own shootout, as in Shootout mode: after one 5:00 overtime, or straight after period 3 with no overtime. It opens on the shootout's menu (A or B on Start Shootout begins it), then five shooters a side, and one each after that until a team is ahead. The winners get one goal more on the scoreboard (a 1-1 game won in the shootout ends 2-1), but no player is credited with it, and the stats and scoring summary are as they were at the end of play. The Stars of the Game then show for 3 seconds, picked from the game's stats, not the shootout's (not yet tested in the game). For a save state with the whole game's stats, wait for the winner's banner to go and the game-over screens to begin. Playoff games still play overtime until a goal. It cannot be on with Overtime until a goal in the regular season. The menu's Exit Shootout line is locked here, as it would throw the whole game away. (As in any game, with the computer playing both teams, any button but START ends the game.) Works in every build, and on McMarkis's 2 MB builds it keeps their own checks, posts and time on ice. On the 2 MB builds a shootout with the computer playing both teams freezes at its first round, as their own Shootout mode does; with a person on a team it plays normally, as in every league game. Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  injuries:
    "In the original game a hit that knocks a puck carrier onto his back while the clock runs can injure him: out for the rest of the period, or 1 time in 7 for the rest of the game. Never: the hit is only a fall, and the puck still comes loose. The penalty, but no injury: the hit is still called (roughing with penalties on, a stoppage with them off), but the player lies down and plays on after the faceoff, with no injury box. Every injury for the period, or for the game: every injury lasts that long. A long fall instead: the player stays down about 5 seconds (an ordinary fall is under 2), then gets up and plays on, with no injury and no penalty. Found by the NHL94 Match Viewer project, as for the Genesis. Tested in the game by the NHL94 Match Viewer project.",
  fighting:
    "McMarkis's port of the NHLPA 93 SNES fights to NHL '94, built in with his permission. A fight can start after enough hard checks between two opponents whose fighting ratings (the second half of the H/F column) are high enough: they drop their gloves and fight, with A for a high punch, B for a low one and Y to grab, until one goes down. Both get a fighting major, and the two majors offset, so neither team gets a power play; when a shoulder check starts the fight, a teammate of the checker also serves an instigator's minor, which does give one. The time in the box follows Fighting penalty time and Penalty time. The loser can be hurt, more likely the higher the winner's Checking rating (from about 1 fight in 60 to about 1 in 4), and then serves his major and stays out for the rest of the game. The bonus: a player needs a fighting rating of 10 or more to fight, and the bonus is added to every player's. The NHL '94 rosters rate fighters about 2 lower than NHLPA 93's, so the default is McMarkis's 2; 0 leaves the ratings as they are, so only the toughest fight, and a higher bonus makes fights more common (at 8 nearly anyone can). It grows a 1 MB ROM to 2 MB; taking it out gives the ROM back as it was. For ROMs built on the original game, not the SA-1 builds. A ROM with NOSE4Web's earlier fighting is updated when the hacks are next applied. Tested in the game by the NHL94 Match Viewer project.",
  fightTime:
    "For leagues that play with fighting: how long a fight keeps each fighter in the box, in seconds of the game clock, whatever its five minutes and Penalty time would give. 0 is off: a fight is a 5-minute major like any other. Only the time in the box changes: the fight still counts as 5 penalty minutes in the statistics, and the two fighters still go off together with no power play. Works with McMarkis's builds' fights and NOSE4Web's. At most 2047 seconds (34:07). Tested in the game by the NHL94 Match Viewer project.",
  penaltyTime:
    "How long a penalty keeps a player in the box. Each penalty has its minutes (2 for a minor, 5 for a major, and so on, which you can change one by one under Rule messages on the Game settings page). This sets how many seconds of the game clock each of those minutes lasts: at 60, as in the original game, a minute is a minute; at 30 every penalty lasts half as long. It suits a league that plays short periods: with 5-minute periods, 30 makes a minor 1:00. Only the time in the box changes: the penalty minutes in the statistics, which penalties are called, and a power-play goal letting a player out early are all as before. It goes with One-minute penalties, which halves the minors' minutes. Works in every build. Tested in the game by the NHL94 Match Viewer project.",
  goaliePoke:
    "Among the recommended fixes, from a community report that the goalie's poke check (X) seems useless. In the original game the poke only reaches a puck on the ice when the goalie holds his stick out to the side, so a poke straight up or down the ice, the way he usually faces, never touches it, and its reach is short. With this on, his poke reaches the ice whichever way he faces, about three times as far (as far as a skater's steal), and knocks the puck loose. It still cannot knock down a raised shot, and his stance and stick saves are as before. It also fixes a poke straight up the ice, which in the original game never stretches out fully. Computer goalies poke too. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  goalieHold:
    "How long a goalie may hold the puck before the whistle. The original game allows 2.33 seconds. A longer time is for every goalie, so the computer's also keeps the puck longer before he passes it. Put 0 for no whistle for a goalie you control; holding the puck past the whistle line below is still whistled at once, a catch in a dive as the next setting says, and the computer's goalie is whistled as before. Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  diveHold:
    "How long a goalie who catches the puck in a dive may hold it after he gets up, before the whistle. The original game allows only 0.08 seconds, so you must pass or drop the puck at exactly the right moment to keep play going; a longer time gives you a chance. Every goalie, the computer's too. With 0 (no whistle) in the goalie hold time above, a goalie you control is not whistled for it at all once this is longer than 0.08 seconds. Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  goalieWidth:
    "How far a goalie you control may go, without the puck, to either side of the middle of the ice. Past it the game takes him over and skates him back to his net. A smaller number keeps him nearer the middle; the original game has 48, and the game never lets him go wider than that, so this can only narrow it. The computer's goalie is as before. Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  goalieOut:
    "How near centre ice a goalie you control may come without the puck, as his distance from it, so a larger number keeps him nearer his net. Past it the game skates him back to his net. For scale, the goal line is 264 from centre ice; the original game has 228, and the game never lets him come farther out than that, so this can only hold him back. At 255 he can hardly leave his net. The computer's goalie is as before. Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  goalieLine:
    "The line a goalie you control may not carry the puck past without a whistle, again as a distance from centre ice, so a smaller number lets him go farther; the original game has 187, and 0 lets him go anywhere. At most 210, just outside his crease. Works on McMarkis's SA-1 and 32-team builds too. Not yet tested in the game.",
  freeBurst:
    'With line changes on, a speed burst (the A button without the puck) costs no energy, where in the original game each costs 5% of full energy. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.',
  noPenaltyShots: 'A foul on a breakaway is called as an ordinary penalty, never a penalty shot.',
  noGoalPosts: 'A puck that reaches the net between the posts is always a goal: it never rings off the post or the crossbar.',
  skipEaIntro: 'Starts the game without the EA logo.',
  barrPick:
    "An option, from a league member’s idea. Before each game every player is rolled a little hot or cold, and on the matchup screen Ron Barr names the team that came out hotter (“Lately ... has been playing well”), but only when the gap is wide, so not every game has the line. With this on he names the hotter team every game, so his pick changes from game to game and the team he picks has the better form that night. With a wide gap he still says “extremely”, and on an exact tie he picks the home team. The line is the hotter-team line of Ron Barr’s text on the Game settings page, so a league can reword it as a pick, such as “{hotter team has} Ron Barr’s pick tonight.” ({hotter team has} gives the team’s full name and “has”, as in “NY Rangers have”.) Tested in the game by the NHL94 Match Viewer project.",
  barrCoin:
    "An option, instead of the one above: Ron Barr names a team every game by a coin flip, home or visitors alike, whatever the teams’ hot and cold rolls, so about half the time he names the team that came out colder. He never says “extremely”. Turning one of the two on turns the other off. It uses the same line of Ron Barr’s text, so the same wording works. Tested in the game by the NHL94 Match Viewer project.",
  skipPucksIntro: 'Starts the game without the flying pucks.',
  organResume:
    "Pausing the game stops the organ, and it stays quiet after the pause until the next song starts. With this on the organ carries on with its song from where it was. The bit of the song that faded out as the pause began is heard again, and a note that was sounding comes back at the song's next note. Tested in the game by the NHL94 Match Viewer project.",
  realTime:
    "The original game's clock runs two and a half times as fast as a real one, so a 5-minute period takes 2 minutes to play. This makes the game clock count true seconds, and penalty time with it. Periods then last as long as they say, so choose shorter ones in the game's options. The time limit on a penalty shot grows with it, from about 17 to about 42 seconds. As on the Genesis. Tested in the game by the NHL94 Match Viewer project.",
  noIcing:
    "Icing is never called: a puck shot from a team's own half and over the goal line plays on, and the goalie plays it as any loose puck. With this on, No icing within the crease and Hybrid icing have no effect. As on the Genesis, from TheTome's forum post. Not yet tested in the game.",
  extraAttackerFix:
    "In Edit Lines, picking a line's extra attacker for one of its positions puts him in both places and drops the player he replaced, so the line is a skater short. With the fix the two swap, as they do for any other move within the line. McMarkis's fix from NHL94SNESVault. NOSE4Web's version also fixes the penalty-kill lines, which the Vault's misses (found by the NHL94 Match Viewer project). Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  yButtonFix:
    'A skater who has been knocked down, or is falling into the boards, being held or otherwise tied up, can still hook or hold with Y, where every other button does nothing until he is free. With the fix Y waits too. (NHL94SNESVault has a fix for a skater knocked down; this covers them all.) Players are used to the original, so it is not among the recommended fixes.',
  comebackFix:
    'A team tied or behind late in the third period is meant to get a boost (+2 Offensive Awareness, +2 Checking and more passing and shooting), but a bug gives it in the first half of the period instead of the second. This makes it come when it should. Overtime is not affected. As on the Genesis. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.',
  awarenessFix:
    "Among the recommended fixes. A computer skater decides what to do next at intervals set by his awareness. Computer skaters use Offensive Awareness when their team has the puck and Defensive when it does not, but in the original game computer wingers and centres use Defensive on offence too. Whether that was meant is not known. With this on they use Offensive, like the others. A small change. As on the Genesis. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  secondAssist:
    "The game gives a goal's assists to the last two other players of the scoring team to touch the puck, but when the scorer touched it twice among them, as in a give-and-go (C passes to A, A to B, B back to A, who scores), it drops C's assist and credits only B. With the fix C gets the second assist, as on the Genesis. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  regainAssist:
    "When a player loses the puck to an opponent, wins it back himself and passes to a teammate who scores, the original game forgets his touch, so he gets no assist. With the fix he gets it. It comes up in about 1 goal in 30. It works with or without the second-assist fix, in every build. Among the recommended fixes. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  stickShots:
    "A hard shot the goalie knocks away with his stick or glove, too fast for him to catch, is not counted as a shot on goal in the original game; only one he catches or stops with his body is, so those go missing from the totals. With this on they count once, for the shooter and his team and against the goalie. On the SNES this covers hard high shots off his stick or glove as well as low ones, more than on the Genesis: up to about 4 more shots on goal a game. Only the statistics change. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  bodychecks:
    "Counts each player's bodychecks in a game, the checks he gives and the checks he takes; the game itself counts only each team's. A check counts as in the team count: one that knocks a player down while the clock runs. McMarkis's hack from NHL94SNESVault, unchanged, so nhl94online.com can read the counts from save states (for leagues on the updated NHL94 Classic ROM and those built on it); ROMs that already have it, such as NHL94_Classic and SDL16, show it as on. One catch, kept so the website can still read them: in a game with more than 20 penalties, the counts and the later penalties in the penalty summary get mixed up. Not offered on McMarkis's 2 MB builds, which count each player's checks themselves. Tested in the game by the NHL94 Match Viewer project.",
  timeOnIce:
    "Counts each player's time on ice, as the Genesis game does: each second of the game clock, everyone on the ice, goalies included, gets a second, up to 99:59. Time on ice in Player Stats shows it, and nhl94online.com and other save-state readers can read it as they do in McMarkis's 2 MB and SA-1 builds. It starts at 0 each game and is kept through a season shootout. McMarkis's code, adapted with his permission. Only for ROMs laid out like the original game, as his own builds count it already. Tested in the game by the NHL94 Match Viewer project.",
  clutchTime:
    "An option, from a community idea: in the last 2:00 of the third period, with the score tied or within one goal, everyone on the ice, both teams and the goalies, plays half a rating point better at everything but aggression, so the end of a close game is sharper. Not in overtime. A goal that makes it a two-goal game ends it at the next faceoff, and one that brings a game back within a goal starts it there. Players already at the top of a rating gain nothing in it. The 2:00 is the same at any period length, so with periods of 2:00 or shorter the whole third period is clutch time. Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  speedBurst:
    "The push a speed burst (A without the puck) gives. Put 0 for the original game's, which is 35 for a fresh player and less for a tired one (with line changes off nobody tires, so it is always 35). Any other number is the push for everybody, tired or not: 1 as good as takes it away, 17 is about half the original's, and much over 64 can send a player who bursts twice the wrong way. What a burst costs in energy is as before (see Speed bursts cost no energy). Works in every build. Not yet tested in the game.",
  turnRate:
    "How quickly a skater stops and turns when he reverses. A larger number stops him sooner; a small one gives a long, sliding stop. Each player's leg strength rating adds a little more (0 to 15). The original game has 112, at most 225. Works in every build. Not yet tested in the game.",
  puckFriction:
    "How fast the puck slows down on the ice, on the same scale as the Genesis setting. A smaller number slows it faster: 8 slows it twice as fast as the original 9, and 10 half as fast. At 8 a loose puck keeps about 78% of its speed each second, where at 9 it keeps about 88%. A player gliding to take a pass slows the same way, as the game uses this setting for him too. Choppy ice, below, adds to it as before. It does not apply to a puck in the air. From chaos's forum post. Works in every build. Not yet tested in the game.",
  choppyIce:
    "An option, from a community idea: the ice wears as each period goes on, so the puck slows a little more, up to a quarter more by the period's end, and the ice is fresh again at the start of each period and overtime. Only the puck: skaters glide as before. Works in every build. Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  nhlShootout:
    "Today's NHL shootout: three rounds a side, then sudden death, where the game plays five. And, as in the NHL, it ends as soon as one team cannot catch up (2-0 after two rounds, say), where the game itself always plays every round. For the season shootout and the main menu's Shootout mode alike. The shooters are chosen as before. Tested in the game by the NHL94 Match Viewer project.",
  giveaways:
    "Counts each player's giveaways and takeaways, as the NHL94 Match Viewer project and the Genesis count them: the puck going from one team to the other with no whistle between. A takeaway goes to the skater who forced it, with a stick steal or a check that knocked the carrier down; any other loss is a giveaway for the player who lost the puck, such as a pass picked off or a puck run into the other team's goalie (goalies get no takeaways). It goes to the player himself, even if a line change or a penalty put someone else in his spot before the loose puck was picked up. Not counted: shots, faceoff wins, passes between teammates, passes or dump-ins the other goalie collects, a puck picked up after the whistle, and anything in highlights or a shootout. A pass at the net counts as a shot, not a giveaway, if the other team picks it up after it reaches the goalie or the goal line. The counts start at 0 each game, are kept through a season shootout, and can be read from save states. Works in every build. Tested in the game by the NHL94 Match Viewer project.",
  giveawaysShown:
    "Game Stats gets a row more, Give/Take: each team's giveaways and takeaways (giveaways first), goalies included, with penalties on or off. It needs the counts, which turn on with it. Tested in the game by the NHL94 Match Viewer project.",
  giveawayPages:
    "Adds Giveaways and Takeaways pages to Player Stats: press right past Penalties, and the players are sorted by their giveaways or takeaways, each row showing goals, assists, points, giveaways (GV) and takeaways (TK). Goalies are not on these pages; instead the Goalies page shows each goalie's giveaways (GV) at the right, with goals against and shots against narrowed to make room. With the time on ice page on too, these come before it. It needs the counts, which turn on with it. In McMarkis's 2 MB and SA-1 builds, which have Player Stats pages of their own, the two pages come after his, and his last page's title is shortened a little to make room (Checks Agt, or Ice Time). Tested in the game by the NHL94 Match Viewer project.",
  timeOnIceShown:
    "Adds a Time On Ice page to Player Stats: press right past Penalties, and the players are sorted by their time on ice, each row showing goals, assists, points and the time (up to 99:59). Goalies are not on this page. The other pages are as before. It needs Time on ice for each player, which turns on with it. With the giveaways and takeaways pages on, it comes after them. McMarkis's page from his 2 MB and SA-1 builds, adapted with his permission; only for ROMs laid out like the original game, as his builds have it already. Tested in the game by the NHL94 Match Viewer project.",
  bodychecksShown:
    "Player Stats shows each player's checks given as Cf in place of penalty minutes (PM), and the sort title says Checks. It needs the bodycheck counts, which turn on with it. McMarkis's hack from NHL94SNESVault. NOSE4Web's version also sorts that column by the checks (the Vault's still sorts it by penalty minutes). Penalty minutes are still counted, and the team stats and penalty summary are as before. Tested in the game by the NHL94 Match Viewer project.",
  penaltyShotFixes:
    'A penalty shot whistled dead because the net was knocked off, or because the loose puck stopped moving for two seconds, is taken all over again, from the side, because the original game never ends it. With the fix those whistles end the penalty shot, as a goal or the puck hitting the boards does, and play goes on to a faceoff.',
  forwardsAndDefence:
    "The game's own Edit Lines offers only forwards for the forward positions and only defencemen for the defence. With this on it lists every skater for every position, so players can put a forward on the point of a power play or a defenceman up front, and picking someone already on the line swaps the two, the extra attacker included. A player plays the position the line gives him. It needs the extra attacker fix, which turns on with it. NOSE4Web's own line editor offers any skater at any position in a ROM that has it. McMarkis's hack from NHL94SNESVault. Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  showMaxBoost:
    "For a ROM that keeps the hot and cold bug, which puts about half of every player's ratings at the maximum in play. Edit Lines and the team roster do not show that, so players cannot see who is really boosted. With this on they show such a rating as 100, as it plays; the overall shown does not change. It changes only what is shown. It cannot be on with the hot and cold bug fix, which removes the boost: turning either on turns the other off. McMarkis's hack from NHL94SNESVault. NOSE4Web's version also shows the few boosted ratings the Vault's misses. Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  manualPullGoalie:
    "During play, a player can press L and R together to pull his goalie for an extra attacker, and again to put him back, with a beep each time; he stays out through faceoffs until put back. Each press counts once, however short or long, and the goalie comes off or back within about half a second. It does nothing between whistles, while the game already has the goalie out for a delayed penalty, or while the backup goalie is in net. With both players on one team, player 1 has it. McMarkis's hack from NHL94SNESVault, improved: the Vault's often missed a quick tap, and a long hold could pull the goalie and put him straight back. Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  hitEnergy:
    "An option, from a community idea: a skater knocked down by a check or a poke check loses this much energy, so he is slower, shoots softer and loses more puck battles until he rests on the bench. 0 is the original game, where a hit costs nothing. Only with line changes on (Automatic counts as on here, unlike on the Genesis). Full energy is 4096; a speed burst costs 204. Recommended: 204 (5%), what a burst costs, or about 38 seconds of skating: it noticeably tires the players hit most and hardly touches the average skater. Up to 4096, all of a skater's energy, for a league that wants hits to wear players down. Energy from hits only, below, makes skating and speed bursts free and a knockdown cost a third. On the SNES a skater with no energy keeps more of his speed than on the Genesis, unless Energy takes all of a skater's speed is on. A knockdown by the puck, a bump that does not knock him down, or a hit after the whistle costs nothing. As on the Genesis; works in every build. Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
  holdEnergy:
    'The same for a skater caught by a hold or hook (Y), once each time it catches him in play. Recommended: 102 (2.5%), half a knockdown\'s. Only with line changes on.',
  injuryBonus:
    "An option, the other half of the community idea: each knockdown a skater takes makes a later injury a little more likely, and half of it wears off at each intermission. 0 is the original game. Only the few hits that can already injure are affected (a puck carrier knocked onto his back while facing straight up or down the ice, with the clock running), so injuries stay rare. Each knockdown he has taken this game, up to five, the hit itself included, adds this number to the hit's chance of injuring him. Recommended: 6, which matches the Genesis's recommended setting: about a quarter more injuries a game, with the skaters knocked down most about a third more likely to be hurt. Each 1 more adds about 5% more injuries. Knockdowns in play count, with line changes on or off; those after the whistle do not. Works on McMarkis's SA-1 and 32-team builds too. Tested in the game by the NHL94 Match Viewer project.",
  fourthPeriodOvertime:
    "Lets one ROM play two kinds of regular-season game: the usual ones, and ones with 99 minutes of overtime, as good as playing until someone scores, so a league that needs both no longer needs a separate ROM. The main menu's Period Length gets an extra choice, the one the 30-second periods hack adds (so that turns on with this). Set its length and menu text on the Game settings page, for example 5:00 and \"5 Minutes, 99 Min OT\". A regular-season game played at that length then gets 99 minutes of overtime. Games at the other lengths keep the overtime set on the Game settings page, and playoff overtime is unchanged, as long as a period. From McMarkis's Genesis patch, as in NOSE4Web's Genesis option. Works in every build. Tested in the game by the NHL94 Match Viewer project.",
  threeStars:
    "The original game picks its three stars simply: goals and assists for skaters, and a bonus for a goalie who lets in few of his shots. The improved way, as on the Genesis, weighs goals, assists, shots and checks for skaters, and shots faced, goals against and shutouts for goalies; a shot faced counts for less than on the Genesis, so that goalies are not picked nearly every game. Choose it for how the ROM will mostly be played: skaters are given a little more with line changes on, when each plays less. Checks count with Bodycheck counts for each player on, and in McMarkis's 2 MB builds, which count them themselves. Tested in the game by the NHL94 Match Viewer project.",
  faceoffFix:
    "Faceoffs as today's NHL rules have them. Only since 2007 has the NHL held every faceoff on one of the nine dots; before that a faceoff was often held where play stopped, and the game follows that older way, putting one on a dot only when play stops past the hash marks. With this on, every faceoff is on a dot: after a goal at centre; after a penalty in the offending team's own end, at the dot on the side the puck was; otherwise past a blue line at that end's dot on the puck's side, and in the neutral zone at the nearest neutral-zone dot. Leave it off to keep the game's own 1990s-style faceoffs. Worked out with the NHL94 Match Viewer project, from today's NHL rulebook.",
}

// What NOSE4Web's version of a hack does better than NHL94SNESVault's.
const VAULT_VERSION_NOTE: Partial<Record<SnesHack, string>> = {
  seasonShootout: "NOSE4Web's versions before 21 November 2026 showed no Stars of the Game after the shootout, and the one of the morning of 12 November 2026 also lost the 2 MB builds' own checks, posts and time on ice in the shootout (they came back as 0); this one does both.",
  bodychecksShown: "NHL94SNESVault's shows the checks but still sorts that column by penalty minutes; NOSE4Web's sorts it by the checks.",
  hitEnergy: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle; this one counts only hits in play.",
  holdEnergy: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle; this one counts only hits in play.",
  injuryBonus: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle; this one counts only hits in play.",
  extraAttackerFix: "NHL94SNESVault's misses the penalty-kill lines, so picking the extra attacker there still puts him on the line twice; NOSE4Web's covers every line. (NOSE4Web used the Vault's before 9 November 2026.)",
  showMaxBoost: "NHL94SNESVault's misses about 1 boosted rating in 28, which NOSE4Web's shows as 100 too.",
  manualPullGoalie: "Earlier versions could miss a quick tap, pull the goalie and put him straight back on a long hold, or act on a press made during a pause once play resumed, and in McMarkis's SA-1 builds NOSE4Web's before 12 November 2026 never pulled the goalie at all. This one acts once on each press made in play, on every build.",
  shotFix: "NOSE4Web's first version (13 November 2026) also kept a computer shooter's shot going, which made the computer goalie move faster until the puck changed hands; this one does it only for a person's shooter.",
  clutchTime: "NOSE4Web's first version (13 November 2026) ended the period when the clock reached 2:00 in a close third; this one lets the clock run on.",
  threeStars: "NOSE4Web's earlier versions (19 and 20 November 2026) gave each shot a goalie faced too much weight, so a goalie was the first star most games; this one picks goalies about as often as the original game.",
  realTime: "NOSE4Web's first version (19 November 2026) left the penalty box on the original timing, so a two-minute minor ended after only 48 seconds of the clock; this one counts the box, power-play time and time on ice in real seconds too, and gives a penalty shot two and a half times as long, as the Genesis's does.",
  giveaways: "NOSE4Web's earlier versions (14 to 18 November 2026) could credit a giveaway or takeaway to a player who came on in a line change while the puck was loose, count some passes at the net the wrong way (as a giveaway when picked up off the goalie or after going wide, or as a shot when picked off before getting there), or count a puck picked up after the whistle. This one fixes all three.",
}

const GROUPS = SNES_HACK_GROUPS

// Why a hack cannot be changed in this ROM. A hack made for the original game's layout is not offered in a build whose
// code is elsewhere (McMarkis's SA-1 and 32-team builds), which is not "something else in its place"; those builds
// have fights of their own.
function whyNotHere(project: RomProject, hack: SnesHack): string {
  const moved = !snesCodeInPlace(project.bytes)
  if (moved && hack === 'fighting' && project.settings.menu.some((item) => /fight/i.test(item.caption))) {
    return "This build has fights of its own (McMarkis's), set by its main menu's Fighting line on the Game settings page, so NOSE4Web's are not added."
  }
  if (moved && snesHackInPlaceOnly(hack)) {
    return "Made for ROMs laid out like the original game, so it is not offered for this build (such as McMarkis's SA-1 and 32-team builds)."
  }
  return 'This ROM has other changes in this part of the game, so it is left exactly as it is.'
}

const sameChoices = (a: SnesHackChoices, b: SnesHackChoices) => SNES_HACKS.every((hack) => a[hack] === b[hack])

export function SnesHacksPage({ project, name, onChange }: Props) {
  const state = useMemo(() => detectSnesHacks(project.bytes), [project.bytes])
  const notHere = (hack: SnesHack) => whyNotHere(project, hack)
  const notOfferedHacks = Object.keys(state.notOffered ?? {}) as SnesHack[]
  // The choices being made, which start again from the ROM whenever it changes.
  const hadAmounts: Record<SnesAmount, number> = state.amounts ?? SNES_AMOUNT_OFF
  const [draft, setDraft] = useState({ rom: project.bytes, choices: state.choices, amounts: hadAmounts })
  if (draft.rom !== project.bytes) setDraft({ rom: project.bytes, choices: state.choices, amounts: hadAmounts })
  const wanted: SnesHackChoices = draft.rom === project.bytes ? draft.choices : state.choices
  const wantedAmounts = draft.rom === project.bytes ? draft.amounts : hadAmounts
  const setAmount = (hack: SnesAmount, value: number) => {
    // With the hacks that go with it or cannot, as a choice made by its own select would be.
    const choices = withSnesHackChoice(wanted, hack, value !== SNES_AMOUNT_OFF[hack])
    const amounts = Object.fromEntries(SNES_AMOUNTS.map((h) => [h, h === hack ? value : choices[h] ? wantedAmounts[h] : SNES_AMOUNT_OFF[h]])) as Record<SnesAmount, number>
    setDraft({ rom: project.bytes, choices, amounts })
    setNotice('')
    setError('')
  }
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  // What could not be copied from another ROM's hacks, if they were.
  const [notCopied, setNotCopied] = useState<string[]>([])
  const changed = SNES_HACKS.filter((hack) => wanted[hack] !== state.choices[hack] || (isAmount(hack) && wantedAmounts[hack] !== hadAmounts[hack]))

  function apply() {
    try {
      onChange(applySnesHacks(project, wanted, false, wantedAmounts))
      setNotice(`Done: ${changed.length === 1 ? '1 change' : `${changed.length} changes`} to the game. Undo puts it back.`)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="team help">
      <h2>Hacks</h2>
      <p className="notice">
        <b>How this page works:</b> choose the hacks you want, then press <b>Apply</b> at the very bottom of the page.
        Nothing in the ROM changes until you do. The list just above Apply shows exactly what will change, and Undo
        takes it all back.
      </p>
      <p className="note">
        Changes to the SNES game itself. They come from the community's patches for the game,{' '}
        <a href="https://github.com/Mhopkinsinc/NHL94SNESVault" target="_blank" rel="noreferrer">
          NHL94SNESVault
        </a>
        , and from the NHL94 Match Viewer project, which found many of the game's bugs and tries hacks out in the
        game; each hack's note says whose it is. The choices show what this ROM has now. Try a hacked ROM in a game
        before a league plays on it.
      </p>
      <HackShortcuts
        onRecommended={
          !sameChoices(withRecommendedSnesFixes(wanted, state.unknown, notOfferedHacks), wanted) &&
          (() => {
            setDraft({ rom: project.bytes, choices: withRecommendedSnesFixes(wanted, state.unknown, notOfferedHacks), amounts: wantedAmounts })
            setNotice('')
            setError('')
          })
        }
        discordText={() => snesHacksForDiscord(project.bytes, name, pictureItems(project).map((item) => `- **${item.title}**`))}
        discordMessages={() => hackSheetDiscord(withPictures(snesHackSheet(project.bytes, name), project))}
        sheet={() => hackSheetHtml(withPictures(snesHackSheet(project.bytes, name), project))}
        name={name}
      />
      {GROUPS.map((group) => (
        <section key={group.id} id={`hacks-${group.id}`}>
          <h3>{group.title}</h3>
          {[...new Set(group.hacks.map((hack) => state.notOffered?.[hack]).filter(Boolean))].map((why) => (
            <p className="note" key={why}>
              {why}
            </p>
          ))}
          {group.hacks.filter((hack) => !state.notOffered?.[hack]).map((hack) => {
            const unknown = state.unknown.includes(hack)
            return (
              <div className="hack" key={hack}>
                {hack === 'threeStars' ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <select aria-label={SNES_HACK_TITLES[hack]} className="wide" disabled={unknown} value={wantedAmounts.threeStars} onChange={(e) => setAmount('threeStars', Number(e.target.value))}>
                      {SNES_STAR_TEXTS.map((text, choice) => (
                        <option key={choice} value={choice}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : hack === 'threeOnThree' ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <select aria-label={SNES_HACK_TITLES[hack]} className="wide" disabled={unknown} value={wantedAmounts.threeOnThree} onChange={(e) => setAmount('threeOnThree', Number(e.target.value))}>
                      {SNES_THREE_ON_THREE_TEXTS.map((text, choice) => (
                        <option key={choice} value={choice}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : hack === 'seasonShootout' ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <select aria-label={SNES_HACK_TITLES[hack]} className="wide" disabled={unknown} value={wantedAmounts.seasonShootout} onChange={(e) => setAmount('seasonShootout', Number(e.target.value))}>
                      {SNES_SHOOTOUT_TEXTS.map((text, choice) => (
                        <option key={choice} value={choice}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : hack === 'injuries' ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <select aria-label={SNES_HACK_TITLES[hack]} className="wide" disabled={unknown} value={wantedAmounts.injuries} onChange={(e) => setAmount('injuries', Number(e.target.value))}>
                      {SNES_INJURY_TEXTS.map((text, choice) => (
                        <option key={choice} value={choice}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : hack === 'referees' ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <select aria-label={SNES_HACK_TITLES[hack]} className="wide" disabled={unknown} value={wantedAmounts.referees} onChange={(e) => setAmount('referees', Number(e.target.value))}>
                      {SNES_REFEREE_TEXTS.map((text, choice) => (
                        <option key={choice} value={choice}>
                          {text}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : hack === 'fighting' ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <select
                      aria-label={SNES_HACK_TITLES[hack]}
                      disabled={unknown}
                      value={wanted.fighting ? 'on' : 'off'}
                      onChange={(e) => setAmount('fighting', e.target.value === 'on' ? (state.choices.fighting ? hadAmounts.fighting : SNES_FIGHT_BONUS_DEFAULT) : SNES_AMOUNT_OFF.fighting)}
                    >
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                    {wanted.fighting && (
                      <>
                        {' '}with a bonus of{' '}
                        <NumberField
                          className="seconds"
                          aria-label="Fighting rating bonus"
                          disabled={unknown}
                          min={SNES_AMOUNT_RANGES.fighting[0]}
                          max={SNES_AMOUNT_RANGES.fighting[1]}
                          value={wantedAmounts.fighting}
                          onValue={(n) => setAmount('fighting', n)}
                        />{' '}
                        <span className="note">on every player's fighting rating.</span>{' '}
                        <button type="button" disabled={unknown || wantedAmounts.fighting === SNES_FIGHT_BONUS_DEFAULT} onClick={() => setAmount('fighting', SNES_FIGHT_BONUS_DEFAULT)}>
                          Use the default {SNES_FIGHT_BONUS_DEFAULT}
                        </button>
                      </>
                    )}
                  </label>
                ) : GOALIE_AMOUNTS.includes(hack) && isAmount(hack) ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <NumberBox
                      label={SNES_HACK_TITLES[hack]}
                      value={wantedAmounts[hack]}
                      range={SNES_AMOUNT_RANGES[hack]}
                      perUnit={hack === 'goalieHold' || hack === 'diveHold' ? 60 : 1}
                      fresh={project.bytes}
                      disabled={unknown}
                      onChange={(n) => setAmount(hack, n)}
                    />{' '}
                    {hack === 'goalieHold' && <span className="note">{wantedAmounts.goalieHold === 0 ? 'seconds: no whistle.' : 'seconds.'}</span>}{' '}
                    {hack === 'diveHold' && <span className="note">seconds.</span>}{' '}
                    <button type="button" disabled={unknown || wantedAmounts[hack] === SNES_AMOUNT_OFF[hack]} onClick={() => setAmount(hack, SNES_AMOUNT_OFF[hack])}>
                      Use the original {goalieOriginal(hack)}
                    </button>
                  </label>
                ) : isAmount(hack) ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <NumberField
                      className="seconds"
                      aria-label={SNES_HACK_TITLES[hack]}
                      disabled={unknown}
                      min={SNES_AMOUNT_RANGES[hack][0]}
                      max={SNES_AMOUNT_RANGES[hack][1]}
                      value={wantedAmounts[hack]}
                      onValue={(n) => setAmount(hack, n)}
                    />{' '}
                    <span className="note">{amountText(hack, wantedAmounts[hack])}</span>{' '}
                    <button type="button" disabled={unknown || wantedAmounts[hack] === RECOMMENDED_AMOUNTS[hack]} onClick={() => setAmount(hack, RECOMMENDED_AMOUNTS[hack])}>
                      {ORIGINAL_BUTTON[hack] ? ORIGINAL_BUTTON[hack] : hack === 'fightTime' ? 'Use 5:00' : `Use the recommended ${RECOMMENDED_AMOUNTS[hack]}`}
                    </button>
                  </label>
                ) : (
                <label>
                  <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                  <select
                    aria-label={SNES_HACK_TITLES[hack]}
                    disabled={unknown}
                    value={wanted[hack] ? 'on' : 'off'}
                    onChange={(e) => {
                      setDraft({ rom: project.bytes, choices: withSnesHackChoice(wanted, hack, e.target.value === 'on'), amounts: wantedAmounts })
                      setNotice('')
                      setError('')
                    }}
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                </label>
                )}
                <p className="summary">
                  {snesHackSummary(hack)}
                  {unknown && <b> {notHere(hack)}</b>}
                </p>
                <details className="more">
                  <summary>More about it</summary>
                  <p className="note">{ABOUT[hack]}</p>
                </details>
                {state.vaultVersions?.includes(hack) && (
                  <p className="note">
                    <b>This ROM has an earlier version of it.</b> {VAULT_VERSION_NOTE[hack]}{' '}
                    <button
                      onClick={() => {
                        try {
                          onChange(applySnesHacks(project, { [hack]: true }, true))
                          setNotice(`Done: ${SNES_HACK_TITLES[hack]} is now NOSE4Web's version. Undo puts it back.`)
                          setError('')
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e))
                        }
                      }}
                    >
                      Put in NOSE4Web's version
                    </button>
                  </p>
                )}
              </div>
            )
          })}
          {group.hacks.includes('hitEnergy') && (
            <p>
              <button
                type="button"
                disabled={HITS_ONLY_HACKS.some((hack) => state.unknown.includes(hack)) || (HITS_ONLY_HACKS.every((hack) => wanted[hack]) && wantedAmounts.hitEnergy === SNES_HITS_ONLY.hitEnergy && wantedAmounts.holdEnergy === SNES_HITS_ONLY.holdEnergy)}
                onClick={() => {
                  setDraft({
                    rom: project.bytes,
                    choices: { ...wanted, hitEnergy: true, holdEnergy: true, noSkatingDrain: true, freeBurst: true, energySpeed: true },
                    amounts: { ...wantedAmounts, ...SNES_HITS_ONLY },
                  })
                  setNotice('')
                  setError('')
                }}
              >
                Energy from hits only
              </button>{' '}
              <span className="note">
                Skating and speed bursts cost nothing; a knockdown costs {SNES_HITS_ONLY.hitEnergy} (a third of full energy) and a hold {SNES_HITS_ONLY.holdEnergy}; and energy takes all of a skater's speed, so three knockdowns leave him at the slowest speed there is.
                Players get it back on the bench as usual. Then Apply. Compared with the original game: about a third more knockdowns, and about one skater a game runs out of energy, whom the computer often leaves on the ice for up to two minutes. Tested in the game by the NHL94 Match Viewer project.
              </span>
            </p>
          )}
          {group.hacks.includes('hitEnergy') && (
            <HitsTable
              knockdown={wantedAmounts.hitEnergy}
              hold={wantedAmounts.holdEnergy}
              disabled={['hitEnergy', 'holdEnergy'].some((hack) => state.unknown.includes(hack as SnesHack))}
              onUse={(knockdown, hold) => {
                setDraft({
                  rom: project.bytes,
                  choices: { ...wanted, hitEnergy: true, holdEnergy: true },
                  amounts: { ...wantedAmounts, hitEnergy: knockdown, holdEnergy: hold },
                })
                setNotice('')
                setError('')
              }}
            />
          )}
        </section>
      ))}
      <section id="hacks-apply" data-tab-always>
        <h3>Apply</h3>
        <p>
          <button disabled={changed.length === 0} onClick={apply}>
            Apply
          </button>{' '}
          <button
            disabled={changed.length === 0}
            onClick={() => {
              setDraft({ rom: project.bytes, choices: state.choices, amounts: hadAmounts })
              setNotCopied([])
            }}
          >
            Set back to what the ROM has
          </button>{' '}
          <CopyHacksButton
            onRom={(other, fileName) => {
              if (other.game.platform !== 'snes') {
                setError(`${fileName} is ${other.game.title}, not an SNES ROM.`)
                return
              }
              const copied = snesHacksCopiedFrom(state, detectSnesHacks(other.bytes))
              const otherAmounts = detectSnesHacks(other.bytes).amounts ?? hadAmounts
              setDraft({
                rom: project.bytes,
                choices: copied.choices,
                amounts: Object.fromEntries(SNES_AMOUNTS.map((hack) => [hack, copied.choices[hack] ? otherAmounts[hack] : SNES_AMOUNT_OFF[hack]])) as Record<SnesAmount, number>,
              })
              setNotCopied(copied.notCopied)
              setNotice(`Set to ${fileName}'s hacks. Check the choices above and press Apply.`)
              setError('')
            }}
            onError={(message) => setError(message)}
          />{' '}
          <span className="note">{notice}</span>
        </p>
        {changed.length > 0 && (
          <div className="outcome">
            <p>Applying will make these changes to the game:</p>
            <ul>
              {changed.map((hack) => (
                <li key={hack}>
                  {SNES_HACK_TITLES[hack]}:{' '}
                  {isAmount(hack)
                    ? `${snesAmountText(hack, hadAmounts[hack])} to ${snesAmountText(hack, wantedAmounts[hack])}`
                    : `${state.choices[hack] ? 'on' : 'off'} to ${wanted[hack] ? 'on' : 'off'}`}
                  .
                </li>
              ))}
            </ul>
          </div>
        )}
        {notCopied.length > 0 && (
          <div className="note">
            <p>Left as this ROM has them:</p>
            <ul>
              {notCopied.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
