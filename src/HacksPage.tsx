import { useMemo, useState, type ReactNode } from 'react'
import { HitsTable } from './HitsTable'
import { WEIGHT_BASES } from './core/attributes'
import { clockTime, penaltyLengths } from './core/penaltytime'
import { FIGHT_TEXTS, type FightChoice } from './core/fight'
import type { SeasonTies } from './core/hacks'
import {
  applyHacks,
  baseWeightForYear,
  BONUS_TEXTS,
  detectHacks,
  HACK_PARTS,
  HACK_RANGES,
  HACK_TITLES,
  hackChanges,
  hacksCopiedFrom,
  hacksForDiscord,
  withRecommendedFixes,
  menuLineChanges,
  BCHECK_TEXTS,
  INJURY_TEXTS,
  hacksSupported,
  holdSeconds,
  NO_HACKS,
  sameHacks,
  STAR_TEXTS,
  type Bodychecks,
  type CheckFix,
  type Bonuses,
  type HackChoices,
  type BCheckPenaltiesOff,
  type PuckColours,
  type Injuries,
  THREE_ON_THREE_TEXTS,
  type ThreeOnThree,
  type ThreeStars,
  type WeightFix,
  fewerSkaterLinesFor,
  fewerSkaterLinesText,
  FULL_ENERGY,
  HITS_ONLY,
  RECOMMENDED_HIT_ENERGY,
  RECOMMENDED_HOLD_ENERGY,
  RECOMMENDED_INJURY_BONUS,
  RECOMMENDED_INJURY_CAP,
} from './core/hacks'
import { emptyLineSlots } from './core/lines'
import type { RomProject } from './core/rom'
import { CopyHacksButton } from './CopyHacksButton'
import { NumberBox } from './NumberBox'
import { HackShortcuts } from './HackShortcuts'
import { genesisHackSheet, genesisHackSummary, hackSheetDiscord, hackSheetHtml, pictureItems, withPictures } from './core/hacksheet'

interface Props {
  project: RomProject
  // The ROM's name, for the Discord post.
  name: string
  onChange: (project: RomProject) => void
}


// An energy amount as units and as a share of full energy.
const energyShare = (units: number) =>
  units === 0 ? 'none taken' : `${units} units is ${Math.round((units / FULL_ENERGY) * 1000) / 10}% of full energy`

const PUCK_TEXTS: Record<PuckColours, string> = {
  rink: "The rink's, as the original game",
  crowd: "The crowd's",
  home: "The home team's",
  away: "The visitors'",
}

const capital = (text: string) => text[0].toUpperCase() + text.slice(1)
// What each choice of bonuses means where it shows: in play, and in the
// ratings on the Edit Lines screen.
const BONUS_EFFECTS: Record<Bonuses, { ice: string; lines: string; more: string }> = {
  original: {
    ice: 'each player is hot or cold in everything at once.',
    lines: 'ratings with a different set of bonuses, one for each attribute, so they do not tell you who is hot.',
    more: 'You have to feel who is hot.',
  },
  disabled: {
    ice: 'no bonuses. Every player plays to his ratings every game.',
    lines: 'the plain ratings.',
    more: 'This suits a league that wants an even contest.',
  },
  hidden: {
    ice: 'each player is hot or cold in everything at once, as in the original game.',
    lines: 'the plain ratings.',
    more: 'Nothing misleads you, but nothing tells you who is hot either.',
  },
  playersMatchLines: {
    ice: 'each player gets the bonuses Edit Lines shows, one for each attribute, so he can be hot in one and cold in another.',
    lines: 'the bonuses the players really have.',
    more: 'What you see is what you get.',
  },
  linesMatchPlayers: {
    ice: 'each player is hot or cold in everything at once, as in the original game.',
    lines: 'the bonus each player really has, the same on every attribute.',
    more: 'What you see is what you get.',
  },
}

type NumberKey = keyof typeof HACK_RANGES

export function HacksPage({ project, name, onChange }: Props) {
  const state = useMemo(() => detectHacks(project.bytes), [project.bytes])
  // The choices being made, which start again from the ROM whenever it changes.
  const [draft, setDraft] = useState({ rom: project.bytes, choices: state.choices })
  if (draft.rom !== project.bytes) setDraft({ rom: project.bytes, choices: state.choices })
  const wanted = draft.rom === project.bytes ? draft.choices : state.choices
  const [year, setYear] = useState('')
  // Counts the times the choices were set back, so that the number boxes show them afresh.
  const [setBack, setSetBack] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  // What could not be copied from another ROM's hacks, if they were.
  const [notCopied, setNotCopied] = useState<string[]>([])

  // smozROM's code for "Edit Lines matches players" with 0 to 15 ratings looks
  // mistaken, so that pairing can be kept where a ROM has it but not made.
  const suspect = (choices: HackChoices) =>
    choices.wideRatings && choices.bonuses === 'linesMatchPlayers' && !(state.choices.wideRatings && state.choices.bonuses === 'linesMatchPlayers')
  const set = (change: Partial<HackChoices>) => {
    // Ron Barr picks one way or the other, not both.
    const barr = change.barrPick ? { barrCoin: false } : change.barrCoin ? { barrPick: false } : {}
    const next = { ...wanted, ...change, ...barr }
    setDraft({ rom: project.bytes, choices: suspect(next) ? { ...next, bonuses: 'original' } : next })
    setNotice(suspect(next) ? `The bonuses were set back to the original game's, since "Edit Lines matches players" is not offered with 0 to 15 ratings.` : '')
    setError('')
  }
  const unknown = (key: keyof HackChoices) => state.unknown.includes(HACK_PARTS[key])
  const changes = hackChanges(state.choices, wanted, state.unknown)
  const rescaled = !unknown('wideRatings') && wanted.wideRatings !== state.choices.wideRatings
  const reweighed = !unknown('baseWeight') && wanted.baseWeight !== state.choices.baseWeight
  const suggested = /^\d{4}$/.test(year.trim()) ? baseWeightForYear(Number(year)) : null

  // One hack: its name, the control that sets it, and what it does.
  const hack = (key: keyof HackChoices, control: ReactNode, about: ReactNode, beside?: ReactNode) => (
    <div className="hack">
      <label>
        <b>{HACK_TITLES[key]}</b> {control}
      </label>
      {beside}
      <p className="summary">
        {genesisHackSummary(key)}
        {unknown(key) && (
          <b> This ROM has its own changes here, which the editor does not recognise, so this is left exactly as it is.</b>
        )}
      </p>
      <details className="more">
        <summary>More about it</summary>
        <p className="note">{about}</p>
      </details>
    </div>
  )
  const number = (key: NumberKey, perUnit = 1) => (
    <NumberBox label={HACK_TITLES[key]} value={wanted[key]} range={HACK_RANGES[key]} perUnit={perUnit} key={setBack} fresh={project.bytes} disabled={unknown(key)} onChange={(value) => set({ [key]: value })} />
  )
  // "The original game has 150", with what this ROM has if that is different.
  const stock = (key: NumberKey) =>
    `The original game has ${NO_HACKS[key]}${!unknown(key) && state.choices[key] !== NO_HACKS[key] ? `, and this ROM has ${state.choices[key]}` : ''}.`
  const onOff = (key: 'clutchTime' | 'choppyIce' | 'nhlShootout' | 'timeOnIce' | 'secondAssist' | 'oneTimerAssist' | 'regainAssist' | 'plusMinus' | 'aggressionFix' | 'ppPkFix' | 'comebackFix' | 'passFix' | 'openNetFix' | 'repeatCheckFix' | 'faceoffFix' | 'runawayFix' | 'penaltyShotTableFix' | 'penaltyShotFixes' | 'goaliePullFix' | 'blindRingFix' | 'snipingFix' | 'awarenessFix' | 'crowdFix' | 'stickShots' | 'stamina' | 'realTime' | 'noIcing' | 'hybridIcing' | 'shootoutInjuries' | 'delayedCalls' | 'greenFan' | 'barrPick' | 'barrCoin' | 'anyPosition' | 'noSkatingDrain' | 'headBleeding' | 'giveaways' | 'organResume') => (
    <select aria-label={HACK_TITLES[key]} disabled={unknown(key)} value={wanted[key] ? 'on' : 'off'} onChange={(e) => set({ [key]: e.target.value === 'on' })}>
      <option value="off">Off</option>
      <option value="on">On</option>
    </select>
  )

  function apply() {
    try {
      onChange(applyHacks(project, wanted))
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
        <b>How this page works:</b> choose the hacks you want, then press <b>Apply</b> at the very bottom of the page.
        Nothing in the ROM changes until you do. The list just above Apply shows exactly what will change, and Undo
        takes it all back.
      </p>
      <p className="note">
        Changes to the game itself: bug fixes, extra statistics, finer ratings, rules, and how it plays. They come
        from smozoma's program{' '}
        <a href="https://github.com/nhl94dotcom/smozROM" target="_blank" rel="noreferrer">
          smozROM
        </a>{' '}
        (built in here with his permission), from members of the NHL94 forums, from the NHL94 Match Viewer project,
        which found many of the game's bugs and tests hacks in the game, and from chaos's fighting patch; each hack's
        note says whose it is, and Help names everyone. The page shows what this ROM has now. Many of the settings
        under Energy, Goalies and Skating are the game's own numbers, in its own units, so change them a little at a
        time and try the result in a game. Test a hacked ROM in a game before a league plays on it.
      </p>
      <HackShortcuts
        onRecommended={
          !sameHacks(withRecommendedFixes(wanted, state.unknown, menuLineChanges(project.settings.menu)), wanted) &&
          (() => {
            set(withRecommendedFixes(wanted, state.unknown, menuLineChanges(project.settings.menu)))
            setSetBack(setBack + 1)
          })
        }
        discordText={() => hacksForDiscord(state, name, pictureItems(project).map((item) => `- **${item.title}**`))}
        discordMessages={() => hackSheetDiscord(withPictures(genesisHackSheet(state, name), project))}
        sheet={() => hackSheetHtml(withPictures(genesisHackSheet(state, name), project))}
        name={name}
      />

      <section id="hacks-fixes">
        <h3>Fixes</h3>
        {hack(
          'checkFix',
          <select aria-label={HACK_TITLES.checkFix} disabled={unknown('checkFix')} value={wanted.checkFix} onChange={(e) => set({ checkFix: e.target.value as CheckFix })}>
            <option value="off">Off</option>
            <option value="all120">Everyone checks as the computer</option>
            {state.choices.checkFix === 'all240' && <option value="all240">Keep this ROM's earlier fix: everyone checks as a person</option>}
          </select>,
          <>
            <b>The fix for the weight bug.</b> In the original game a light skater you control knocks down anyone two
            or more weight steps heavier, and a heavy one struggles: the game works out a check one way when a person
            controls the checker and another when the computer does, and gets the person's way wrong. Pressing C to
            charge and then B to switch away just before the hit hands the check to the computer: the C-then-B check.
            This fix, found by the NHL94 Match Viewer project, judges every check the computer's way: the heavier
            checker does better, as he should, and switching away gains nothing. Your checks against players your own
            weight or lighter get easier than they were. Leave smozoma's legacy weight bug fix, under Legacy hacks
            below, off with it.
            {state.choices.checkFix === 'all240' &&
              " This ROM has the editor's earlier C-then-B fix, which judges every check the person's way, so the computer's checkers get the weight bug too."}
          </>,
        )}
        {hack(
          'secondAssist',
          onOff('secondAssist'),
          'When two players pass back and forth and then one scores, the original game gives no assist to the player who passed to them. This gives it.',
        )}
        {hack(
          'oneTimerAssist',
          onOff('oneTimerAssist'),
          "Among the recommended fixes. When a shooter's stick touches a pass without catching it and he then one-times the puck in, the original game gives the goal no assist (about 1 one-timer goal in 24). With this fix the passer and the player before him get their assists. Ordinary one-timers are unchanged. It works with or without the second-assist fix. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
        )}
        {hack(
          'regainAssist',
          onOff('regainAssist'),
          "Among the recommended fixes. When a player loses the puck to an opponent, wins it back himself and passes to a teammate who scores, the original game gives him no assist (about 1 goal in 34). With this fix he gets it. It works with or without the second-assist and one-timer assist fixes. Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
        )}
        {hack(
          'aggressionFix',
          onOff('aggressionFix'),
          <>
            In the original game a player's Aggression rating does not work in order: a 4 plays like a 1, and a 6 or a
            3 takes the most penalties. With this fix it rises with the rating, so a 6 takes the most penalties and a 0
            the fewest. Players rated 4 to 6 will take more penalties than they do now. For goalies the same rating is
            GvL, the glove rating: with the fix a goalie needs about 5 for the reaching glove save, where now it jumps
            about with the rating (a 3 can make it and a 4 cannot).
          </>,
        )}
        {hack(
          'ppPkFix',
          onOff('ppPkFix'),
          <>
            A team's power play rating is meant to lift some of its players' ratings on the power play, and its
            penalty kill rating to come off them on the penalty kill, but the original game mixes the two up. The
            original rosters were made for the intended way, so in play Anaheim, meant to be weak at both, has the best
            power play and penalty kill. With this fix the game uses them as intended, so rosters play as their makers
            meant, and the team page shows the two that way round too. A league that set these ratings by what the
            editor showed before the fix should check them after turning it on.
          </>,
        )}
        {hack(
          'comebackFix',
          onOff('comebackFix'),
          <>
            A team tied or behind in the third period gets a small boost to Offensive Awareness, Checking and how
            readily its computer players shoot. The original game checks the clock the wrong way round, so the boost
            comes in the first half of the period and goes for the second. This gives it in the second half, as
            meant. Overtime is unchanged: both teams have it throughout.
          </>,
        )}
        {hack(
          'openNetFix',
          onOff('openNetFix'),
          <>
            The game aims a one-timer itself, whatever the d-pad says. When the goalie is out of position, after a
            dive or skating out, it aims high under the crossbar, and from close in about 4 in 10 of those one-timers
            at an open net go over or off the bar. With this fix they are aimed at the middle of the net at mid-height,
            as the game already does with the goalie pulled, and many more of them go in. Computer players' shots,
            aimed the same way, get the same aim. One-timers with the goalie in position are unchanged. Genesis only:
            the SNES game lets one-timers follow the stick. Found by the NHL94 Match Viewer project. Tested in the game
            by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'repeatCheckFix',
          onOff('repeatCheckFix'),
          <>
            After a player knocks someone down or makes him wobble, the original game ignores every later hit by the
            same player on the same man until some other hit lands anywhere on the ice, however long that takes: you
            can line him up again a minute later and nothing happens. With this fix the same checker is kept off him
            only while he recovers, about 2 seconds after a knockdown and 1 after a wobble, so he cannot be flattened
            again as he gets up; after that a check works as any other. Genesis only: the SNES game has no such block.
            Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'passFix',
          onOff('passFix'),
          <>
            Now and then in the original game a pass goes nearly twice as fast as the passer's rating allows: the
            rocket pass, mostly to a teammate skating towards the passer 17 to 23 feet away. And a pass to a teammate
            skating away close by is sometimes fired at him almost at once. Both come from rough timing in how the game
            works out a pass. With this fix every pass goes at the speed its Passing rating sets; how high a pass lifts
            is unchanged. Passing will feel different to players used to the rocket pass, and a receiver catches more
            of the passes that used to bounce off his stick. Found and measured by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'faceoffFix',
          onOff('faceoffFix'),
          <>
            Faceoffs as today's NHL holds them, always on one of the nine dots, as it has since 2007. The original game
            follows the older way: unless play stops past the hash marks, it holds the faceoff where the puck was,
            often in the open ice between the dots (about 1 faceoff in 8, mostly after penalties). With this on, every
            faceoff is on a dot: after a goal at centre; after a penalty in the offending team's own end, at the dot on
            the puck's side; otherwise, past a blue line, at that end's dot on the puck's side, and in the neutral zone
            at the nearest neutral-zone dot. A puck shot out of play is faced off by where the player who last touched
            it stood. When both teams take penalties the faceoff still moves out to the neutral zone. Leave it off to
            keep the game's own 1990s-style faceoffs. Worked out with the NHL94 Match Viewer project, from today's NHL
            rulebook.
          </>,
        )}
        {hack(
          'runawayFix',
          onOff('runawayFix'),
          <>
            Now and then a skater you control shoots off far past top speed and slides out of control for a second or
            two, usually racing back on defence. The game lets a computer skater glide onto a pass, and a player
            knocked into the boards slide, by letting him barely slow down. Three things leave that gliding on: taking
            over a skater while a pass is coming to him, getting up after a fall into the boards, and a one-timer that
            misses the puck. Each speed burst then adds to the last, and he runs away. With this fix he skates normally
            once he is yours, back on his feet, or done with the one-timer. Computer skaters still glide onto passes,
            and a one-timer still glides while it is being taken. Taking over a skater with a pass coming, you now
            steer him onto it yourself. Found by the NHL94 Match Viewer project, which recorded the runaways.
          </>,
        )}
        {hack(
          'penaltyShotTableFix',
          onOff('penaltyShotTableFix'),
          <>
            A foul on a skater on a breakaway can give a penalty shot, but the original game calls every penalty shot
            for the wrong foul, the next one along its list: charging is announced and recorded as slashing, slashing
            as roughing, and so on, hooking and tripping included. With this fix each penalty shot is called for its
            own foul. Which fouls give penalty shots does not change: holding gives none, as the game has no penalty
            shot for it, and interference is never called on the puck carrier.
          </>,
        )}
        {hack(
          'penaltyShotFixes',
          onOff('penaltyShotFixes'),
          <>
            Two penalty shot bugs. A penalty shot stopped by an unusual whistle, such as the puck going over the glass
            or the net being knocked off, is taken all over again; with the fix the game goes on to a faceoff instead.
            And a puck shot over the glass just after the penalty shot was awarded can come into the shot unable to
            touch anything, floating through the net and the boards (the "ghost puck"); with the fix it plays
            normally. Found by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'snipingFix',
          onOff('snipingFix'),
          <>
            An option, a matter of taste: some leagues like it as it is. Whenever a team's own goalie is off the ice
            (on a delayed penalty, or pulled late in a game by a person or the computer), the original game makes every
            one of that team's shots from within range go exactly where it is aimed, whatever the shooter's Shot
            Accuracy. With the fix those shots are as accurate as any other (at Shot Accuracy 15, exactly on target
            about half the time). Shots at an empty net are not affected. Found by the NHL94 Match Viewer project.
            Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'goaliePullFix',
          onOff('goaliePullFix'),
          <>
            In the last minute of the third period the computer pulls its goalie for an extra attacker, but only when it
            is exactly two goals behind, never when one goal down, which looks like a slip by the game's makers. With
            this on it pulls him when one or two goals behind, as a real coach would. This changes how the computer
            plays late in close games. While its goalie is out, the computer's shots within range go exactly where
            they are aimed, as anyone's do with the goalie pulled, unless the pulled-goalie sniping fix is on too.
            Found by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'blindRingFix',
          onOff('blindRingFix'),
          <>
            An option, a matter of taste. When a goalie drops into the butterfly or makes some kick saves, his stick
            moves aside, leaving a small blind spot just past his blade where a flat puck touches neither his stick nor
            his body and slides through his legs. With this on, his body stops such a puck as it would anywhere else.
            A small change overall, but it falls on five-hole goals: 3 of the 218 in recorded games.
            Measured by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'awarenessFix',
          onOff('awarenessFix'),
          <>
            Among the recommended fixes. How often a computer skater rethinks what to do is set by his awareness:
            Offensive Awareness when his team has the puck, Defensive when it does not. But in the original game
            computer wingers and centres on offence use their Defensive Awareness by mistake. With this on they use
            Offensive. A small change: for most players the difference is a tiny fraction of a second. Found by the
            NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'crowdFix',
          onOff('crowdFix'),
          <>
            An option. The game is meant to give skaters a crowd bonus (+2 Agility and +2 Speed, a boost chasing the
            puck, more reach for the goalie's body) only while the crowd meter is past its record, but in the original
            game it is on all the time. With this on it comes and goes with the meter, which is past its record about
            three quarters of the time, so skaters are a little slower in the quiet spells (about 5% off top speed).
            Found by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
      </section>

      <section id="hacks-statistics">
        <h3>Statistics</h3>
        {hack(
          'stickShots',
          onOff('stickShots'),
          <>
            A hard low shot that the goalie knocks away with his stick is a save, but the original game does not count
            it as a shot on goal: only a catch or a save with his body counts. So shots along the ice go missing from
            the totals, more so for the team attacking down the screen. With this on, each such shot counts once as a
            shot on goal for the shooter and his team and against the goalie: about 2 more shots on goal a game in
            league games. Only the statistics change; play, the crowd and everything else are as before. Found and
            built by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'bodychecks',
          <select aria-label={HACK_TITLES.bodychecks} disabled={unknown('bodychecks')} value={wanted.bodychecks} onChange={(e) => set({ bodychecks: e.target.value as Bodychecks })}>
            <option value="off">Off</option>
            {state.choices.bodychecks === 'earlier' && <option value="earlier">Keep this ROM's earlier version</option>}
            <option value="on">On</option>
          </select>,
          <>
            Counts each player's successful checks, and shows them in Player Stats as Chk, where penalty minutes
            were.
            {state.choices.bodychecks === 'earlier' && ' This ROM has an earlier version of the hack. On replaces it with the current one.'}
          </>,
        )}
        {hack(
          'plusMinus',
          onOff('plusMinus'),
          'Keeps a plus-minus for every player. The game does not show it; it is there to be read out of a save state by a league that tracks statistics.',
        )}
        {hack(
          'timeOnIce',
          onOff('timeOnIce'),
          "The game counts each player's time on ice but never shows it. This adds a Time On Ice page to Player Stats: press right past Penalty Minutes, and the players are sorted by their time on ice, each row showing goals, assists, points and the time, up to 99:59. Goalies' time shows too. The other pages are as before, and playoff stats are unchanged, as the game keeps no time on ice for the playoffs. With giveaways and takeaways on, Time On Ice comes after their two pages. As McMarkis's SNES builds show it. Tested in the game by the NHL94 Match Viewer project.",
        )}
        {hack(
          'giveaways',
          onOff('giveaways'),
          "Counts each player's giveaways and takeaways, the way the NHL94 Match Viewer project counts them: the puck going from one team to the other with no whistle between. A takeaway goes to the skater who won the puck with a stick steal or a check that knocked the carrier down; any other loss, such as a pass picked off or a puck run into the other team's goalie, is a giveaway for the player who lost it. Goalies get no takeaways. The count goes to the right player even when a line change or a penalty has put someone else in his spot before the loose puck is picked up. Shots, faceoff wins, passes between teammates and dump-ins the other goalie collects are not counted, nor anything in highlights or a shootout. Game Stats gets a new last row, Give/Takeaways, with each team's totals. Player Stats gets a page for each, after Penalty Minutes (or Checks For) and before Time On Ice, with the players sorted by giveaways (GV) or takeaways (TK); game stats only, as the game keeps nothing for the playoffs. The counts start again each game. Tested in the game by the NHL94 Match Viewer project. A pass at the net counts as a shot, not a giveaway, if the other team picks it up off the goalie or after it goes wide. Not yet tested in the game.",
        )}
        {hack(
          'threeStars',
          <select aria-label={HACK_TITLES.threeStars} disabled={unknown('threeStars')} value={wanted.threeStars} onChange={(e) => set({ threeStars: e.target.value as ThreeStars })}>
            {(Object.keys(STAR_TEXTS) as ThreeStars[]).map((choice) => (
              <option key={choice} value={choice}>
                {capital(STAR_TEXTS[choice])}
              </option>
            ))}
          </select>,
          <>
            The original game picks its three stars very simply. The improved way weighs goals, assists, shots and
            checks for skaters, and goals against, shots faced and shutouts for goalies. Choose it for how the ROM
            will mostly be played: skaters are given a little more with line changes on, when each plays less.
          </>,
        )}
      </section>

      <section id="hacks-ratings">
        <h3>Ratings</h3>
        {hack(
          'wideRatings',
          <select aria-label={HACK_TITLES.wideRatings} disabled={unknown('wideRatings')} value={wanted.wideRatings ? 'wide' : 'narrow'} onChange={(e) => set({ wideRatings: e.target.value === 'wide' })}>
            <option value="narrow">0 to 6, as the original game</option>
            <option value="wide">0 to 15</option>
          </select>,
          <>
            The original game rates each attribute from 0 to 6. This lets them run from 0 to 15, for finer
            differences between players, and brings overall rating formulas made for the new scale, which give more
            to the attributes that make or stop goals.
          </>,
        )}
        {hack(
          'baseWeight',
          <select aria-label={HACK_TITLES.baseWeight} disabled={unknown('baseWeight')} value={wanted.baseWeight} onChange={(e) => set({ baseWeight: Number(e.target.value) })}>
              {WEIGHT_BASES.map((base) => (
                <option key={base} value={base}>
                  {base} pounds{base === NO_HACKS.baseWeight ? ' (original)' : ''}
                </option>
              ))}
          </select>,
          <>
            A player's weight is one of sixteen steps of 8 pounds, counted up from this. Players have grown heavier
            over the years, so a ROM for another era starts the count elsewhere, to spread its players across the
            steps: from {wanted.baseWeight} to {wanted.baseWeight + 120} pounds as chosen. Give a season's year for
            the weight smozROM suggests for it.
          </>,
          <span className="by-year">
            or for the season of{' '}
            <input className="num" inputMode="numeric" aria-label="Season year" placeholder="year" value={year} onChange={(e) => setYear(e.target.value)} />{' '}
            <button disabled={suggested === null || unknown('baseWeight')} onClick={() => suggested !== null && set({ baseWeight: suggested })}>
              {suggested === null ? 'Use that season' : `Use ${suggested} pounds`}
            </button>
          </span>,
        )}
        {hack(
          'bonuses',
          <select aria-label={HACK_TITLES.bonuses} className="wide" disabled={unknown('bonuses')} value={wanted.bonuses} onChange={(e) => set({ bonuses: e.target.value as Bonuses })}>
            {(Object.keys(BONUS_TEXTS) as Bonuses[]).map((choice) => (
              <option
                key={choice}
                value={choice}
                disabled={suspect({ ...wanted, bonuses: choice })}
              >
                {capital(BONUS_TEXTS[choice])}
              </option>
            ))}
          </select>,
          <>
            Before each game, the game makes every player a little hot or cold: a small bonus or penalty on top of
            the ratings you set, which are not changed. It keeps two sets of these. One is used on the ice, where a
            player has a single bonus for all his attributes. The other is shown in Edit Lines, with a separate
            bonus for each attribute. The two do not agree, so in the original game Edit Lines misleads.
            <br />
            <b>With this choice, on the ice:</b> {BONUS_EFFECTS[wanted.bonuses].ice}
            <br />
            <b>In Edit Lines:</b> {BONUS_EFFECTS[wanted.bonuses].lines}
            <br />
            {BONUS_EFFECTS[wanted.bonuses].more} Whatever you choose, the announcer's pre-game ratings are not put right.
            {wanted.wideRatings && ' "Edit Lines matches players" is not offered with 0 to 15 ratings, where it looks not to work properly.'}
          </>,
        )}
        {hack(
          'hotColdRange',
          number('hotColdRange'),
          <>
            How hot or cold a player can be made before each game: anything from minus this number to one less than
            it, so the original 9 gives -9 to 8. A smaller number makes the swings smaller: 4 changes about half as
            many ratings in play as 9. At 2 or less hot and cold no longer changes how anyone plays, though Edit Lines
            and the player cards still show the small values; 0 makes them all 0. It goes with any of the hot and cold
            bonus choices above. From chaos's forum post. {stock('hotColdRange')} Tested in the game by the NHL94 Match
            Viewer project.
          </>,
        )}
        {hack(
          'clutchTime',
          onOff('clutchTime'),
          "An option, from a community idea: in the last 2:00 of the third period, with the score tied or within one goal, everyone on the ice, both teams and the goalies, plays half a rating point better at everything but Aggression, so the end of a close game is sharper. Not in overtime. A goal that opens a two-goal lead ends it at the next faceoff, and one that brings a game back within a goal starts it again there. Players already at the top of a rating gain nothing there. The 2:00 is the same at any period length, so with periods of 2:00 or shorter the whole third period is clutch time. Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
        )}
      </section>

      <section id="hacks-rules">
        <h3>Rules</h3>
        {hack(
          'seasonTies',
          <select aria-label={HACK_TITLES.seasonTies} className="wide" disabled={unknown('seasonTies')} value={wanted.seasonTies} onChange={(e) => set({ seasonTies: e.target.value as SeasonTies })}>
            <option value="tie">End in a tie (as the original game)</option>
            <option value="overtime">Overtime until a goal</option>
            <option value="shootout">A shootout after one overtime</option>
            <option value="shootoutNow">A shootout after period 3, no overtime</option>
          </select>,
          <>
            In the original game a regular-season game still tied after its overtime ends in a tie, where a playoff
            game plays another overtime, and another, until someone scores. <b>Overtime until a goal</b> plays the
            regular season the same way: each overtime is as long as the regular season's (10:00, or the fourth period
            length's with that option), and ties are no more, though a game can run long. <b>A shootout after one
            overtime</b> settles it after the overtime instead, and <b>a shootout after period 3</b> straight after
            regulation, with no overtime. Either is played as the game's own Shootout mode plays one, five shooters a
            side and then a shooter each until one team is ahead; the winners get one goal more on the scoreboard, and
            the game ends as any other, saved in the records as an ordinary win. Playoffs always play overtime until a
            goal, as they did, and Shootout mode is as it was. Worked out by the NHL94 Match Viewer project. Tested in
            the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'fourthPeriodOvertime',
          number('fourthPeriodOvertime'),
          <>
            Lets one ROM play two kinds of regular-season game: the usual ones, and ones with a long overtime of their
            own, such as 99 minutes, as good as playing until someone scores, so a league that needs both no longer
            needs a separate ROM. The main menu's Period Length offers three of the game's four lengths, and this adds
            the fourth. Set that length and its menu text on the Game settings page (the original game's is 30
            seconds), for example 5:00 and "5 Min, 99 Min OT". A regular-season game played at it then gets this many
            seconds of overtime (5940 is 99 minutes), and ends at 0:00 if still tied; 0 turns the option off. Games at
            the other lengths keep the overtime set on the Game settings page, and playoff overtime is unchanged, as
            long as a period. With 99 minutes, the faceoff song cannot play in the first half of the overtime.
            McMarkis's "5 Minutes, 99 Min OT" patch, made for any length. Tested in the game by the NHL94 Match Viewer
            project.
          </>,
        )}
        {hack(
          'fighting',
          <select aria-label={HACK_TITLES.fighting} className="wide" disabled={unknown('fighting')} value={wanted.fighting} onChange={(e) => set({ fighting: e.target.value as FightChoice })}>
            {(Object.keys(FIGHT_TEXTS) as FightChoice[]).map((choice) => (
              <option key={choice} value={choice}>
                {FIGHT_TEXTS[choice]}
              </option>
            ))}
          </select>,
          <>
            chaos's fighting patch (version 1.01), which brings NHLPA 93's fights into the game: after enough hard
            checks, two players with high enough fighting ratings may drop the gloves, and both are given fighting
            majors. The main menu gets a <b>Fighting</b> line, Off, On or On - Arcade Mode (more fights), whose
            starting choice is set here; the roster screens show each player's fighting rating from 0 to 100. How fights
            start and are won is in chaos's forum post, "How fighting works in the NHL94 fighting patch". Fighting
            uses the fighting half of the H/F column, which a league sets on the team pages: in the original game only
            a few players rate high enough to start a fight. The ROM grows to 3 MB; Genesis Plus GX, which the leagues
            use, plays it, and saved records still work. It goes into league ROMs too: the main menu keeps the
            league's own captions, choices, teams offered and period lengths, with the Fighting line added. It works
            with head bleeding on or off. Made by chaos with McMarkis and AbdulBCRT, from github.com/Chaos81/nhl94-patches
            under the MIT licence; its title screen, credits and fighting ratings are left out. Tested in the game by
            the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'shootoutInjuries',
          onOff('shootoutInjuries'),
          <>
            Only with a shootout for tied regular-season games on (above): a skater injured for the game, by a hit or
            in a fight (chaos's patch), takes no shot in it, and the next healthy player on the team's shootout list
            shoots in his place, even if he was picked on the shootout screen. A period's injury is over by then. If
            all five are out, the listed players shoot as before. Shootout mode from the main menu is as it was.
            Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'nhlShootout',
          onOff('nhlShootout'),
          "Today's NHL shootout: three rounds a side, then sudden death, where the game plays five. And, as in the NHL, it ends as soon as one team cannot catch up, such as 2-0 after two rounds, where the game itself always plays every round. For the season shootout and the main menu's Shootout mode alike. The shooters are chosen as before. Tested in the game by the NHL94 Match Viewer project.",
        )}
        {hack(
          'fightSeconds',
          <>
            {number('fightSeconds')} seconds in the box for each fighter ({wanted.fightSeconds === 0 ? 'off' : clockTime(wanted.fightSeconds)})
          </>,
          <>
            An option for leagues that play with fighting (chaos's patch, above): how long a fight keeps each fighter in
            the box, in seconds of the game clock, in place of what its five minutes and the penalty time below would
            give. 0 is off, as the original game: a fight is a 5-minute major like any other. Only the time in the box
            changes: the fight still counts as 5 penalty minutes in the statistics, and the two fighters still go off
            together with no power play, as both get the same time. An instigator's extra minor is as before. Tested
            in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'penaltySeconds',
          <>
            {number('penaltySeconds')} seconds in the box for each penalty minute
          </>,
          <>
            How long a penalty keeps a player in the box. Each penalty has its minutes (2 for a minor, 5 for a major,
            and so on, which you can change one by one under Rule messages on the Game settings page), and the game
            keeps the player off for that many minutes of the game clock. This sets how long each of those minutes
            is: at 60, as in the original game, a minute is a minute; at 30 every penalty lasts half as long. Now{' '}
            {penaltyLengths(wanted.penaltySeconds)}. It suits a league that plays short periods and wants penalties to
            match: with 5-minute periods, 30 makes a minor 1:00, as a 2-minute minor is to a 20-minute period. Only
            the time in the box changes: the penalty minutes in the statistics, which penalties are called, and a
            power-play goal letting a player out early are all as before. The time is counted on the game clock, as
            the period is. {stock('penaltySeconds')} Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'realTime',
          onOff('realTime'),
          <>
            The original game's clock runs two and a half times as fast as a real one, so that a 5 minute period takes
            2 minutes to play. This makes the game clock, the penalty clock and the penalty shot clock count true
            seconds. Periods then last as long as they say, so choose shorter ones on the Game settings page.
          </>,
        )}
        {hack(
          'noIcing',
          onOff('noIcing'),
          "Icing is never called: a puck shot from a team's own half and over the goal line plays on, and the goalie plays it as any loose puck. Some leagues play 2 on 2 this way. From TheTome's forum post, made a little more cleanly here; a ROM with the post's version is recognised. Tested in the game by the NHL94 Match Viewer project.",
        )}
        {hack(
          'hybridIcing',
          onOff('hybridIcing'),
          <>
            An option, the icing rule the NHL has played since 2013. The original game plays the older touch icing: after
            the puck crosses the goal line, icing is called if a defender touches it first and waved off if an attacker
            does, which can mean a race into the end boards. With this on it is decided as the puck crosses: if the
            defending team's nearest skater is as near as or nearer to the end-zone faceoff dots than the icing team's
            nearest, icing is called there and then; if an attacker is nearer, it is waved off and play goes on. Goalies
            do not count, and it goes by distance alone, not by how fast each player is going. Everything else is as
            before: a team short-handed never ices, and a puck that crosses within the width of the crease is not
            icing. Has no effect with No icing on. Tested in the game by the NHL94 Match Viewer project, with the SNES
            version of this hack.
          </>,
        )}
        {hack(
          'threeOnThree',
          <select aria-label={HACK_TITLES.threeOnThree} className="wide" disabled={unknown('threeOnThree')} value={wanted.threeOnThree} onChange={(e) => set({ threeOnThree: e.target.value as ThreeOnThree })}>
            {(Object.keys(THREE_ON_THREE_TEXTS) as ThreeOnThree[]).map((choice) => (
              <option key={choice} value={choice}>
                {THREE_ON_THREE_TEXTS[choice]}
              </option>
            ))}
          </select>,
          <>
            An option, as the NHL plays overtime: each team has its goalie and three skaters, its current line's
            <b> LW, C and RD</b> (two forwards and a defenceman, a centre for the draws, one player on each side). A
            penalty gives the other team a skater more, as the NHL does: 4 on 3, and 5 on 3 for a second. When it
            ends the teams play 4 on 4 until the next whistle, then 3 on 3 again. The lines are not changed, so it
            works with line changes On or Off, and the players come from whichever line is on. Choose <b>in the
            regular season</b> to keep the playoffs 5 on 5, as the NHL does. The overtime's length is set as before.
            A team with three in the box plays two skaters, its C and LW, until one comes out, and the other team then
            has at most four (4 on 2), as the NHL never gives a team more than a two-skater advantage. A shootout after
            overtime has not been tried with it yet. Worked out with the NHL94 Match Viewer project. Tested in the game
            by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'delayedCalls',
          onOff('delayedCalls'),
          "An option, a matter of taste. In the original game, while one team has a penalty pending (the referee's arm up, play going on until it touches the puck), the other team cannot be called for anything: its checks, holds, hooks and pokes are never penalties until the whistle. With this on they can be. A foul by the team with the puck stops play at once, and both players go to the box, 4 on 4. Goalie interference was already called. The SNES game has no such rule. Known bug 12 on the NHL94 Match Viewer project's list. Tested in the game by the NHL94 Match Viewer project.",
        )}
        {hack(
          'bCheckPenaltiesOff',
          <select
            aria-label={HACK_TITLES.bCheckPenaltiesOff}
            className="wide"
            disabled={unknown('bCheckPenaltiesOff')}
            value={wanted.bCheckPenaltiesOff}
            onChange={(e) => set({ bCheckPenaltiesOff: e.target.value as BCheckPenaltiesOff })}
          >
            {(Object.keys(BCHECK_TEXTS) as BCheckPenaltiesOff[])
              .filter((choice) => choice !== 'forum' || state.choices.bCheckPenaltiesOff === 'forum')
              .map((choice) => (
                <option key={choice} value={choice}>
                  {BCHECK_TEXTS[choice]}
                </option>
              ))}
          </select>,
          <>
            With penalties off, the original game lets your B-check trip a player only after an extra roll of your
            Checking against his Agility, so many miss; with penalties on there is no such roll. <b>As with penalties on</b>{' '}
            drops the roll, so B-checks trip the same either way. It changes nothing with penalties on, as leagues play.
            A forum post (CoachMac) does this in a way that also gives the computer's B-checks that roll with penalties
            on, so about 3 in 4 of them miss; NOSE4Web's version does not (worked out by the NHL94 Match Viewer
            project). A ROM with the forum's version shows it as such, and can be set back. Tested in the game by the
            NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'injuries',
          <select aria-label={HACK_TITLES.injuries} className="wide" disabled={unknown('injuries')} value={wanted.injuries} onChange={(e) => set({ injuries: e.target.value as Injuries })}>
            {(Object.keys(INJURY_TEXTS) as Injuries[]).map((choice) => (
              <option key={choice} value={choice}>
                {INJURY_TEXTS[choice]}
              </option>
            ))}
          </select>,
          <>
            In the original game a hard hit can injure the player knocked down, for the rest of the period or, when the
            checker has a high Fighting rating, the rest of the game. With <b>never</b> a hit is only a fall, and the
            head-bleeding hack below then never shows. With <b>the penalty, but no injury</b> the hit is still called,
            but there is no injury box: the player lies down for about ten seconds and then skates on. <b>Every injury
            for the period</b> and <b>for the game</b> make every injury last that long, whoever made the hit. With <b>a long fall instead</b> a
            hit that would injure has the player go down and stay down about 5 seconds, where an ordinary fall lasts
            under 2, then get up and play on: no injury, no injury box and no penalty, and he cannot be knocked down
            again while he lies there. It does not go with head bleeding, which would never show. From chaos's forum
            post, with the period, penalty and long-fall choices worked out by the NHL94 Match Viewer project. Tested
            in the game by the NHL94 Match Viewer project.
          </>,
        )}
      </section>

      <section id="hacks-energy">
        <h3>Energy and injury risk</h3>
        {hack('stamina', onOff('stamina'), 'With line changes on, players on the ice do not tire, so lines need changing only when you want to.')}
        {hack(
          'energyDrain',
          number('energyDrain'),
          <>
            How fast a player tires on the ice with line changes on. A larger number tires him sooner and makes for more
            line changes. {stock('energyDrain')} Keep it at 16 or more: below that a player with high endurance gains
            energy instead of losing it, and after a minute or two a fast skater drops to the slowest speed there is
            (found in the game by the NHL94 Match Viewer project). For no tiring from skating at all, use Skating costs no
            energy, below.
          </>,
        )}
        {hack(
          'energyRecovery',
          number('energyRecovery'),
          <>How fast a player gets his energy back on the bench. A larger number rests him sooner. {stock('energyRecovery')}</>,
        )}
        {hack(
          'noSkatingDrain',
          onOff('noSkatingDrain'),
          <>
            With line changes on, skating costs no energy. Players then tire only from what else costs it: hits and holds
            (Energy lost when knocked down, below) and speed bursts (the next setting), and they rest on the bench as usual.
            With speed bursts set to cost nothing too, only hits tire a player. Unlike Unlimited stamina, which stops
            every loss, hits still count. Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'burstEnergy',
          number('burstEnergy'),
          <>
            The energy a C-button speed burst costs with line changes on, out of 4096 for a fresh player; 0 for none.
            {' '}{stock('burstEnergy')} Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'hitEnergy',
          number('hitEnergy'),
          <>
            An option, from a community idea: a skater knocked down by a check or a poke check loses this much energy, so
            he is slower, shoots softer and loses puck battles more until he rests on the bench. 0 is the original game,
            where a hit costs the skater nothing. Only with line changes On, where energy counts at all. Full energy is{' '}
            {FULL_ENERGY} units: {energyShare(wanted.hitEnergy)}. Recommended: {RECOMMENDED_HIT_ENERGY} (5%), what a burst
            of speed costs, or about 25 seconds of skating: the most-hit players tire noticeably and the computer changes
            lines a little more often, while the average skater is hardly touched. People hit about twice as often as
            the computer does. Half as much is too little to notice. Up to 4096, all of a skater's energy, for a league
            that wants hits to wear players down. For energy lost only to hits, the button below turns on Skating costs
            no energy, makes a speed burst cost nothing, and sets a knockdown to {HITS_ONLY.hitEnergy} (a third) and a
            hold to {HITS_ONLY.holdEnergy}: three knockdowns then empty a skater, each one taking about an eighth
            off an average skater's top speed, and he gets it back on the bench as usual, in about 7 minutes of game time from empty. At no energy
            every skater is as slow as the slowest, and his shots and checks are weaker too. A knockdown by a puck, a
            bump that does not knock him down, or a hit after the whistle costs nothing. Worked out by the NHL94 Match
            Viewer project. Tested in the game by the NHL94 Match Viewer project.
          </>,
          <button type="button" disabled={unknown('hitEnergy') || wanted.hitEnergy === RECOMMENDED_HIT_ENERGY} onClick={() => set({ hitEnergy: RECOMMENDED_HIT_ENERGY })}>
            Use the recommended {RECOMMENDED_HIT_ENERGY}
          </button>,
        )}
        <p>
          <button
            type="button"
            disabled={(Object.keys(HITS_ONLY) as (keyof typeof HITS_ONLY)[]).some((key) => unknown(key)) || (Object.keys(HITS_ONLY) as (keyof typeof HITS_ONLY)[]).every((key) => wanted[key] === HITS_ONLY[key])}
            onClick={() => set(HITS_ONLY)}
          >
            Energy from hits only
          </button>{' '}
          <span className="note">
            Skating and speed bursts cost nothing; a knockdown costs {HITS_ONLY.hitEnergy} and a hold {HITS_ONLY.holdEnergy}. Against the original game: as many line changes and the average skater as fresh, but about a third more knockdowns, and more than one skater a game emptied, whom the computer often leaves on the ice for up to about four minutes of game time. Tested in the game by the NHL94 Match Viewer project.
          </span>
        </p>
        <HitsTable
          knockdown={wanted.hitEnergy}
          hold={wanted.holdEnergy}
          disabled={unknown('hitEnergy') || unknown('holdEnergy')}
          onUse={(knockdown, hold) => set({ hitEnergy: knockdown, holdEnergy: hold })}
        />
        {hack(
          'holdEnergy',
          number('holdEnergy'),
          <>
            The same for a skater caught by a hold or hook (A without the puck), once each time it catches him in play.{' '}
            {energyShare(wanted.holdEnergy)}. Recommended: {RECOMMENDED_HOLD_ENERGY} (2.5%), half a knockdown's. Only with line
            changes On.
          </>,
          <button type="button" disabled={unknown('holdEnergy') || wanted.holdEnergy === RECOMMENDED_HOLD_ENERGY} onClick={() => set({ holdEnergy: RECOMMENDED_HOLD_ENERGY })}>
            Use the recommended {RECOMMENDED_HOLD_ENERGY}
          </button>,
        )}
        {hack(
          'injuryBonus',
          number('injuryBonus'),
          <>
            An option, the other half of the community idea: each knockdown a skater takes makes a later injury a little
            more likely, and half of it wears off at each intermission. 0 is the original game. Only the few hits that can
            injure in the original game are affected (a puck carrier knocked onto his back while facing straight up or down
            the ice, with the clock running), so injuries stay rare. On such a hit, each knockdown the skater has taken
            this game, this one included, adds this many chances in 160 of an injury, up to the most below.
            Recommended: {RECOMMENDED_INJURY_BONUS} a knockdown, at most {RECOMMENDED_INJURY_CAP}: about 27% more
            injuries a game, estimated from recorded league games, with the skaters knocked down most about 1.3 times
            as likely to be hurt; 10 and 50 come to about 54% and 1.7 times, and 2 and 10 are too little to notice.
            Knockdowns in play are counted, with line changes on or off; those after the whistle are not. Worked out by
            the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.
          </>,
          <button
            type="button"
            disabled={unknown('injuryBonus') || (wanted.injuryBonus === RECOMMENDED_INJURY_BONUS && wanted.injuryCap === RECOMMENDED_INJURY_CAP)}
            onClick={() => set({ injuryBonus: RECOMMENDED_INJURY_BONUS, injuryCap: RECOMMENDED_INJURY_CAP })}
          >
            Use the recommended {RECOMMENDED_INJURY_BONUS} and {RECOMMENDED_INJURY_CAP}
          </button>,
        )}
        {hack(
          'injuryCap',
          number('injuryCap'),
          <>
            The most the knockdowns can add to a hit's impact, however many he has taken: at {wanted.injuryCap}, about{' '}
            {Math.round((wanted.injuryCap / 160) * 100)} in 100 more on a hit that can injure. Used only when the risk above
            is more than 0.
          </>,
        )}
      </section>

      <section id="hacks-goalies">
        <h3>Goalies</h3>
        {hack(
          'goalieHold',
          <>{number('goalieHold', 60)} seconds</>,
          <>
            How long a goalie may hold the puck before the whistle. The original game allows {holdSeconds(NO_HACKS.goalieHold)}{' '}
            seconds. Put 0 for no whistle at all; a goalie the game controls still gives the puck up by himself.
          </>,
        )}
        {hack(
          'goalieWidth',
          number('goalieWidth'),
          <>How far a goalie you control may go, without the puck, to either side of the middle of the ice. A larger number lets him go wider. {stock('goalieWidth')}</>,
        )}
        {hack(
          'goalieOut',
          number('goalieOut'),
          <>
            How near centre ice a goalie you control may come without the puck, as his distance from it, so a smaller number lets
            him come farther out. For scale, the goal line is 268 from centre ice and the blue line about 88. {stock('goalieOut')}
          </>,
        )}
        {hack(
          'goalieLine',
          number('goalieLine'),
          <>
            The line a goalie you control may not skate past without a whistle, again as a distance from centre ice, so
            a smaller number lets him go farther; 170 is about the top of the faceoff circles. Without the puck he is
            kept within the range above anyway, so in practice this is the line he may carry the puck to.{' '}
            {stock('goalieLine')}
          </>,
        )}
        {hack(
          'goalieDelay',
          number('goalieDelay'),
          <>
            How long a player holds B before he takes control of his goalie, in sixtieths of a second: 17, about a
            quarter of a second, in the original game, so 12 is a fifth of a second. It is the same for all four pads in 2 on 2, a 4-Way Play adapter
            included. From smozoma's forum post. {stock('goalieDelay')} Tested in the game by the NHL94 Match Viewer
            project.
          </>,
        )}
      </section>

      <section id="hacks-skating">
        <h3>Skating and the puck</h3>
        {hack(
          'speedBurst',
          number('speedBurst'),
          <>
            The push the C button gives a player without the puck. Put 0 for the original game's, which is 32 for a
            fresh player and less for a tired one. Any other number is the push for everybody, tired or not: 1 as
            good as takes it away, 16 is half the original's, and much over 64 sends players the wrong way.
          </>,
        )}
        {hack(
          'turnRate',
          number('turnRate'),
          <>
            How quickly a skater stops and turns when he reverses. A larger number stops him sooner; a small one gives
            a long, sliding stop. {stock('turnRate')}
          </>,
        )}
        {hack(
          'puckFriction',
          number('puckFriction'),
          <>
            How fast the puck slows down on the ice. A smaller number slows it faster: 8 slows it twice as fast as the
            original 9, and 10 half as fast. At 8 a loose puck keeps about 80% of its speed each second, where at 9 it
            keeps about 89%. Every gliding skater slows the same way, as the game uses this setting for them too: a
            player receiving a pass, one sliding after a fall, and a skater caught by the runaway-speed bug. Choppy
            ice, below, changes the puck alone. It does not apply to a puck in the air. From chaos's forum post.{' '}
            {stock('puckFriction')} Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'choppyIce',
          onOff('choppyIce'),
          "An option, from a community idea: the ice wears as each period goes on, so the puck slows a little more, up to a quarter more by the period's end, and the ice is fresh again after each intermission. Only the puck: skaters glide as before. It goes with the Puck friction setting above, wearing the ice from wherever that sets it. The ice is fresh for overtime too. Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match Viewer project.",
        )}
      </section>

      <section id="hacks-lines">
        <h3>Edit Lines and controls</h3>
        {(() => {
          // Offered for a ROM that leaves positions of its first line empty on every team.
          const fitted = fewerSkaterLinesFor(emptyLineSlots(project.teams)[0])
          if (fitted === 0 && wanted.fewerSkaterLines === 0) return null
          return hack(
            'fewerSkaterLines',
            <select
              aria-label={HACK_TITLES.fewerSkaterLines}
              className="wide"
              disabled={unknown('fewerSkaterLines') || (fitted === null && wanted.fewerSkaterLines === 0)}
              value={wanted.fewerSkaterLines}
              onChange={(e) => set({ fewerSkaterLines: Number(e.target.value) })}
            >
              <option value={0}>All five positions, as the original game</option>
              {[...new Set([fitted, wanted.fewerSkaterLines].filter((value): value is number => !!value))].map((value) => (
                <option key={value} value={value}>
                  Only {fewerSkaterLinesText(value)}
                </option>
              ))}
            </select>,
            <>
              For a ROM that puts fewer skaters on the ice. The game's Edit Lines and the Team Rosters line view still
              show all five skaters' positions, and crash as they open when the ROM leaves a position empty. This makes
              them show only the positions this ROM plays, with line changes off or on, worked out from the positions
              its first line leaves empty on every team
              {fitted ? `: ${fewerSkaterLinesText(fitted)}` : ''}. It works only where those positions follow each other in
              the order LD, RD, LW, C, RW{fitted === null ? ', which they do not in this ROM' : ''}. A ROM with smozoma's
              version is updated to this when its hacks are next applied. From smozoma's forum post for 2 on 2, made to
              work for any number of skaters by the NHL94 Match Viewer project. Tested in the game by the NHL94 Match
              Viewer project, for 1 on 1 and 2 on 2.
            </>,
          )
        })()}
        {hack(
          'anyPosition',
          onOff('anyPosition'),
          <>
            The game's own Edit Lines lists only forwards for the forward positions and only defencemen for the defence.
            With this on it lists every skater for every position, and picking someone already on the line swaps the two,
            as the game already does. A player plays the position the line gives him, faceoffs included, with his own
            ratings. Saved lines keep a defenceman at forward as himself, and lines saved before it was on still load.
            The same save loaded on a ROM without this keeps its lines too, except that anyone saved out of position is
            replaced by a forward or defenceman as the position needs, never by a skater already on the line.
            NOSE4Web's own line editor offers any skater at any position whatever the ROM has. As McMarkis's SNES hack
            in NHL94SNESVault, brought to the Genesis by the NHL94 Match Viewer project. Tested in the game by the NHL94
            Match Viewer project.
          </>,
        )}
      </section>

      <section id="hacks-looks">
        <h3>Looks and screens</h3>
        {hack(
          'puckColours',
          <select aria-label={HACK_TITLES.puckColours} className="wide" disabled={unknown('puckColours')} value={wanted.puckColours} onChange={(e) => set({ puckColours: e.target.value as PuckColours })}>
            {(Object.keys(PUCK_TEXTS) as PuckColours[]).map((choice) => (
              <option key={choice} value={choice}>
                {PUCK_TEXTS[choice]}
              </option>
            ))}
          </select>,
          <>
            Which of the game's colour sets the puck is drawn in: the rink's, as in the original game, the crowd's, or
            the home team's or visitors' uniform colours, so a team's puck can be its own. Its shadow is left as it is.
            From AdamCatalyst's forum post, completed by the NHL94 Match Viewer project. Tested in the game by the NHL94
            Match Viewer project.
          </>,
        )}
        {hack(
          'netColours',
          <select aria-label={HACK_TITLES.netColours} className="wide" disabled={unknown('netColours')} value={wanted.netColours} onChange={(e) => set({ netColours: e.target.value as PuckColours })}>
            {(Object.keys(PUCK_TEXTS) as PuckColours[]).map((choice) => (
              <option key={choice} value={choice}>
                {PUCK_TEXTS[choice]}
              </option>
            ))}
          </select>,
          <>
            Which of the game's colour sets both nets are drawn in, as for the puck. The net keeps its own pattern, so
            in another set it takes that set's colours in the same places: the crowd's gives red posts, as in
            clockwise's forum post, and an olive-grey net. A team's colours may look odd, since they were never made
            for the net; a home team's can look heavy against the ice. Both nets change, in play and in replays, and
            the puck stays as it was. Worked out by the NHL94 Match Viewer project. Tested in the game by the NHL94
            Match Viewer project.
          </>,
        )}
        {hack(
          'greenFan',
          onOff('greenFan'),
          "A fan in a green shirt in the stands is missing his arm and leg in the original game, cut off by the stairs. This puts them back from tiles still in the ROM. From kingraph's forum post; several league ROMs have it. Tested in the game by the NHL94 Match Viewer project.",
        )}
        {hack(
          'barrPick',
          onOff('barrPick'),
          <>
            An option, from a league member's idea. Before each game every player is rolled a little hot or cold, which
            changes how he plays that night, and on the matchup screen Ron Barr says "Lately ... has been playing
            well" of the team whose six starters came out hotter in all, but only when the gap is wide, so not every
            game has the line. With this on he names a team every game: the one whose starters came out hotter, so the
            team he picks has its starters in better form that night. With a wide gap he still says "extremely"; on an
            exact tie he picks the visitors. The line adds about 2 seconds to the matchup screen. What he says is the
            hotter-team line of Ron Barr's text on the Game settings page, which names the team's city, so a league can
            make it a pick, such as "Ron Barr likes {'{hotter team}'} tonight." With the hot and cold range at 0 he
            always picks the visitors; at 2 or less hot and cold does not change play, so his pick is only luck. On a
            league ROM whose Ron Barr text has a line taken out by hand (the Check page says so), put the line back
            first, or a line in the wrong place shows every game. The Genesis game calls both New York teams "New
            York", so when they meet the line does not say which. Not yet tried on EVO, which has a matchup screen of
            its own. Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'barrCoin',
          onOff('barrCoin'),
          <>
            An option, instead of the one above: Ron Barr names a team every game by a coin flip, home or visitors
            alike, whatever the teams' hot and cold rolls. His pick then has nothing to do with their form that night:
            about half the time he names the team whose starters came out colder. He always says "well", never
            "extremely". Turning one of the two on turns the other off. The same line of Ron Barr's text is used, and
            the same cautions apply: a league ROM with a line of his text taken out by hand needs it put back, and when
            the two New York teams meet the Genesis game calls both "New York". Tested in the game by the NHL94 Match
            Viewer project.
          </>,
        )}
        {hack(
          'introWait',
          number('introWait'),
          <>
            How long each of the two intro screens, EA Sports and High Score Productions, waits before moving on: with
            its fades, each screen lasts about 4.9 seconds at the original 80 and about 1.6 at 20. A button skips
            either screen anyway. From AdamCatalyst's forum post. {stock('introWait')} Tested in the game by the NHL94
            Match Viewer project.
          </>,
        )}
        {!unknown('headBleeding') &&
          hack(
            'headBleeding',
            onOff('headBleeding'),
            <>
              In NHLPA '93 a player hurt by a check lies on the ice with blood spreading from his head; NHL '94 took
              the blood out. With this on, a player hurt for the game bleeds as he lies there: a little as he lands,
              more half a second later. A player out for the period lies as before. Only the look changes, not how the
              game plays. The blood is drawn in colours 13 and 14 of the arena palette, which are dark reds in the
              original game. It needs more room, which grows a 1 MB ROM to 2 MB. It works with or without the fighting
              patch. Tested in the game by the NHL94 Match Viewer project.
            </>,
          )}
        {hack(
          'organResume',
          onOff('organResume'),
          <>
            Pausing the game stops the organ, and it stays quiet after the pause until the next song starts. With this on
            the organ carries on with its song from where it was. A note that was sounding when the game was paused is
            heard again at the song's next note. Tested in the game by the NHL94 Match Viewer project.
          </>,
        )}
      </section>

      <section id="hacks-legacy">
        <h3>Legacy hacks</h3>
        <p className="note">Kept for league ROMs that already have them. A better fix has replaced each one, so leave them off in a new ROM.</p>
        {hack(
          'weightFix',
          <select aria-label={HACK_TITLES.weightFix} disabled={unknown('weightFix')} value={wanted.weightFix} onChange={(e) => set({ weightFix: e.target.value as WeightFix })}>
            <option value="off">Off</option>
            {state.choices.weightFix === 'simple' && <option value="simple">Keep this ROM's earlier, simpler fix</option>}
            <option value="on">On</option>
          </select>,
          <>
            smozoma's fix for the weight bug, from smozROM. The NHL94 Match Viewer project has since found that it
            rests on a misreading of the game: the original game rightly lets the heavier checker do better, and the
            only bug is in how it works out the checks of a player a person controls. This fix swaps the weights
            round, so the computer's checkers then do better the lighter they are, and counts both players' checking
            ratings. It is kept for league ROMs that have it; for the weight bug, use the weight bug and
            C-then-B fix at the top of Fixes instead, and leave this off.
            {state.choices.weightFix === 'simple' && ' This ROM has an earlier fix, which swaps the weights and leaves checking ratings out of it.'}
          </>,
        )}
      </section>

      <section id="hacks-apply" data-tab-always>
        <h3>Apply</h3>
        {changes.length === 0 ? (
          <p>Nothing is set to change.</p>
        ) : (
          <div className="outcome">
            <p>Applying will make these changes to the game:</p>
            <ul>
              {changes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {rescaled && (
              <p>
                Every player's ratings will be restated on the new scale, so that each plays as he did:{' '}
                {wanted.wideRatings ? '0, 1, 2, 3, 4, 5, 6 become 0, 3, 5, 8, 10, 13, 15' : 'each becomes the nearest of 0 to 6'}. Overall
                ratings will read differently, since the two scales work them out differently.
              </p>
            )}
            {wanted.headBleeding && !state.choices.headBleeding && project.bytes.length < 0x200000 && (
              <p>Head bleeding needs more room in the ROM, which grows it to 2 MB.</p>
            )}
            {reweighed && <p>Every player's weight will be moved to the step nearest the pounds he weighs now, which can be up to 4 pounds out.</p>}
            {wanted.checkFix === 'all120' && wanted.weightFix !== 'off' && (
              <p>
                The weight bug and C-then-B fix and smozoma's legacy weight bug fix should not go together: with the
                first the bug is already fixed, and the legacy fix would then have every checker do better the lighter
                he is.
              </p>
            )}
            {wanted.weightFix === 'on' && state.choices.weightFix !== 'on' && (
              <p>
                smozoma's legacy weight bug fix is balanced for the original game's players. Keep checking ratings about where the
                original's are, or checking becomes too easy or too hard: most forwards 2 or 3 out of 6 (4 to 8 out of
                15), most defencemen 2 to 4 (4 to 11), and very few players 5 or 6 (12 to 15).
              </p>
            )}
            {wanted.threeStars !== 'original' && wanted.bodychecks === 'off' && !unknown('bodychecks') && (
              <p>The improved three stars count bodychecks, which are only kept with bodycheck statistics on.</p>
            )}
          </div>
        )}
        <p>
          <button disabled={changes.length === 0} onClick={apply}>
            Apply
          </button>{' '}
          <button disabled={sameHacks(wanted, state.choices)} onClick={() => {
              set(state.choices)
              setSetBack(setBack + 1)
              setNotCopied([])
            }}
          >
            Set back to what the ROM has
          </button>{' '}
          <CopyHacksButton
            onRom={(other, fileName) => {
              if (!hacksSupported(other.game)) {
                setError(`${fileName} is ${other.game.title}, whose hacks this page cannot read.`)
                return
              }
              const copied = hacksCopiedFrom(state, detectHacks(other.bytes))
              set(copied.choices)
              setSetBack(setBack + 1)
              setNotCopied(copied.notCopied)
              setNotice(`Set to ${fileName}'s hacks. Check the list above and press Apply.`)
            }}
            onError={(message) => setError(message)}
          />{' '}
          <span className="note">{notice}</span>
        </p>
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
