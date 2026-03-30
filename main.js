/**
 * main.js — application entry point
 *
 * Wires up the search form to the pipeline:
 *   fetchTossups (api.js)
 *     → extractClues (clues.js)
 *     → buildTfidf + completeLinkageCluster + scoreClusters + sortClusters (cluster.js)
 *     → renderResults (ui.js)
 */

import { fetchTossups }                             from './api.js';
import { extractClues }                             from './clues.js';
import { buildTfidf, completeLinkageCluster, scoreClusters, sortClusters } from './cluster.js';
import { showStatus, hideStatus, showStats, hideStats, renderResults, clearResults } from './ui.js';

// ── Controls ──────────────────────────────────────────────────────────────

const form        = document.getElementById('searchForm');
const queryInput  = document.getElementById('queryInput');
const searchBtn   = document.getElementById('searchBtn');
const sortByEl    = document.getElementById('sortBy');
const thresholdEl = document.getElementById('threshold');
const threshValEl = document.getElementById('thresholdVal');
const topNEl      = document.getElementById('topN');

thresholdEl.addEventListener('input', () => {
  threshValEl.textContent = parseFloat(thresholdEl.value).toFixed(2);
});

// ── Search ────────────────────────────────────────────────────────────────

form.addEventListener('submit', async e => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;
  await runSearch(query);
});

async function runSearch(query) {
  searchBtn.disabled = true;
  clearResults();
  hideStats();
  showStatus(`Fetching questions for "${query}"…`);

  let tossups;
  try {
    tossups = await fetchTossups(query);
  } catch (err) {
    showStatus(`Failed to fetch questions: ${err.message}`, { error: true });
    searchBtn.disabled = false;
    return;
  }

  if (!tossups.length) {
    showStatus(`No tossups found for "${query}". Try a different spelling or answer.`, { error: true });
    searchBtn.disabled = false;
    return;
  }

  showStatus(`Found ${tossups.length} questions. Extracting clues…`);
  await tick();

  const clues = extractClues(tossups);

  if (!clues.length) {
    showStatus('No clues could be extracted from those questions.', { error: true });
    searchBtn.disabled = false;
    return;
  }

  showStatus(`Vectorizing ${clues.length} clues…`);
  await tick();

  const vecs = buildTfidf(clues.map(c => c.text));
  const threshold = parseFloat(thresholdEl.value);

  showStatus('Clustering (complete linkage)…');
  await tick();

  const { clusters: rawClusters, sim } = completeLinkageCluster(vecs, threshold);

  showStatus('Scoring clusters…');
  await tick();

  const scored  = scoreClusters(rawClusters, sim, clues);
  const sortBy  = sortByEl.value;
  const sorted  = sortClusters(scored, sortBy);
  const topN    = parseInt(topNEl.value, 10);

  hideStatus();
  showStats({
    questions: tossups.length,
    clues:     clues.length,
    clusters:  scored.length,
  });
  renderResults(sorted, sortBy, topN);

  searchBtn.disabled = false;
}

// Yield to the browser so status messages paint before heavy JS runs
function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
