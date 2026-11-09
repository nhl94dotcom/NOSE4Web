import { useState } from 'react'
import { canAddGenesisBlood, hasGenesisBlood, withGenesisBloodAdded, withGenesisBloodTakenOut } from './core/genesisblood'
import type { RomProject } from './core/rom'

interface Props {
  project: RomProject
  onChange: (project: RomProject) => void
}

// Head bleeding for game injuries, after NHLPA '93. See core/genesisblood.ts.
export function GenesisBloodSection({ project, onChange }: Props) {
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  const added = hasGenesisBlood(project)
  if (!added && !canAddGenesisBlood(project)) return null

  function act(change: () => RomProject, message: string) {
    try {
      const next = change()
      onChange(next)
      const grew = next.bytes.length > project.bytes.length ? ` The ROM grew to ${next.bytes.length / 0x100000} MB to make room.` : ''
      setNotice(message + grew)
      setFailed(false)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
      setFailed(true)
    }
  }

  return (
    <section>
      <h3>Head bleeding</h3>
      <p className="note">
        In NHLPA '93 a player hurt by a check lies on the ice with blood spreading from his head; NHL '94 took the blood out. With this on, a
        player hurt for the game bleeds as he lies there: a little as he lands, more half a second later. A player out for the period lies as
        before. Only the look changes, not how the game plays. The blood is drawn in colours 13 and 14 of the arena palette, which are dark reds
        in the original game. The ROM's sprite frame table is copied to the end of the ROM to make room, which grows a 1 MB ROM to 2 MB.
        {added ? ' This ROM has it.' : ''}
      </p>
      <p>
        {added ? (
          <button onClick={() => act(() => withGenesisBloodTakenOut(project), 'Head bleeding taken out. Undo puts it back.')}>Take head bleeding out</button>
        ) : (
          <button onClick={() => act(() => withGenesisBloodAdded(project), 'Head bleeding added: a player hurt for the game now bleeds.')}>Add head bleeding</button>
        )}{' '}
        {notice && <span className={failed ? 'error' : 'note'}>{notice}</span>}
      </p>
    </section>
  )
}
