#!/usr/bin/env python3
import base64
import json
import os
import re
import socket
import subprocess
import tempfile
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote

from PIL import Image, ImageFilter, ImageOps


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
OCR_MAX_SIDE = 1600
OCR_MIN_WIDTH = 1000
OCR_TIMEOUT_SECONDS = 18
OPENAI_MODEL = os.environ.get("OPENAI_VISION_MODEL", "gpt-4.1")


def clean_text(value):
    if not value:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def compact_fields(fields):
    allowed = {
        "renter",
        "license_number",
        "license_country",
        "license_issue",
        "license_expiry",
        "nationality",
        "passport_id",
        "birth_date",
        "address",
        "additional_name",
        "additional_birth_date",
        "additional_license_number",
        "additional_license_issue",
        "additional_license_country",
        "additional_license_expiry",
        "vehicle_model",
        "vehicle_plate",
        "vehicle_color",
        "fuel_type",
        "credit_card_number",
        "credit_card_expiry",
    }
    return {
        key: clean_text(value)
        for key, value in (fields or {}).items()
        if key in allowed and clean_text(value)
    }


def validate_extracted_fields(fields, scan_type):
    fields = dict(fields or {})
    if scan_type in {"driver", "additional", "id"}:
        bad_name = re.compile(
            r"LICENCIA|LICENSE|CONDUCIR|REPUBLICA|REPÚBLICA|CIUDAD|SEGURIDAD|MINISTERIO|"
            r"TRANSPORTE|CLASE|CLASS|VIAL|NACIONAL|DOCUMENTO|PASAPORTE|IDENTITY",
            re.IGNORECASE,
        )
        for key in ("renter", "additional_name"):
            if key in fields and bad_name.search(fields[key]):
                fields.pop(key, None)
        for key in ("license_number", "additional_license_number", "passport_id"):
            value = re.sub(r"[^A-Z0-9]", "", normalize_key(fields.get(key, "")))
            if fields.get(key) and (len(value) < 5 or len(value) > 16 or not re.search(r"\d", value)):
                fields.pop(key, None)
    if scan_type == "driver":
        joined = normalize_key(" ".join(str(value) for value in fields.values()))
        country = normalize_key(fields.get("license_country", ""))
        if "ARGENTINA" in joined and country == "ITALIA":
            fields["license_country"] = "ARGENTINA"
    if scan_type == "car":
        if fields.get("vehicle_plate") and not re.search(r"\d", fields["vehicle_plate"]):
            fields.pop("vehicle_plate", None)
        fuel = normalize_key(fields.get("fuel_type", ""))
        if fuel and fuel not in {"GASOLINA", "DIESEL"}:
            fields.pop("fuel_type", None)
    return fields



def transcription_prompt(scan_type):
    base = (
        "Eres un OCR de documentos para Larios Rental. Tu tarea NO es interpretar todavia, solo TRANSCRIBIR. "
        "Mira la foto completa, localiza el documento/carnet/llavero/tarjeta dentro de la imagen e ignora fondo, mesa, navegador o teclado. "
        "Transcribe TODAS las lineas impresas visibles del documento, respetando etiquetas como 1., 2., 3., 4a., 4b., 5., Apellido, Nombre, Matricula, Marca, Modelo y Fuel. "
        "No inventes letras. Si una parte no se ve, omite esa parte. Devuelve SOLO JSON valido sin markdown con esta forma: "
        "{\"raw_text_lines\":[\"linea 1\",\"linea 2\"]}. "
    )
    if scan_type in {"driver", "additional"}:
        return base + (
            "Es especialmente importante copiar literalmente los campos numerados del permiso: 1, 2, 3, 4a, 4b, 4c y 5. "
            "Ejemplo de salida: [\"FUHRERSCHEIN\",\"1. SALINGER\",\"2. PAUL\",\"3. 13.07.1994 MODLING\",\"4a. 11.03.2021 4b. 10.03.2036\",\"5. 21080013\"]."
        )
    if scan_type == "car":
        return base + "Es un llavero de coche: copia literalmente Matricula, Marca, Modelo y Fuel."
    return base

def vision_prompt(scan_type):
    base = (
        "Eres un lector de documentos para contratos de alquiler de Larios Rental. "
        "Recibiras fotos tomadas con movil. Localiza visualmente el documento/carnet dentro de la foto y lee SOLO el texto impreso en el documento. "
        "Ignora mesa, fondo, navegador, teclado, reflejos y textos de la app. "
        "Devuelve SOLO JSON valido, sin markdown. Si un dato no se ve claro, cadena vacia. No inventes. "
        "Fechas siempre en formato dd/mm/aaaa. "
        "Devuelve siempre: {\"raw_text_lines\": [lineas visibles del documento], \"eu_fields\": {\"1\":\"\",\"2\":\"\",\"3\":\"\",\"4a\":\"\",\"4b\":\"\",\"5\":\"\"}, \"fields\": {...}}. "
    )
    if scan_type in {"driver", "additional"}:
        return base + (
            "TIPO: PERMISO DE CONDUCIR. Para permisos europeos, el objetivo principal es leer las etiquetas numericas impresas. "
            "No traduzcas ni adivines. Copia exactamente el valor que aparece junto a cada etiqueta: "
            "1 = apellidos, 2 = nombre, 3 = fecha nacimiento, 4a = fecha expedicion, 4b = fecha caducidad, 5 = numero de permiso. "
            "Despues construye fields asi: renter = 2 + espacio + 1; birth_date = 3; license_issue = 4a; license_expiry = 4b; license_number = 5. "
            "Ejemplo: si ves 1. SALINGER, 2. PAUL, 3. 13.07.1994, 4a. 11.03.2021, 4b. 10.03.2036, 5. 21080013, devuelve renter='PAUL SALINGER', birth_date='13/07/1994', license_issue='11/03/2021', license_expiry='10/03/2036', license_number='21080013'. "
            "Detecta pais por cabecera y codigo de pais del recuadro azul: A=AUSTRIA, I=ITALIA, E=ESPAÑA, H=HUNGRIA, D=ALEMANIA, F=FRANCIA, B=BELGICA, P=PORTUGAL, PL=POLONIA, CZ=REPUBLICA CHECA, SK=ESLOVAQUIA, RO=RUMANIA. "
            "No confundas categorias AM/A/B/C/C1/F con pais. Si el recuadro azul muestra A y dice Führerschein, pais AUSTRIA. "
            "Para permisos no europeos/latinoamericanos usa etiquetas: Apellido/Last name, Nombre/First name, Fecha de Nac./Date of birth, Otorgamiento/Date of issue, Vencimiento/Expires, N Licencia/License N, Domicilio/Address. "
            "Para licencia argentina: Apellido=QUEIROT y Nombre=FERNANDO DANIEL debe devolver renter='FERNANDO DANIEL QUEIROT', pais ARGENTINA. "
            "fields debe contener solo estas keys: renter, license_number, license_country, license_issue, license_expiry, birth_date, address."
        )
    if scan_type == "id":
        return base + (
            "Tipo: documento de identidad o pasaporte. En fields devuelve keys: "
            "renter, passport_id, nationality, birth_date, address. "
            "No confundas cabeceras de pais como nombre."
        )
    if scan_type == "car":
        return base + (
            "Tipo: llavero o ficha de coche. Normalmente tiene etiquetas Matricula, Marca, Modelo, Fuel. "
            "Mapea Matricula a vehicle_plate, Marca+Modelo a vehicle_model y Fuel a fuel_type. "
            "fuel_type debe ser gasolina o diesel si aplica. Devuelve JSON con keys: "
            "vehicle_plate, vehicle_model, vehicle_color, fuel_type."
        )
    if scan_type == "card":
        return base + (
            "Tipo: tarjeta bancaria. En fields devuelve keys: credit_card_number, credit_card_expiry. "
            "No devuelvas CVV aunque aparezca."
        )
    return base + "Devuelve JSON con los campos que reconozcas."


def direct_vision_prompt(scan_type):
    if scan_type in {"driver", "additional"}:
        return (
            "Lee el permiso de conducir de la imagen. Devuelve SOLO JSON plano sin markdown con keys: renter, license_number, license_country, license_issue, license_expiry, birth_date, address. "
            "Para permisos europeos usa estrictamente las etiquetas impresas: 1 apellidos, 2 nombre, 3 nacimiento, 4a expedicion, 4b caducidad, 5 numero. "
            "Ejemplo visual: 1 SALINGER, 2 PAUL, 3 13.07.1994, 4a 11.03.2021, 4b 10.03.2036, 5 21080013 => renter PAUL SALINGER, license_country AUSTRIA, birth_date 13/07/1994, license_issue 11/03/2021, license_expiry 10/03/2036, license_number 21080013. "
            "Detecta pais por codigo grande del recuadro azul: A Austria, I Italia, E Espana, H Hungria. No confundas AM/A/B/C/C1/F con pais. "
            "Para carnet argentino: N Licencia es license_number; Apellido + Nombre forman renter; Fecha de Nac. birth_date; Otorgamiento license_issue; Vencimiento license_expiry; Domicilio address; pais ARGENTINA. "
            "Si un campo no se ve, cadena vacia."
        )
    if scan_type == "id":
        return (
            "Lee el DNI o pasaporte de la imagen. Devuelve SOLO JSON plano con keys: "
            "renter, passport_id, nationality, birth_date, address. Fechas dd/mm/aaaa. "
            "Si un campo no se ve, cadena vacia."
        )
    if scan_type == "car":
        return (
            "Lee el llavero o ficha de coche. Devuelve SOLO JSON plano con keys: "
            "vehicle_plate, vehicle_model, vehicle_color, fuel_type. "
            "fuel_type solo gasolina o diesel si aparece claro."
        )
    if scan_type == "card":
        return (
            "Lee la tarjeta bancaria. Devuelve SOLO JSON plano con keys: credit_card_number, credit_card_expiry. "
            "No devuelvas CVV."
        )
    return "Lee la imagen y devuelve SOLO JSON plano con los campos visibles."


def extract_json_object(text):
    text = clean_text(text)
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


def normalize_vision_payload(payload, scan_type):
    if not isinstance(payload, dict):
        return {}
    fields = payload.get("fields") if isinstance(payload.get("fields"), dict) else payload
    compact = compact_fields(fields)
    raw_lines = payload.get("raw_text_lines") or payload.get("raw_lines") or payload.get("lines") or []
    if isinstance(raw_lines, str):
        raw_text = raw_lines
    elif isinstance(raw_lines, list):
        raw_text = "\n".join(clean_text(line) for line in raw_lines if clean_text(line))
    else:
        raw_text = ""
    parsed_from_lines = parse_ocr(raw_text, scan_type) if raw_text else {}
    eu_parsed = {}
    eu_fields = payload.get("eu_fields") or payload.get("eu") or {}
    if scan_type in {"driver", "additional"} and isinstance(eu_fields, dict):
        one = clean_person_name(eu_fields.get("1") or eu_fields.get(1) or "")
        two = clean_person_name(eu_fields.get("2") or eu_fields.get(2) or "")
        three = normalize_date(eu_fields.get("3") or eu_fields.get(3) or "")
        four_a = normalize_date(eu_fields.get("4a") or eu_fields.get("4A") or "")
        four_b_raw = clean_text(eu_fields.get("4b") or eu_fields.get("4B") or "")
        four_b = normalize_date(four_b_raw)
        five = clean_license_number(eu_fields.get("5") or eu_fields.get(5) or "")
        if one or two:
            eu_parsed["renter"] = clean_text(f"{two} {one}" if two and one else two or one).title()
        if three:
            eu_parsed["birth_date"] = three
        if four_a:
            eu_parsed["license_issue"] = four_a
        if four_b:
            eu_parsed["license_expiry"] = four_b
        elif four_b_raw and not re.search(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}", four_b_raw):
            alt = clean_license_number(four_b_raw)
            if alt:
                eu_parsed["license_number"] = alt
        if five:
            eu_parsed["license_number"] = five
    # Priority: raw line parser, then explicit EU fields, then direct fields from model.
    merged = {**compact, **parsed_from_lines, **eu_parsed}
    return validate_extracted_fields(compact_fields(merged), scan_type)


def openai_vision_json(image_urls, prompt):
    content = [{"type": "input_text", "text": prompt}]
    content.extend({"type": "input_image", "image_url": image_url, "detail": "high"} for image_url in image_urls)
    request_body = {
        "model": OPENAI_MODEL,
        "input": [
            {
                "role": "user",
                "content": content,
            }
        ],
        "temperature": 0,
        "max_output_tokens": 1800,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {os.environ.get('OPENAI_API_KEY')}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=70) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI devolvio error {exc.code}: {detail[:300]}") from exc
    data = json.loads(raw)
    text = data.get("output_text", "")
    if not text:
        chunks = []
        for item in data.get("output", []):
            for content in item.get("content", []):
                if content.get("type") in {"output_text", "text"}:
                    chunks.append(content.get("text", ""))
        text = "\n".join(chunks)
    return extract_json_object(text)


def run_vision_ocr(images, scan_type=""):
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Falta OPENAI_API_KEY en el servidor.")
    if isinstance(images, str):
        image_urls = [images]
    else:
        image_urls = [image for image in images if isinstance(image, str) and image.startswith("data:image")]
    if not image_urls:
        raise RuntimeError("No se recibio ninguna imagen valida.")
    image_urls = image_urls[:3]

    minimum = 2 if scan_type in {"driver", "additional", "id", "car"} else 1
    debug = {"mode": "ocr_v2_transcribe_then_parse"}

    # Paso 1: pedir una transcripcion literal del documento. Esto suele ser mas fiable
    # que pedir al modelo que interprete campos directamente.
    transcribed_text = ""
    try:
        trans_payload = openai_vision_json(image_urls, transcription_prompt(scan_type))
        raw_lines = trans_payload.get("raw_text_lines") or trans_payload.get("lines") or trans_payload.get("raw_lines") or []
        if isinstance(raw_lines, list):
            transcribed_text = "\n".join(clean_text(line) for line in raw_lines if clean_text(line))
        elif isinstance(raw_lines, str):
            transcribed_text = raw_lines
        debug["raw_text"] = transcribed_text[:1200]
    except Exception as exc:
        debug["transcription_error"] = str(exc)[:300]

    parsed_fields = parse_ocr(transcribed_text, scan_type) if transcribed_text else {}
    parsed_fields = validate_extracted_fields(compact_fields(parsed_fields), scan_type)
    if len(parsed_fields) >= minimum:
        parsed_fields["_debug_mode"] = "transcription_parser"
        return parsed_fields

    # Paso 2: pedir extraccion estructurada completa, usando imagen + reglas.
    first_payload = openai_vision_json(image_urls, vision_prompt(scan_type))
    first_fields = normalize_vision_payload(first_payload, scan_type)
    merged = {**first_fields, **parsed_fields}
    if len(merged) >= minimum:
        merged["_debug_mode"] = "vision_fields_plus_parser"
        return merged

    # Paso 3: ultimo intento, prompt directo y estricto.
    second_payload = openai_vision_json(image_urls, direct_vision_prompt(scan_type))
    second_fields = normalize_vision_payload(second_payload, scan_type)
    final = {**first_fields, **second_fields, **parsed_fields}
    if final:
        final["_debug_mode"] = "direct_fallback"
    return final


def normalize_key(text):
    replacements = str.maketrans("ÁÉÍÓÚÜÑáéíóúüñ", "AEIOUUNaeiouun")
    return str(text).translate(replacements).upper()


def date_from_yymmdd(value):
    if not re.fullmatch(r"\d{6}", value or ""):
        return ""
    yy = int(value[:2])
    year = 1900 + yy if yy > 35 else 2000 + yy
    return f"{value[4:6]}/{value[2:4]}/{year}"


def extract_dates(text):
    dates = re.findall(r"\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b", text)
    normalized = []
    for raw in dates:
        parts = re.split(r"[./-]", raw)
        day, month, year = parts
        day_number = int(day)
        month_number = int(month)
        if not (1 <= day_number <= 31 and 1 <= month_number <= 12):
            continue
        if len(year) == 2:
            year = ("19" if int(year) > 35 else "20") + year
        normalized.append(f"{day_number:02d}/{month_number:02d}/{year}")
    for day, month, year in re.findall(r"\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b", text):
        day_number = int(day)
        month_number = int(month)
        if 1 <= day_number <= 31 and 1 <= month_number <= 12:
            normalized.append(f"{day_number:02d}/{month_number:02d}/{year}")
    month_names = {
        "ENE": 1,
        "JAN": 1,
        "FEB": 2,
        "MAR": 3,
        "ABR": 4,
        "APR": 4,
        "MAY": 5,
        "JUN": 6,
        "JUL": 7,
        "AGO": 8,
        "AUG": 8,
        "SEP": 9,
        "OCT": 10,
        "NOV": 11,
        "DIC": 12,
        "DEC": 12,
    }
    for day, month, year in re.findall(r"\b(\d{1,2})\s+([A-ZÁÉÍÓÚ]{3,})\s+(\d{4})\b", normalize_key(text)):
        month_number = month_names.get(month[:3])
        day_number = int(day)
        if month_number and 1 <= day_number <= 31:
            normalized.append(f"{day_number:02d}/{month_number:02d}/{year}")
    return normalized




def normalize_date(value):
    value = clean_text(value)
    if not value:
        return ""
    m = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", value)
    if not m:
        return ""
    day, month, year = m.groups()
    day_number = int(day)
    month_number = int(month)
    if not (1 <= day_number <= 31 and 1 <= month_number <= 12):
        return ""
    if len(year) == 2:
        year = ("19" if int(year) > 35 else "20") + year
    return f"{day_number:02d}/{month_number:02d}/{year}"

def find_document_number(text):
    compact = re.sub(r"[^A-Z0-9]", "", normalize_key(text))
    spanish_document = "IDESP" in compact or "DOCUMENTONACIONAL" in compact or "DNI" in compact
    dni_letters = "TRWAGMYFPDXBNJZSQVHLCKE"

    def dni_is_valid(candidate):
        if not re.fullmatch(r"\d{8}[A-Z]", candidate):
            return False
        return dni_letters[int(candidate[:8]) % 23] == candidate[-1]

    def nie_is_valid(candidate):
        if not re.fullmatch(r"[XYZ]\d{7}[A-Z]", candidate):
            return False
        prefix = {"X": "0", "Y": "1", "Z": "2"}[candidate[0]]
        number = prefix + candidate[1:8]
        return dni_letters[int(number) % 23] == candidate[-1]

    nie_candidates = [match.group(0) for match in re.finditer(r"[XYZ]\d{7}[A-Z]", compact)]
    for candidate in nie_candidates:
        if nie_is_valid(candidate):
            return candidate
    for match in re.finditer(r"\d{8}[A-Z]", compact):
        candidate = match.group(0)
        day = int(candidate[:2])
        month = int(candidate[2:4])
        year = int(candidate[4:8])
        if 1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2099:
            continue
        if dni_is_valid(candidate):
            return candidate
    if nie_candidates:
        return nie_candidates[0]
    if spanish_document:
        return ""
    for match in re.finditer(r"\d{8}[A-Z]", compact):
        candidate = match.group(0)
        day = int(candidate[:2])
        month = int(candidate[2:4])
        year = int(candidate[4:8])
        if 1 <= day <= 31 and 1 <= month <= 12 and 1900 <= year <= 2099:
            continue
        return candidate
    return ""


def clean_license_number(value):
    candidate = clean_text(value).upper().replace(" ", "").replace("-", "")
    match = re.search(r"\d{6,8}[A-Z]", candidate)
    if match:
        return match.group(0)
    numeric = re.search(r"\b\d{5,12}\b", candidate)
    if numeric:
        return numeric.group(0)
    alpha_numeric = re.search(r"\b[A-Z0-9]{5,16}\b", candidate)
    return alpha_numeric.group(0) if alpha_numeric and re.search(r"\d", alpha_numeric.group(0)) else ""


def find_numbered_value(lines, number):
    label = f"{number}."
    for index, line in enumerate(lines):
        normalized = normalize_key(line)
        if normalized.startswith(label) or normalized == str(number):
            value = line[len(label) :].strip(" :.-")
            if value:
                return clean_text(value)
            if index + 1 < len(lines):
                return clean_text(lines[index + 1])
    pattern = re.compile(rf"\b{re.escape(str(number))}\s*[.)]\s*(.+)", re.IGNORECASE)
    for line in lines:
        match = pattern.search(line)
        if match:
            return clean_text(match.group(1))
    return ""


def clean_person_name(value):
    value = normalize_key(value)
    value = value.replace("0", "O").replace("1", "I")
    value = re.sub(r"[^A-Z ]", " ", value)
    value = re.sub(r"\b(?:ESPANA|SPAIN|PERMISO|CONDUCIR|DRIVING|LICENCE|DNI|NOMBRE|APELLIDOS)\b", " ", value)
    return clean_text(value).title()


def find_credit_card_number(text):
    candidates = []
    for raw in (text or "").splitlines():
        digits = re.sub(r"[^\d]", "", raw)
        if 13 <= len(digits) <= 19:
            candidates.append(digits)
    for raw in re.findall(r"\b(?:\d[ -]?){13,19}\b", text or ""):
        digits = re.sub(r"[^\d]", "", raw)
        if 13 <= len(digits) <= 19:
            candidates.append(digits)
    for candidate in candidates:
        if len(set(candidate)) <= 1:
            continue
        return " ".join(candidate[i : i + 4] for i in range(0, len(candidate), 4))
    return ""


def find_credit_card_expiry(text):
    for month, year in re.findall(r"\b(0[1-9]|1[0-2])\s*[/.-]\s*(\d{2}|\d{4})\b", text or ""):
        year = year[-2:]
        return f"{month}/{year}"
    return ""


def find_after_labels(lines, labels):
    normalized_labels = [normalize_key(label) for label in labels]
    for index, line in enumerate(lines):
        normalized = normalize_key(line)
        for label in normalized_labels:
            if label in normalized:
                after = line[normalized.find(label) + len(label) :].strip(" :.-")
                if after and len(after) >= 2:
                    return clean_text(after)
                if index + 1 < len(lines):
                    return clean_text(lines[index + 1])
    return ""


def find_after_labels_clean(lines, labels, ignored_words):
    ignored = {normalize_key(word) for word in ignored_words}
    value = find_after_labels(lines, labels)
    normalized = normalize_key(value)
    words = [word for word in re.split(r"[^A-Z0-9]+", normalized) if word]
    if value and words and not all(word in ignored for word in words):
        return value
    normalized_labels = [normalize_key(label) for label in labels]
    for index, line in enumerate(lines):
        normalized_line = normalize_key(line)
        if any(label in normalized_line for label in normalized_labels) and index + 1 < len(lines):
            return clean_text(lines[index + 1])
    return ""


def find_vehicle_plate(text):
    normalized = normalize_key(text)
    match = re.search(r"MATR[IÍ]CULA\s*[:\-]?\s*([0-9]{4}\s*[A-Z]{3})", normalized)
    if match:
        return match.group(1).strip()
    match = re.search(r"\b([0-9]{4}\s*[A-Z]{3})\b", normalized)
    if match:
        return match.group(1).strip()
    return ""


def parse_mrz(text):
    lines = [normalize_key(line).replace(" ", "") for line in text.splitlines()]
    mrz_lines = [line for line in lines if "<" in line and len(line) >= 25]
    result = {}
    if not mrz_lines:
        return result

    if len(mrz_lines) >= 2 and len(mrz_lines[-1]) >= 25:
        name_line = mrz_lines[-1]
        name_parts = [part for part in name_line.split("<<") if part]
        if name_parts:
            surnames = name_parts[0].replace("<", " ").strip()
            names = " ".join(name_parts[1:]).replace("<", " ").strip()
            full_name = clean_text(f"{names} {surnames}" if names else surnames).replace("0", "O").replace("1", "I")
            result["renter"] = full_name.title()

    first = mrz_lines[0]
    if first.startswith("P<") and len(mrz_lines) >= 2:
        passport = re.sub(r"[^A-Z0-9]", "", mrz_lines[1][:9])
        if passport:
            result["passport_id"] = passport
        if len(mrz_lines[1]) >= 28:
            result["nationality"] = mrz_lines[1][10:13]
            result["birth_date"] = date_from_yymmdd(mrz_lines[1][13:19])
    elif len(mrz_lines) >= 3:
        doc = re.sub(r"[^A-Z0-9]", "", first[5:14])
        if doc:
            result["passport_id"] = doc
        second = mrz_lines[1]
        if len(second) >= 15:
            result["birth_date"] = date_from_yymmdd(second[:6])
            result["nationality"] = second[7:10]
    document_number = find_document_number(text)
    if document_number:
        result["passport_id"] = document_number
    elif "IDESP" in normalize_key(text):
        result.pop("passport_id", None)
    return result



def normalize_license_country_from_text(text):
    n = normalize_key(text)
    # Prefer explicit country names / headers. Avoid using a loose single letter unless the document header is a driving licence.
    country_patterns = [
        ("AUSTRIA", ["OSTERREICH", "AUSTRIA", "FUHRERSCHEIN", "FUEHRERSCHEIN"]),
        ("ITALIA", ["REPUBBLICA ITALIANA", "PATENTE DI GUIDA", "ITALIA"]),
        ("ESPANA", ["REINO DE ESPANA", "PERMISO DE CONDUCCION", "ESPANA"]),
        ("HUNGRIA", ["MAGYARORSZAG", "VEZETOI ENGEDELY", "HUNGARY"]),
        ("BELGICA", ["BELGIE", "BELGIQUE", "BELGIEN", "BELGIUM"]),
        ("FRANCIA", ["REPUBLIQUE FRANCAISE", "FRANCE", "PERMIS DE CONDUIRE"]),
        ("ALEMANIA", ["DEUTSCHLAND", "BUNDESREPUBLIK", "GERMANY"]),
        ("POLONIA", ["POLSKA", "PRAWO JAZDY"]),
        ("PORTUGAL", ["PORTUGAL", "CARTA DE CONDUCAO"]),
        ("ARGENTINA", ["ARGENTINA", "BUENOS AIRES", "LICENCIA NACIONAL DE CONDUCIR"]),
    ]
    for country, words in country_patterns:
        if any(w in n for w in words):
            if country == "AUSTRIA" and not any(w in n for w in ["OSTERREICH", "AUSTRIA", "FUHRERSCHEIN", "FUEHRERSCHEIN"]):
                continue
            return country
    return ""


def clean_eu_field_value(value):
    value = clean_text(value)
    value = re.sub(r"^[\s:;.,-]+", "", value)
    value = re.sub(r"\b(?:1|2|3|4a|4b|4c|5|6|7|8|9)\s*[.)]?\b.*$", "", value, flags=re.IGNORECASE)
    return clean_text(value)


def extract_eu_label_value(text, label):
    # Read EU driving-licence fields by official labels: 1,2,3,4a,4b,5.
    raw = clean_text(text.replace("\n", " "))
    raw = re.sub(r"(?i)4\s*\(\s*a\s*\)", "4a", raw)
    raw = re.sub(r"(?i)4\s*\(\s*b\s*\)", "4b", raw)
    raw = re.sub(r"(?i)4\s*\(\s*c\s*\)", "4c", raw)
    raw = re.sub(r"(?i)\b([1235679])\s*[:;]", r"\1.", raw)
    raw = re.sub(r"(?i)\b4\s*a\s*[:;.]?", "4a.", raw)
    raw = re.sub(r"(?i)\b4\s*b\s*[:;.]?", "4b.", raw)
    raw = re.sub(r"(?i)\b4\s*c\s*[:;.]?", "4c.", raw)
    label_patterns = {
        "1": r"\b1\s*[.)]",
        "2": r"\b2\s*[.)]",
        "3": r"\b3\s*[.)]",
        "4a": r"\b4a\s*[.)]?",
        "4b": r"\b4b\s*[.)]?",
        "4c": r"\b4c\s*[.)]?",
        "5": r"\b5\s*[.)]",
    }
    next_pat = r"(?=\s*(?:\b1\s*[.)]|\b2\s*[.)]|\b3\s*[.)]|\b4a\s*[.)]?|\b4b\s*[.)]?|\b4c\s*[.)]?|\b5\s*[.)]|\b7\s*[.)]|\b9\s*[.)]|$))"
    pat = label_patterns[label] + r"\s*(.*?)" + next_pat
    m = re.search(pat, raw, flags=re.IGNORECASE)
    if not m:
        return ""
    return clean_text(m.group(1))


def parse_eu_driving_license(text):
    """Deterministic parser for most EU driving licences.
    Official fields: 1=surname, 2=name, 3=birth, 4a=issue, 4b=expiry, 5=licence number.
    """
    normalized = normalize_key(text)
    if not any(w in normalized for w in [
        "FUHRERSCHEIN", "FUEHRERSCHEIN", "PERMISO DE CONDUCCION", "PATENTE DI GUIDA",
        "VEZETOI ENGEDELY", "PRAWO JAZDY", "PERMIS DE CONDUIRE", "DRIVING LICENCE",
        "LICENCIA NACIONAL DE CONDUCIR"
    ]):
        return {}
    result = {}
    country = normalize_license_country_from_text(text)
    if country:
        result["license_country"] = country
    surname_raw = extract_eu_label_value(text, "1")
    name_raw = extract_eu_label_value(text, "2")
    surname = clean_person_name(surname_raw)
    name = clean_person_name(name_raw)
    if name and surname:
        result["renter"] = clean_text(f"{name} {surname}").title()
    elif surname or name:
        result["renter"] = clean_text(name or surname).title()

    field3 = extract_eu_label_value(text, "3")
    date3 = extract_dates(field3)
    if date3:
        result["birth_date"] = date3[0]

    field4a = extract_eu_label_value(text, "4a")
    date4a = extract_dates(field4a)
    if date4a:
        result["license_issue"] = date4a[0]

    field4b = extract_eu_label_value(text, "4b")
    date4b = extract_dates(field4b)
    if date4b:
        result["license_expiry"] = date4b[0]
    elif field4b:
        maybe_doc = clean_license_number(field4b)
        if maybe_doc:
            result["license_number"] = maybe_doc

    field5 = extract_eu_label_value(text, "5")
    lic = clean_license_number(field5)
    if lic:
        result["license_number"] = lic
    return {k: v for k, v in result.items() if clean_text(v)}


def parse_argentina_license(text):
    lines = [clean_text(line) for line in text.splitlines() if clean_text(line)]
    normalized = normalize_key(text)
    if not any(w in normalized for w in ["ARGENTINA", "BUENOS AIRES", "LICENCIA NACIONAL DE CONDUCIR"]):
        return {}
    result = {"license_country": "ARGENTINA"}
    # Direct labelled extraction; labels may appear on same line or previous small text.
    combined = " ".join(lines)
    def grab(label_regex, stop_regex):
        m = re.search(label_regex + r"\s*[:/\-]*\s*(.*?)\s*(?=" + stop_regex + r"|$)", combined, re.IGNORECASE)
        return clean_text(m.group(1)) if m else ""
    stop = r"(?:\b(?:1|2|3|4a|4b|5|7|9)\s*[.)]|Apellido|Last name|Nombre|First name|Domicilio|Address|Fecha de Nac|Date of birth|Otorgamiento|Date of issue|Vencimiento|Expires|Firma|Signature|Clases|Class)"
    license_number = grab(r"(?:5\s*[.)]?\s*)?(?:N[°ºo]?\s*)?Licencia\s*/?\s*License\s*N[°ºo]?", stop) or find_after_labels_clean(lines, ["n licencia", "license n"], ["n", "licencia", "license"])
    if not license_number:
        m = re.search(r"\b(?:N[°ºo]?\s*)?Licencia\s*/?\s*License\s*N[°ºo]?\s*(\d{5,12})", combined, re.IGNORECASE)
        if m:
            license_number = m.group(1)
    if license_number:
        result["license_number"] = clean_license_number(license_number)
    surname = grab(r"(?:1\s*[.)]?\s*)?Apellido\s*/?\s*Last\s*name", stop)
    name = grab(r"(?:2\s*[.)]?\s*)?Nombre\s*/?\s*First\s*name", stop)
    # Fallback and cleanup for Argentine cards where label and value are close together.
    m_s = re.search(r"Apellido\s*/?\s*Last\s*name\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s'-]{2,}?)(?=\s+(?:2\s*[.)]|Nombre|First|8\s*[.)]|Domicilio|Address|3\s*[.)]|Fecha))", combined, re.IGNORECASE)
    m_n = re.search(r"Nombre\s*/?\s*First\s*name\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s'-]{2,}?)(?=\s+(?:8\s*[.)]|Domicilio|Address|3\s*[.)]|Fecha|4a|Otorgamiento))", combined, re.IGNORECASE)
    if m_s:
        surname = m_s.group(1)
    if m_n:
        name = m_n.group(1)
    surname = re.sub(r"\b(?:8|3|4a|4b|5|7|9)\s*[.)]?.*$", "", surname, flags=re.IGNORECASE).strip()
    name = re.sub(r"\b(?:8|3|4a|4b|5|7|9)\s*[.)]?.*$", "", name, flags=re.IGNORECASE).strip()
    if surname or name:
        result["renter"] = clean_text(f"{name} {surname}").title()
    address = grab(r"(?:8\s*[.)]?\s*)?Domicilio\s*/?\s*Address", stop)
    if address:
        result["address"] = address.title()
    birth = extract_dates(grab(r"(?:3\s*[.)]?\s*)?Fecha\s+de\s+Nac\.?\s*/?\s*Date\s+of\s+birth", stop))
    issue = extract_dates(grab(r"(?:4a\s*[.)]?\s*)?Otorgamiento\s*/?\s*Date\s+of\s+issue", stop))
    expiry = extract_dates(grab(r"(?:4b\s*[.)]?\s*)?Vencimiento\s*/?\s*Expires", stop))
    if birth: result["birth_date"] = birth[0]
    if issue: result["license_issue"] = issue[0]
    if expiry: result["license_expiry"] = expiry[0]
    return {k: v for k, v in result.items() if clean_text(v)}

def parse_ocr(text, scan_type):
    lines = [clean_text(line) for line in text.splitlines() if clean_text(line)]
    normalized = normalize_key(text)
    result = parse_mrz(text)
    dates = extract_dates(text)
    document_number = find_document_number(text)

    if scan_type == "driver":
        deterministic = {}
        deterministic.update(parse_eu_driving_license(text))
        deterministic.update(parse_argentina_license(text))
        result.update(deterministic)
        license_number = clean_license_number(
            result.get("license_number")
            or find_after_labels_clean(lines, ["n licencia", "nº licencia", "no licencia", "num licencia", "numero licencia", "license n", "license no", "license number"], ["license", "licencia", "n", "no", "number"])
            or find_numbered_value(lines, 5)
            or find_after_labels(lines, ["5."])
        )
        if license_number:
            result.setdefault("license_number", license_number)
        country = normalize_license_country_from_text(text)
        if country:
            result.setdefault("license_country", country)
        if len(dates) >= 1:
            result.setdefault("birth_date", dates[0])
        if len(dates) >= 2:
            result.setdefault("license_issue", dates[1])
        if len(dates) >= 3:
            result.setdefault("license_expiry", dates[2])
        if "PERMANENTE" in normalized:
            result["license_expiry"] = "Permanente"
        surname = clean_person_name(find_after_labels_clean(lines, ["apellido", "last name"], ["apellido", "last", "name"]) or find_numbered_value(lines, 1))
        name = clean_person_name(find_after_labels_clean(lines, ["nombre", "first name"], ["nombre", "first", "name"]) or find_numbered_value(lines, 2))
        renter = clean_text(f"{name} {surname}" if name and surname else name or surname)
        if not renter:
            renter = clean_person_name(find_after_labels(lines, ["apellidos y nombre", "nombre", "name"]))
        if renter and len(re.sub(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]", "", renter)) >= 6:
            result.setdefault("renter", renter.title())
        address = find_after_labels_clean(lines, ["domicilio", "address"], ["domicilio", "address"])
        if address:
            result.setdefault("address", address.title())

    if scan_type == "id":
        if document_number:
            result["passport_id"] = document_number
        result.setdefault("passport_id", find_after_labels(lines, ["dni", "pasaporte", "passport", "documento", "document no"]))
        result.setdefault("nationality", find_after_labels(lines, ["nacionalidad", "nationality"]))
        if "ESP" in normalize_key(result.get("nationality", "")) or "ESP" in normalized:
            result["nationality"] = "ESP"
        result.setdefault("address", find_after_labels(lines, ["domicilio", "address"]))
        if not result.get("address"):
            for index, line in enumerate(lines):
                key = normalize_key(line)
                if any(word in key for word in ["CALLE", "C.", "AVDA", "AVENIDA", "PASEO"]):
                    extra = lines[index + 1] if index + 1 < len(lines) else ""
                    result["address"] = clean_text(f"{line} {extra}")
                    break
        name = clean_person_name(find_after_labels(lines, ["nombre", "name"]))
        surname = clean_person_name(find_after_labels(lines, ["apellidos", "surname", "surnames"]))
        result.setdefault("renter", clean_text(f"{name} {surname}" if name and surname else name or surname))
        if dates:
            result.setdefault("birth_date", dates[0])

    if scan_type == "car":
        result["vehicle_plate"] = find_vehicle_plate(text)
        brand = find_after_labels(lines, ["marca", "brand", "make"])
        model = find_after_labels(lines, ["modelo", "model", "denominacion comercial"])
        if brand and model and brand.lower() not in model.lower():
            result["vehicle_model"] = clean_text(f"{brand} {model}")
        else:
            result["vehicle_model"] = model or brand
        if "DIESEL" in normalized or "GASOLEO" in normalized:
            result["fuel_type"] = "diesel"
        elif "GASOLINA" in normalized or "GASC" in normalized or "BASC" in normalized or "PETROL" in normalized or "UNLEADED" in normalized or "95" in normalized:
            result["fuel_type"] = "gasolina"
        elif "ELECTRIC" in normalized or "ELECTRICO" in normalized:
            result["fuel_type"] = "electrico"
        elif "HIBRID" in normalized or "HYBRID" in normalized:
            result["fuel_type"] = "hibrido"
        if not result.get("vehicle_model"):
            brand_guess = "CITROEN" if any(word in normalized for word in ["CITROEN", "CIROEN", "CIPROEN", "CIQROEN"]) else ""
            model_guess = "C3" if re.search(r"\bC\s*[3S]\b", normalized) else ""
            result["vehicle_model"] = clean_text(f"{brand_guess} {model_guess}")

    if scan_type == "card":
        result["credit_card_number"] = find_credit_card_number(text)
        result["credit_card_expiry"] = find_credit_card_expiry(text)

    return {key: clean_text(value) for key, value in result.items() if clean_text(value)}


def crop_document(image):
    image = ImageOps.exif_transpose(image).convert("RGB")
    small = image.resize((max(1, image.width // 4), max(1, image.height // 4))).convert("HSV")
    pixels = small.load()
    xs = []
    ys = []
    for y in range(small.height):
        for x in range(small.width):
            _hue, saturation, value = pixels[x, y]
            if saturation > 35 and 45 < value < 245:
                xs.append(x)
                ys.append(y)
    if len(xs) < 500:
        return image

    scale_x = image.width / small.width
    scale_y = image.height / small.height
    left = max(0, int((min(xs) - 20) * scale_x))
    top = max(0, int((min(ys) - 20) * scale_y))
    right = min(image.width, int((max(xs) + 20) * scale_x))
    bottom = min(image.height, int((max(ys) + 20) * scale_y))
    if (right - left) * (bottom - top) < image.width * image.height * 0.06:
        return image
    return image.crop((left, top, right, bottom))


def resize_for_ocr(image):
    width, height = image.size
    max_side = max(width, height)
    if max_side > OCR_MAX_SIDE:
        ratio = OCR_MAX_SIDE / max_side
        image = image.resize((int(width * ratio), int(height * ratio)), Image.Resampling.LANCZOS)
    elif width < OCR_MIN_WIDTH:
        ratio = OCR_MIN_WIDTH / width
        image = image.resize((int(width * ratio), int(height * ratio)), Image.Resampling.LANCZOS)
    return image


def preprocess_for_ocr(image, scan_type):
    image = ImageOps.exif_transpose(image).convert("RGB")
    if scan_type in {"driver", "id", "card"}:
        image = crop_document(image)
    image = resize_for_ocr(image)
    gray = ImageOps.grayscale(image)
    gray = ImageOps.autocontrast(gray)
    gray = gray.filter(ImageFilter.SHARPEN)
    threshold = 150 if scan_type == "card" else 170
    binary = gray.point(lambda value: 255 if value > threshold else 0)
    return [gray, binary]


def psm_modes_for(scan_type):
    if scan_type == "card":
        return ("6", "7")
    if scan_type == "car":
        return ("6", "11")
    return ("6", "11")


def run_ocr(data_url, scan_type=""):
    _, encoded = data_url.split(",", 1) if "," in data_url else ("", data_url)
    image_bytes = base64.b64decode(encoded)
    with tempfile.TemporaryDirectory() as tmp_dir:
        image = Image.open(BytesIO(image_bytes))
        outputs = []
        errors = []
        for index, processed in enumerate(preprocess_for_ocr(image, scan_type)):
            processed_path = Path(tmp_dir) / f"processed_{index}.png"
            processed.save(processed_path, optimize=True)
            for psm in psm_modes_for(scan_type):
                try:
                    completed = subprocess.run(
                        [
                            "tesseract",
                            str(processed_path),
                            "stdout",
                            "-l",
                            "eng",
                            "--oem",
                            "1",
                            "--psm",
                            psm,
                            "-c",
                            "preserve_interword_spaces=1",
                        ],
                        check=False,
                        capture_output=True,
                        text=True,
                        timeout=OCR_TIMEOUT_SECONDS,
                    )
                except subprocess.TimeoutExpired:
                    errors.append("El OCR tardo demasiado con esta foto.")
                    continue
                if completed.returncode == 0 and clean_text(completed.stdout):
                    outputs.append(completed.stdout)
                elif completed.stderr:
                    errors.append(completed.stderr.strip())
    if not outputs:
        raise RuntimeError(errors[0] if errors else "No se pudo leer la imagen. Prueba otra foto mas cerca y con buena luz.")
    return "\n".join(outputs)


def local_ip_addresses():
    addresses = {"127.0.0.1"}
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass
    return sorted(addresses)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if self.path == "/api/ocr":
                scan_type = payload.get("scan_type", "")
                text = run_ocr(payload["image"], scan_type)
                fields = parse_ocr(text, scan_type)
                self.send_json({"text": text, "fields": fields})
                return
            if self.path == "/api/vision-ocr":
                scan_type = payload.get("scan_type", "")
                fields = run_vision_ocr(payload.get("images") or payload.get("image"), scan_type)
                self.send_json({"fields": fields, "field_count": len(fields), "model": OPENAI_MODEL})
                return
            self.send_error(404)
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=500)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def translate_path(self, path):
        path = unquote(path.split("?", 1)[0].split("#", 1)[0])
        return str(STATIC_DIR / path.lstrip("/"))


def main():
    host = "0.0.0.0"
    server = None
    port_from_env = os.environ.get("PORT")
    candidate_ports = [int(port_from_env)] if port_from_env else range(8765, 8786)
    for port in candidate_ports:
        try:
            server = ThreadingHTTPServer((host, port), Handler)
            break
        except OSError:
            continue
    if server is None:
        raise RuntimeError("No he encontrado un puerto libre.")

    print("Larios Rental OCR listo.")
    print("Abre una de estas direcciones desde el movil/tablet conectado a la misma WiFi:")
    for address in local_ip_addresses():
        print(f"  http://{address}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
