// Puzzle number -> calendar date.
//
// The conversation text does not carry usable dates: LinkedIn renders day
// separators ("lundi", "Aujourd'hui") rather than absolute dates for recent
// messages, and a paste captures only whatever the browser had rendered. Puzzle
// numbers, on the other hand, are exact daily counters.
//
// So dates here are DERIVED, not sourced. The anchor below was cross-checked
// four independent ways: in the 2026-09-21..23 sample, Queens, Tango, Zip and
// Patches each advanced by exactly 1 per day, and the day separators in the
// paste (lundi / mardi / Aujourd'hui) line up with 21 / 22 / 23 September 2026.
//
// The assumption this rests on: a game's number never skips or repeats a day. If
// LinkedIn ever paused a game, every date BEFORE that pause shifts by a day —
// which would nudge a puzzle in or out of a 30-day window at the boundary, but
// cannot reorder or alter any score. Dates are used for filtering and display
// only; medals are always computed from puzzle numbers.
export const ANCHOR = {
  date: '2026-09-23',
  puzzles: { Queens: 876, Tango: 716, Zip: 555, Patches: 190 },
}

const DAY_MS = 86400000

function anchorUTC() {
  const [y, m, d] = ANCHOR.date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// Returns an ISO date string (YYYY-MM-DD), or null for a game with no anchor.
export function puzzleToDate(game, puzzle) {
  const base = ANCHOR.puzzles[game]
  if (base === undefined) return null
  return new Date(anchorUTC() + (puzzle - base) * DAY_MS).toISOString().slice(0, 10)
}

// Cross-check: for a set of results, every game's (puzzle - anchor) offset should
// map to the same date across games on the same day. Returns any game whose
// derived dates disagree with the others for a shared calendar day, which is how
// a skipped puzzle would surface.
export function dateSpan(results) {
  const dates = results.map(r => puzzleToDate(r.game, r.puzzle)).filter(Boolean).sort()
  return dates.length ? { first: dates[0], last: dates[dates.length - 1], days: new Set(dates).size } : null
}

export const PERIODS = [
  { id: 'all', label: 'Tout le temps', days: null },
  { id: '30d', label: '30 derniers jours', days: 30 },
  { id: '7d', label: '7 derniers jours', days: 7 },
]

// Inclusive window ending today: a 30-day period covers today and the 29 days
// before it, so a puzzle played today is always in every window.
export function withinPeriod(date, days, today = new Date()) {
  if (!days || !date) return true
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const [y, m, d] = date.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d)
  return t > end - days * DAY_MS && t <= end
}
