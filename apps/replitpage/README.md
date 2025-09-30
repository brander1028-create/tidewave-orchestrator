# replitpage

Replit에서 작업하는 보조 프로젝트입니다. 이 폴더만 수정해서 커밋하면 메인 프로젝트와 충돌 없이 공존합니다.

## 구조
- 정적 페이지: `index.html`
- 필요한 자산은 이 폴더 내부에 추가하세요(`assets/`, `css/`, `js/` 등).

## 배포
레포 루트의 GitHub Actions(monorepo Pages)가 `apps/*` 와 `rankpage/`를 수집해 `docs/<폴더명>/` 로 배포합니다.

작성: ChatGPT (2025-09-30, KST)
