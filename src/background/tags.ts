import type { Settings } from '@common/types';

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-_]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$|\s+/g, '');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}

export function similarity(a: string, b: string): number {
  const s1 = slugify(a), s2 = slugify(b);
  const maxLen = Math.max(s1.length, s2.length) || 1;
  const dist = levenshtein(s1, s2);
  return Math.round(100 * (1 - dist / maxLen));
}

export function canonicalizeTags(candidates: string[], known: string[], settings: Settings): string[] {
  const out: string[] = [];
  const knownSet = new Set(known);
  for (const t of candidates.map(slugify)) {
    const aliasTo = settings.tagging.aliases[t];
    if (aliasTo) {
      if (!out.includes(aliasTo)) out.push(aliasTo);
      continue;
    }
    // exact known
    if (knownSet.has(t)) { if (!out.includes(t)) out.push(t); continue; }
    // fuzzy to closest known
    let best = { tag: t, score: 0 };
    for (const k of knownSet) {
      const score = similarity(t, k);
      if (score > best.score) best = { tag: k, score };
    }
    if (best.score >= settings.tagging.dedupeThreshold) {
      if (!out.includes(best.tag)) out.push(best.tag);
    } else {
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

