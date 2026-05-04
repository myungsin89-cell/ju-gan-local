@echo off
echo ========================================
echo  ju-gan-local 초기 설정
echo  원본 ju-gan 에서 파일 복사
echo ========================================

set SRC=원본 ju-gan 폴더 경로를 여기에 입력하세요
set DEST=%~dp0

echo.
echo app.js, manifest.json, sw.js, 아이콘 파일을 복사합니다.
echo 원본 폴더: %SRC%

copy "%SRC%\app.js" "%DEST%\app.js"
copy "%SRC%\manifest.json" "%DEST%\manifest.json"
copy "%SRC%\sw.js" "%DEST%\sw.js"
copy "%SRC%\icon.png" "%DEST%\icon.png"
copy "%SRC%\icon-192.png" "%DEST%\icon-192.png"
copy "%SRC%\icon-512.png" "%DEST%\icon-512.png"

echo.
echo 완료! 이제 index.html 을 브라우저에서 열어보세요.
pause
