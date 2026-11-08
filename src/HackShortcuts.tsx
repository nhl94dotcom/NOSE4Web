import { useState } from 'react'
import { writeClipboard } from './clipboard'
import { download } from './download'

interface Props {
  // Sets the page's choices to the recommended fixes; false where they are all set already.
  onRecommended: (() => void) | false
  // What this ROM has, as a post for a league's Discord.
  discordText: () => string
  // The same, explained for a league's owners, as a page of its own.
  sheet: () => string
  // Starts the name of the sheet's file.
  name: string
}

// The buttons at the top of a Hacks page.
export function HackShortcuts({ onRecommended, discordText, sheet, name }: Props) {
  const [notice, setNotice] = useState('')
  // Once copied, the post stays shown, kept up to date with the ROM.
  const [shown, setShown] = useState(false)
  const text = shown ? discordText() : ''
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
            void writeClipboard(discordText())
            setShown(true)
            setNotice("Copied. Paste it into your league's Discord; the text is below too.")
          }}
        >
          Copy this ROM's hacks for Discord
        </button>{' '}
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
      {shown && <textarea className="discord-text" aria-label="This ROM's hacks for Discord" readOnly value={text} rows={Math.min(16, text.split('\n').length + 1)} />}
    </>
  )
}
