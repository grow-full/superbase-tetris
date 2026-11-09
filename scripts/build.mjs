// Vercel 빌드 스크립트 (외부 패키지 없음, Node 18+)
// 정적 파일을 dist/ 로 복사하고 환경 변수로 dist/config.js 를 만든다.
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'dist';
const FILES = ['index.html', 'styles.css', 'favicon.svg', 'src'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const file of FILES) cpSync(file, `${OUT}/${file}`, { recursive: true });

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.warn('⚠ SUPABASE_URL / SUPABASE_ANON_KEY 환경 변수가 없습니다. 랭킹·피드백 없이 빌드합니다.');
}
if (/service_role|sb_secret_/.test(key)) {
  console.error('✖ SUPABASE_ANON_KEY 에 비밀(service_role/secret) 키가 들어 있습니다. 공개(anon/publishable) 키를 사용하세요.');
  process.exit(1);
}

writeFileSync(
  `${OUT}/config.js`,
  `window.APP_CONFIG = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key })};\n`,
);
console.log(`✔ ${OUT}/ 빌드 완료 (Supabase ${url ? '연결됨' : '미설정'})`);
