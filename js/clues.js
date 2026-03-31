/**
 * clues.js — sentence splitting, giveaway filtering, and clue extraction
 *
 * Ported from the Python library with the same smart sentence-boundary
 * detection that avoids splitting on:
 *   - Single-letter initials  (U.S., Ulysses S. Grant, J.K. Rowling)
 *   - Common abbreviations    (Dr., Vol., etc.)
 *   - Exclamatory titles      (Home! Sweet Home!)
 *   - Pronunciation guides    (("OIL-er"))
 */

const ABBREVS = new Set([
  'mr','mrs','ms','dr','prof','sr','jr','vs','etc','dept','est','approx',
  'vol','no','fig','jan','feb','mar','apr','jun','jul','aug','sep','oct',
  'nov','dec','st','ave','blvd',
]);

const BOUNDARY_RE = /([.!?])\s+(?=[A-Z0-9"])/g;

/**
 * Returns true only if the regex match represents a real sentence boundary.
 *
 * @param {string} text
 * @param {number} matchIndex  - index of the punctuation character
 * @param {string} punct       - the matched punctuation (. ! ?)
 * @param {number} afterIndex  - index of the first char after the whitespace
 */
function isRealBoundary(text, matchIndex, punct, afterIndex) {
  if (punct === '.') {
    // Walk back to find the word immediately before the period
    let ws = matchIndex - 1;
    while (ws > 0 && /[a-zA-Z]/.test(text[ws - 1])) ws--;
    const word = text.slice(ws, matchIndex).toLowerCase();
    if (word.length === 1) return false;        // single initial
    if (ABBREVS.has(word)) return false;        // known abbreviation
  }

  if (punct === '!' || punct === '?') {
    // "Home! Sweet Home!" — char before this punct is also ! or ?
    if (matchIndex >= 1 && (text[matchIndex - 1] === '!' || text[matchIndex - 1] === '?')) {
      return false;
    }
    // Look ahead: another ! or ? within 40 chars with ≤3 words before it
    const next = text.slice(afterIndex, afterIndex + 40);
    if (next.includes('!') || next.includes('?')) {
      const wordsBefore = next.split(/[!?]/)[0].split(/\s+/).filter(Boolean);
      if (wordsBefore.length <= 3) return false;
    }
  }

  // Pronunciation guide: e.g. '...equations. ("OIL-er")...' shouldn't split
  if (afterIndex < text.length && text[afterIndex] === '(') return false;

  return true;
}

/**
 * Split a Quizbowl question text into individual clue sentences.
 *
 * @param {string} text - Raw question_sanitized text
 * @returns {string[]}
 */
export function splitSentences(text) {
  text = text.replace(/\(\*\)/g, '').trim();

  const sentences = [];
  let last = 0;
  let m;
  BOUNDARY_RE.lastIndex = 0;

  while ((m = BOUNDARY_RE.exec(text)) !== null) {
    const punct     = m[1];
    const matchIdx  = m.index;
    const afterIdx  = m.index + m[0].length;

    if (isRealBoundary(text, matchIdx, punct, afterIdx)) {
      const chunk = text.slice(last, matchIdx + 1).trim();
      if (chunk) sentences.push(chunk);
      last = afterIdx;
    }
  }

  const tail = text.slice(last).trim();
  if (tail) sentences.push(tail);

  return sentences;
}

// Matches the "For 10 points" giveaway sentence pattern
const FTP_RE = /for\s+(10|ten)\s+points|ftp\b|name\s+this\s+(measure|quantity|property|fluid|value)/i;

/**
 * Returns true if a sentence is a "For 10 points" giveaway.
 *
 * @param {string} sentence
 * @returns {boolean}
 */
export function isGiveaway(sentence) {
  return FTP_RE.test(sentence);
}

/**
 * Label a clue's difficulty by its position in the question.
 * Quizbowl questions get easier toward the end, so earlier = harder.
 *
 * @param {number} idx   - 0-based sentence index
 * @param {number} total - total sentences in the question
 * @returns {'hard'|'medium'|'easy'}
 */
export function difficultyLabel(idx, total) {
  const r = idx / Math.max(total - 1, 1);
  return r < 0.34 ? 'hard' : r < 0.67 ? 'medium' : 'easy';
}

/**
 * Extract clues from an array of QBreader tossup objects.
 * Giveaway sentences are dropped automatically.
 *
 * @param {object[]} tossups - Raw tossup objects from QBreader
 * @returns {{ text: string, questionIdx: number, difficulty: string }[]}
 */
export function extractClues(tossups) {
  const clues = [];
  tossups.forEach((tossup, qIdx) => {
    const text = tossup.question_sanitized ?? tossup.question ?? '';
    const sentences = splitSentences(text);
    const total = sentences.length;
    sentences.forEach((s, sIdx) => {
      if (!isGiveaway(s)) {
        clues.push({ text: s, questionIdx: qIdx, difficulty: difficultyLabel(sIdx, total) });
      }
    });
  });
  return clues;
}
