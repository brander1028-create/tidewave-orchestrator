# 🔍 Blog Exposure Analyzer

블로그 상위 노출 분석 및 광고성 키워드 추출 시스템

## 📊 프로젝트 구조

```
blog-exposure-analyzer/
├── shared/
│   └── schema.ts          # DB 스키마 (5개 테이블)
├── server/
│   ├── services/
│   │   ├── keyword-validator.ts    ✅ 완료 (키워드 검증/필터링)
│   │   ├── searchads-api.ts        ✅ 완료 (네이버 API 호출)
│   │   ├── keyword-cache.ts        ✅ 완료 (메모리 캐시)
│   │   ├── blog-scraper.ts         ✅ 완료 (블로그 스크래핑)
│   │   ├── keyword-extractor.ts    ✅ 완료 (N-gram 추출)
│   │   ├── adscore-engine.ts       ✅ 완료 (광고성 점수 계산)
│   │   └── keyword-service.ts      ✅ 완료 (통합 서비스)
│   ├── db.ts                       ✅ 완료 (DB 연결)
│   ├── routes.ts                   ⏳ TODO (API 라우트)
│   └── index.ts                    ⏳ TODO (서버 진입점)
├── client/
│   └── src/
│       ├── pages/
│       │   ├── search.tsx          ⏳ TODO (검색 페이지)
│       │   ├── blog-detail.tsx     ⏳ TODO (블로그 상세)
│       │   └── dashboard.tsx       ⏳ TODO (대시보드)
│       └── main.tsx                ⏳ TODO (앱 진입점)
└── package.json                    ✅ 완료

## 🎯 핵심 기능

### 1. 블로그 발견
- 키워드 검색 → 상위 노출 블로그 10개 수집
- 일반 블로그 / 인플루언서 구분

### 2. 포스트 수집
- 블로그당 최신 글 10개 수집 (RSS 우선)
- 총 10개 블로그 × 10개 글 = 100개 포스트

### 3. 키워드 추출 ⭐ 핵심!
- 각 글에서 연속 N-gram (1~4) 추출
- **사전 필터링**: 블랙리스트, 광고 불가 패턴
- **DB 캐시 조회**: 있으면 즉시 사용
- **API 호출**: 없으면 네이버 SearchAds API
- **광고성 판단**: ad_depth, ctr, cpc 기반
- **티어 할당**: 글당 4개 키워드 (AdScore 높은 순)

### 4. 순위 체크
- 추출된 키워드 각각 네이버 모바일 검색
- 첫 페이지(1-50위) 내 블로그 순위 확인

## 🔑 개선 사항

### ✅ 구현 완료
1. **키워드 검증 (keyword-validator.ts)**
   - 길이, 특수문자, 의미 체크
   - 블랙리스트 필터링
   - 인텔리전트 배치 그룹핑

2. **API 재시도 로직 (searchads-api.ts)**
   - 지수 백오프 (Rate Limit 대응)
   - 배치 크기 자동 조정
   - 정확한 키워드 매칭 (relKeyword 무시)

3. **메모리 캐시 (keyword-cache.ts)**
   - Map 기반 초고속 조회
   - TTL 차등 적용 (HOT/WARM/COLD)
   - 주기적 정리

4. **광고성 부스팅 (adscore-engine.ts)**
   - 단일 광고 불가 키워드 감지
   - 조합 키워드 부스트 (+30%)
   - AdScore 종합 계산

5. **블로그 스크래핑 (blog-scraper.ts)**
   - 모바일 네이버 검색
   - RSS 우선 + HTML 폴백
   - 상위노출/서치피드 구분

6. **통합 서비스 (keyword-service.ts)**
   - 3단계 캐시 (메모리 → DB → API)
   - 자동 저장 및 갱신

---

**생성일**: 2025-09-30
**상태**: 🚧 백엔드 핵심 완료, 라우트/프론트엔드 개발 중