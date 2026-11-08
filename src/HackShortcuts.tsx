import { useState } from 'react'
import { writeClipboard } from './clipboard'
import { download } from './download'

interface Props {
  // Sets the page's choices to the recommended fixes; false where they are all set already.
  onRecommended: (() => void) | false
  // What this ROM has, as a short post for a league's Discord.
  discordText: () => string
  // The same, each hack explained, as Discord messages to paste one after another.
  discordMessages: () => string[]
  // The same, explained for a league's owners, as a page of its own.
  sheet: () => string
  // Starts the name of the sheet's file.
  name: string
}

// The buttons at the top of a Hacks page.
export function HackShortcuts({ onRecommended, discordText, discordMessages, sheet, name }: Props) {
  const [notice, setNotice] = useState('')
  // Each hack explained, or the names only.
  const [explain, setExplain] = useState(true)
  // Once copied, the post stays shown, kept up to date with the ROM.
  const [shown, setShown] = useState(false)
  const messages = () => (explain ? discordMessages() : [discordText()])
  const shownMessages = shown ? messages() : []
  const copy = (all: string[], i: number) => {
    void writeClipboard(all[i])
    setNotice(
      all.length === 1
        ? "Copied. Paste it into your league's Discord; the text is below too."
        : `Copied message ${i + 1} of ${all.length}. Paste it into your league's Discord, then copy the next one below.`,
    )
  }
  return (
    <>
      <p>
        <button
          disabled={!onRecommended}
          onClick={() => {
            if (!onRecommended) return
            onRecommended()
            setNotice('The recommended fixes are set. Check the list under Apply below, then press Apply.')
          }}
        >
          Turn on the recommended fixes
        </button>{' '}
        <button
          onClick={() => {
            copy(messages(), 0)
            setShown(true)
          }}
        >
          Copy this ROM's hacks for Discord
        </button>{' '}
        <label>
          <input type="checkbox" checked={explain} onChange={(e) => setExplain(e.target.checked)} /> explain each hack
        </label>{' '}
        <button
          onClick={() => {
            download(sheet(), `${name}_hacks.html`, 'text/html')
            setNotice("Downloaded. The page explains each of this ROM's hacks for your league's owners; open it to read or print it, or share the file.")
          }}
        >
          Download hack sheet
        </button>{' '}
        <span className="note">{notice || (onRecommended ? '' : 'Every recommended fix is set.')}</span>
      </p>
      {shownMessages.map((text, i) => (
        <div key={i} className="discord-message">
          {shownMessages.length > 1 && (
            <button onClick={() => copy(shownMessages, i)}>
              Copy message {i + 1} of {shownMessages.length}
            </button>
          )}
          <textarea
            className="discord-text"
            aria-label={shownMessages.length > 1 ? `This ROM's hacks for Discord, message ${i + 1}` : "This ROM's hacks for Discord"}
            readOnly
            value={text}
            rows={Math.min(16, text.split('\n').length + 1)}
          />
        </div>
      ))}
    </>
  )
}
