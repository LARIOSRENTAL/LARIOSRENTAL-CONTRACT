@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt
if "%OPENAI_API_KEY%"=="" echo AVISO: falta OPENAI_API_KEY. El servidor arrancara, pero la vision OCR no funcionara hasta configurarla.
python server.py
pause
