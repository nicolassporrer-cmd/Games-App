// Parser for LinkedIn conversation text pasted straight out of the browser.
//
// Everything here was written against real messages in raw/, not against a guess
// at the format. The share text is identical in French and English apart from the
// trailing blurb, which we ignore entirely — we only need the game, the puzzle
// number and the time.

export const TRACKED_GAMES = ['Queens', 'Tango', 'Zip', 'Patches']

const ALL_GAMES = ['Queens', 'Tango', 'Zip', 'Patches', 'Pinpoint', 'Crossclimb', 'Mini Sudoku']

// The separator before the puzzle number is usually "#", but LinkedIn also emits
// "no." and "n°" on some clients — seen in the wild as "Queens no. 870 | 0:15".
// Times exceed a minute often enough to matter ("Queens #873 | 4:19").
const RESULT_RE = new RegExp(
  `\\b(${ALL_GAMES.join('|')})\\s+(?:#|no\\.?\\s*|n[°o]\\s*)(\\d+)\\s*\\|\\s*(\\d+):(\\d{2})\\b`, 'g')

// A result is NOT always at the start of its line: people top-and-tail the share
// text with commentary ("contreperf dsl Tango #712 | 0:51 with no hints"). So we
// search the whole line — which means quoted-reply previews have to be excluded
// explicitly instead, because LinkedIn inlines a whole quoted message after a
// "Mahaut : " prefix and that would double-count the score.
const QUOTED_REPLY_RE = /^\*?\s*\p{Lu}[\p{L}'’-]*(?:[ -]\p{Lu}[\p{L}'’-]*)?\s:\s/u

// Primary sender anchor: the profile-link line that precedes every block. It is
// language-independent, unlike "a envoyé les messages suivants".
const SENDER_LINK_RE = /^\[([^\]]+)\]\(https:\/\/[^)]*linkedin\.com\/in\/[^)]*\)(?:\s*\([^)]*\))?\s*(\d{1,2}):(\d{2})\s*$/

// Fallback sender anchor, FR and EN.
const SENDER_SENT_RE = /^\*?\s*(.+?)\s+(?:a\s+envoyé\s+les?\s+messages?\s+suivants?|sent\s+the\s+following\s+messages?)\s+(?:à|at)\s+(\d{1,2}):(\d{2})/i

// LinkedIn glues the day separator onto the name on that fallback line, with no
// space: "mardiNicolas Malhomme", and for older messages a date instead of a
// weekday: "15 sept.Pierre-Alexandre Medinger".
const DAY_PREFIX_RE = /^(?:\d{1,2}\s*[\p{L}]{3,10}\.?|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|aujourd['’]hui|hier|monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|yesterday)/iu

// Lines that look like a sender link but carry no time — LinkedIn chrome, not people.
const NOT_A_NAME_RE = /^(?:Voir le profil|View .*profile|Le statut est|Status is)/i

function cleanName(raw) {
  let name = raw.replace(DAY_PREFIX_RE, '').trim()
  name = name.replace(/\s*\((?:He|She|They)\/[^)]*\)\s*$/i, '').trim()
  return name
}

// Broad net for format drift: a line mentioning a game, a pipe and a clock time
// is almost certainly a result. If RESULT_RE did not match such a line, that is
// reported rather than silently dropped.
function looksLikeResult(line) {
  return ALL_GAMES.some(g => line.includes(g)) && line.includes('|') && /\d:\d{2}/.test(line)
}

export function parseConversation(text) {
  const lines = text.split(/\r?\n/)
  const results = []
  const ignored = []       // real results for games we don't track
  const quoted = []        // results inside quoted-reply previews — deliberately skipped
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

    // A quoted reply repeats someone else's message inside the current block, so
    // its scores are already counted from the original and its sender is wrong.
    if (QUOTED_REPLY_RE.test(line)) {
      for (const m of line.matchAll(RESULT_RE)) quoted.push({ line: i + 1, game: m[1], puzzle: Number(m[2]) })
      return
    }

    const matches = [...line.matchAll(RESULT_RE)]
    if (!matches.length) {
      if (looksLikeResult(line)) unmatched.push({ line: i + 1, text: line.trim().slice(0, 160) })
      return
    }

    for (const m of matches) {
      const [, game, puzzle, mins, secs] = m
      if (!sender) { unmatched.push({ line: i + 1, text: line.trim().slice(0, 160), why: 'no sender established' }); continue }
      const entry = {
        player: sender,
        game,
        puzzle: Number(puzzle),
        score: Number(mins) * 60 + Number(secs),
        display: `${Number(mins)}:${secs}`,
        order: i,
      }
      if (TRACKED_GAMES.includes(game)) results.push(entry)
      else ignored.push(entry)
    }
  })

  return { results, ignored, quoted, unmatched, senders: [...senders] }
}
