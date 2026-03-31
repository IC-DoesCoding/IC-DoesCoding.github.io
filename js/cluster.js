/**
 * cluster.js — TF-IDF vectorization and complete-linkage clustering
 *
 * Finds groups of clue sentences that express the same trivia fact,
 * even when worded differently.
 *
 * Pipeline:
 *   1. Normalize and tokenize each clue into 1-grams and 2-grams.
 *   2. Compute TF-IDF vectors (L2-normalised).
 *   3. Build an N×N cosine similarity matrix.
 *   4. Complete-linkage clustering: two groups only merge when the minimum
 *      pairwise similarity across them exceeds the threshold.
 *   5. Score each multi-question cluster and return sorted results.
 */

// ── Normalization ──────────────────────────────────────────────────────────

/**
 * Lowercase and strip punctuation.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Tokenize into 1-grams and 2-grams.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  const words = normalize(text).split(' ').filter(Boolean);
  const tokens = [...words];
  for (let i = 0; i < words.length - 1; i++) {
    tokens.push(`${words[i]} ${words[i + 1]}`);
  }
  return tokens;
}

// ── TF-IDF ────────────────────────────────────────────────────────────────

/**
 * Build L2-normalised TF-IDF sparse vectors (plain objects) for each document.
 *
 * @param {string[]} corpus
 * @returns {Record<string, number>[]}
 */
export function buildTfidf(corpus) {
  const n = corpus.length;

  // Term frequency per document
  const tfMaps = corpus.map(doc => {
    const tokens = tokenize(doc);
    const map = {};
    for (const t of tokens) map[t] = (map[t] ?? 0) + 1;
    const total = tokens.length || 1;
    for (const t in map) map[t] /= total;
    return map;
  });

  // Document frequency
  const df = {};
  for (const map of tfMaps) {
    for (const t in map) df[t] = (df[t] ?? 0) + 1;
  }

  // TF-IDF with L2 normalisation
  return tfMaps.map(map => {
    const vec = {};
    for (const t in map) {
      const idf = Math.log((n + 1) / (df[t] + 1)) + 1;
      vec[t] = map[t] * idf;
    }
    let norm = 0;
    for (const t in vec) norm += vec[t] ** 2;
    norm = Math.sqrt(norm) || 1;
    for (const t in vec) vec[t] /= norm;
    return vec;
  });
}

/**
 * Cosine similarity between two L2-normalised sparse vectors.
 *
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 * @returns {number} value in [0, 1]
 */
function cosineSim(a, b) {
  let dot = 0;
  for (const t in a) if (b[t] !== undefined) dot += a[t] * b[t];
  return dot;
}

// ── Clustering ────────────────────────────────────────────────────────────

/**
 * Complete-linkage agglomerative clustering.
 * Two clusters only merge when every pair across them exceeds `threshold`.
 *
 * @param {Record<string, number>[]} vecs  - L2-normalised TF-IDF vectors
 * @param {number} threshold               - minimum similarity to merge
 * @returns {{ clusters: number[][], sim: number[][] }}
 */
export function completeLinkageCluster(vecs, threshold) {
  const n = vecs.length;

  // Pre-compute full similarity matrix
  const sim = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      i === j ? 1 : cosineSim(vecs[i], vecs[j])
    )
  );

  let clusters = Array.from({ length: n }, (_, i) => [i]);
  let merged = true;

  while (merged) {
    merged = false;
    let bestA = -1, bestB = -1, bestSim = -1;

    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        // Complete linkage: use the minimum pairwise similarity
        let minSim = Infinity;
        for (const i of clusters[a]) {
          for (const j of clusters[b]) {
            if (sim[i][j] < minSim) minSim = sim[i][j];
          }
        }
        if (minSim >= threshold && minSim > bestSim) {
          bestSim = minSim;
          bestA = a;
          bestB = b;
        }
      }
    }

    if (bestA !== -1) {
      clusters[bestA] = clusters[bestA].concat(clusters[bestB]);
      clusters.splice(bestB, 1);
      merged = true;
    }
  }

  return { clusters, sim };
}

// ── Scoring & sorting ─────────────────────────────────────────────────────

const DIFF_ORDER = { hard: 0, medium: 1, easy: 2 };

/**
 * Score each cluster and return those that span at least 2 questions.
 *
 * @param {number[][]} clusters
 * @param {number[][]} sim
 * @param {{ text: string, questionIdx: number, difficulty: string }[]} clues
 * @returns {object[]} unsorted cluster objects
 */
export function scoreClusters(clusters, sim, clues) {
  const results = [];

  for (const cluster of clusters) {
    const questionSet = new Set(cluster.map(i => clues[i].questionIdx));
    if (questionSet.size < 2) continue;

    const hardCount     = cluster.filter(i => clues[i].difficulty === 'hard').length;
    const questionCount = questionSet.size;
    const combinedScore = questionCount * 2 + hardCount;

    // Most central clue = highest average similarity to all others in cluster
    let repIdx = cluster[0];
    if (cluster.length > 1) {
      let bestAvg = -1;
      for (const i of cluster) {
        const avg = cluster.reduce((s, j) => s + (i !== j ? sim[i][j] : 0), 0)
                    / (cluster.length - 1);
        if (avg > bestAvg) { bestAvg = avg; repIdx = i; }
      }
    }

    const others = cluster
      .filter(i => i !== repIdx)
      .sort((a, b) => DIFF_ORDER[clues[a].difficulty] - DIFF_ORDER[clues[b].difficulty]);

    const difficulties = {};
    for (const i of cluster) difficulties[clues[i].text] = clues[i].difficulty;

    results.push({
      representative: clues[repIdx].text,
      variants:       others.map(i => clues[i].text),
      difficulties,
      questionCount,
      hardCount,
      clueCount:      cluster.length,
      combinedScore,
    });
  }

  return results;
}

/**
 * Sort cluster results.
 *
 * @param {object[]} clusters
 * @param {'combined'|'common'|'hard'} sortBy
 * @returns {object[]} new sorted array
 */
export function sortClusters(clusters, sortBy = 'combined') {
  const key = {
    combined: c => [c.combinedScore, c.hardCount],
    common:   c => [c.questionCount, c.hardCount],
    hard:     c => [c.hardCount,     c.questionCount],
  }[sortBy] ?? (c => [c.combinedScore, c.hardCount]);

  return [...clusters].sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return kb[i] - ka[i];
    }
    return 0;
  });
}
