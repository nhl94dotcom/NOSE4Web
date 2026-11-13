// How long penalties last with a given number of seconds in the box for each
// penalty minute: the penalty time hack on both systems.

// Seconds as the game clock shows them, 1:30.
export const clockTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

// "a 2-minute minor lasts 1:30 and a 5-minute major 3:45".
export const penaltyLengths = (secondsPerMinute: number) =>
  `a 2-minute minor lasts ${clockTime(2 * secondsPerMinute)} and a 5-minute major ${clockTime(5 * secondsPerMinute)}`

// A fight's time in the box: off, or 2:30.
export const fightTimeText = (seconds: number) => (seconds === 0 ? 'as its minutes give (off)' : `${clockTime(seconds)} in the box for each fighter`)

// For lists of changes: "minors 1:00 and majors 2:30", or the original game's.
export const penaltyTimeText = (secondsPerMinute: number) =>
  `minors ${clockTime(2 * secondsPerMinute)} and majors ${clockTime(5 * secondsPerMinute)}${secondsPerMinute === 60 ? ' (as the original game)' : ''}`
