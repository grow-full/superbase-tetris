// 간단한 금칙어 목록. 공백/특수문자를 지운 뒤 포함 여부로 검사한다.
const BANNED = [
  '시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새', '좆', '존나', '미친놈', '미친년', '닥쳐', '꺼져',
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'cunt', 'nigger', 'faggot',
];

function normalize(text) {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}0-9_]/gu, '');
}

export function hasBannedWord(text) {
  const n = normalize(text);
  return BANNED.some((w) => n.includes(w));
}

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;
export const FEEDBACK_MAX = 500;

/** 닉네임 검사. 문제가 없으면 null, 있으면 오류 문구를 돌려준다. */
export function validateNickname(raw, { required = true } = {}) {
  const name = raw.trim();
  if (!name) return required ? '닉네임을 입력해 주세요.' : null;
  const len = [...name].length;
  if (len < NICKNAME_MIN || len > NICKNAME_MAX) return `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해 주세요.`;
  if (hasBannedWord(name)) return '사용할 수 없는 단어가 들어 있습니다.';
  return null;
}

export function validateFeedback(raw) {
  const text = raw.trim();
  if (!text) return '내용을 입력해 주세요.';
  if ([...text].length > FEEDBACK_MAX) return `내용은 ${FEEDBACK_MAX}자 이내로 입력해 주세요.`;
  if (hasBannedWord(text)) return '사용할 수 없는 단어가 들어 있습니다.';
  return null;
}
