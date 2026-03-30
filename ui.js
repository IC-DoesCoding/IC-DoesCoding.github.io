/**
 * ui.js — DOM rendering helpers
 *
 * All direct DOM manipulation lives here. main.js calls these functions;
 * it never touches innerHTML or classList itself.
 */

const esc = s =>
  s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Status bar ────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status');

export function showStatus(msg, { error = false } = {}) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', error);
  statusEl.hidden = false;
}

export function hideStatus() {
  statusEl.hidden = true;
}

// ── Stats strip ───────────────────────────────────────────────────────────

const statsEl = document.getElementById('statsStrip');

export function showStats({ questions, clues, clusters }) {
  document.getElementById('statQ').textContent = questions;
  document.getElementById('statC').textContent = clues;
  document.getElementById('statK').textContent = clusters;
  statsEl.hidden = false;
}

export function hideStats() {
  statsEl.hidden = true;
}

// ── Results ───────────────────────────────────────────────────────────────

const resultsEl = document.getElementById('results');

/**
 * Render a sorted list of cluster objects into the results container.
 *
 * @param {object[]} clusters - scored & sorted cluster objects
 * @param {string}   sortBy   - 'combined' | 'common' | 'hard'
 * @param {number}   topN     - max clusters to show
 */
export function renderResults(clusters, sortBy, topN) {
  if (!clusters.length) {
    resultsEl.innerHTML = `
      <div class="message">
        <strong>No recurring clues found</strong>
        Try lowering the similarity threshold, or this answer may not have enough questions.
      </div>`;
    return;
  }

  const sortLabel = { combined: 'combined score', common: 'most questions', hard: 'hard clues first' }[sortBy] ?? sortBy;
  const shown = clusters.slice(0, topN);

  const cards = shown.map((cluster, idx) => {
    const allClues = [
      { text: cluster.representative, isRep: true },
      ...cluster.variants.map(t => ({ text: t, isRep: false })),
    ];

    const clueRows = allClues.map(({ text, isRep }) => {
      const diff = cluster.difficulties[text] ?? 'easy';
      return `
        <div class="clue-row">
          <span class="diff-tag ${diff}">${diff}</span>
          <span class="clue-text ${isRep ? '' : 'is-variant'}">${esc(text)}</span>
        </div>`;
    }).join('');

    return `
      <div class="cluster-card" style="animation-delay:${idx * 0.035}s">
        <div class="cluster-header" data-toggle>
          <span class="cluster-rank">#${idx + 1}</span>
          <span class="cluster-rep">${esc(cluster.representative)}</span>
          <span class="badges">
            <span class="badge badge-q">${cluster.questionCount}q</span>
            ${cluster.hardCount > 0 ? `<span class="badge badge-h">${cluster.hardCount} hard</span>` : ''}
            <span class="badge badge-sc">score&nbsp;${cluster.combinedScore}</span>
          </span>
          <span class="chevron">▾</span>
        </div>
        <div class="cluster-body">${clueRows}</div>
      </div>`;
  }).join('');

  resultsEl.innerHTML = `
    <div class="section-title">
      Canon clues
      <span>sorted by ${sortLabel}</span>
    </div>
    ${cards}`;

  // Attach toggle listeners
  resultsEl.querySelectorAll('[data-toggle]').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.cluster-card').classList.toggle('open');
    });
  });
}

export function clearResults() {
  resultsEl.innerHTML = '';
}
