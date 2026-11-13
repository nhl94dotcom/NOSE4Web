import { useEffect } from 'react'

// Every page's sections fold: a click (or Enter or Space) on a section's heading, its first child, hides or shows
// the rest of it. Which are folded is kept per heading text in this browser, so a section stays as it was left.
// Done on the page's elements, so every page's sections work the same way without each knowing.
const KEY = 'nose4web.collapsedSections'
const HEADING = 'main section > h2:first-child, main section > h3:first-child'

export function useCollapsibleSections(): void {
  useEffect(() => {
    let folded = new Set<string>()
    try {
      folded = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
    } catch {
      // No storage: nothing remembered.
    }
    const save = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify([...folded]))
      } catch {
        // No storage: not remembered.
      }
    }
    const keyOf = (heading: Element) => `${heading.tagName}:${(heading.textContent ?? '').trim()}`
    const apply = () => {
      for (const heading of document.querySelectorAll(HEADING)) {
        const isFolded = folded.has(keyOf(heading))
        // Still a heading (screen readers and the page's own outline), with a tab stop and its state.
        if (!heading.hasAttribute('data-fold')) {
          heading.setAttribute('data-fold', '')
          heading.setAttribute('tabindex', '0')
          heading.setAttribute('title', 'Click to fold or unfold this section')
        }
        if (heading.getAttribute('aria-expanded') !== String(!isFolded)) heading.setAttribute('aria-expanded', String(!isFolded))
        const section = heading.parentElement!
        if (section.hasAttribute('data-folded') !== isFolded) section.toggleAttribute('data-folded', isFolded)
      }
    }
    const toggle = (heading: Element) => {
      const key = keyOf(heading)
      if (folded.has(key)) folded.delete(key)
      else folded.add(key)
      save()
      apply()
    }
    const headingOf = (target: EventTarget | null) => (target instanceof Element ? target.closest(HEADING) : null)
    const onClick = (event: MouseEvent) => {
      const heading = headingOf(event.target)
      // Controls inside a heading keep their own clicks.
      if (heading && !(event.target as Element).closest('button, a, input, select, textarea, label')) toggle(heading)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const heading = headingOf(event.target)
      if (heading && event.target === heading) {
        event.preventDefault()
        toggle(heading)
      }
    }
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    apply()
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
}
