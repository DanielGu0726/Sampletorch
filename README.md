# Sampletorch

샘플토치 치과기공소 홈페이지 (임플란트 보철 3D 모델). 기공소명·연락처·수치는 임시값이므로 실제 정보로 교체할 것. 빌드 과정 없는 정적 사이트(HTML/CSS/JS + Three.js CDN).

## 로컬 미리보기
```
npx serve .
```
(파일을 그냥 더블클릭하면 ES 모듈이 막혀 3D가 안 나올 수 있으니 로컬 서버로 열 것)

## 배포
Cloudflare Pages ↔ GitHub 연동. `main` 브랜치에 push하면 자동 배포된다.
- Build command: 없음
- Build output directory: `/`
