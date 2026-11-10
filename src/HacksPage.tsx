import { useMemo, useState, type ReactNode } from 'react'
import { WEIGHT_BASES } from './core/attributes'
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
  type ThreeStars,
  type WeightFix,
  fewerSkaterLinesFor,
  fewerSkaterLinesText,
  FULL_ENERGY,
  RECOMMENDED_HIT_ENERGY,
  RECOMMENDED_HOLD_ENERGY,
  RECOMMENDED_INJURY_BONUS,
  RECOMMENDED_INJURY_CAP,
} from './core/hacks'
import { emptyLineSlots } from './core/lines'
import type { RomProject } from './core/rom'
import { CopyHacksButton } from './CopyHacksButton'
import { GenesisBloodSection } from './GenesisBloodSection'
import { HackShortcuts } from './HackShortcuts'
import { genesisHackSheet, hackSheetDiscord, hackSheetHtml, pictureItems, withPictures } from './core/hacksheet'

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

const BCHECK_TEXTS: Record<BCheckPenaltiesOff, string> = {
  original: 'As in the original game',
  asPenaltiesOn: 'As with penalties on',
  forum: "The forum's version",
}

const INJURY_TEXTS: Record<Injuries, string> = {
  original: 'As in the original game',
  never: 'Never: a hit is only a fall',
  penaltyOnly: 'The penalty, but no injury',
  period: 'Every injury for the period',
  game: 'Every injury for the game',
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

interface NumberBoxProps {
  label: string
  value: number
  range: [number, number]
  // How many of the game's units make one of what is typed.
  perUnit: number
  // Anything whose changing means the box should show the value afresh.
  fresh: unknown
  disabled: boolean
  onChange: (value: number) => void
}

// A box for one of the game's numbers. What is typed is kept as typed, and
// passed on whenever it is a number the game can take.
function NumberBox({ label, value, range, perUnit, fresh, disabled, onChange }: NumberBoxProps) {
  const shown = (stored: number) => String(perUnit === 1 ? stored : Number((stored / perUnit).toFixed(2)))
  const [typed, setTyped] = useState({ value, fresh, text: shown(value) })
  if (typed.value !== value || typed.fresh !== fresh) setTyped({ value, fresh, text: shown(value) })
  const read = (text: string) => {
    const stored = Math.round(Number(text) * perUnit)
    return text.trim() !== '' && Number.isFinite(stored) && stored >= range[0] && stored <= range[1] ? stored : null
  }
  return (
    <input
      className="num"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={read(typed.text) === null}
      disabled={disabled}
      value={typed.text}
      onChange={(e) => {
        const stored = read(e.target.value)
        setTyped({ value: stored ?? value, fresh, text: e.target.value })
        if (stored !== null && stored !== value) onChange(stored)
      }}
    />
  )
}

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
    const next = { ...wanted, ...change }
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
      <p className="note">
        {about}
        {unknown(key) && (
          <b> This ROM's code here is neither the original game's nor a version of this hack the editor knows, so it is left exactly as it is.</b>
        )}
      </p>
    </div>
  )
  const number = (key: NumberKey, perUnit = 1) => (
    <NumberBox label={HACK_TITLES[key]} value={wanted[key]} range={HACK_RANGES[key]} perUnit={perUnit} key={setBack} fresh={project.bytes} disabled={unknown(key)} onChange={(value) => set({ [key]: value })} />
  )
  // "The original game has 150", with what this ROM has if that is different.
  const stock = (key: NumberKey) =>
    `The original game has ${NO_HACKS[key]}${!unknown(key) && state.choices[key] !== NO_HACKS[key] ? `, and this ROM has ${state.choices[key]}` : ''}.`
  const onOff = (key: 'secondAssist' | 'oneTimerAssist' | 'regainAssist' | 'plusMinus' | 'aggressionFix' | 'ppPkFix' | 'comebackFix' | 'passFix' | 'faceoffFix' | 'runawayFix' | 'penaltyShotTableFix' | 'penaltyShotFixes' | 'goaliePullFix' | 'blindRingFix' | 'snipingFix' | 'awarenessFix' | 'crowdFix' | 'stickShots' | 'stamina' | 'realTime' | 'noIcing' | 'greenFan') => (
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
      <p className="note">
        Changes to the game itself: bug fixes, extra statistics, finer ratings, and how it plays. Most are the work of
        smozoma, from his program{' '}
        <a href="https://github.com/nhl94dotcom/smozROM" target="_blank" rel="noreferrer">
          smozROM
        </a>
        , built in here with his permission; those under Play were found by members of the NHL94 forums, who are named
        in Help. The page shows what this ROM has now. Change what you like and press
        Apply; nothing is changed until you do. Test a hacked ROM in a game before a league plays on it.
      </p>
      <HackShortcuts
        onRecommended={
          !sameHacks(withRecommendedFixes(wanted, state.unknown), wanted) &&
          (() => {
            set(withRecommendedFixes(wanted, state.unknown))
            setSetBack(setBack + 1)
          })
        }
        discordText={() => hacksForDiscord(state, name, pictureItems(project).map((item) => `- **${item.title}**`))}
        discordMessages={() => hackSheetDiscord(withPictures(genesisHackSheet(state, name), project))}
        sheet={() => hackSheetHtml(withPictures(genesisHackSheet(state, name), project))}
        name={name}
      />

      <section>
        <h3>Fixes</h3>
        {hack(
          'checkFix',
          <select aria-label={HACK_TITLES.checkFix} disabled={unknown('checkFix')} value={wanted.checkFix} onChange={(e) => set({ checkFix: e.target.value as CheckFix })}>
            <option value="off">Off</option>
            <option value="all120">Everyone checks as the computer</option>
            {state.choices.checkFix === 'all240' && <option value="all240">Keep this ROM's earlier fix: everyone checks as a person</option>}
          </select>,
          <>
            <b>The fix for the weight bug.</b> The original game judges a check one way when a person controls the checker at the moment of contact and
            another when the computer does, and works the person's way out in a single byte that overflows. That
            overflow is the weight bug: a light skater you control knocks down anyone two or more weight steps heavier,
            and a heavy one struggles. Pressing C to charge and then B to switch away hands the checker to the computer
            just before he hits, the C-then-B check. This fix, found by the NHL94 Match Viewer project, judges every
            check the computer's way, which never overflows: the heavier checker does better, as it should, and
            switching away gains nothing. Your checks get easier than they were against players your own weight or
            lighter. Leave smozoma's legacy weight bug fix, under Legacy hacks below, off with it.
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
          "When the shooter's stick touches a pass without catching it and he then one-times it in, the original game counts him twice among the last players to touch the puck and gives the goal no assist: about 1 one-timer goal in 24 in recorded games. This puts him on the list as every other touch does, so the passer and the player before him get their assists. Ordinary one-timers are unchanged. Found by the NHL94 Match Viewer project and tested in the game; it goes with the second-assist fix or without it, and is among the recommended fixes.",
        )}
        {hack(
          'regainAssist',
          onOff('regainAssist'),
          "When a player loses the puck to an opponent, wins it back himself, and passes to a teammate who scores, the original game loses his assist: a flag left from the opponent's touch makes the scorer take his place among the last players to touch the puck. This clears the flag when he wins it back, so he gets the assist. About 1 goal in 34 in recorded games. Found by the NHL94 Match Viewer project and tested in the game; it goes with the second-assist and one-timer assist fixes or without them, and is among the recommended fixes.",
        )}
        {hack(
          'aggressionFix',
          onOff('aggressionFix'),
          <>
            The original game wraps a player's Aggression round in play, so it does not rise with the rating: a 4
            plays like a 1, and a 6 or a 3 draws the most penalties. This makes it rise with the rating, so a 6 draws the
            most penalties and a 0 the fewest. Players rated 4 to 6 will take more penalties than they do now. For
            goalies the same place holds GvL, the glove rating: with the fix a goalie needs about 5 for the
            reaching glove save, where now it jumps about with the rating (a 3 can make it and a 4 cannot).
          </>,
        )}
        {hack(
          'ppPkFix',
          onOff('ppPkFix'),
          <>
            The game is meant to add a team's power play rating to some of each player's ratings on the power play
            and take its penalty kill rating off them on the penalty kill, but it reads the two from the wrong halves
            of their byte. The original rosters were written for the intended way, so in play Anaheim, meant to be weak
            at both, has the best power play and penalty kill. This makes the game read them as intended, so rosters
            play as their makers meant; the team page then shows the two that way round too. Leagues that have already
            set these ratings as the editor showed them before the fix should check them after it.
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
          'passFix',
          onOff('passFix'),
          <>
            A pass to a teammate is aimed at where he will be, and timed to get there. The original game counts that
            time in whole eighths of a second, rounded down, so now and then a pass goes nearly twice as fast as the
            passer's rating allows: the rocket pass, mostly to a teammate skating towards the passer 17 to 23 feet
            away. It also sometimes takes the wrong one of two answers for a teammate skating away close by, and fires
            the puck at him in an eighth of a second. This counts the time in 64ths of a second and takes the right
            answer, so every pass goes at the speed its Passing rating sets. Replaying 2,535 passes from 29 recorded
            games, no pass went more than 1.23 times its speed with the fix, where 69 reached rocket speed without
            it. How high a pass lifts is unchanged. Passing will feel different to players used to the rocket pass,
            and a receiver catches more of the passes that used to bounce off his stick. Found and measured by the
            NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'faceoffFix',
          onOff('faceoffFix'),
          <>
            Faceoffs as today's NHL rules have them. Only since 2007 has the NHL held every faceoff on one of the nine
            dots; before that a faceoff was often held where play stopped, and the game follows that older way. It
            puts a faceoff on a dot only when play stops past the hash marks, and anywhere else holds it where the puck
            was, often in the open ice between the dots: 1 faceoff in 8 in recorded games, most of them after
            penalties. With this on, every faceoff is on a dot: after a goal at centre; after a penalty in the
            offending team's own end, at the dot on the side the puck was; otherwise, past a blue line, at that end's
            dot on the puck's side, and in the neutral zone at the nearest neutral-zone dot. A puck shot out of play
            is faced off by where the player who last touched it stood. When both teams take penalties the faceoff
            still moves out to the neutral zone. Leave it off to keep the game's own 1990s-style faceoffs. Worked out
            with the NHL94 Match Viewer project, from today's NHL rulebook.
          </>,
        )}
        {hack(
          'runawayFix',
          onOff('runawayFix'),
          <>
            Now and then a skater you control shoots off far past top speed and slides out of control for a second or
            two, usually racing back on defence. The game lets a computer skater about to take a pass glide onto it,
            and lets one knocked into the boards slide, by almost turning off how quickly he slows down. Three ways
            leave that on: taking a skater over while a pass is coming to him, getting up after a fall into the boards,
            and a one-timer that misses the puck. He then barely slows, each speed burst stacks on the last, and he
            runs away. This turns the gliding off in all three places, so he skates normally once he is yours, back on
            his feet, or done with the one-timer. Computer skaters still glide onto passes, and a one-timer still glides
            while it is being taken. Taking over a skater with a pass coming, you now steer him onto it yourself.
            Found by the NHL94 Match Viewer project, which recorded the runaways.
          </>,
        )}
        {hack(
          'penaltyShotTableFix',
          onOff('penaltyShotTableFix'),
          <>
            A foul on a skater on a breakaway can give a penalty shot. The original game looks each foul up one place
            too far along its table, so every penalty shot is called for the wrong foul: charging is announced and
            recorded as slashing, slashing as roughing, and so on, and a breakaway hooking or tripping is called as
            the next foul along. This gives each foul its own penalty shot. Which fouls give penalty shots does not
            change: holding gives none, as the game has no penalty shot for it, and interference is never called on
            the puck carrier.
          </>,
        )}
        {hack(
          'penaltyShotFixes',
          onOff('penaltyShotFixes'),
          <>
            Two penalty shot bugs. A penalty shot stopped by a whistle that is not one of its own endings, such as the
            puck going over the glass or the net being knocked off, is taken all over again; with the fix the game goes
            on to a faceoff instead. And a puck shot over the glass just after the penalty shot was awarded can enter
            the shot unable to touch anything, floating through the net and the boards (the "ghost puck"); with the fix
            it plays normally. Found by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'snipingFix',
          onOff('snipingFix'),
          <>
            An option, a matter of taste: some leagues like it as it is. Whenever a team's own goalie is off the ice (on a delayed penalty, or pulled late in a game by a person or
            the computer) the original game makes every one of its shots from within range go exactly where it is
            aimed, whatever the shooter's Shot Accuracy. With the fix such a shot takes the normal accuracy roll, as
            any other does (exact within range about half the time at Shot Accuracy 15). Shots at an empty net are
            not affected; they already take the roll. Found by the NHL94 Match Viewer project, and tested in the game:
            with the shooter's goalie pulled, 270 of 270 test shots hit the aim on the original, 155 on the fix, the
            same rate as with the goalie in.
          </>,
        )}
        {hack(
          'goaliePullFix',
          onOff('goaliePullFix'),
          <>
            In the last minute of the third period the computer pulls its goalie for an extra attacker, but only when it
            is exactly two goals behind: never when one goal down, which looks like a slip in the game's code (its own
            note says "more than 2"). With this on it pulls him when one or two goals behind, as a real coach would.
            This changes how the computer plays late in close games. While its goalie is out, the computer's shots
            within range go exactly where they are aimed, as anyone's do with the goalie pulled, unless the
            pulled-goalie sniping fix is on too. Found by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'blindRingFix',
          onOff('blindRingFix'),
          <>
            An option, a matter of taste. When a goalie drops into the butterfly or makes some kick saves, his stick
            moves aside, and a flat puck between 8 and 14 units from his blade touches neither his stick nor his body:
            it slides through his legs. With this on, his body plays such a puck as it would anywhere else. It is a
            small change overall (about 0.3% fewer expected goals over 928 recorded shots), but it falls on five-hole
            goals, 3 of 218 in the recordings. Measured by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'awarenessFix',
          onOff('awarenessFix'),
          <>
            An option. A computer skater decides what to do next at intervals set by his awareness: Offensive Awareness
            when his team has the puck, Defensive when it does not. But computer wingers and centres on offence use
            their Defensive Awareness, a slip in the game's code. With this on they use Offensive. A small change: the
            interval is 7 to 15 frames, and for most players it moves by a frame at most. Found by the NHL94 Match
            Viewer project and tested in the game.
          </>,
        )}
        {hack(
          'crowdFix',
          onOff('crowdFix'),
          <>
            An option. The game gives skaters a crowd bonus (+2 Agility and +2 Speed, a boost chasing the puck, more
            reach for the goalie's body) when the crowd meter is past its record, but a switch in the code leaves it
            on all the time. With this on it comes and goes with the meter, which in recorded games is past its
            record about three quarters of the time, so skaters are a little slower in the quiet spells. Found by the
            NHL94 Match Viewer project and tested in the game: a quiet crowd now takes about 5% off a skater's top
            speed.
          </>,
        )}
        {hack(
          'fourthPeriodOvertime',
          number('fourthPeriodOvertime'),
          <>
            An option, in seconds of overtime: 0 leaves it off. The main menu offers three of the game's four period
            lengths; this offers the fourth too, and a regular-season game on it gets this much overtime instead of the
            Clock's (5940 is 99 minutes, about as good as no limit). Set the fourth length and its menu text with the
            others on the Game settings page: the original's is 30 seconds. The other lengths keep the Clock's overtime,
            and playoff overtime stays as long as a period, as in the original game. McMarkis's "5 Minutes, 99 Min OT"
            patch, made for any length; it can save a league a separate playoff ROM.
          </>,
        )}
      </section>

      <section>
        <h3>Statistics</h3>
        {hack(
          'stickShots',
          onOff('stickShots'),
          <>
            A hard low shot that comes off the goalie's stick is a save on the ice, but the original game does not count
            it as a shot on goal: only a catch or a save with his body counts. So shots along the ice go missing from
            the totals, and a team attacking down the screen, where more shots are aimed that way, is credited with
            about 6% fewer. With this on, a hard low shot the goalie's stick knocks away counts as a shot on goal for
            the shooter and his team and against the goalie, once, as one his stick catches already does: about 2 more
            shots on goal a game in recorded league games. Only the
            statistics change; play, the crowd and everything else are as before. Found, built and tested in the game by the NHL94 Match Viewer project.
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

      <section>
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
            {wanted.wideRatings && ' "Edit Lines matches players" is not offered with 0 to 15 ratings, where the code for it looks to be mistaken.'}
          </>,
        )}
      </section>

      <section>
        <h3>Weights</h3>
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
      </section>

      <section>
        <h3>Play</h3>
        <p className="note">
          How the game plays. Most of these are the game's own numbers, shown as its code holds them, so change them
          a little at a time and try the result in a game.
        </p>
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
            a smaller number lets him go farther; 170 is about the top of the faceoff circles. The code whistles him
            with or without the puck, but without it he is kept in the range above, so in practice it is the line he
            may carry the puck to. {stock('goalieLine')}
          </>,
        )}
        {hack('stamina', onOff('stamina'), 'With line changes on, players on the ice do not tire, so lines need changing only when you want to.')}
        {hack(
          'energyDrain',
          number('energyDrain'),
          <>How fast a player tires on the ice with line changes on. A larger number tires him sooner and makes for more line changes. {stock('energyDrain')}</>,
        )}
        {hack(
          'energyRecovery',
          number('energyRecovery'),
          <>How fast a player gets his energy back on the bench. A larger number rests him sooner. {stock('energyRecovery')}</>,
        )}
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
          'realTime',
          onOff('realTime'),
          <>
            The original game's clock runs two and a half times as fast as a real one, so that a 5 minute period takes
            2 minutes to play. This makes the game clock, the penalty clock and the penalty shot clock count true
            seconds. Periods then last as long as they say, so choose shorter ones on the Game settings page.
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
            but there is no injury box: the player lies down for about ten seconds and then skates on. The last two
            choices make every injury last the period, or the game, whoever made the hit. From chaos's forum post, with
            the period and penalty choices worked out in the game's code by the NHL94 Match Viewer project, and all
            tested in the game.
          </>,
        )}
        {hack(
          'hotColdRange',
          number('hotColdRange'),
          <>
            Before each game every player is made a little hot or cold: each value from -n to n - 1, so the original 9
            gives -9 to 8. A smaller number makes the swings smaller. In play the value is divided by 3, so 2 or less
            takes hot and cold out of how anyone plays, though Edit Lines and the player cards still show the small
            values; 0 makes them all 0. It goes with any of the hot and cold bonus choices above. From chaos's forum post,
            tested in the game by the NHL94 Match Viewer project: 4 changes about half as many working ratings as 9, and
            2 none. {stock('hotColdRange')}
          </>,
        )}
        {hack(
          'noIcing',
          onOff('noIcing'),
          "Icing is never called: a puck shot from a team's own half and over the goal line plays on, and the goalie plays it as any loose puck. Some leagues play 2 on 2 this way. From TheTome's forum post, tested in the game by the NHL94 Match Viewer project; NOSE4Web's version branches cleanly past the instruction the post's skips half of, and a ROM with the post's version is recognised.",
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
            A forum post (CoachMac) does it by swapping two tests, which also gives the computer's B-checks that roll
            with penalties on, so about 3 in 4 of them miss; NOSE4Web's changes one test only (found by the NHL94 Match
            Viewer project, and tested in the game: with penalties off, B-checks tripped 66 times in 72, as with them
            on, where the original managed 10). A ROM with the forum's version shows it as such, and can be set back.
          </>,
        )}
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
              show all five skaters' positions, and a position the ROM leaves empty crashes them as they open (an
              address error). This makes them show only the positions this ROM plays, with line changes off or on, worked out
              from the positions its first line leaves empty on every team
              {fitted ? `: ${fewerSkaterLinesText(fitted)}` : ''}. It works only where those positions follow each other in
              the order LD, RD, LW, C, RW{fitted === null ? ', which they do not in this ROM' : ''}. From smozoma's forum post
              for 2 on 2, worked out for any number of skaters, and for line changes on, in the game's code by the NHL94
              Match Viewer project, and tested in the game for 1 on 1 and 2 on 2 with line changes off and on. A ROM with smozoma's version is updated to this when
              its hacks are next applied.
            </>,
          )
        })()}
        {hack(
          'puckFriction',
          number('puckFriction'),
          <>
            How fast the puck slows down on the ice: each moment it loses 1 / 2<sup>n</sup> of its speed, so a smaller
            number slows it faster (8 is twice as fast as the original 9, 10 half as fast). A player receiving a pass
            slows the same way, and so does a skater caught by the runaway-speed bug. There is no friction in the air.
            From chaos's forum post, tested in the game by the NHL94 Match Viewer project: at 8 a loose puck keeps about
            0.80 of its speed a second, where the original's 9 keeps about 0.89. {stock('puckFriction')}
          </>,
        )}
        {hack(
          'hitEnergy',
          number('hitEnergy'),
          <>
            An option, from a community idea: a skater knocked down by a check or a poke check loses this much energy, so
            he is slower, shoots softer and loses puck battles more until he rests on the bench. 0 is the original game,
            where a hit costs the skater nothing. Only with line changes On, where the game's energy counts at all. Full
            energy is {FULL_ENERGY} units: {energyShare(wanted.hitEnergy)}. Recommended: {RECOMMENDED_HIT_ENERGY} (5%), what a
            burst of speed costs, about 25 seconds of skating. Measured over computer games, it tires the most-hit players noticeably (their lowest energy about a tenth lower) and the computer changes lines about 15% more often, while the average skater is hardly touched; people hit about twice as often. Half as
            much was measured as too small to notice. Up to 1024, a quarter of full energy, for a league that wants hits to
            wear players down. A knockdown by a puck, or a bump that does not knock him down, costs nothing. Read from the game's
            code by the NHL94 Match Viewer project, which measured the shifts and tested it in the game: each knockdown and hold takes its amount once, and nothing with line changes Off or Auto.
          </>,
          <button type="button" disabled={unknown('hitEnergy') || wanted.hitEnergy === RECOMMENDED_HIT_ENERGY} onClick={() => set({ hitEnergy: RECOMMENDED_HIT_ENERGY })}>
            Use the recommended {RECOMMENDED_HIT_ENERGY}
          </button>,
        )}
        {hack(
          'holdEnergy',
          number('holdEnergy'),
          <>
            The same for a skater caught by a hold or hook (A without the puck), once each time it catches him.{' '}
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
            the ice, with the clock running), so injuries stay rare: the game rolls 0 to 159 against the hit's impact, and
            this adds the number to the impact for each knockdown the skater has taken this game, up to the most below.
            Recommended: {RECOMMENDED_INJURY_BONUS} a knockdown, at most {RECOMMENDED_INJURY_CAP}: estimated from recorded
            league games at about 30% more injuries a game, with the skaters knocked down most (5 times or more) about 1.4
            times as likely to be hurt; a fifth of that was too little to notice. Knockdowns are counted with line changes
            on or off. Read from the game's code by the NHL94 Match Viewer project and tested in the game: each knockdown
            counts once, the counts start at 0 each game and halve at each intermission, and only hits that can already
            injure become likelier to.
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
        {hack(
          'goalieDelay',
          number('goalieDelay'),
          <>
            How long a player holds B before he takes control of his goalie, in counts of the game's timer: 17, about half
            a second, in the original game, so 12 is about a third of a second. It is the same for all four pads in 2 on 2.
            From smozoma's forum post; the NHL94 Match Viewer project checked every place in the game's code and tested
            it in the game on all four pads, 3 and 4 through a 4-Way Play adapter (12 counts took the goalie after 12
            frames, where the original takes 17).{' '}
            {stock('goalieDelay')}
          </>,
        )}
      </section>

      <section>
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
            From AdamCatalyst's forum post, with the puck's pieces placed in the game's code and tested in the game by the
            NHL94 Match Viewer project.
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
            Which of the game's colour sets both nets are drawn in, as for the puck. The net art keeps its own colour
            numbers, so in another set they take that set's colours in the same places: the crowd's gives red posts, as
            in clockwise's forum post. A team's colours may look odd, since they were never made for the net. The nets
            sit in the same table of pieces as the puck, placed by the NHL94 Match Viewer project.
          </>,
        )}
        {hack(
          'greenFan',
          onOff('greenFan'),
          "A fan in a green shirt in the stands is missing his arm and leg in the original game, cut off by the stairs. This puts them back from tiles still in the ROM. From kingraph's forum post, tested in the game by the NHL94 Match Viewer project; several league ROMs have it.",
        )}
        {hack(
          'introWait',
          number('introWait'),
          <>
            How long each of the two intro screens, EA Sports and High Score Productions, waits before moving on, in
            counts of four frames: with its fades, each screen lasts about 4.9 seconds at the original 80 and about 1.6 at
            20. A button skips either screen anyway. From AdamCatalyst's forum post, tested in the game by the NHL94 Match
            Viewer project. {stock('introWait')}
          </>,
        )}
      </section>

      <section>
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
            rests on a misreading of the game's code: the original formula is the physical one, where the heavier
            checker does better, and the only bug is an overflow for a checker a person controls. This fix swaps the
            weights round, so the computer's checkers then do better the lighter they are, and counts both players'
            checking ratings. It is kept for league ROMs that have it; for the weight bug, use the weight bug and
            C-then-B fix at the top of Fixes instead, and leave this off.
            {state.choices.weightFix === 'simple' && ' This ROM has an earlier fix, which swaps the weights and leaves checking ratings out of it.'}
          </>,
        )}
      </section>

      <section>
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
            {reweighed && <p>Every player's weight will be moved to the step nearest the pounds he weighs now, which can be up to 4 pounds out.</p>}
            {wanted.checkFix === 'all120' && wanted.weightFix !== 'off' && (
              <p>
                The weight bug and C-then-B fix and smozoma's legacy weight bug fix should not go together: with the
                first there is no overflow left to fix, and the legacy fix would then have every checker do better the
                lighter he is.
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

      <GenesisBloodSection project={project} onChange={onChange} />
    </main>
  )
}
