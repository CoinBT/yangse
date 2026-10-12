@echo off
chcp 65001 >nul
cd /d "%~dp0"
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared 프로그램을 먼저 설치해 주세요.
  echo 안내: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  pause
  exit /b 1
)
echo 서버를 별도 창에서 실행한 뒤, 여기에 생성되는 https://...trycloudflare.com 주소를 친구들에게 공유하세요.
echo.
cloudflared tunnel --url http://localhost:3000
pause
