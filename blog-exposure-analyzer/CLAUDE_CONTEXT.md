# 🤖 CLAUDE CONTEXT - Blog Exposure Analyzer

> **새 Claude 세션에서 즉시 작업을 이어가기 위한 컨텍스트 문서**

## 📋 **프로젝트 개요**

**목표**: 네이버 SearchAds API를 사용한 블로그 노출도 분석 도구  
**상태**: 코딩 완료 (34개 파일), 배포 진행 중  
**GitHub**: `brander1028-create/tidewave-orchestrator`  
**브랜치**: `feature/blog-exposure-analyzer`  
**폴더**: `blog-exposure-analyzer/`

## 🏗️ **아키텍처**

```
blog-exposure-analyzer/
├── server/ (Node.js + Express + TypeScript)
│   ├── index.ts - 메인 서버
│   ├── services/
│   │   ├── searchads-api.ts - 네이버 API 연동 (실제 API 호출)
│   │   ├── blog-scraper.ts - 블로그 수집 (네이버 검색 + RSS)
│   │   ├── keyword-service.ts - 키워드 분석 + 점수 계산
│   │   ├── db.ts - PostgreSQL (Drizzle ORM)
│   │   └── memory-cache.ts - 3티어 캐싱
│   └── routes/ - API 엔드포인트
├── client/ (React + Vite + TypeScript)
│   ├── src/
│   │   ├── pages/ - SearchPage, JobPage, BlogDetailPage
│   │   ├── components/ - ProgressBar, BlogCard, KeywordCard
│   │   └── lib/ - API 클라이언트
│   └── public/
└── package.json - 통합 빌드 스크립트
```

## 🔑 **핵심 기능 (구현 완료)**

### **백엔드 서비스**
- ✅ **실제 네이버 SearchAds API 호출** (키워드 검색량/광고 데이터)
- ✅ **블로그 스크래핑**: 네이버 검색 → HTML 파싱 → RSS 수집
- ✅ **키워드 추출**: N-gram 분석 + TF-IDF + 조합 키워드 생성
- ✅ **AdScore 계산**: 검색량 × 경쟁도 × 광고 확률
- ✅ **PostgreSQL 저장**: Drizzle ORM + 스키마 정의
- ✅ **3티어 캐싱**: Memory → Database → API

### **프론트엔드**
- ✅ **React SPA**: Vite + TypeScript + Tailwind CSS
- ✅ **실시간 진행상황**: WebSocket 또는 폴링으로 작업 상태 표시
- ✅ **키워드 입력 폼**: 1-50개 키워드 입력
- ✅ **블로그 카드 리스트**: 제목, URL, 점수, 키워드 표시
- ✅ **반응형 UI**: 모바일 + 데스크톱 지원

## 🚀 **배포 상황**

### **Vercel 연결 완료**
- **Team**: `sius-projects-9ee2e350`
- **Project**: `tidewave-orchestrator`
- **문제**: Root Directory 설정 필요

### **해결 방법**
1. https://vercel.com/new 접속
2. Import: `tidewave-orchestrator`
3. **Root Directory**: `blog-exposure-analyzer` (중요!)
4. Framework: `Vite`
5. Build Command: `npm run build`
6. Output Directory: `dist/client`

### **환경 변수 (필수)**
```env
DATABASE_URL=postgresql://user:password@host/database
SEARCHAD_API_KEY=네이버_API_키
SEARCHAD_SECRET_KEY=네이버_시크릿_키  
SEARCHAD_CUSTOMER_ID=고객_ID
```

## 📡 **API 명세**

### **주요 엔드포인트**
```typescript
POST /api/search
Body: { keyword: string }
Response: { jobId: string }

GET /api/jobs/:jobId
Response: { 
  status: 'pending' | 'processing' | 'completed' | 'failed',
  progress: number,
  message: string 
}

GET /api/blogs/:jobId  
Response: {
  blogs: Blog[],
  keywords: Keyword[]
}
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
  createdAt: Date
}

interface Keyword {
  text: string
  searchVolume: number
  competition: number
  adScore: number
}
```

## 🔄 **워크플로우**

1. **사용자**: 키워드 입력 → "분석 시작"
2. **1단계**: 네이버 검색 → 블로그 URL 수집
3. **2단계**: 각 블로그 RSS 파싱 → 최근 포스트 수집  
4. **3단계**: 키워드 추출 → SearchAds API 호출
5. **4단계**: AdScore 계산 → DB 저장 → 결과 표시

## 🛠️ **기술 스택**

### **Backend**
- Node.js 18+ + Express + TypeScript
- PostgreSQL + Drizzle ORM
- 네이버 SearchAds API (실제 연동)
- node-fetch, cheerio, fast-xml-parser

### **Frontend**  
- React 18 + Vite + TypeScript
- Tailwind CSS + Wouter (라우팅)
- TanStack Query (상태 관리)

### **배포**
- Vercel (프론트엔드 + Serverless Functions)
- PostgreSQL 호스팅: Neon/Supabase 권장

## 🎯 **현재 작업**

**배포 중**: Root Directory 설정하면 즉시 배포 가능  
**완성도**: 100% (모든 파일 구현 완료)  
**테스트**: 로컬에서 작동 확인 완료

## 💬 **새 Claude 세션에서 말할 내용**

```
"GitHub의 blog-exposure-analyzer 폴더에 완성된 프로젝트가 있어.
CLAUDE_CONTEXT.md 파일을 읽고 Vercel 배포를 도와줘."
```

---

**Last Updated**: 2024-09-30  
**Files**: 34개 완성  
**Status**: 배포 대기 중