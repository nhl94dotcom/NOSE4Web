import { SNES_FIGHT_BONUS_DEFAULT } from './core/snesfight'
import { HitsTable } from './HitsTable'
import { snesCodeInPlace } from './core/snes'
import { clockTime, penaltyLengths } from './core/penaltytime'
import { SNES_HACK_GROUPS } from './core/hackgroups'
import { HackSectionLinks } from './HackSectionLinks'
import { useMemo, useState, type ReactNode } from 'react'
import type { RomProject } from './core/rom'
import { CopyHacksButton } from './CopyHacksButton'
import { HackShortcuts } from './HackShortcuts'
import { hackSheetDiscord, hackSheetHtml, pictureItems, snesHackSheet, withPictures } from './core/hacksheet'
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
  SNES_SHOOTOUT_TEXTS,
  SNES_THREE_ON_THREE_TEXTS,
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
  seasonShootout: 0,
  threeOnThree: 0,
  // Not a recommendation: a fighting major's 5:00.
  fightTime: 300,
}
const FULL_ENERGY = 0x1000
const isAmount = (hack: SnesHack): hack is SnesAmount => (SNES_AMOUNTS as SnesHack[]).includes(hack)
// An energy amount as units and as a share of full energy.
const energyShare = (units: number) => (units === 0 ? 'Off: none taken.' : `${units} units, ${Math.round((units / FULL_ENERGY) * 1000) / 10}% of full energy.`)
// The injury risk: what it adds to a hit that can injure, at most.
const riskShare = (bonus: number) => (bonus === 0 ? 'Off.' : `Up to ${bonus * 5} impact after 5 knockdowns: about ${Math.round(((bonus * 5) / 300) * 100)} in 100 more on a hit that can injure.`)
const amountText = (hack: SnesAmount, value: number) =>
  hack === 'penaltyTime' ? `seconds for each penalty minute: ${penaltyLengths(value)}.` : hack === 'fightTime' ? (value === 0 ? 'seconds: off, as its minutes give.' : `seconds in the box for each fighter: ${clockTime(value)}.`) : hack === 'injuryBonus' ? riskShare(value) : energyShare(value)

interface Props {
  project: RomProject
  // The ROM's name, for the Discord post.
  name: string
  onChange: (project: RomProject) => void
}

const ABOUT: Record<SnesHack, ReactNode> = {
  hotColdFix: (
    <>
      Before each game the SNES makes every player a little hot or cold in each rating, but a bug turns every cold
      value into a large one, so about half of every player's ratings play at the maximum, 15, whatever they are in the
      ROM. This fixes it, so that hot and cold move a rating by a point or so either way and the ratings you set are
      the ones that play. It changes how every game plays, so try it before a league uses it: without the bug every player plays lower than players are used to, so it suits a league whose ratings are set higher. It is not among the recommended fixes.
    </>
  ),
  ppPkFix: (
    <>
      The game is meant to add a team's power play rating to some of each player's ratings on the power play
            and take its penalty kill rating off them on the penalty kill, but it reads the two from the wrong halves
            of their byte. The original rosters were written for the intended way, so in play Anaheim, meant to be weak
            at both, has the best power play and penalty kill. This makes the game read them as intended, so rosters
            play as their makers meant; the team page then shows the two that way round too. Leagues that have already
            set these ratings as the editor showed them before the fix should check them after it.
    </>
  ),
  defenceControl: 'Turns defence control on for both teams at the start of every game, where the original game starts with it off. Not a fix, but among the recommended hacks, as leagues play with it on.',
  oneMinutePenalties: 'Makes every minor penalty one minute long instead of two.',
  thirtySecondPeriods: 'Adds 30 seconds to the period lengths on the main menu. It is in the original game, but hidden.',
  noInterference: 'Interference is never called.',
  shotFix:
    "Now and then a player winds up a shot and swings with the puck, but no shot comes. The game fires a shot only while a shot-mode flag is set, and clears that flag whenever anyone takes the puck, even the shooter himself gathering it again after an opponent's stick knocked it loose during his wind-up. With this, a player who takes the puck while still winding up a shot keeps shooting. A hold or hook during the wind-up still spoils the shot, as in the original game. Found by the NHL94 Match Viewer project. Waiting on a test in the game.",
  oneTimerFix:
    "Now and then a player calls for a one-timer, starts his swing, and then has the puck without ever shooting. The swing waits for the pass; when the wait ends first (the pass a little late, a teammate touching it on the way, or B pressed), the game stops waiting but leaves the swing playing, and when the puck reaches him he carries it through the swing and no shot comes. Found and traced frame by frame by the NHL94 Match Viewer project: 2 of 1,043 one-timer swings in 25 computer games, and 1 of 503 in a league player's recordings. With this, a player still winding up when the wait ends goes back to skating, so he takes the puck as from any pass and can shoot it; a one-timer that connects keeps its full swing. Tested in the game by them on the 1 MB, 2 MB and SA-1 builds: abandoned swings end at once (9, 8 and 4 players holding the puck through a swing in the unfixed games, 1, 0 and 0 with the fix: the one left had already swung and missed), and one-timers that connect keep their full swing and hit as often.",
  shootoutInjuries:
    "With A shootout for tied regular-season games on: a skater injured for the game (not for the period, which is over by then) takes no attempt in it, and the next healthy player on the team's shootout list shoots in his place, even if he was picked on the shootout screen. If all five are out, the listed players shoot as before. Shootout mode from the main menu is as it was. On McMarkis's builds a player hurt in a fight is kept out too, even while his fighting major still has time left. With NOSE4Web's fighting on the 1 MB game too (since 13 November 2026; apply the hacks again to update an earlier fighting ROM). From Match Viewer's reading of the game's code, and tested in the game by them: injured shooters on the default list and picked on the shootout screen each gave way to the right player, wrapping past round 5, and with the season shootout's mark clear every listed shooter shot. On McMarkis's builds, two players hurt in fights with their majors still running at the end of overtime were passed over every round, also tested.",
  creaseIcing:
    "As on the Genesis: a puck that crosses the goal line within the width of the crease is not icing (in the original SNES game it is). From Match Viewer's reading of both games' code, and tested in the game by them: with icing on and the puck across either goal line, 40 and 44 from the middle dropped it, 46 and wider crossed.",
  hybridIcing:
    "An option, the icing rule the NHL has played since 2013, as on the Genesis. The original game plays touch icing: after the puck crosses the goal line, icing is called if a defender touches it first and waved off if an attacker does. With this on it is decided as the puck crosses: if the defending team's nearest skater is as near as or nearer to the end-zone faceoff dots than the icing team's nearest, icing is called there and then; if an attacker is nearer, it is waved off and play goes on. Goalies do not count, and it goes by distance alone, not speed. The SNES game's own rules stay: a team short-handed never ices, and icing is waved off before the puck reaches the goal line when a defending player, the goalie too, is close to a slow puck along the ice. With No icing within the crease on too, a puck that crosses within the crease's width is not icing at all. Tested in the game by the NHL94 Match Viewer project, with the Genesis version, over 38 computer games: every call and wave-off decided correctly at the crossing, ties to the defenders, and no team icing short-handed.",
  noSkatingDrain:
    'With line changes on, skating costs no energy: the drain every 64th frame on the ice never runs. Players then tire only from what else costs it, hits and holds (if set) and speed bursts, and rest on the bench as usual. With speed bursts free too, only hits tire a player. Read from the game\'s code by the NHL94 Match Viewer project and tested in the game: a skater never hit keeps full energy through a shift.',
  energySpeed:
    "With line changes on, how much a tired skater slows. The original game halves his speed rating at no energy, so even an empty skater keeps more than half his speed; with this on, energy takes all of it, as on the Genesis, and an empty skater skates at the slowest speed there is. With Energy from hits only, an average skater is then about 14%, 29% and 43% slower after one, two and three knockdowns, where the original's way gives 8%, 14% and 22%. It needs Skating costs no energy, which turns on with it: goalies never go to the bench, so the skating drain would slow them more than in the original game. Line changes Auto keeps everyone at full speed. Read from the game's code and tested in the game by the NHL94 Match Viewer project, on the original and the SA-1 build: a leg-speed-15 skater's speed class is 15, 10, 5 and 0 after none to three knockdowns, and goalies keep full speed.",
  seasonOvertime:
    "A regular-season game still tied after its overtime plays another overtime, and another, until someone scores, as a playoff game does, instead of ending in a tie. Each overtime is the regular season's 5:00; playoffs are as they were. The same two changes as the Genesis option, which the NHL94 Match Viewer project found and tested there, and tested by them in the SNES game too, on the original and the SA-1 build.",
  threeOnThree:
    "As on the Genesis, as the NHL plays overtime: each team has its goalie and three skaters, its current line's LW, C and RD (two forwards and a defenceman, a centre for the draws, one player on each side). A penalty gives the other team a skater more: 4 on 3, and 5 on 3 for a second. When it ends the teams play 4 on 4 until the next whistle, then 3 on 3 again. A team with three of its players in the box plays two skaters, its C and LW, until one comes out: the game has room for six players a team on the ice and in the box together. The other team then has at most four, as the NHL never gives a team more than two skaters' advantage. The lines are not changed, so it works with line changes On or Off. Choose in the regular season to keep the playoffs 5 on 5, as the NHL does. Worked out from the game's code and tested in the game by the NHL94 Match Viewer project, on the original game and McMarkis's SA-1 build: 3 on 3 at every even-strength draw with line changes On and Off, 4 on 3 and 4 on 4 after it ends, a third-period penalty carried into overtime, a penalty shot in overtime, the power-play clock, and playoff overtime kept 5 on 5; 5 on 3 and three in the box, which come up rarely on the SNES, were tested on the Genesis version.",
  seasonShootout:
    "A regular-season game still tied is settled by the game's own shootout, as its Shootout mode plays one: after one 5:00 overtime, or straight after period 3 with no overtime. It begins with the shootout's set-up screen (the pause menu, as in Shootout mode), then five shooters a side and one each after until a team is ahead. The winners get one goal more on the scoreboard, everything else about the game (its stats, the scoring summary, the lines) is as it was at the end of play, and the game then ends as any other. Playoff games play overtime until a goal, as they always have. Not with overtime until a goal, which settles ties its own way. Built from the NHL94 Match Viewer project's reading of the game's code, and tested in the game by them, both ways, on the original and Classic: the score is the tied score with one goal more for the winners (a 1-1 game won in the shootout ends 2-1), the stats, the goals by period and the scoring summary are the game's, and the game ends as any other. The winners' extra goal is in the score only: no player is given it. The shootout opens on its menu, as in Shootout mode: Start Shootout (or Resume Shootout between shooters) is the first line, so a press of A or B starts it. Its last line, Exit Shootout, does nothing here: in Shootout mode it ends a shootout, but here it would throw away the whole game, so NOSE4Web locks it while its shootout plays (the pause menu's Exit Game in the rest of the game is as before). (As in any game, with no pad on either team, the computer playing both, a press of any button but START ends the game: the original game takes it for the demo.) On the original game and ROMs built on it, and on the 32-team builds, SA-1 included; on the SA-1 builds, whose game state is elsewhere, NOSE4Web keeps it in their BW-RAM while the shootout plays, and on the 2 MB builds it keeps their own checks, posts and time on ice through it. Tested in the game by Match Viewer on those builds too, with a pad on a team. With the computer on both sides the 2 MB builds' own shootout hangs at its first round, in their Shootout mode too, with or without NOSE4Web; with a person on a team it plays, as in every league game.",
  injuries:
    "In the original game a hit that knocks a puck carrier onto his back with the clock running can injure him: out for the rest of the period, or one time in 7 the rest of the game. With never a hit is only a fall, and the puck still comes loose. With the penalty, but no injury the hit is still called (roughing with penalties on, the injury stoppage with them off), but there is no injury and no injury box: the player lies down and plays on after the faceoff. Every injury for the period and for the game make every injury last that long. With a long fall instead a hit that would injure has the player go down and stay down about 5 seconds, where an ordinary fall lasts under 2, then get up and play on: no injury, no injury box and no penalty. The places in the game's code were found by the NHL94 Match Viewer project, as for the Genesis choices, and all six tested in the game on the original and the SA-1 build.",
  fighting:
    "McMarkis's port of the NHLPA 93 SNES fights to NHL '94, built in with his permission. A fight can start after enough hard checks between two opponents, when both players' fighting ratings (the second half of the H/F column) are high enough: the two drop their gloves, the crowd gathers, and they fight with A for a high punch, B for a low one and Y to grab, the computer for players it controls, until one goes down. Both get a fighting major (the instigator a minor as well), shown in the penalty box and the stats, and a box names the two fighters. The game asks for a fighting rating of 10 or more; the bonus is added to every player's first, and the 94 rosters rate fighters about 2 lower than NHLPA 93's, so McMarkis's patch adds 2, the default here: 0 leaves the ratings as they are, so only the toughest fight, and a higher bonus makes fights more common (at 8 nearly anyone can). The fight frames, the punches' sounds and the code go in a bank of their own past the first megabyte, which grows a 1 MB ROM to 2 MB; taking it out gives the ROM back as it was. For ROMs built on the original game (not the SA-1 builds). Checked in the game by McMarkis in his build; NOSE4Web's build of his source is his byte for byte but for the bank it goes in, and the NHL94 Match Viewer project tested it in the game on the original, Classic and SDL16: the names box, the gloves on the ice, the fight, both majors, the pause and the replay, and the bonus (at 8, fights in two games of three). A player hurt in a fight is out for the rest of the game, his fighting major served first: McMarkis's later fix, brought into NOSE4Web on 13 November 2026 (before, he came back once his major was over). A ROM with NOSE4Web's earlier fighting is updated when the hacks are next applied. Tested in the game by the NHL94 Match Viewer project: hurt fight losers served their majors (or were let out early by a power-play goal) and then stayed out to the end of the game, the marks were cleared at each game's start, and in the shootout the hurt were passed over.",
  fightTime:
    "For leagues that play with fighting: how long a fight keeps each fighter in the box, in seconds of the game clock, whatever its five minutes and the penalty time give. 0 is off: a fight is a 5-minute major like any other. Only the time in the box changes: the fight still counts as 5 penalty minutes in the statistics, and two fighters still go off together with no power play, as both get the same time. Waiting on a test in the game.",
  penaltyTime:
    "How long a penalty keeps a player in the box. Each penalty has its minutes (2 for a minor, 5 for a major, and so on, which you can change one by one under Rule messages on the Game settings page), and the game keeps the player off for that many minutes of the game clock. This sets how long each of those minutes is: at 60, as in the original game, a minute is a minute; at 30 every penalty lasts half as long. It suits a league that plays short periods and wants penalties to match: with 5-minute periods, 30 makes a minor 1:00, as a 2-minute minor is to a 20-minute period. Only the time in the box changes: the penalty minutes in the statistics, which penalties are called, and a power-play goal letting a player out early are all as before. It goes with the one-minute penalties hack, which halves the minors' minutes. Read from the game's code: box time is the minutes times 60 in one place only, which this changes, in every build. Tested in the game by the NHL94 Match Viewer project at 30, on the original and the SA-1 build: minors served 60 seconds, majors 150, with 2 and 5 penalty minutes, and a power-play goal letting the player out as before.",
  goaliePoke:
    "A fix as an option, from a community report that the goalie's poke check (X) seems useless. In the original game a goalie's stick can only touch a puck on the ice when he holds it out to the side, so a poke straight up or down the ice, the way he usually faces, never reaches it. The poke's stick also reaches only about 2 units around its tip. With this on, while poking his stick reaches the ice, about 6 units around its tip (as far as a skater's steal reaches), whichever way he faces, and knocks the puck loose, as a sideways poke already can; it still cannot knock down a raised shot, and his stance and stick saves are as before. It also fixes a poke straight up the ice, which in the original game never reaches full stretch (his facing is left unlocked, so he stands up again at once). Computer goalies poke too. Read from the game's code by the NHL94 Match Viewer project and tested in the game, the poke straight up the ice included.",
  freeBurst:
    'A C-button speed burst costs no energy with line changes on, where the original costs 204 of 4096. Read from the game\'s code by the NHL94 Match Viewer project and tested in the game.',
  noPenaltyShots: 'A foul on a breakaway is called as an ordinary penalty, never a penalty shot.',
  noGoalPosts: 'A puck that reaches the net between the posts is always a goal: it never rings off the post or the crossbar.',
  skipEaIntro: 'Starts the game without the EA logo.',
  skipPucksIntro: 'Starts the game without the flying pucks.',
  extraAttackerFix:
    "In Edit Lines, picking a line's extra attacker for one of its positions puts him in both places and drops the player he replaced from the line, so the line has one skater too few. With the fix the two swap, as they do for any other move within the line. This is McMarkis's fix from NHL94SNESVault, in NOSE4Web's version, which also covers the penalty-kill lines, where the Vault's never finds the extra attacker (found by the NHL94 Match Viewer project, and tested in the game by them on the original game, the penalty-kill lines included). Also on McMarkis's SA-1 and 32-team builds, found there by the code around it (tested in the game on them by the NHL94 Match Viewer project).",
  yButtonFix:
    'A skater who has been knocked down, or is falling into the boards, being held or in any other move that locks him, can still hook or hold with Y, where every other button does nothing until he is free. With the fix Y waits too. (NHL94SNESVault has a fix for a skater knocked down; this covers every locked move.) Players are used to the original, so it is not among the recommended fixes.',
  comebackFix:
    'A team tied or behind late in the third period is meant to get a bonus (+2 Offensive Awareness, +2 Checking and more passing and shooting), but the clock test is the wrong way round, so it comes in the first half of the period and not the second. This makes it come when it should. Overtime is not affected. As on the Genesis; found by the NHL94 Match Viewer project and tested in the game.',
  awarenessFix:
    "An option. A computer skater decides what to do next at intervals set by his awareness: Offensive Awareness when his team has the puck, Defensive when it does not. But computer wingers and centres on offence use their Defensive Awareness, a slip in the game's code. With this on they use Offensive. A small change. As on the Genesis; found by the NHL94 Match Viewer project and tested in the game.",
  secondAssist:
    "The game credits a goal's assists to the last two other players of the scoring team to touch the puck, but when the scorer touched it twice among them, as in a give-and-go (C passes to A, A to B, B back to A, who scores), it drops C's assist and credits only B. With the fix C gets the second assist, as on the Genesis. Found by the NHL94 Match Viewer project and tested in the game.",
  regainAssist:
    "When a player loses the puck to an opponent, wins it back himself, and passes to a teammate who scores, the original game loses his assist: a flag left from before the opponent's touch makes the scorer take his place among the last players to touch the puck. This clears the flag when he wins it back, so he keeps his place and gets the assist. About 1 goal in 29 in recorded games. Found by the NHL94 Match Viewer project and tested in the game; it goes with the second-assist fix or without it, in every build, and is among the recommended fixes.",
  stickShots:
    "A hard shot the goalie knocks away with his stick or glove, too fast for him to catch, is not counted as a shot on goal in the original game, only one he catches or stops with his body is, so those go missing from the totals. With this on they count once, for the shooter and his team and against the goalie. On the SNES this covers hard high shots off his stick or glove as well as low ones, more than on the Genesis: up to about 4 more shots on goal a game. Only the statistics change. Found by the NHL94 Match Viewer project and tested in the game.",
  bodychecks:
    "Counts each player's bodychecks during a game: the checks he gives and the checks he takes. The game itself only counts each team's. A check counts as the game's own team count does: one that knocks a player down while the clock runs. McMarkis's PlayerStat_BodyChecks from NHL94SNESVault, byte for byte, so the counts are where nhl94online.com reads them from save states (for leagues on the updated NHL94 Classic ROM and those built on it), and NHL94_Classic and SDL16 show up as having it. They are left where the Vault has them for that reason, though they sit in the room of the penalty summary's 21st to 47th entries, so in a game with more than 20 penalties the two get mixed up: later penalties change the counts, and checks change those penalties in the summary. Found by the code around it; not offered on the 2 MB builds, which count each player's checks themselves. Tested in the game by the NHL94 Match Viewer project: each check counts once for the checker and once for the player hit, and the counts start at 0 each game.",
  bodychecksShown:
    "Player Stats shows each player's checks given as Cf in place of penalty minutes (PM), and the sort title says Checks. It needs the counts, which turn on with it. McMarkis's PlayerStat_BodyChecks_Display from NHL94SNESVault, in NOSE4Web's version: sorting by that column sorts by the checks, where the Vault's still sorts by penalty minutes. Penalty minutes are still counted, and the team stats and penalty summary are as before. Tested in the game by the NHL94 Match Viewer project: Cf matches each player's count and sorting by it orders by it.",
  penaltyShotFixes:
    'A penalty shot whistled dead because the net was knocked off, or because the loose puck stopped moving for two seconds, is taken all over again, from the side, as the original game leaves it pending. With the fix those whistles end the penalty shot, as a goal or the puck hitting the boards does, and play goes on to a faceoff.',
  forwardsAndDefence:
    "The game's own Edit Lines offers only forwards for the forward positions and only defencemen for the defence. With this on it lists every skater for every position, so players can put a forward on the point of a power play or a defenceman up front, and picking someone already on the line swaps the two, the extra attacker included. A player plays the position the line gives him. It needs the extra attacker fix, which turns on with it. NOSE4Web's own line editor offers any skater at any position in a ROM that has it. McMarkis's hack from NHL94SNESVault, tested in the game with the NHL94 Match Viewer project. Also on McMarkis's SA-1 and 32-team builds, found there by the code around it (tested in the game on them by the NHL94 Match Viewer project).",
  showMaxBoost:
    "For a ROM that keeps the hot and cold bug. The bug puts about half of every player's ratings at the maximum in play, but Edit Lines and the team roster go on showing the value the game works out for display, so players cannot see who is really boosted. With this on they show such a rating as 100, as it plays; the overall shown does not change. It changes only what is shown, and cannot be on with the hot and cold bug fix, which removes the boost; turning either on turns the other off. McMarkis's hack from NHL94SNESVault, tested in the game with the NHL94 Match Viewer project, in NOSE4Web's version: it reads the stored hot or cold value, as play does, so it also catches the cold value of -1 the Vault's misses (about 1 rating in 28). Also on McMarkis's SA-1 and 32-team builds, found there by the code around it (tested in the game on them by the NHL94 Match Viewer project).",
  manualPullGoalie:
    "During play, a player can press L and R together to pull his goalie for an extra attacker, and again to put him back, with a beep each time; he stays out through faceoffs until put back. Each press of L and R together (and nothing else) counts once, however short or long, and the goalie comes off or back within about half a second. It does nothing between whistles, while the game has the goalie out for a delayed penalty, or while the backup goalie is in net. With both players on one team, player 1 has it. McMarkis's hack from NHL94SNESVault, tested in the game with the NHL94 Match Viewer project, in NOSE4Web's version: the Vault's reads the buttons only every half second, so a quick tap was often missed and a long hold could pull the goalie and put him straight back. Also on McMarkis's SA-1 and 32-team builds, found there by the code around it (tested in the game on them by the NHL94 Match Viewer project).",
  hitEnergy:
    "An option, from a community idea: a skater knocked down by a check or a poke check loses this much energy, so he is slower, shoots softer and loses puck battles more until he rests on the bench. 0 is the original game, where a hit costs the skater nothing. Only with line changes on, where the game's energy counts at all. Full energy is 4096 units; a burst of speed costs 204. Recommended: 204 (5%), what a burst costs, about 38 seconds of skating. Measured over computer games, it tires the most-hit players noticeably (their lowest energy about a tenth lower) while the average skater is hardly touched; people hit about twice as often; half as much was measured as too small to notice. Up to 4096, all of a skater's energy, for a league that wants hits to wear players down; Energy from hits only, below, makes skating and speed bursts free and a knockdown cost a third. On the SNES a skater with no energy keeps more of his speed than on the Genesis (his speed rating is halved, not lost); Match Viewer measured an average skater 8%, 14% and 22% slower after one, two and three knockdowns of 1365. A knockdown by the puck, a bump that does not knock him down, or a hit after the whistle costs nothing. As on the Genesis; read from the game's code by the NHL94 Match Viewer project, which measured the shifts and tested it in the game, in the original and McMarkis's SA-1 build: each knockdown and hold takes its amount once, and nothing with line changes Off. As the game's own energy drain, Automatic line changes count as on here (on the Genesis they do not). Found by the code around it, so it goes into every build.",
  holdEnergy:
    'The same for a skater caught by a hold or hook (Y), once each time it catches him in play. Recommended: 102 (2.5%), half a knockdown\'s. Only with line changes on.',
  injuryBonus:
    "An option, the other half of the community idea: each knockdown a skater takes makes a later injury a little more likely, and half of it wears off at each intermission. 0 is the original game. Only the few hits that can injure in the original game are affected (a puck carrier knocked onto his back while facing straight up or down the ice, with the clock running), so injuries stay rare: the game rolls 0 to 298 against the hit's impact, and this adds the number to the impact for each knockdown the skater has taken this game, the one being rolled for included, counting up to five. Recommended: 6, the Genesis's recommended effect: estimated from recorded SNES league games at about 27% more injuries a game, with the skaters knocked down most (5 times or more) about 1.35 times as likely to be hurt; each 1 more adds about 5% (19 comes to about 87% and 2.1 times). The estimates are indicative only, as those games had no injuries to check them against. Knockdowns in play are counted, with line changes on or off; those after the whistle are not. Also on McMarkis's SA-1 and 32-team builds, the counts kept where those builds have room (tested in the game there too). Read from the game's code by the NHL94 Match Viewer project and tested in the game: each knockdown counts once, the counts start at 0 each game and halve at each intermission, and only hits that can already injure become likelier to.",
  fourthPeriodOvertime:
    "An option. A regular-season game played on the menu's fourth period length gets 99 minutes of overtime, about as good as no limit, which can save a league a separate playoff ROM. The fourth length is the one the 30-second periods hack offers, so that turns on with this; set its length and menu text with the others on the Game settings page (for example 5:00, \"5 Minutes, 99 Min OT\"). The other lengths keep the Clock's overtime, and playoff overtime stays as long as a period, as in the original game. McMarkis's Genesis patch, made for the SNES as NOSE4Web's Genesis option has it. Found by the code that sets the clock, so it goes into every build. Tested in the game by the NHL94 Match Viewer project, on the original and McMarkis's SA-1 build: 99:00 in the regular season on the fourth length, 5:00 otherwise and in the playoffs, and a tied game ends at 0:00.",
  faceoffFix:
    "Faceoffs as today's NHL rules have them. Only since 2007 has the NHL held every faceoff on one of the nine dots; before that a faceoff was often held where play stopped, and the game follows that older way, putting one on a dot only when play stops past the hash marks. With this on, every faceoff is on a dot: after a goal at centre; after a penalty in the offending team's own end, at the dot on the side the puck was; otherwise past a blue line at that end's dot on the puck's side, and in the neutral zone at the nearest neutral-zone dot. Leave it off to keep the game's own 1990s-style faceoffs. Worked out with the NHL94 Match Viewer project, from today's NHL rulebook.",
}

// What NOSE4Web's version of a hack does better than NHL94SNESVault's.
const VAULT_VERSION_NOTE: Partial<Record<SnesHack, string>> = {
  seasonShootout: "NOSE4Web's of the morning of 12 November 2026 did not keep the 2 MB builds' own checks, posts and time on ice through the shootout (they came back as 0); this one does.",
  bodychecksShown: "NHL94SNESVault's shows the checks but still sorts that column by penalty minutes; NOSE4Web's sorts it by the checks.",
  hitEnergy: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle, which the game itself never lets injure; this one counts only hits in play.",
  holdEnergy: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle, which the game itself never lets injure; this one counts only hits in play.",
  injuryBonus: "NOSE4Web's first version (9 November 2026) also counted hits after the whistle, which the game itself never lets injure; this one counts only hits in play.",
  extraAttackerFix: "NHL94SNESVault's, on the penalty-kill lines, never finds the extra attacker, so picking him there still puts him on the line twice; NOSE4Web's covers every line. NOSE4Web's own fix was the Vault's before 9 November 2026.",
  showMaxBoost: "NHL94SNESVault's misses about 1 boosted rating in 28 (a cold value of -1), which NOSE4Web's shows as 100 too.",
  manualPullGoalie: "NHL94SNESVault's reads the buttons only about every half second, so a quick tap is often missed and a long hold can pull the goalie and put him straight back, and NOSE4Web's of the morning of 9 November 2026 can act on a press made in a short pause once play resumes; NOSE4Web's now acts once on each press made in play.",
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
    return "Made for ROMs laid out like the original game. This build's game code is elsewhere (as in McMarkis's SA-1 and 32-team builds), so it is not offered here."
  }
  return 'This ROM has something else in its place, so it is left exactly as it is.'
}

const sameChoices = (a: SnesHackChoices, b: SnesHackChoices) => SNES_HACKS.every((hack) => a[hack] === b[hack])

export function SnesHacksPage({ project, name, onChange }: Props) {
  const state = useMemo(() => detectSnesHacks(project.bytes), [project.bytes])
  const notHere = (hack: SnesHack) => whyNotHere(project, hack)
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
      <p className="note">
        Changes to the SNES game itself. They come from the patches of the community's disassembly of the game,{' '}
        <a href="https://github.com/Mhopkinsinc/NHL94SNESVault" target="_blank" rel="noreferrer">
          NHL94SNESVault
        </a>
        , and from the NHL94 Match Viewer project, which found many of the bugs in the game's code and tests hacks in
        the game; each hack's note says whose it is. The page shows what this ROM has now. Change what you like and
        press Apply; nothing is changed until you do. Test a hacked ROM in a game before a league plays on it.
      </p>
      <HackSectionLinks groups={GROUPS} />
      <HackShortcuts
        onRecommended={
          !sameChoices(withRecommendedSnesFixes(wanted, state.unknown), wanted) &&
          (() => {
            setDraft({ rom: project.bytes, choices: withRecommendedSnesFixes(wanted, state.unknown), amounts: wantedAmounts })
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
                {hack === 'threeOnThree' ? (
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
                        <input
                          type="number"
                          aria-label="Fighting rating bonus"
                          disabled={unknown}
                          min={SNES_AMOUNT_RANGES.fighting[0]}
                          max={SNES_AMOUNT_RANGES.fighting[1]}
                          value={wantedAmounts.fighting}
                          onChange={(e) => setAmount('fighting', Math.max(SNES_AMOUNT_RANGES.fighting[0], Math.min(SNES_AMOUNT_RANGES.fighting[1], Math.round(Number(e.target.value) || 0))))}
                        />{' '}
                        <span className="note">on every player's fighting rating.</span>{' '}
                        <button type="button" disabled={unknown || wantedAmounts.fighting === SNES_FIGHT_BONUS_DEFAULT} onClick={() => setAmount('fighting', SNES_FIGHT_BONUS_DEFAULT)}>
                          Use the default {SNES_FIGHT_BONUS_DEFAULT}
                        </button>
                      </>
                    )}
                  </label>
                ) : isAmount(hack) ? (
                  <label>
                    <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                    <input
                      type="number"
                      aria-label={SNES_HACK_TITLES[hack]}
                      disabled={unknown}
                      min={SNES_AMOUNT_RANGES[hack][0]}
                      max={SNES_AMOUNT_RANGES[hack][1]}
                      value={wantedAmounts[hack]}
                      onChange={(e) => setAmount(hack, Math.max(SNES_AMOUNT_RANGES[hack][0], Math.min(SNES_AMOUNT_RANGES[hack][1], Math.round(Number(e.target.value) || 0))))}
                    />{' '}
                    <span className="note">{amountText(hack, wantedAmounts[hack])}</span>{' '}
                    <button type="button" disabled={unknown || wantedAmounts[hack] === RECOMMENDED_AMOUNTS[hack]} onClick={() => setAmount(hack, RECOMMENDED_AMOUNTS[hack])}>
                      {hack === 'penaltyTime' ? 'Use the original 60' : hack === 'fightTime' ? 'Use 5:00' : `Use the recommended ${RECOMMENDED_AMOUNTS[hack]}`}
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
                <p className="note">
                  {ABOUT[hack]}
                  {unknown && <b> {notHere(hack)}</b>}
                </p>
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
                Players get it back on the bench as usual. Then Apply. The energy costs were tested in the game by the NHL94 Match Viewer project; with the original's speed an average skater was 8%, 14% and 22% slower after one, two and three knockdowns, which is why energy now takes all of his speed (about 14%, 29% and 43%, also tested in the game). Over 12 computer games against the original: as many line changes, the average skater on the ice as fresh, about a third more knockdowns, and about one skater a game emptied; the computer then often leaves him on the ice, for up to two minutes of game time.
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
      <section id="hacks-apply">
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
