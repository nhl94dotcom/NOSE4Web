import { useEffect, useMemo, useState } from 'react'
import { overallRating } from './core/rating'
import type { RomProject } from './core/rom'
import {
  applySeason,
  buildSeasonRosters,
  DEFAULT_SEASON_OPTIONS,
  defaultPlacement,
  parseSeason,
  seasonBuilderSupported,
  seasonLabel,
  type Season,
  type SeasonOptions,
} from './core/seasonbuilder'
import { teamLabels } from './core/team'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// The season files sit beside the site (scripts/fetch-seasons.mjs).
const load = (file: string) =>
  fetch(`seasons/${file}`).then((r) => {
    if (!r.ok) throw new Error(`The season data could not be loaded (${r.status}).`)
    return r.json()
  })

export function RealSeasonPage({ project, onChange }: Props) {
  const [seasons, setSeasons] = useState<string[]>([])
  const [franchises, setFranchises] = useState<Record<string, string[]>>({})
  const [chosen, setChosen] = useState('')
  const [season, setSeason] = useState<Season | null>(null)
  const [placement, setPlacement] = useState<(number | null)[]>([])
  const [options, setOptions] = useState<SeasonOptions>(DEFAULT_SEASON_OPTIONS)
  const [shown, setShown] = useState(0)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState<string[]>([])
  const supported = seasonBuilderSupported(project.game)

  useEffect(() => {
    if (!supported) return
    Promise.all([load('index.json'), load('franchises.json')])
      .then(([list, names]: [string[], Record<string, string[]>]) => {
        setSeasons(list)
        setFranchises(names)
        // The season the original game's ratings come from, to begin with.
        setChosen(list.includes('19921993') ? '19921993' : list[list.length - 1])
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [supported])

  useEffect(() => {
    if (!chosen) return
    let current = true
    setSeason(null)
    load(`${chosen}.json`)
      .then((file) => {
        if (!current) return
        const next = parseSeason(file)
        setSeason(next)
        setPlacement(defaultPlacement(project, next, franchises))
        setShown(0)
        setNotes([])
        setError('')
      })
      .catch((e: unknown) => current && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      current = false
    }
    // The placement starts afresh only for a new season, not each change to the ROM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen, franchises])

  const built = useMemo(() => (season ? buildSeasonRosters(project.game, season, options) : []), [season, options, project.game])
  const ours = teamLabels(project.teams, project.game)
  const placed = placement.filter((s) => s !== null).length
  // The ROM's teams a season's team can go to without being chosen by hand: all but its All-Star teams.
  const places = project.teams.filter((t) => !/all.?stars?/i.test(t.names.join(' '))).length

  if (!supported) {
    return (
      <main className="team help">
        <h2>Real NHL season</h2>
        <p className="note">This ROM's players have attributes of their own making, so a real season's players cannot be rated for it.</p>
      </main>
    )
  }

  function bringIn() {
    if (!season) return
    try {
      const result = applySeason(project, season, placement, options, built)
      onChange(result.project)
      setNotes(result.notes)
      setError('')
    } catch (e) {
      setNotes([])
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const number = (key: 'goalies' | 'forwards' | 'defence', label: string, min: number, max: number) => (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={options[key]}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          if (Number.isFinite(n)) setOptions({ ...options, [key]: Math.max(min, Math.min(max, n)) })
        }}
      />
    </label>
  )
  const view = built[shown]

  return (
    <main className="team help">
      <h2>Real NHL season</h2>
      <p className="note">
        Fills teams with the players of a real NHL season, 1967-68 on, rated from that season's stats: where each player
        stands among that season's players, given out in the same proportions as the original NHL 94's ratings. Each
        team gets the players with the most games for it, newly built lines, and Offence and Defence ratings by its goals
        for and against. Undo takes it all back.
      </p>
      <div className="fields">
        <label>
          Season
          <select aria-label="Season" value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {seasons.map((id) => (
              <option key={id} value={id}>
                {seasonLabel(id)}
              </option>
            ))}
          </select>
        </label>
        {number('goalies', 'Goalies', 1, 3)}
        {number('forwards', 'Forwards', 9, 15)}
        {number('defence', 'Defence', 6, 12)}
      </div>
      <p>
        <label className="choice">
          <input type="checkbox" checked={options.names} onChange={(e) => setOptions({ ...options, names: e.target.checked })} /> Use that
          season's team names (place, initials and nickname)
        </label>
      </p>
      {error && <p className="error">{error}</p>}
      {!season && !error && <p className="note">Loading the season…</p>}
      {season && (
        <>
          <h3>Where each team goes</h3>
          <p className="note">
            Each team goes where the ROM has the same team or franchise; the rest go to the teams left over. Choose
            Keep as it is for a team to leave alone.
          </p>
          <table className="season-placement">
            <tbody>
              {project.teams.map((_, slot) => (
                <tr key={slot}>
                  <td>{ours[slot]}</td>
                  <td>
                    <select
                      aria-label={`Season team for ${ours[slot]}`}
                      value={placement[slot] ?? ''}
                      onChange={(e) => {
                        const next = e.target.value === '' ? null : Number(e.target.value)
                        // A season team goes to one place only: where it was is kept as it is.
                        setPlacement(placement.map((s, i) => (i === slot ? next : s === next ? null : s)))
                      }}
                    >
                      <option value="">Keep as it is</option>
                      {season.teams.map((t, s) => (
                        <option key={s} value={s}>
                          {t.location} {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {season.teams.length > places && (
            <p className="note">
              {season.season} has {season.teams.length} teams, and this ROM has places for {places}, not counting its
              All-Star teams. To bring them all in, open a ROM with {season.teams.length} or more team places, such as a
              league's 32-team ROM.
            </p>
          )}
          {season.teams.some((_, s) => !placement.includes(s)) && (
            <p className="note">
              Not brought in:{' '}
              {season.teams
                .filter((_, s) => !placement.includes(s))
                .map((t) => `${t.location} ${t.name}`)
                .join(', ')}
              .
            </p>
          )}
          <p>
            <button disabled={placed === 0} onClick={bringIn}>
              Bring in {placed} {placed === 1 ? 'team' : 'teams'} from {season.season}
            </button>
          </p>
          {notes.length > 0 && (
            <ul>
              {notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
          <h3>The players</h3>
          <p>
            <label>
              Show{' '}
              <select aria-label="Season team to show" value={shown} onChange={(e) => setShown(Number(e.target.value))}>
                {season.teams.map((t, s) => (
                  <option key={s} value={s}>
                    {t.location} {t.name}
                  </option>
                ))}
              </select>
            </label>
          </p>
          {view && (
            <table className="season-players">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>#</th>
                  <th>Season</th>
                  <th>Overall</th>
                </tr>
              </thead>
              <tbody>
                {view.players.map((p, i) => (
                  <tr key={i}>
                    <td>{p.player.name}</td>
                    <td>{p.player.jersey ? p.player.jersey.toString(16) : ''}</td>
                    <td>{p.line}</td>
                    <td>{overallRating(p.player.attributes, p.isGoalie, project.game)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="note">
            Speed, Agility and Checking are the least sure: no stat measures them, so they come from what goes with them
            (games, points, shots, age, size). Change any player on his team's page afterwards. Stats: the NHL's public
            stats service.
          </p>
        </>
      )}
    </main>
  )
}
