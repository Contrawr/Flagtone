// The Daily ranking: finished Dailies are sent to a small Supabase database, which
// answers with your place and the day's top ten. Nothing else leaves the browser:
// a random player id, the nickname you chose, and the five match percentages.
// With no project configured below, the ranking simply doesn't appear.
export const RANKING = {
  url: 'https://gglyaezdooljleqngabu.supabase.co',
  key: 'sb_publishable_9KzLZQnn7nB2vVA6ewnh5g_xlSVBhMl',
};

export const NICKNAME_MAX = 16;
const TIMEOUT_MS = 8000;

export const rankingEnabled = () => Boolean(RANKING.url && RANKING.key);

// Letters (any alphabet), digits, spaces, dots, dashes and underscores; trimmed and
// with runs of spaces collapsed. Returns null when it isn't usable.
export function cleanNickname(text) {
  const name = String(text ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > NICKNAME_MAX) return null;
  return /^[\p{L}\p{N} ._-]+$/u.test(name) ? name : null;
}

export function newPlayerId() {
  return crypto.randomUUID?.() ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

async function call(path, body, prefer) {
  const res = await fetch(`${RANKING.url.replace(/\/$/, '')}/rest/v1/${path}`, {
    method: 'POST',
    headers: {
      apikey: RANKING.key,
      // Older "anon" keys are JWTs and also go in Authorization; newer publishable keys don't.
      ...(RANKING.key.startsWith('eyJ') ? { Authorization: `Bearer ${RANKING.key}` } : {}),
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res;
}

// Sends a finished Daily. Sending the same day twice keeps the first score.
export async function submitDaily({ day, playerId, nickname, results }) {
  const percents = results.map((r) => r.percent);
  const score = Math.round(percents.reduce((a, b) => a + b, 0) / percents.length);
  const res = await call('daily_scores', {
    day, player_id: playerId, nickname, score, percents,
  }, 'return=minimal');
  if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
}

// { place, total, top: [{ place, nickname, score, me }], mine } for one day; place
// and mine are null if this player hasn't sent a score that day.
export async function fetchBoard({ day, playerId }) {
  const res = await call('rpc/daily_board', { p_day: day, p_player: playerId });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return {
    place: data?.place ?? null,
    total: data?.total ?? 0,
    top: Array.isArray(data?.top) ? data.top : [],
    mine: data?.mine ?? null,
  };
}

// "Top 6%" for good places, otherwise nothing.
export function topPercent(place, total) {
  if (!place || total < 5) return '';
  const pct = Math.max(1, Math.ceil((place / total) * 100));
  return pct <= 50 ? `Top ${pct}%` : '';
}
