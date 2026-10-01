// Fixed roster, so a display name never depends on who happens to appear in a
// given paste. Deriving the "S."/"M." suffix from the paste itself was a real
// bug: a paste with only one Nicolas would label him "Nicolas", and he'd merge
// into the scoreboard as a second, separate player.
//
// Full names are the parser's input (that is what LinkedIn renders); only the
// short label is ever stored or displayed.
export const ROSTER = {
  'Sacha Guillaume': 'Sacha',
  "Mahaut d'Harcourt": 'Mahaut',
  'Pierre-Alexandre Medinger': 'Pierre-Alexandre',
  'Ariane Delecroix': 'Ariane',
  'Nicolas Malhomme': 'Nicolas M.',
  'Nicolas Sporrer': 'Nicolas S.',
  // Played earlier in the conversation's history; appears in the LinkedIn export
  // but not in the recent pastes.
  'Juliette Bourgain': 'Juliette',
}

// Anyone not on the roster gets "First L." rather than a bare first name, so a
// new player can never collide with an existing one. Add them to ROSTER to give
// them a nicer label.
export function resolvePlayer(fullName) {
  if (!fullName) return null
  const hit = ROSTER[fullName.trim()]
  if (hit) return hit
  const parts = fullName.trim().split(/\s+/)
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0]
}

export function isKnown(fullName) {
  return Boolean(ROSTER[String(fullName).trim()])
}

// Notes shown in red under a player's name in the main table, keyed by the SHORT
// display label (the same string the scoreboard stores), so a flag survives any
// change to how full names are written. Purely editorial — a flag never touches
// a score, a medal or the ordering. Delete a line to remove a flag.
export const FLAGS = {
  Sacha: 'Contrôle antidopage non satisfaisant',
}

export const flagFor = player => FLAGS[player] ?? null
