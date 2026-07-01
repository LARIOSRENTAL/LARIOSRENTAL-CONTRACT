# Larios Rental - OCR V2 Inteligente

Esta version cambia el escaner de documentos a una estrategia nueva:

1. Primero transcribe literalmente el documento completo con vision.
2. Despues interpreta esas lineas con reglas:
   - Permiso europeo: 1 apellidos, 2 nombre, 3 nacimiento, 4a expedicion, 4b caducidad, 5 numero.
   - Carnets internacionales: Apellido/Nombre/License No/Date of Birth/Issue/Expires/Address.
   - DNI/Pasaporte: campos del documento y MRZ si existe.
   - Llavero: Matricula, Marca, Modelo, Fuel.
3. Si no encuentra campos suficientes, hace dos intentos extra con vision.

## Variables en Render / Railway

OPENAI_API_KEY = tu clave de OpenAI
OPENAI_VISION_MODEL = gpt-4.1

## Comandos Render

Build Command:
pip install -r requirements.txt

Start Command:
python server.py

## Subir nueva version

Sube a GitHub TODO el contenido de esta carpeta, no el ZIP entero, y haz Redeploy en Render.
