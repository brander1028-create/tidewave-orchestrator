import { createHash } from 'crypto';

export function secretsFingerprint(): string {
  const vals = [
    process.env.NAVER_CLIENT_ID?.trim() || '',
    process.env.NAVER_CLIENT_SECRET?.trim() || '',
    process.env.SEARCHAD_API_KEY?.trim() || '',
    process.env.SEARCHAD_CUSTOMER_ID?.trim() || '',
    process.env.SEARCHAD_SECRET_KEY?.trim() || '',
  ];
  // 값 자체를 해시하고, 해시는 절대 응답/로그로 내보내지 않음
  return createHash('sha256').update(vals.join('|')).digest('hex');
}