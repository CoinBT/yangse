@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [안내] Node.js가 설치되어 있지 않습니다.
  echo https://nodejs.org 에서 LTS 버전을 설치해 주세요.
  pause
  exit /b 1
)
echo.
echo ========================================
echo    양세찬게임 - 호스트 서버 실행

echo ========================================
echo.
echo 브라우저에서 http://localhost:3000 열어 주세요.
echo 다른 곳의 친구들은 README.md에 있는 초대 링크 생성법을 이용해 주세요.
echo.
node server.js
pause
