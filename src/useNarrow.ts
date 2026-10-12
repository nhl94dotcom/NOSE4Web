import { useEffect, useState } from 'react'

// Below this width the page is laid out for a phone: the list of teams slides
// in over the page, and tables too wide to use become lists of cards. Kept in
// step with the same width in App.css.
export const NARROW_QUERY = '(max-width: 820px)'

// Whether the window is narrow just now.
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY)
    const update = () => setNarrow(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return narrow
}
