import { useState } from 'react'
import { readClipboard, writeClipboard } from './clipboard'
import { copyDraws, pasteDraws } from './core/clipboard'
import type { GameConfig } from './core/games'
import { MAX_SECONDS, menuOptions, type FixedText, type Settings } from './core/settings'
import { resetSettingsPart, settingsPartChanged } from './core/reset'
import { ResetButton } from './ResetButton'

function cleanText(text: string): string {
  return text.replace(/[^\x20-\x7d]/g, '')
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

interface Props {
  game: GameConfig
  settings: Settings
  // The settings as they are in the ROM that was opened.
  original: Settings
  teamNames: string[]
  onChange: (settings: Settings) => void
}

export function SettingsEditor({ game, settings, original, teamNames, onChange }: Props) {
  // Playoff draws ticked for copying and pasting.
  const [ticked, setTicked] = useState<number[]>([])
  const [notice, setNotice] = useState('')

  async function copyTicked() {
    await writeClipboard(copyDraws(settings.playoffDraws, ticked))
    setNotice(`Copied ${ticked.length === 1 ? '1 draw' : `${ticked.length} draws`}.`)
  }

  async function pasteOverTicked() {
    try {
      const playoffDraws = pasteDraws(settings.playoffDraws, ticked, await readClipboard(), teamNames.length)
      onChange({ ...settings, playoffDraws })
      setNotice('Pasted.')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  function replace<T>(list: T[], index: number, value: T): T[] {
    return list.map((v, i) => (i === index ? value : v))
  }

  function textInput<T extends FixedText>(value: T, onText: (next: T) => void) {
    return (
      <input
        value={value.text}
        maxLength={value.maxLength}
        size={value.maxLength}
        onChange={(e) => onText({ ...value, text: cleanText(e.target.value) })}
      />
    )
  }

  function secondsInput(seconds: number, onSeconds: (next: number) => void) {
    return (
      <>
        <input
          className="seconds"
          type="number"
          min={0}
          max={MAX_SECONDS}
          value={seconds}
          onChange={(e) => onSeconds(Math.min(MAX_SECONDS, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}
        />{' '}
        <span className="note">{clock(seconds)}</span>
      </>
    )
  }

  function byteInput(value: number, onValue: (next: number) => void) {
    return (
      <input
        className="seconds"
        type="number"
        min={0}
        max={255}
        value={value}
        onChange={(e) => onValue(Math.min(255, Math.max(0, Math.floor(Number(e.target.value)) || 0)))}
      />
    )
  }

  const duplicateDraws = settings.playoffDraws
    .map((draw, i) => (new Set(draw).size < draw.length ? i + 1 : 0))
    .filter((n) => n > 0)

  return (
    <main className="team">
      <section>
        <h2>Clock</h2>
        <p>
          <ResetButton
            what="clock settings"
            changed={settingsPartChanged(settings, original, 'clock')}
            onReset={() => onChange(resetSettingsPart(settings, original, 'clock'))}
          />
        </p>
        <table className="left">
          <thead>
            <tr>
              <th />
              <th>Seconds</th>
              <th>Menu text</th>
            </tr>
          </thead>
          <tbody>
            {settings.periodLengths.map((period, i) => (
              <tr key={i}>
                <td>{i < 3 ? `Period length, choice ${i + 1}` : 'Period length, fourth entry'}</td>
                <td>
                  {secondsInput(period.seconds, (seconds) =>
                    onChange({ ...settings, periodLengths: replace(settings.periodLengths, i, { ...period, seconds }) }),
                  )}
                </td>
                <td>
                  {textInput(period, (next) =>
                    onChange({ ...settings, periodLengths: replace(settings.periodLengths, i, next) }),
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td>Overtime</td>
              <td>{secondsInput(settings.overtimeSeconds, (overtimeSeconds) => onChange({ ...settings, overtimeSeconds }))}</td>
              <td />
            </tr>
            <tr>
              <td>Shootout (penalty shot)</td>
              <td>{secondsInput(settings.shootoutSeconds, (shootoutSeconds) => onChange({ ...settings, shootoutSeconds }))}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <p className="note">The menu text does not update itself when you change the seconds.</p>
      </section>

      <section>
        <h2>Main menu starting choices</h2>
        <p>
          <ResetButton
            what="starting choices"
            changed={settingsPartChanged(settings, original, 'menu')}
            onReset={() => onChange(resetSettingsPart(settings, original, 'menu'))}
          />
        </p>
        <table className="left">
          <tbody>
            {settings.menu.map((item, i) => {
              const options = menuOptions(settings, game, i, teamNames)
              return (
                <tr key={i}>
                  <td>{item.caption}</td>
                  <td>
                    <select
                      className="wide"
                      value={item.value}
                      onChange={(e) =>
                        onChange({ ...settings, menu: replace(settings.menu, i, { ...item, value: Number(e.target.value) }) })
                      }
                    >
                      {item.value >= options.length && <option value={item.value}>Invalid ({item.value})</option>}
                      {options.map((option, o) => (
                        <option key={o} value={o}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Rule messages</h2>
        <p>
          <ResetButton
            what="rule messages"
            changed={settingsPartChanged(settings, original, 'rules')}
            onReset={() => onChange(resetSettingsPart(settings, original, 'rules'))}
          />
        </p>
        <table className="left">
          <thead>
            <tr>
              <th>Message</th>
              <th>Fade-out delay</th>
              <th>Penalty minutes</th>
            </tr>
          </thead>
          <tbody>
            {settings.rules.map((rule, i) => (
              <tr key={rule.offset}>
                <td>{textInput(rule, (next) => onChange({ ...settings, rules: replace(settings.rules, i, next) }))}</td>
                <td>
                  {byteInput(rule.delay, (delay) =>
                    onChange({ ...settings, rules: replace(settings.rules, i, { ...rule, delay }) }),
                  )}
                </td>
                <td>
                  {byteInput(rule.penaltyMinutes, (penaltyMinutes) =>
                    onChange({ ...settings, rules: replace(settings.rules, i, { ...rule, penaltyMinutes }) }),
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">
          Several messages appear more than once because the game keeps separate copies for different situations.
        </p>
      </section>

      <section>
        <h2>Playoff draws</h2>
        <p className="note">
          The game picks one of these {settings.playoffDraws.length} draws when a new playoff starts.
          {duplicateDraws.length > 0 && (
            <span className="error"> A team appears twice in draw {duplicateDraws.join(', ')}.</span>
          )}
        </p>
        <p>
          <button disabled={ticked.length === 0} onClick={() => void copyTicked()}>
            Copy ticked
          </button>{' '}
          <button disabled={ticked.length === 0} onClick={() => void pasteOverTicked()}>
            Paste over ticked
          </button>{' '}
          <ResetButton
            what="playoff draws"
            changed={settingsPartChanged(settings, original, 'playoffDraws')}
            onReset={() => onChange(resetSettingsPart(settings, original, 'playoffDraws'))}
          />{' '}
          <span className="note">{notice}</span>
        </p>
        <table>
          <thead>
            <tr>
              <th />
              <th>#</th>
              {game.playoffSlotLabels.map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.playoffDraws.map((draw, d) => (
              <tr key={d}>
                <td>
                  <input
                    type="checkbox"
                    title="Select for copy and paste"
                    checked={ticked.includes(d)}
                    onChange={(e) =>
                      setTicked(e.target.checked ? [...ticked, d].sort((a, b) => a - b) : ticked.filter((i) => i !== d))
                    }
                  />
                </td>
                <td>{d + 1}</td>
                {draw.map((team, slot) => (
                  <td key={slot}>
                    <select
                      className="narrow"
                      value={team}
                      onChange={(e) =>
                        onChange({
                          ...settings,
                          playoffDraws: replace(settings.playoffDraws, d, replace(draw, slot, Number(e.target.value))),
                        })
                      }
                    >
                      {team >= teamNames.length && <option value={team}>Invalid ({team})</option>}
                      {teamNames.map((name, t) => (
                        <option key={t} value={t}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
