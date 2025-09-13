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

export function checkApiKeys(): {
  hasNaverOpenApi: boolean;
  hasSearchAds: boolean;
  fingerprint: string;
} {
  const naverClientId = process.env.NAVER_CLIENT_ID?.trim() || '';
  const naverClientSecret = process.env.NAVER_CLIENT_SECRET?.trim() || '';
  const searchadApiKey = process.env.SEARCHAD_API_KEY?.trim() || '';
  const searchadCustomerId = process.env.SEARCHAD_CUSTOMER_ID?.trim() || '';
  const searchadSecretKey = process.env.SEARCHAD_SECRET_KEY?.trim() || '';

  return {
    hasNaverOpenApi: !!(naverClientId && naverClientSecret),
    hasSearchAds: !!(searchadApiKey && searchadCustomerId && searchadSecretKey),
    fingerprint: secretsFingerprint()
  };
}