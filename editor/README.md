# Remotion 웹 에디터

업로드한 영상을 브라우저에서 편집하고 Remotion 효과를 입히는 웹 영상 에디터입니다.
미리보기는 `@remotion/player`로 실시간 렌더링됩니다.

## 실행

```bash
cd editor
pnpm install
pnpm dev      # http://localhost:5273
```

## 핵심 기능

1. **컷편집** — 타임라인에서 클립을 드래그로 이동하고, 양 끝 핸들로 트림하며,
   플레이헤드 위치에서 `✂ 분할`(단축키 `S`)로 자르고 `Del`로 삭제합니다.
   영상 분할 시 in-point(trim)가 자동 보정되어 끊김 없이 이어집니다.
2. **줌 인/줌 아웃** — 애니메이션 패널의 `줌 인/줌 아웃 (Ken Burns)`로 클립 전체에
   배율 애니메이션을 주거나, 영역 선택 도구의 `영역으로 줌`으로 특정 부분을 확대 연출합니다.
3. **Remotion 기능** — `interpolate`/`spring` 기반 애니메이션(페이드·슬라이드·회전·펄스 등),
   등장 트랜지션(페이드/슬라이드/와이프/플립), `@remotion/media`의 영상 트림·볼륨·속도,
   `@remotion/effects` WebGL 필터 라이브러리(블러·픽셀화·비네트·글로우·색수차·색보정 등),
   `@remotion/shapes` 도형, 오디오를 노출합니다. 새 효과/애니메이션은 레지스트리에 한 줄로 추가됩니다.
4. **영역 선택 도구** — 미리보기에서 영역을 드래그한 뒤,
   ① 셀렉트 박스 ② 텍스트 명령(예: `줌`, `블러`, `모자이크`, `스포트라이트`, `강조`) ③ 버튼
   세 가지 방식으로 연출 효과를 적용합니다.

## 구조

- `src/types.ts` — 프로젝트/트랙/클립/효과 데이터 모델
- `src/store.ts` — Zustand 상태 + 편집 액션(추가/분할/이동/리사이즈/효과)
- `src/remotion/VideoComposition.tsx` — 상태 → Remotion 컴포지션 렌더
- `src/remotion/ClipRenderer.tsx` — 클립별 변형/애니메이션/필터/영역효과 합성
- `src/remotion/animations.ts` — 애니메이션 레지스트리(확장 지점)
- `src/remotion/effects.ts` — WebGL 필터 + 영역 효과 + 영역 줌 레지스트리(확장 지점)
- `src/components/*` — 미디어 패널·미리보기·타임라인·인스펙터 UI

## 다음 단계(선택)

- 서버 사이드 mp4 내보내기(`@remotion/renderer`)
- 키프레임 기반 자유 애니메이션, 더 많은 `@remotion/transitions` 노출
