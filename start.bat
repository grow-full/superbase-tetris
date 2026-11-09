@echo off
chcp 65001 >nul
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo [오류] Python이 없습니다. https://www.python.org 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

echo STACKFALL 로컬 서버를 시작합니다: http://localhost:5173
echo 이 창을 닫으면 서버가 종료됩니다.
start "" cmd /c "timeout /t 1 >nul & start http://localhost:5173/"
python -m http.server 5173 --bind 127.0.0.1
pause
