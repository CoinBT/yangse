# 양세찬 게임 Public Edition — 광고 심사 준비 체크리스트

이 저장소의 `main`은 Render Singapore 웹 서비스 `yangsechan-webgame`에 자동 배포됩니다.

## 사이트 구조
- `/`: 게임 소개 및 플레이 유도 콘텐츠 홈페이지
- `/play`: 기존 실시간 게임방 (게임·채팅 화면에 광고 스크립트를 넣지 않음)
- `/guide`, `/faq`, `/about`: 독창적인 게임 설명과 정보성 콘텐츠
- `/privacy`, `/terms`, `/contact`, `/safety`: 정책과 운영 지원 안내
- `/robots.txt`, `/sitemap.xml`: 크롤러 공개 경로
- 과거 초대 링크 `/?room=ABC123`는 `/play?room=ABC123`로 이동

## 지금 바로 공개됐다고 해도 아직 심사 신청을 누르지 말아야 하는 이유
1. **운영자 공식 연락처가 미정:** `/contact`는 공개 GitHub 이슈만 지원. 개인정보 비공개 문의 채널이 필요.
2. **개인정보처리방침/약관은 법적 최종본이 아님:** 실제 데이터 보유기간, 요청·삭제 절차, 처리위탁 및 광고·쿠키 정책을 운영자에 맞게 완성해야 함.
3. **실제 소유 도메인 미연결:** `onrender.com` 임시 하위 도메인이 아닌 직접 소유한 독립 도메인 연결 권장. AdSense는 일반 하위 도메인 등록을 제한할 수 있음.
4. **게임 공개 운영 준비:** 유해 채팅 신고·차단, 로그·게임방 삭제 정책, 동시 접속 한계 및 DB 지속성, 게임물 등급분류와 사업자·세무 등 적용 법규 별도 확인 필요.
5. **AdSense 계정 검증 전:** 현재 광고 코드/실제 광고/게시자 ID 없음. 승인이나 수익을 보장할 수 없음.

## Render 환경변수 (운영자 확인 뒤 설정)
- `SITE_URL`: 직접 소유한 HTTPS 최종 도메인, 예: `https://YOUR-DOMAIN.example` — sitemap에 반영. 실제 도메인 확보 전 설정하지 않기.
- `ADSENSE_CLIENT_ID`: Google AdSense에서 **본인이 실제로 발급받은** `ca-pub-` + 16자리 번호.
  - 값이 올바르면 코드가 공개 콘텐츠 페이지(홈, 가이드, FAQ, 소개)의 `<head>`에만 주입됨.
  - `/play`, 채팅, 개인정보처리방침, 이용약관, 문의, 안전 페이지에는 광고 코드를 주입하지 않음.
  - `/ads.txt`도 실제 ID를 설정한 후에만 `google.com, pub-..., DIRECT, f08c47fec0942fa0`을 제공.
  - 신원 확인 전 예시 `ca-pub-000...`를 절대로 설정하지 말 것.
- `DATA_DIR`: 영구 디스크 마운트 경로(유료 서버 또는 DB 구조로 전환 시 검토).

## AdSense 심사 신청 전 실제 순서
1. 게임의 이름·브랜드·상표·유사성 위험 확인, 운영 목적과 정책 확정.
2. 도메인 구매 후 Render Dashboard에서 Custom Domain 연결 및 HTTPS 확인.
3. 위 도메인으로 모든 내부 링크·사이트맵·SEO 미리보기 확인.
4. 공식 지원 이메일 지정, 개인정보처리방침/이용약관 실제 운영정보로 개정.
5. 법적 등급분류·사업자·신고 필요성 및 한국 개인정보 규정 확인.
6. 콘텐츠 페이지와 링크, 모바일 UI, 서버 지속성·유해 채팅 관리 테스트.
7. Google AdSense 계정 개설 및 사이트 추가, 소유권 확인 코드가 필요한 경우 위 환경변수에 본인 ID 입력.
8. AdSense 대시보드에서 사이트 심사 요청. 승인된 뒤 정책에 맞춰 광고 표시 설정.
9. Google의 지역별 동의 관리(CMP 등) 및 쿠키 공지 필요성을 방문자 지역에 따라 처리.
10. 광고를 클릭하도록 유도하거나, 게임 버튼·비공개 채팅·의미 없는 빈 페이지 근처에 광고 게재하지 않기.

## 로컬 테스트
`npm test` 실행. 또는 `npm start` 후 `http://localhost:3000`, `/play`, `/api/health` 확인.

공식 정책은 항상 최신 원문을 확인:
- https://support.google.com/adsense/answer/7299563
- https://support.google.com/adsense/answer/1346295
- https://support.google.com/adsense/answer/2784438
- https://support.google.com/adsense/answer/1348695
