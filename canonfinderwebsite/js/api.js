/**
 * api.js — QBreader API client
 *
 * Fetches tossup questions whose answer line matches the given query string.
 * Uses the /api/query endpoint with searchType=answer so we only get
 * questions about that answer, not questions that merely mention the word.
 *
 * QBreader paginates at maxReturnLength per page; we walk pages until we
 * have collected all available tossups.
 */

const BASE = 'https://www.qbreader.org/api';

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

    const res = await fetch(`${BASE}/query?${params}`);
    if (!res.ok) throw new Error(`QBreader API error: ${res.status} ${res.statusText}`);

    const data = await res.json();
    const batch = data.tossups?.tossups ?? [];

    if (!batch.length) break;   // no more results
    tossups.push(...batch);

    // If we got fewer than a full page, there are no more pages
    if (batch.length < pageSize) break;
    page++;
  }

  return tossups.slice(0, maxQuestions);
}
