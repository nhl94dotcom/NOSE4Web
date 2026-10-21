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
  holdSeconds,
  NO_HACKS,
  sameHacks,
  STAR_TEXTS,
  type Bodychecks,
  type CheckFix,
  type Bonuses,
  type HackChoices,
  type ThreeStars,
  type WeightFix,
} from './core/hacks'
import type { RomProject } from './core/rom'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
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

export function HacksPage({ project, onChange }: Props) {
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
  const onOff = (key: 'secondAssist' | 'plusMinus' | 'aggressionFix' | 'ppPkFix' | 'comebackFix' | 'stamina' | 'realTime') => (
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

      <section>
        <h3>Fixes</h3>
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
            checking ratings. For the weight bug itself, the checking fix below is the better choice. This one is
            kept for league ROMs that have it.
            {state.choices.weightFix === 'simple' && ' This ROM has an earlier fix, which swaps the weights and leaves checking ratings out of it.'}
          </>,
        )}
        {hack(
          'secondAssist',
          onOff('secondAssist'),
          'When two players pass back and forth and then one scores, the original game gives no assist to the player who passed to them. This gives it.',
        )}
        {hack(
          'checkFix',
          <select aria-label={HACK_TITLES.checkFix} disabled={unknown('checkFix')} value={wanted.checkFix} onChange={(e) => set({ checkFix: e.target.value as CheckFix })}>
            <option value="off">Off</option>
            <option value="all120">Everyone checks as the computer</option>
            {state.choices.checkFix === 'all240' && <option value="all240">Keep this ROM's earlier fix: everyone checks as a person</option>}
          </select>,
          <>
            The original game judges a check one way when a person controls the checker at the moment of contact and
            another when the computer does, and works the person's way out in a single byte that overflows. That
            overflow is the weight bug: a light skater you control knocks down anyone two or more weight steps heavier,
            and a heavy one struggles. Pressing C to charge and then B to switch away hands the checker to the computer
            just before he hits, the C-then-B check. This fix, found by the NHL94 Match Viewer project, judges every
            check the computer's way, which never overflows: the heavier checker does better, as it should, and
            switching away gains nothing. Your checks get easier than they were against players your own weight or
            lighter. Leave the weight bug fix above off with it.
            {state.choices.checkFix === 'all240' &&
              " This ROM has the editor's earlier C-then-B fix, which judges every check the person's way, so the computer's checkers get the weight bug too."}
          </>,
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
      </section>

      <section>
        <h3>Statistics</h3>
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
                The checking fix and the weight bug fix should not go together: with the checking fix there is no
                overflow left to fix, and the weight bug fix would then have every checker do better the lighter he is.
              </p>
            )}
            {wanted.weightFix === 'on' && state.choices.weightFix !== 'on' && (
              <p>
                The weight bug fix is balanced for the original game's players. Keep checking ratings about where the
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
            }}
          >
            Set back to what the ROM has
          </button>{' '}
          <span className="note">{notice}</span>
        </p>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
