import { describe, expect, it } from 'vitest'
import { makeSchedule, ScheduleError, scheduleRows } from '../src/core/schedule'

// The League page's schedule maker.
const teams = (n: number, group = (_i: number) => '') => Array.from({ length: n }, (_, i) => ({ team: i, name: `Team ${i}`, group: group(i) }))
const check = (s: ReturnType<typeof makeSchedule>) => {
  // No team twice in a day.
  const byDay = new Map<number, number[]>()
  for (const g of s.games) byDay.set(g.day, [...(byDay.get(g.day) ?? []), g.home, g.away])
  for (const list of byDay.values()) expect(new Set(list).size).toBe(list.length)
  // The totals are the games'.
  for (const [team, t] of s.totals) {
    expect(s.games.filter((g) => g.home === team).length).toBe(t.home)
    expect(s.games.filter((g) => g.away === team).length).toBe(t.away)
    expect(t.games).toBe(t.home + t.away)
  }
}

describe('the schedule maker', () => {
  it('has each pair meet as often as asked, home and away split evenly, no team twice a day', () => {
    const s = makeSchedule({ teams: teams(6), withinGroup: 4, betweenGroups: 4, seed: 1 })
    check(s)
    expect(s.games).toHaveLength(60)
    for (const t of s.totals.values()) expect(t).toEqual({ games: 20, home: 10, away: 10 })
    // Each pair: four games, two at each team's.
    expect(s.games.filter((g) => g.home === 0 && g.away === 1)).toHaveLength(2)
    expect(s.games.filter((g) => g.home === 1 && g.away === 0)).toHaveLength(2)
    // Six teams play three games a day where they can.
    expect(s.days).toBeLessThanOrEqual(22)
  })

  it('shares an odd number of meetings out so that no team is far from even', () => {
    const s = makeSchedule({ teams: teams(7), withinGroup: 3, betweenGroups: 3, seed: 5 })
    check(s)
    for (const t of s.totals.values()) {
      expect(t.games).toBe(18)
      expect(Math.abs(t.home - t.away)).toBeLessThanOrEqual(2)
    }
  })

  it('has teams of one group meet more often', () => {
    const s = makeSchedule({ teams: teams(8, (i) => (i < 4 ? 'East' : 'West')), withinGroup: 4, betweenGroups: 2, seed: 2 })
    check(s)
    // 3 in the group x 4, 4 outside it x 2.
    for (const t of s.totals.values()) expect(t.games).toBe(20)
    expect(s.games.filter((g) => [g.home, g.away].sort().join() === '0,1')).toHaveLength(4)
    expect(s.games.filter((g) => [g.home, g.away].sort().join() === '0,4')).toHaveLength(2)
  })

  it('gives the same schedule for the same mix, and another for another', () => {
    const a = makeSchedule({ teams: teams(6), withinGroup: 2, betweenGroups: 2, seed: 3 })
    expect(makeSchedule({ teams: teams(6), withinGroup: 2, betweenGroups: 2, seed: 3 }).games).toEqual(a.games)
    expect(makeSchedule({ teams: teams(6), withinGroup: 2, betweenGroups: 2, seed: 4 }).games).not.toEqual(a.games)
  })

  it('writes the games as spreadsheet rows, and refuses what cannot be a season', () => {
    const s = makeSchedule({ teams: teams(2), withinGroup: 2, betweenGroups: 2, seed: 1 })
    const rows = scheduleRows(s, (t) => `Team ${t}`)
    expect(rows[0]).toEqual(['Game', 'Day', 'Home', 'Visitors'])
    expect(rows.slice(1).map((r) => r.slice(0, 2))).toEqual([[1, 1], [2, 2]])
    expect(() => makeSchedule({ teams: teams(1), withinGroup: 2, betweenGroups: 2, seed: 1 })).toThrow(ScheduleError)
    expect(() => makeSchedule({ teams: teams(4), withinGroup: 0, betweenGroups: 0, seed: 1 })).toThrow(ScheduleError)
    expect(() => makeSchedule({ teams: teams(4), withinGroup: 25, betweenGroups: 2, seed: 1 })).toThrow(ScheduleError)
  })
})
