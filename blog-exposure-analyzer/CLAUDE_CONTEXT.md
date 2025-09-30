# 🤖 CLAUDE CONTEXT - Blog Exposure Analyzer (전체 대화 내용 포함)

> **새 Claude 세션에서 즉시 작업을 이어가기 위한 완전한 컨텍스트 문서**

## 📋 **프로젝트 개요**

**목표**: 네이버 SearchAds API를 사용한 블로그 노출도 분석 도구  
**상태**: 코딩 완료 (34개 파일), 배포 진행 중  
**GitHub**: `brander1028-create/tidewave-orchestrator`  
**브랜치**: `feature/blog-exposure-analyzer`  
**폴더**: `blog-exposure-analyzer/`

## 💬 **사용자 요청사항 & 결정사항**

### **핵심 요구사항**
- **실제 API 연동**: "목업 아니고 진짜 API 불러오는 진짜 버전"
- **네이버 SearchAds API**: 실제 키워드 검색량, 광고 데이터 수집
- **블로그 분석**: 네이버 검색 → RSS 수집 → 키워드 추출
- **점수 계산**: AdScore = 검색량 × 경쟁도 × 광고 확률
- **완전한 풀스택**: 백엔드 + 프론트엔드 + 데이터베이스

### **기술 스택 결정**
- **백엔드**: Node.js + Express + TypeScript (사용자 선호)
- **프론트엔드**: React + Vite + TypeScript
- **데이터베이스**: PostgreSQL + Drizzle ORM
- **배포**: Vercel (사용자 계정 연결됨)

### **기능 요구사항**
1. **키워드 입력** → 블로그 검색 → RSS 수집
2. **실제 SearchAds API** 호출로 정확한 데이터
3. **3티어 캐싱**: Memory → DB → API (성능 최적화)
4. **실시간 진행상황** 표시
5. **반응형 웹 UI**: 모바일/데스크톱 지원

## 🏗️ **아키텍처 (완성된 구조)**

```
blog-exposure-analyzer/
├── package.json - 통합 빌드 설정
├── server/ (백엔드 - Express + TypeScript)
│   ├── index.ts - 메인 서버 (포트 3000)
│   ├── services/
│   │   ├── db.ts - PostgreSQL 연결 (Drizzle ORM)
│   │   ├── searchads-api.ts - 네이버 API 실제 연동
│   │   ├── blog-scraper.ts - 네이버 검색 + RSS 파싱
│   │   ├── keyword-service.ts - 키워드 분석 + AdScore 계산
│   │   └── memory-cache.ts - 3티어 캐싱 시스템
│   └── routes/
│       ├── search.ts - POST /api/search
│       ├── jobs.ts - GET /api/jobs/:id
│       └── blogs.ts - GET /api/blogs/:jobId
├── client/ (프론트엔드 - React + Vite)
│   ├── src/
│   │   ├── App.tsx - 메인 앱
│   │   ├── pages/
│   │   │   ├── SearchPage.tsx - 키워드 입력
│   │   │   ├── JobPage.tsx - 진행상황 표시
│   │   │   └── BlogDetailPage.tsx - 상세 결과
│   │   ├── components/
│   │   │   ├── ProgressBar.tsx - 실시간 진행률
│   │   │   ├── BlogCard.tsx - 블로그 카드
│   │   │   └── KeywordCard.tsx - 키워드 점수
│   │   └── lib/
│   │       └── api.ts - API 클라이언트
│   ├── public/
│   └── index.html
├── shared/
│   └── types.ts - TypeScript 타입 정의
├── .env.example - 환경변수 템플릿
├── tsconfig.json - TypeScript 설정
├── drizzle.config.ts - DB 설정
└── vercel.json - 배포 설정
```

## 🔑 **핵심 기능 (모두 구현 완료)**

### **1. 실제 네이버 SearchAds API 연동**
```typescript
// server/services/searchads-api.ts
- 실제 API 키 사용
- HMAC-SHA256 서명 인증
- 키워드 검색량 데이터
- 광고 경쟁도 정보
- Rate Limit 대응 (exponential backoff)
```

### **2. 블로그 스크래핑 시스템**
```typescript
// server/services/blog-scraper.ts
- 네이버 검색 HTML 파싱
- RSS 피드 자동 발견
- XML 파싱으로 포스트 수집
- 중복 제거 로직
```

### **3. 키워드 분석 엔진**
```typescript
// server/services/keyword-service.ts
- N-gram 키워드 추출
- TF-IDF 점수 계산
- 조합 키워드 생성
- AdScore = 검색량 × 경쟁도 × 광고확률
```

### **4. 3티어 캐싱 시스템**
```typescript
// 캐싱 전략
Memory Cache (1시간) → Database (1일) → API 호출
- 성능 최적화
- API 요청 최소화
- 비용 절약
```

### **5. React 프론트엔드**
```typescript
// client/src/
- 키워드 입력 폼
- 실시간 진행상황 (WebSocket/폴링)
- 블로그 카드 리스트
- 키워드별 점수 표시
- 반응형 UI (Tailwind CSS)
```

## 🚀 **배포 상황 & 문제해결**

### **Vercel 연결 완료**
- **사용자 계정**: `sius-projects-9ee2e350`
- **팀**: `team_2VP7u5YHaELG0KxaluBm304d`
- **기존 프로젝트**: `tidewave-orchestrator`

### **배포 과정에서 발생한 문제들**
1. **Root Directory 미설정**: 프로젝트 루트 대신 하위 폴더 배포 필요
2. **vercel.json 설정 오류**: Function runtime 버전 명시 필요
3. **404 에러**: 경로 라우팅 문제

### **해결된 설정**
```json
// vercel.json (최종 버전)
{
  "version": 2,
  "functions": {
    "server/index.ts": {
      "runtime": "@vercel/node@18.x"
    }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "/server/index.ts" },
    { "src": "/(.*)", "dest": "/dist/client/$1" }
  ]
}
```

### **권장 배포 방법**
```
1. https://vercel.com/new 접속
2. Import: tidewave-orchestrator
3. Root Directory: blog-exposure-analyzer ⭐ (중요!)
4. Framework: Vite
5. Build Command: npm run build
6. Output Directory: dist/client
```

## 🔧 **환경 변수 (필수 설정)**

```env
# .env
DATABASE_URL=postgresql://user:password@host:5432/database
SEARCHAD_API_KEY=네이버_API_키
SEARCHAD_SECRET_KEY=네이버_시크릿_키
SEARCHAD_CUSTOMER_ID=고객_ID

# 추천 DB 호스팅
- Neon (무료 PostgreSQL)
- Supabase (무료 PostgreSQL)
```

## 📡 **API 명세**

### **엔드포인트**
```typescript
POST /api/search
Body: { keyword: string }
Response: { jobId: string, message: string }

GET /api/jobs/:jobId
Response: { 
  status: 'pending' | 'processing' | 'completed' | 'failed',
  progress: number,
  message: string,
  currentStep: string
}

GET /api/blogs/:jobId
Response: {
  blogs: Blog[],
  keywords: Keyword[],
  summary: AnalysisSummary
}

GET /health
Response: { status: 'ok', timestamp: string }
```

### **데이터 모델**
```typescript
interface Blog {
  id: string
  title: string
  url: string
  description: string
  adScore: number
  keywords: string[]
  rssUrl?: string
  publishedAt: Date
  createdAt: Date
}

interface Keyword {
  text: string
  searchVolume: number
  competition: number
  adScore: number
  source: 'title' | 'content'
}

interface Job {
  id: string
  keyword: string
  status: JobStatus
  progress: number
  message: string
  createdAt: Date
  completedAt?: Date
}
```

## 🔄 **워크플로우 (단계별 진행)**

1. **사용자**: 키워드 입력 → "분석 시작" 버튼
2. **1단계**: 네이버 검색 → 블로그 URL 수집 (상위 20개)
3. **2단계**: RSS 피드 자동 발견 → 최근 포스트 파싱
4. **3단계**: 키워드 추출 → N-gram 분석
5. **4단계**: SearchAds API 호출 → 검색량/경쟁도 데이터
6. **5단계**: AdScore 계산 → PostgreSQL 저장
7. **결과**: 블로그별 점수 순으로 표시

## 🛠️ **기술 스택 & 의존성**

### **Backend Dependencies**
```json
{
  "@neondatabase/serverless": "^0.9.0",
  "drizzle-orm": "^0.30.0",
  "express": "^4.18.3",
  "fast-xml-parser": "^4.3.5",
  "node-fetch": "^3.3.2",
  "ws": "^8.16.0",
  "zod": "^3.22.4"
}
```

### **Frontend Dependencies**
```json
{
  "@tanstack/react-query": "^5.28.0",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "wouter": "^3.0.0"
}
```

### **Build Tools**
```json
{
  "@vitejs/plugin-react": "^4.2.1",
  "tailwindcss": "^3.4.1",
  "typescript": "^5.3.3",
  "vite": "^5.1.4"
}
```

## 🎯 **현재 상황 & 다음 단계**

### **완성된 것**
- ✅ **모든 소스코드** (34개 파일)
- ✅ **GitHub 업로드** 완료
- ✅ **Vercel 계정 연결**
- ✅ **배포 설정 파일**

### **진행 중**
- 🔄 **Vercel 배포**: Root Directory 설정 후 재배포 필요
- ⏳ **환경 변수 설정**: DB + API 키 입력 대기

### **즉시 할 일**
1. **새 Vercel 프로젝트 생성** (Root Directory: blog-exposure-analyzer)
2. **환경 변수 추가** (DATABASE_URL, API 키들)
3. **배포 완료** → URL 확인
4. **기능 테스트** → 실제 키워드로 분석 시도

## 💡 **중요한 메모**

### **사용자 피드백**
- "목업 아니고 진짜 API" - 실제 네이버 SearchAds API 구현 완료
- "Claude 4.5 서버 문제" - 새창에서 작업 계속 (컨텍스트 문서 필요)
- "매번 새창에서 설명 비효율적" - 이 문서로 해결

### **Claude 세션 문제 해결**
- **문제**: 새창 열 때마다 컨텍스트 손실
- **해결**: CLAUDE_CONTEXT.md 파일로 자동화
- **사용법**: "GitHub CLAUDE_CONTEXT.md 읽고 배포 도와줘"

### **배포 우선순위**
1. **Vercel** (프론트엔드 + Serverless Functions)
2. **Railway** (백엔드 대안, 장시간 작업 지원)
3. **환경변수**: Neon DB + 네이버 API 키 필수

## 🔄 **재시작용 명령어**

```
새 Claude 세션에서 이 한 줄만 입력:

"GitHub brander1028-create/tidewave-orchestrator의 
blog-exposure-analyzer/CLAUDE_CONTEXT.md 읽고 
Vercel 배포 이어서 도와줘"
```

---

**Last Updated**: 2024-09-30 21:30 KST  
**Files**: 34개 완성  
**Status**: 배포 설정 완료, Root Directory 지정 후 배포 가능  
**Next**: 새 Vercel 프로젝트 생성 → 환경변수 → 배포 완료