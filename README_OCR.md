# Larios Rental - App movil con vision OCR

Esta version incluye la app movil y un servidor local. El movil/tablet abre la app desde el ordenador y el servidor lee las imagenes con vision de OpenAI. Si no hay clave de OpenAI, intenta usar Tesseract como respaldo, pero la opcion fiable es vision.

## Requisitos

- Python 3.
- Una clave `OPENAI_API_KEY`.
- Tesseract OCR instalado en el ordenador solo como respaldo.
- Movil/tablet y ordenador conectados a la misma WiFi.

## Uso

1. En esta carpeta ejecuta:

```bash
python3 -m pip install -r requirements.txt
export OPENAI_API_KEY="tu_clave"
python3 server.py
```

En Windows PowerShell:

```powershell
$env:OPENAI_API_KEY="tu_clave"
python server.py
```

2. El servidor mostrara direcciones tipo:

```text
http://192.168.1.50:8765
```

3. Abre esa direccion desde Safari/Chrome en el movil o tablet.
4. Usa los botones de carnet, DNI/Pasaporte y coche. Al subir la imagen, el servidor devolvera los campos detectados para revisarlos antes de aplicar al contrato.

## Importante

Si subes solo la carpeta `static` a GitHub Pages/Netlify como web estatica, la app puede rellenar y generar PDF, pero no puede usar vision OCR porque no existe el servidor `/api/vision-ocr`.

## Probar en Render o Railway

Sube a GitHub el contenido de esta carpeta, no el archivo ZIP ni una carpeta contenedora. En la raiz del repositorio deben quedar `server.py`, `requirements.txt`, `README_OCR.md` y la carpeta `static`.

### Render

1. Crea un Web Service nuevo desde el repositorio de GitHub.
2. Usa estos comandos:

```bash
pip install -r requirements.txt
python server.py
```

3. Anade estas variables de entorno:

```text
OPENAI_API_KEY=tu_clave_de_openai
OPENAI_VISION_MODEL=gpt-4.1
```

4. Cuando termine el despliegue, abre la URL publica de Render y prueba el escaner desde el movil.

### Railway

1. Crea un proyecto nuevo desde el repositorio de GitHub.
2. En Variables anade:

```text
OPENAI_API_KEY=tu_clave_de_openai
OPENAI_VISION_MODEL=gpt-4.1
```

3. Si Railway pide un comando de inicio, usa:

```bash
python server.py
```

4. Genera o abre el dominio publico del servicio y prueba la app desde ese enlace.
