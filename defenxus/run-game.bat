@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo 🎮 DEFENXUS 서버 시작 중...
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🌐 http://localhost:8000
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 모바일 접속:
echo 1. 명령 프롬프트 열기
echo 2. ipconfig 실행
echo 3. "IPv4 주소" 복사 ^(예: 192.168.x.x^)
echo 4. 모바일에서 http://[IP]:8000 입력
echo.
echo 서버 중지: Ctrl+C 누르기
echo.

python -m http.server 8000
pause
