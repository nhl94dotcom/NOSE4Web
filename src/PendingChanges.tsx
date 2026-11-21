import { changesText } from './hackdraft'

// The bar along the bottom of a Hacks page while it has choices not applied yet.
export function PendingBar({ count, onApply, onSetBack }: { count: number; onApply: () => void; onSetBack: () => void }) {
  if (count === 0) return null
  return (
    <div className="pending-bar" role="status">
      <b>{changesText(count)} not applied yet.</b> Nothing changes in the ROM until you press Apply.{' '}
      <span className="pending-buttons">
        <button onClick={onApply}>Apply them</button>{' '}
        <button onClick={() => document.getElementById('hacks-apply')?.scrollIntoView({ behavior: 'smooth' })}>See the list</button>{' '}
        <button onClick={onSetBack}>Set back</button>
      </span>
    </div>
  )
}

// On every other page while a draft is kept.
export function PendingNotice({ count, onGo }: { count: number; onGo: () => void }) {
  return (
    <p className="notice pending-notice" role="status">
      <b>The Hacks page has {changesText(count)} not applied yet.</b> They are kept while you look at other pages, but
      they are not in the ROM, or in a download, until you press Apply there. <button onClick={onGo}>Go to Hacks</button>
    </p>
  )
}

// On every other page while a MIDI file read on Game settings waits to be put in.
export function MusicPendingNotice({ title, onGo }: { title: string; onGo: () => void }) {
  return (
    <p className="notice pending-notice" role="status">
      <b>The music "{title}" is loaded on Game settings but not put in yet.</b> It is kept while you look at other pages,
      but it is not in the ROM, or in a download, until you press Put it in there. <button onClick={onGo}>Go to Game settings</button>
    </p>
  )
}
