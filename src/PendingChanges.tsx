import { changesText } from './hackdraft'

// The bar along the bottom of a Hacks page while it has choices not applied yet.
export function PendingBar({ count, onApply, onSetBack }: { count: number; onApply: () => void; onSetBack: () => void }) {
  if (count === 0) return null
  return (
    <div className="pending-bar" role="status">
      <b>{changesText(count)} not applied yet.</b> Nothing in the ROM changes until you press Apply.{' '}
      <span className="pending-buttons">
        <button onClick={onApply}>Apply now</button>{' '}
        <button onClick={() => document.getElementById('hacks-apply')?.scrollIntoView({ behavior: 'smooth' })}>See the list</button>{' '}
        <button onClick={onSetBack}>Set back to the ROM</button>
      </span>
    </div>
  )
}

// On every other page while a draft is kept.
export function PendingNotice({ count, onGo }: { count: number; onGo: () => void }) {
  return (
    <p className="notice pending-notice" role="status">
      <b>The Hacks page has {changesText(count)} not applied yet.</b> Your choices are kept while you look at other
      pages. They go into the ROM when you press Apply there, and a download asks about them first.{' '}
      <button onClick={onGo}>Go to Hacks</button>
    </p>
  )
}

// On every other page while a MIDI file read on Game settings waits to be put in.
export function MusicPendingNotice({ title, onGo }: { title: string; onGo: () => void }) {
  return (
    <p className="notice pending-notice" role="status">
      <b>The music "{title}" is loaded on Game settings but not put in yet.</b> It is kept while you look at other
      pages. It goes into the ROM when you press Put it in there, and a download asks about it first.{' '}
      <button onClick={onGo}>Go to Game settings</button>
    </p>
  )
}

// On every other page while work set up on Bulk changes, Trade or Import a team is not done (pagedrafts.ts).
export function WorkPendingNotice({ text, button, place, onGo }: { text: string; button: string; place: string; onGo: () => void }) {
  return (
    <p className="notice pending-notice" role="status">
      <b>{text}</b> It is kept while you look at other pages. Nothing changes until you press {button} there, and a
      download asks about it first. <button onClick={onGo}>Go to {place}</button>
    </p>
  )
}
