// Small fuzzy search for the tag autocompletion
//
// Every item gets a score, lower is better:
//   0      exact match
//   1      name starts with the query
//   2      a word of the name starts with the query ("rech" -> "Steuer Rechnung")
//   3      query occurs somewhere in the name
//   4 + n  query matches with n typos (n <= 1 for 4-7 chars, n <= 2 from 8 chars)
//   8      all query characters occur in order ("rchng" -> "Rechnung")
// Matching ignores case and diacritics ("gebuhren" finds "Gebühren").

const WORD_SEPARATOR = /[\s\-_/.:,;()]+/;

function normalizeForSearch(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Smallest edit distance between `pattern` and any substring of `text`
// (Sellers' algorithm: Levenshtein, but the match may start and end anywhere).
function substringEditDistance(pattern, text) {
  let previous = Array.from({ length: pattern.length + 1 }, (_, i) => i);
  let best = previous[pattern.length];
  for (let j = 1; j <= text.length; j++) {
    const current = [0];
    for (let i = 1; i <= pattern.length; i++) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1;
      current[i] = Math.min(
        previous[i] + 1,        // extra character in text
        current[i - 1] + 1,     // missing character in text
        previous[i - 1] + cost  // match / substitution
      );
    }
    best = Math.min(best, current[pattern.length]);
    previous = current;
  }
  return best;
}

function isSubsequence(pattern, text) {
  let i = 0;
  for (let j = 0; j < text.length && i < pattern.length; j++) {
    if (pattern[i] === text[j]) i++;
  }
  return i === pattern.length;
}

function scoreMatch(query, name) {
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  if (name.includes(query)) {
    return name.split(WORD_SEPARATOR).some(word => word.startsWith(query)) ? 2 : 3;
  }
  const maxTypos = query.length < 4 ? 0 : query.length < 8 ? 1 : 2;
  if (maxTypos > 0) {
    const typos = substringEditDistance(query, name);
    if (typos <= maxTypos) return 4 + typos;
  }
  if (query.length >= 3 && isSubsequence(query, name)) return 8;
  return Infinity;
}

/**
 * Search items by a text field.
 * @param {Array<Object>} items - e.g. [{id: 1, name: 'Rechnung'}]
 * @param {string} query - user input
 * @param {{key?: string, limit?: number}} options
 * @returns {Array<Object>} matching items, best match first
 */
function fuzzySearch(items, query, { key = 'name', limit = Infinity } = {}) {
  const normalizedQuery = normalizeForSearch(query);
  if (!normalizedQuery) return [];

  return items
    .map(item => {
      const name = normalizeForSearch(item[key]);
      return { item, name, score: scoreMatch(normalizedQuery, name) };
    })
    .filter(result => result.score !== Infinity)
    .sort((a, b) =>
      a.score - b.score ||
      a.name.length - b.name.length ||
      a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(result => result.item);
}

if (typeof window !== 'undefined') {
  window.fuzzySearch = fuzzySearch;
}
if (typeof module !== 'undefined') {
  module.exports = { fuzzySearch, substringEditDistance, normalizeForSearch };
}
