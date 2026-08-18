#!/bin/bash

cd "$(dirname "$0")/crystal-defense"

echo "🎮 크리스탈 디펜스 서버 시작 중..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 http://localhost:8000/crystal-defense/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "모바일 접속:"
echo "1. 이 명령 실행: hostname -I"
echo "2. 출력된 IP 주소를 복사"
echo "3. 모바일에서 http://[IP]:8000/crystal-defense/ 입력"
echo ""
echo "서버 중지: Ctrl+C 누르기"
echo ""

python3 -m http.server 8000
