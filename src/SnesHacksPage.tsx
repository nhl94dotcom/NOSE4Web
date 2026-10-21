import { useMemo, useState, type ReactNode } from 'react'
import type { RomProject } from './core/rom'
import { applySnesHacks, detectSnesHacks, SNES_HACK_TITLES, SNES_HACKS, type SnesHack, type SnesHackChoices } from './core/sneshacks'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

const ABOUT: Record<SnesHack, ReactNode> = {
  hotColdFix: (
    <>
      Before each game the SNES makes every player a little hot or cold in each rating, but a bug turns every cold
      value into a large one, so about half of every player's ratings play at the maximum, 15, whatever they are in the
      ROM. This fixes it, so that hot and cold move a rating by a point or so either way and the ratings you set are
      the ones that play. It changes how every game plays, so try it before a league uses it.
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
  defenceControl: 'Turns defence control on for both teams at the start of every game, where the original game starts with it off.',
  oneMinutePenalties: 'Makes every minor penalty one minute long instead of two.',
  thirtySecondPeriods: 'Adds 30 seconds to the period lengths on the main menu. It is in the original game, but hidden.',
  noInterference: 'Interference is never called.',
  noPenaltyShots: 'A foul on a breakaway is called as an ordinary penalty, never a penalty shot.',
  noGoalPosts: 'A puck that reaches the net between the posts is always a goal: it never rings off the post or the crossbar.',
  skipEaIntro: 'Starts the game without the EA logo.',
  skipPucksIntro: 'Starts the game without the flying pucks.',
}

const GROUPS: { title: string; hacks: SnesHack[] }[] = [
  { title: 'Fixes', hacks: ['hotColdFix', 'ppPkFix'] },
  { title: 'Rules and play', hacks: ['defenceControl', 'oneMinutePenalties', 'thirtySecondPeriods', 'noInterference', 'noPenaltyShots', 'noGoalPosts'] },
  { title: 'Starting up', hacks: ['skipEaIntro', 'skipPucksIntro'] },
]

export function SnesHacksPage({ project, onChange }: Props) {
  const state = useMemo(() => detectSnesHacks(project.bytes), [project.bytes])
  // The choices being made, which start again from the ROM whenever it changes.
  const [draft, setDraft] = useState({ rom: project.bytes, choices: state.choices })
  if (draft.rom !== project.bytes) setDraft({ rom: project.bytes, choices: state.choices })
  const wanted: SnesHackChoices = draft.rom === project.bytes ? draft.choices : state.choices
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const changed = SNES_HACKS.filter((hack) => wanted[hack] !== state.choices[hack])

  function apply() {
    try {
      onChange(applySnesHacks(project, wanted))
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
        Changes to the SNES game itself, from the patches of the community's disassembly of the game,{' '}
        <a href="https://github.com/Mhopkinsinc/NHL94SNESVault" target="_blank" rel="noreferrer">
          NHL94SNESVault
        </a>
        . The page shows what this ROM has now. Change what you like and press Apply; nothing is changed until you do.
        Test a hacked ROM in a game before a league plays on it.
      </p>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3>{group.title}</h3>
          {group.hacks.map((hack) => {
            const unknown = state.unknown.includes(hack)
            return (
              <div className="hack" key={hack}>
                <label>
                  <b>{SNES_HACK_TITLES[hack]}</b>{' '}
                  <select
                    aria-label={SNES_HACK_TITLES[hack]}
                    disabled={unknown}
                    value={wanted[hack] ? 'on' : 'off'}
                    onChange={(e) => {
                      setDraft({ rom: project.bytes, choices: { ...wanted, [hack]: e.target.value === 'on' } })
                      setNotice('')
                      setError('')
                    }}
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                </label>
                <p className="note">
                  {ABOUT[hack]}
                  {unknown && <b> This ROM has something else in its place, so it is left exactly as it is.</b>}
                </p>
              </div>
            )
          })}
        </section>
      ))}
      <section>
        <p>
          <button disabled={changed.length === 0} onClick={apply}>
            Apply
          </button>{' '}
          <button disabled={changed.length === 0} onClick={() => setDraft({ rom: project.bytes, choices: state.choices })}>
            Set back to what the ROM has
          </button>{' '}
          <span className="note">{notice}</span>
        </p>
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
