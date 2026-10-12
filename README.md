# Sampletorch

가상 브랜드 Sampletorch의 3D 랜딩 페이지. 빌드 과정 없는 정적 사이트(HTML/CSS/JS + Three.js CDN).

## 로컬 미리보기
```
npx serve .
```
(파일을 그냥 더블클릭하면 ES 모듈이 막혀 3D가 안 나올 수 있으니 로컬 서버로 열 것)

## 배포
Cloudflare Pages ↔ GitHub 연동. `main` 브랜치에 push하면 자동 배포된다.
- Build command: 없음
- Build output directory: `/`
