# STACKFALL

브라우저에서 바로 즐기는 낙하형 블록 퍼즐 게임입니다. 점수 랭킹과 사용자 피드백은 Supabase에 저장되고, Vercel로 배포합니다.

- 빌드 도구·외부 라이브러리 없이 순수 JavaScript(ES 모듈) + Canvas 2D
- 배경음·효과음은 Web Audio API로 직접 합성 (음원 파일 없음 → 저작권 문제 없음)
- 고스트 피스(떨어질 위치 그림자)는 요구사항에 따라 넣지 않음

## 폴더 구조

```
index.html, styles.css, favicon.svg
src/
  main.js            화면 전환, 게임 루프, 랭킹·피드백 UI
  game/              게임 규칙 (보드, 블록, 회전 보정, 점수) — 테스트 대상
  render/            Canvas 그리기
  input/             키보드 입력 (DAS/ARR 반복 이동)
  audio/             배경음 + 효과음 합성
  api/supabase.js    Supabase REST API 호출 (fetch)
  ui/validation.js   닉네임·피드백 검사, 금칙어
supabase/migrations/001_init.sql   테이블 + RLS 정책
scripts/build.mjs  Vercel 빌드 (dist/ 복사 + config.js 생성)
tests/             단위 테스트 (node:test)
```

## 1. Supabase 설정

1. [supabase.com](https://supabase.com)에서 프로젝트를 만듭니다.
2. 대시보드 **SQL Editor**에 [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) 내용을 붙여넣고 실행합니다.
   - `scores`: 누구나 조회·추가 가능, 수정·삭제 불가
   - `feedback`: 누구나 추가 가능, 조회는 관리자만 (대시보드 **Table Editor**에서 확인)
3. **Project Settings → API**에서 아래 두 값을 복사합니다.
   - Project URL
   - `anon` 공개 키 (또는 새 형식의 `publishable` 키)

> ⚠️ `service_role` / `secret` 키는 절대 사용하지 마세요. 브라우저에 그대로 노출됩니다. 빌드 스크립트가 이런 키를 발견하면 빌드를 중단합니다.

## 2. 로컬 실행

> ⚠️ `index.html`을 더블클릭해서 열면(`file://`) 브라우저 보안 정책 때문에 게임 코드가 불러와지지 않아 버튼이 동작하지 않습니다. 반드시 로컬 서버로 여세요.

**Windows:** 프로젝트 폴더의 `start.bat`을 더블클릭하면 서버가 켜지고 브라우저가 열립니다 (Python 필요). 끝낼 때는 검은 창을 닫으세요.

직접 실행하려면:

```bash
cp config.example.js config.js   # 값 채우기 (config.js는 git에 올라가지 않음)
python -m http.server 5173       # 또는 npx serve .
# → http://localhost:5173
```

`config.js`가 없으면 랭킹·피드백만 꺼지고 게임은 정상 동작합니다.

테스트 (Node 18 이상 필요):

```bash
npm test
```

## 3. Vercel 배포

1. 이 저장소를 GitHub(`grow-full/superbase-tetris`)에 push 합니다.
2. [vercel.com](https://vercel.com) → **Add New → Project** → 저장소 선택
3. 설정은 [`vercel.json`](vercel.json)에 들어 있어 그대로 두면 됩니다 (Build: `npm run build`, Output: `dist`).
4. **Environment Variables**에 추가:

   | 이름 | 값 |
   |---|---|
   | `SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_ANON_KEY` | anon(또는 publishable) 공개 키 |

5. **Deploy**. 이후 `main`에 push하면 자동 배포, PR은 미리보기 배포됩니다.

환경 변수를 바꾼 뒤에는 Vercel에서 **Redeploy** 해야 반영됩니다.

## 조작법

| 키 | 동작 |
|---|---|
| ← → | 좌우 이동 |
| ↓ | 소프트 드롭 (1칸당 1점) |
| Space | 하드 드롭 (1칸당 2점) |
| ↑ / X | 시계 방향 회전 |
| Z / Ctrl | 반시계 방향 회전 |
| C / Shift | 홀드 |
| P / Esc | 일시정지 |
| M | 음소거 |

점수: 1줄 100 · 2줄 300 · 3줄 500 · 4줄 800 (× 레벨). 10줄마다 레벨 상승.

## 알려진 한계

- 점수는 브라우저에서 계산되므로 개발자 도구로 조작할 수 있습니다. DB 제약(레벨과 줄 수 일치, 줄 수 대비 최대 점수)으로 터무니없는 값만 막습니다. 필요하면 Supabase Edge Function으로 서버 검증을 추가하세요.
- 모바일 터치 조작은 아직 없습니다 (PC 키보드 전용).

## 음원

모든 배경음과 효과음은 [`src/audio/audio.js`](src/audio/audio.js)에서 코드로 합성한 오리지널입니다. 외부 음원은 쓰지 않았습니다.
