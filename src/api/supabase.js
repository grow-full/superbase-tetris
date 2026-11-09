/**
 * Supabase REST(PostgREST) API를 fetch로 직접 호출한다 (라이브러리 없음).
 * 설정은 config.js 의 window.APP_CONFIG 에서 읽는다. 공개(anon/publishable) 키만 사용한다.
 */

const config = window.APP_CONFIG || {};
const BASE_URL = String(config.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = String(config.SUPABASE_ANON_KEY || '');
const TIMEOUT_MS = 8000;

// http:// 는 로컬 Supabase(CLI, 127.0.0.1:54321) 용
export const isOnlineEnabled = /^https?:\/\//.test(BASE_URL) && KEY.length > 20 && !KEY.startsWith('YOUR-');

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  if (!isOnlineEnabled) throw new ApiError('온라인 기능이 설정되지 않았습니다.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const auth = { apikey: KEY };
  // 기존 anon 키(JWT)는 Authorization 헤더도 함께 보낸다. 새 publishable 키는 apikey만 보낸다.
  if (KEY.startsWith('eyJ')) auth.Authorization = `Bearer ${KEY}`;
  try {
    const res = await fetch(`${BASE_URL}/rest/v1/${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...auth, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let message = `요청 실패 (${res.status})`;
      try {
        const json = await res.json();
        if (json?.message) message = json.message;
      } catch {
        /* 본문이 JSON이 아닌 경우 */
      }
      throw new ApiError(message, res.status);
    }
    return res;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err.name === 'AbortError') throw new ApiError('서버 응답이 너무 늦습니다.');
    throw new ApiError('서버에 연결할 수 없습니다.');
  } finally {
    clearTimeout(timer);
  }
}

/** 기간 시작 시각(ISO). all 이면 null */
export function periodStart(period, now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'today') return d.toISOString();
  if (period === 'week') {
    const day = (d.getDay() + 6) % 7; // 월요일 = 0
    d.setDate(d.getDate() - day);
    return d.toISOString();
  }
  return null;
}

function periodFilter(period) {
  const since = periodStart(period);
  return since ? `&created_at=gte.${encodeURIComponent(since)}` : '';
}

export async function submitScore({ nickname, score, level, lines, durationSec }) {
  await request('scores', {
    method: 'POST',
    body: { nickname, score, level, lines, duration_sec: durationSec },
    headers: { Prefer: 'return=minimal' },
  });
}

export async function fetchLeaderboard(period = 'all', limit = 10) {
  const res = await request(
    `scores?select=nickname,score,level,lines,created_at&order=score.desc,created_at.asc&limit=${limit}${periodFilter(period)}`,
  );
  return res.json();
}

/** 점수 score 이상인 기록 수 = 방금 저장한 기록의 순위 (동점이면 먼저 달성한 사람이 앞) */
export async function fetchRank(score, period = 'all') {
  const res = await request(`scores?select=id&score=gte.${Number(score)}${periodFilter(period)}`, {
    method: 'HEAD',
    headers: { Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return Number.isFinite(total) ? total : null;
}

export async function submitFeedback({ nickname, category, rating, content }) {
  await request('feedback', {
    method: 'POST',
    body: { nickname: nickname || null, category, rating, content },
    headers: { Prefer: 'return=minimal' },
  });
}
