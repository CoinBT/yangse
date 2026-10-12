# 양세찬 게임 — 웹주소로 접속하게 배포하기

친구들은 PC 또는 스마트폰 브라우저만 필요합니다. **Node.js 설치는 배포하는 사람에게도 필요 없습니다.**

## 방법 A: Render 앱을 이용해 배포

Render 앱이 연결되어 있으면 이 코드가 올라간 **GitHub 저장소 URL**을 전달해 웹 서비스 생성과 배포를 요청할 수 있습니다. 채팅에서 Render 도구가 제공되지 않으면 아래의 방법 B로 직접 배포하세요. 서버 소스와 배포 설정만으로는 실시간 URL이 자동 발급되지 않습니다. 실제 링크는 Render에서 배포가 성공한 뒤 생성됩니다.

## 방법 B: 웹브라우저로 직접 배포 (GitHub + Render)

1. 이 압축파일을 풀어 주세요. `render.yaml`, `server.js`, `package.json`, `public/` 등이 있습니다. **압축파일 자체를 올리지 말고 압축을 푼 폴더 내용물을 업로드**하세요.
2. [GitHub](https://github.com/new)에서 **새 저장소**를 만드세요. `Private`로 해도 됩니다. GitHub의 **Add file → Upload files**에서 압축 푼 프로젝트의 **파일과 `public/` 및 `tests/` 폴더 구조 전체**를 업로드하고 **Commit changes**를 클릭하세요. `data/rooms.json`은 업로드하지 마세요.
3. [Render](https://dashboard.render.com/)에 로그인합니다. **New → Blueprint**를 누르고 GitHub 저장소를 연결하면 `render.yaml`이 읽힙니다.
4. 무료 플랜 `free` 배포 설정을 확인하고 **Deploy / Apply**합니다.
5. Render에서 표시되는 `https://...onrender.com` 주소로 접속해 닉네임을 입력하고 **방 만들기**를 클릭하세요.
6. 게임방 안의 **초대 링크 복사**를 눌러 친구들에게 보내세요. 친구들은 링크 접속 → 닉네임 입력 → 참가자 또는 관전자 선택으로 입장합니다.

### Render Blueprint 대신 Web Service 메뉴를 사용하는 경우

- New → Web Service → GitHub 저장소 선택
- Runtime: Node
- Build Command: `npm install --omit=dev --ignore-scripts`
- Start Command: `npm start`
- Instance Type: Free (무료 체험용)
- Health Check Path: `/api/health`

## 꼭 알아둘 사항

- Render 무료 서비스는 15분간 HTTP 요청이나 웹소켓 메시지가 없으면 중지될 수 있습니다. 다음 접속 시 재기동까지 약 1분 걸릴 수 있습니다.
- **무료 Render 서버의 저장 파일은 재기동·업데이트·슬립 전환 시 삭제됩니다.** 따라서 누적 스코어/기록도 서버가 중지되면 소실됩니다. **한 게임 세션 안에서 라운드를 반복하는 동안에는 누적됩니다.**
- 장기간 스코어를 남기려면 유료 인스턴스에 영구 디스크를 추가하고 `DATA_DIR` 환경변수를 디스크 마운트 경로(예 `/var/data`)로 설정해야 합니다. 또는 서버 코드에 클라우드 DB 저장 기능을 추가해야 합니다.
- **호스트가 서버 비용을 부담**하려면 무료 플랜/유료 플랜을 선택해 배포한 본인의 Render 계정에서 운영합니다. 게임 내 호스트는 방을 만드는 사람으로, 서버 계정 소유자와 꼭 같을 필요는 없습니다.
- 공개 링크 유출 시 낯선 사람이 방코드만 알면 입장할 수 있습니다. 아는 사람에게만 공유하세요.
- 대규모 무제한 관전은 보장하지 않습니다. 참가자 제한은 12명이며 관전 제한은 코드에 없지만 실제 한도는 호스팅 사양에 따릅니다.
- 브라우저에서 질문, 정답, 투표는 작동하지만 실시간 음성 대화는 별도 음성통화를 이용하세요.

## 배포 전 로컬 테스트(선택사항)

`npm start`로 시작합니다. Node.js 18 이상 필요. `http://localhost:3000/api/health`에 접속해 `{ "ok": true }`가 나오면 정상입니다.
