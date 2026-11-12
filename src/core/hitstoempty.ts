// How much a knockdown and a hold cost for a skater to be emptied by a given
// number of knockdowns: full energy is 4096, and 4095 split between the hits
// leaves him 1 after the last, as Energy from hits only's 1365 does (three of
// them). Both games set energy below 0 to 0 (setpde), so a cost rounded up
// empties him just the same. A hold costs half a knockdown, rounded up.
export interface HitsToEmpty {
  hits: number
  knockdown: number
  hold: number
}

export const HITS_TO_EMPTY: HitsToEmpty[] = [2, 3, 4, 5, 6, 8, 10].map((hits) => {
  const knockdown = Math.floor(4095 / hits)
  return { hits, knockdown, hold: Math.ceil(knockdown / 2) }
})
