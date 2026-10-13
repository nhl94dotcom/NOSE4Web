import { useMemo, useState, type ReactNode } from 'react'
import { WEIGHT_BASES } from './core/attributes'
import {
  applyHacks,
  baseWeightForYear,
  BONUS_TEXTS,
  detectHacks,
  HACK_PARTS,
  HACK_TITLES,
  hackChanges,
  NO_HACKS,
  sameHacks,
  STAR_TEXTS,
  type Bodychecks,
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
const BONUS_NOTES: Record<Bonuses, string> = {
  original:
    'The game makes each player a little hot or cold for a game. The ratings Edit Lines shows include bonuses too, but not the ones the players really get, so they mislead.',
  disabled: 'No player is hot or cold, on the ice or in Edit Lines. Players are the same every game, which suits leagues that want an even contest.',
  hidden: 'Players are still hot or cold on the ice, but Edit Lines shows their plain ratings, so you have to feel who is hot.',
  playersMatchLines: 'The players get the bonuses Edit Lines shows, so a player can be hot in one attribute and cold in another.',
  linesMatchPlayers: 'Edit Lines shows the bonuses the players really have, so each player is hot or cold in everything at once.',
}

export function HacksPage({ project, onChange }: Props) {
  const state = useMemo(() => detectHacks(project.bytes), [project.bytes])
  // The choices being made, which start again from the ROM whenever it changes.
  const [draft, setDraft] = useState({ rom: project.bytes, choices: state.choices })
  if (draft.rom !== project.bytes) setDraft({ rom: project.bytes, choices: state.choices })
  const wanted = draft.rom === project.bytes ? draft.choices : state.choices
  const [year, setYear] = useState('')
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
  const onOff = (key: 'secondAssist' | 'plusMinus') => (
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
        Changes to the game itself: bug fixes, extra statistics, finer ratings. They are the work of smozoma, from his
        program{' '}
        <a href="https://github.com/nhl94dotcom/smozROM" target="_blank" rel="noreferrer">
          smozROM
        </a>
        , built in here with his permission. The page shows what this ROM has now. Change what you like and press
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
            The original game has a bug that makes light players good at checking and heavy players easy to knock
            over. This turns that round, and also counts both players' checking ratings in whether a check succeeds.
            {state.choices.weightFix === 'simple' && ' This ROM has an earlier fix, which swaps the weights and leaves checking ratings out of it.'}
          </>,
        )}
        {hack(
          'secondAssist',
          onOff('secondAssist'),
          'When two players pass back and forth and then one scores, the original game gives no assist to the player who passed to them. This gives it.',
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
            {BONUS_NOTES[wanted.bonuses]} Whatever you choose, the announcer's pre-game ratings stay as they were.
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
          <button disabled={sameHacks(wanted, state.choices)} onClick={() => set(state.choices)}>
            Set back to what the ROM has
          </button>{' '}
          <span className="note">{notice}</span>
        </p>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
