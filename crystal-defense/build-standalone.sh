#!/bin/bash
# 크리스탈 디펜스를 더블클릭 한 번으로 실행되는 단일 HTML 파일로 빌드한다.
# ES 모듈(import/export)을 브라우저 file:// 프로토콜에서 그대로 열면
# CORS 제약으로 동작하지 않기 때문에, esbuild로 전체를 하나의 스크립트로
# 번들링한 뒤 CSS/HTML과 함께 인라인으로 합쳐서 서버 없이도 열리게 만든다.
set -e
cd "$(dirname "$0")"

echo "📦 JS 번들링 중..."
npx --yes esbuild js/main.js --bundle --format=iife --outfile=/tmp/crystal-defense-bundle.js

echo "🔧 단일 HTML 파일 조립 중..."
python3 << 'PYEOF'
import re

with open('index.html', encoding='utf-8') as f:
    html = f.read()
with open('css/style.css', encoding='utf-8') as f:
    css = f.read()
with open('/tmp/crystal-defense-bundle.js', encoding='utf-8') as f:
    js = f.read()

html = html.replace(
    '<link rel="stylesheet" href="css/style.css" />',
    f'<style>\n{css}\n</style>'
)
html = re.sub(
    r'<script type="module" src="js/main\.js"></script>',
    lambda m: f'<script>\n{js}\n</script>',
    html
)
html = html.replace(
    '<title>크리스탈 디펜스 (Crystal Defense)</title>',
    '<title>크리스탈 디펜스 (Crystal Defense) — 더블클릭 실행판</title>'
)

with open('크리스탈디펜스.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("✅ 크리스탈디펜스.html 생성 완료:", len(html), "bytes")
PYEOF

rm -f /tmp/crystal-defense-bundle.js
echo ""
echo "🎮 완료! 크리스탈디펜스.html 파일을 더블클릭하면 바로 실행됩니다."
