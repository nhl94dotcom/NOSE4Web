import { useEffect } from 'react'

// A page with several sections shows them one at a time, chosen by a row of tabs at its top (a new member found the
// long pages, everything at once, too much). A tab is named by its section's heading, or by data-tab where several
// sections share one or the heading is long; "All" shows the page as one long page, as it was. Done on the page's
// elements, as the folding of sections is, so every page has tabs without each knowing: a section of the page (a
// <section> directly in its <main>) is a tab, unless it has data-tab-always (shown whatever the tab, like the Hacks
// page's Apply); a page with data-no-tabs (Help, a document to read through) has none. The tab last chosen on each
// page is kept in this browser; all the teams' pages share one, so going from team to team stays on, say, Lines.
const KEY = 'nose4web.sectionTabs'
export const ALL_SECTIONS = 'All'
// Fewer sections than this are shown together.
const MIN_TABS = 3

const headingOf = (section: Element) => section.querySelector(':scope > h2:first-child, :scope > h3:first-child')

// The tab a section is on: its data-tab, or its heading without a count at the end ("Skaters (18)").
export function tabOf(section: Element): string {
  const named = section.getAttribute('data-tab')
  if (named) return named
  return (headingOf(section)?.textContent ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim()
}

export function useSectionTabs(pageKey: string): void {
  useEffect(() => {
    let chosen: Record<string, string> = {}
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
      if (stored && typeof stored === 'object') chosen = stored as Record<string, string>
    } catch {
      // No storage: each page starts on its first tab.
    }
    const save = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(chosen))
      } catch {
        // No storage: not remembered.
      }
    }
    let bar: HTMLElement | null = null
    let shownTabs: string[] = []
    const page = () => document.querySelector('.body > main')
    const sectionsOf = (main: Element) =>
      [...main.children].filter((child) => child.tagName === 'SECTION' && !child.hasAttribute('data-tab-always') && tabOf(child) !== '')
    // The tab chosen here, kept even while a team without it is shown (a team with no photos), the first otherwise.
    const activeOf = (tabs: string[]) => {
      const wanted = chosen[pageKey] ?? chosen['*']
      return wanted === ALL_SECTIONS || (wanted !== undefined && tabs.includes(wanted)) ? wanted : tabs[0]
    }
    const choose = (tab: string) => {
      chosen[pageKey] = tab
      save()
      apply()
      // The new tab from its top, the tabs still in view.
      const main = page()
      if (main && bar && main.scrollTop > bar.offsetTop) main.scrollTop = bar.offsetTop
    }
    const removeBar = () => {
      bar?.remove()
      bar = null
      shownTabs = []
    }
    const apply = () => {
      const main = page()
      const sections = main && !main.hasAttribute('data-no-tabs') ? sectionsOf(main) : []
      const tabs = [...new Set(sections.map(tabOf))]
      if (tabs.length < MIN_TABS) {
        removeBar()
        for (const child of main?.children ?? []) child.removeAttribute('data-tab-hidden')
        return
      }
      if (!bar || bar.parentElement !== main || shownTabs.join('\n') !== tabs.join('\n')) {
        removeBar()
        bar = document.createElement('div')
        bar.className = 'section-tabs'
        bar.setAttribute('role', 'tablist')
        bar.setAttribute('aria-label', 'Sections of this page')
        for (const tab of [...tabs, ALL_SECTIONS]) {
          const button = document.createElement('button')
          button.type = 'button'
          button.setAttribute('role', 'tab')
          button.textContent = tab
          if (tab === ALL_SECTIONS) button.title = 'Show every section of this page, one under another'
          button.addEventListener('click', () => choose(tab))
          bar.append(button)
        }
        shownTabs = tabs
        main!.insertBefore(bar, sections[0])
      }
      const active = activeOf(tabs)
      for (const button of bar.children) {
        const on = button.textContent === active
        if (button.getAttribute('aria-selected') !== String(on)) button.setAttribute('aria-selected', String(on))
        button.classList.toggle('active', on)
      }
      // What lies between sections (the team page's roster tools and Add player, between Team and Lines) goes with the
      // section before it; what comes before the first, or after one shown under every tab, is always shown.
      let tab: string | null = null
      for (const child of main!.children) {
        if (child === bar) continue
        if (child.tagName === 'SECTION') tab = sections.includes(child) ? tabOf(child) : child.hasAttribute('data-tab-always') ? null : tab
        const hidden = tab !== null && active !== ALL_SECTIONS && tab !== active
        if (child.hasAttribute('data-tab-hidden') !== hidden) child.toggleAttribute('data-tab-hidden', hidden)
      }
    }
    // A link to a place in the page (the Help's contents, a note's "see below") opens the tab it is on.
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null
      const target = link && document.getElementById(link.getAttribute('href')!.slice(1))
      const section = target?.closest('[data-tab-hidden]')
      if (section) choose(tabOf(section))
    }
    const observer = new MutationObserver(apply)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    apply()
    document.addEventListener('click', onClick, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
      removeBar()
    }
  }, [pageKey])
}
