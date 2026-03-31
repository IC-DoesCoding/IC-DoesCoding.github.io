/**
 * api.js — QBreader API client
 *
 * Fetches tossup questions whose answer line matches the given query string.
 * Uses the /api/query endpoint with searchType=answer so we only get
 * questions about that answer, not questions that merely mention the word.
 *
 * QBreader paginates at maxReturnLength per page; we walk pages until we
 * have collected all available tossups.
 *
 * CORS note: QBreader's API does not send Access-Control-Allow-Origin headers,
 * so direct browser fetches are blocked on deployed sites (e.g. GitHub Pages).
 * We first try a direct fetch; if it fails with a CORS/network error we retry
 * through allorigins.win, a free public CORS proxy.
 */

const QBREADER = 'https://www.qbreader.org/api';
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

/**
 * Fetch a URL, falling back to the CORS proxy if the direct request fails.
 *
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function fetchWithFallback(url) {
  try {
    const res = await fetch(url);
    // Some browsers return an opaque response instead of throwing on CORS block
    if (res.ok) return res;
    throw new Error(`HTTP ${res.status}`);
  } catch {
    // Direct fetch failed — try via CORS proxy
    const proxied = await fetch(CORS_PROXY + encodeURIComponent(url));
    if (!proxied.ok) throw new Error(`Proxy error: ${proxied.status} ${proxied.statusText}`);
    return proxied;
  }
}

/**
 * Fetch all tossups whose answer matches `answerQuery`.
 *
 * @param {string} answerQuery - The answer to search for (e.g. "viscosity")
 * @param {object} [opts]
 * @param {number} [opts.maxQuestions=150] - Cap on total questions fetched
 * @param {number} [opts.pageSize=50]      - Questions per API request
 * @returns {Promise<object[]>} Array of raw tossup objects from QBreader
 */
export async function fetchTossups(answerQuery, { maxQuestions = 150, pageSize = 50 } = {}) {
  const tossups = [];
  let page = 1;

  while (tossups.length < maxQuestions) {
    const params = new URLSearchParams({
      queryString:      answerQuery,
      questionType:     'tossup',
      searchType:       'answer',
      maxReturnLength:  pageSize,
      tossupPagination: page,
    });

    const url = `${QBREADER}/query?${params}`;
    const res = await fetchWithFallback(url);
    const data = await res.json();

    const batch = data.tossups?.questionArray ?? [];
    if (!batch.length) break;
    tossups.push(...batch);

    if (batch.length < pageSize) break;
    page++;
  }

  return tossups.slice(0, maxQuestions);
}
