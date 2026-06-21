#!/bin/bash
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt
if [ -z "$OPENAI_API_KEY" ]; then
  echo "AVISO: falta OPENAI_API_KEY. El servidor arrancara, pero la vision OCR no funcionara hasta configurarla."
fi
python3 server.py
