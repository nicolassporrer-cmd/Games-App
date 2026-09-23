// Parser for LinkedIn conversation text pasted straight out of the browser.
//
// Everything here was written against real messages in raw/sample-conversation.txt,
// not against a guess at the format. The share text is identical in French and
// English apart from the trailing blurb, which we ignore entirely — we only need
// the game, the puzzle number and the time.

export const TRACKED_GAMES = ['Queens', 'Tango', 'Zip', 'Patches']

// A result line ALWAYS starts at the beginning of a line. This anchoring is what
// excludes LinkedIn's quoted-reply previews, which inline the whole thing after a
// "* Mahaut : " prefix and would otherwise double-count someone's score.
const RESULT_RE = /^(Queens|Tango|Zip|Patches|Pinpoint|Crossclimb|Mini Sudoku)\s+#(\d+)\s*\|\s*(\d+):(\d{2})\b/

// Primary sender anchor: the profile-link line that precedes every block. It is
// language-independent, unlike "a envoyé les messages suivants".
const SENDER_LINK_RE = /^\[([^\]]+)\]\(https:\/\/[^)]*linkedin\.com\/in\/[^)]*\)(?:\s*\([^)]*\))?\s*(\d{1,2}):(\d{2})\s*$/

// Fallback sender anchor, FR and EN. LinkedIn glues the day separator onto the
// name here ("mardiNicolas Malhomme"), so the day words get stripped below.
const SENDER_SENT_RE = /^\*?\s*(.+?)\s+(?:a\s+envoyé\s+les?\s+messages?\s+suivants?|sent\s+the\s+following\s+messages?)\s+(?:à|at)\s+(\d{1,2}):(\d{2})/i

const DAY_PREFIX_RE = /^(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|aujourd['’]hui|hier|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday)/i

// Lines that look like a sender link but carry no time — LinkedIn chrome, not people.
const NOT_A_NAME_RE = /^(?:Voir le profil|View .*'s profile|Le statut est|Status is)/i

function cleanName(raw) {
  let name = raw.replace(DAY_PREFIX_RE, '').trim()
  name = name.replace(/\s*\((?:He|She|They)\/[^)]*\)\s*$/i, '').trim()
  return name
}

export function parseConversation(text) {
  const lines = text.split(/\r?\n/)
  const results = []
  const ignored = []       // real results for games we don't track
  const unmatched = []     // result-shaped lines the parser failed on — must stay empty
  const senders = new Set()
  let sender = null

  lines.forEach((line, i) => {
    const linkMatch = line.match(SENDER_LINK_RE)
    if (linkMatch && !NOT_A_NAME_RE.test(linkMatch[1])) {
      sender = cleanName(linkMatch[1])
      senders.add(sender)
      return
    }
    const sentMatch = line.match(SENDER_SENT_RE)
    if (sentMatch) {
      const name = cleanName(sentMatch[1])
      if (name && !NOT_A_NAME_RE.test(name)) { sender = name; senders.add(sender) }
      return
    }

    const m = line.match(RESULT_RE)
    if (!m) {
      // Safety net: anything shaped like "<Word> #123 | 0:12" that we did NOT
      // parse gets surfaced rather than silently dropped.
      if (/^[A-Z][A-Za-z ]{2,20}\s+#\d+\s*\|\s*\d+:\d{2}/.test(line)) unmatched.push({ line: i + 1, text: line })
      return
    }

    const [, game, puzzle, mins, secs] = m
    const entry = {
      player: sender,
      game,
      puzzle: Number(puzzle),
      score: Number(mins) * 60 + Number(secs),
      display: `${Number(mins)}:${secs}`,
      order: i,
    }
    if (!sender) { unmatched.push({ line: i + 1, text: line, why: 'no sender established' }); return }
    if (TRACKED_GAMES.includes(game)) results.push(entry)
    else ignored.push(entry)
  })

  return { results, ignored, unmatched, senders: [...senders] }
}

// Two Nicolas in this group, so first names alone collide. Disambiguate with a
// surname initial only where it's actually needed.
export function shortNames(fullNames) {
  const first = n => n.split(/\s+/)[0]
  const counts = new Map()
  for (const n of fullNames) counts.set(first(n), (counts.get(first(n)) ?? 0) + 1)
  const map = {}
  for (const n of fullNames) {
    const parts = n.split(/\s+/)
    map[n] = counts.get(parts[0]) > 1 && parts.length > 1
      ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`
      : parts[0]
  }
  return map
}
