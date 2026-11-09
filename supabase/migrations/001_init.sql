-- STACKFALL: 점수 / 피드백 테이블과 RLS(행 단위 보안) 정책
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.

-- ============ scores ============
create table if not exists public.scores (
  id           uuid primary key default gen_random_uuid(),
  nickname     text not null check (char_length(btrim(nickname)) between 2 and 12),
  score        integer not null check (score between 0 and 9999999),
  level        integer not null check (level >= 1),
  lines        integer not null check (lines >= 0),
  duration_sec integer not null check (duration_sec between 0 and 86400),
  created_at   timestamptz not null default now(),
  -- 기본 조작 방지: 레벨은 줄 수로 정해지고, 점수는 줄 수·레벨로 낼 수 있는 최대값을 넘을 수 없다
  constraint scores_level_matches_lines check (level = lines / 10 + 1),
  -- 줄 점수 최대 200×레벨/줄 + 드롭 점수 여유분(홀드로 같은 블록을 두 번 내리는 경우 포함)
  constraint scores_score_plausible check (score <= lines * (200 * level + 250) + 6000)
);

create index if not exists scores_rank_idx on public.scores (score desc, created_at asc);
create index if not exists scores_created_idx on public.scores (created_at desc);

alter table public.scores enable row level security;

drop policy if exists "scores are public" on public.scores;
create policy "scores are public"
  on public.scores for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can add a score" on public.scores;
create policy "anyone can add a score"
  on public.scores for insert
  to anon, authenticated
  with check (true);

-- 수정/삭제 정책은 만들지 않는다 → anon 키로는 수정·삭제 불가
-- id, created_at 은 클라이언트가 정할 수 없도록 입력 가능한 컬럼을 제한
revoke all on public.scores from anon, authenticated;
grant select on public.scores to anon, authenticated;
grant insert (nickname, score, level, lines, duration_sec) on public.scores to anon, authenticated;

-- ============ feedback ============
create table if not exists public.feedback (
  id         uuid primary key default gen_random_uuid(),
  nickname   text check (nickname is null or char_length(btrim(nickname)) between 2 and 12),
  category   text not null default 'etc' check (category in ('bug', 'idea', 'praise', 'etc')),
  rating     smallint not null check (rating between 1 and 5),
  content    text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "anyone can send feedback" on public.feedback;
create policy "anyone can send feedback"
  on public.feedback for insert
  to anon, authenticated
  with check (true);

-- 조회 정책 없음 → 피드백은 관리자만 (Supabase 대시보드 Table Editor 에서) 확인
revoke all on public.feedback from anon, authenticated;
grant insert (nickname, category, rating, content) on public.feedback to anon, authenticated;
