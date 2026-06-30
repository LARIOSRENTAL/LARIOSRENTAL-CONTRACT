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
OPENAI_MODEL = os.environ.get("OPENAI_VISION_MODEL", "gpt-4.1-mini")


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


def vision_prompt(scan_type):
    base = (
        "Eres un extractor de datos para contratos de alquiler de coches de Larios Rental. "
        "Puedes recibir una foto original y un recorte/enderezado del mismo documento. "
        "Compara ambas imagenes y usa la que se lea mejor. Ignora mesa, dedos, fondo, pantalla y texto de la app. "
        "Lee la imagen con cuidado y devuelve SOLO JSON valido, sin markdown. "
        "Si un dato no se ve claro, devuelve cadena vacia. No inventes nada. "
        "Fechas siempre en formato dd/mm/aaaa. "
    )
    if scan_type in {"driver", "additional"}:
        return base + (
            "Tipo: permiso de conducir. En permisos europeos usa los campos: "
            "1 apellidos, 2 nombre, 3 fecha nacimiento, 4a fecha expedicion, "
            "4b fecha caducidad, 5 numero de carnet. Si 4b no es fecha y parece documento, usalo como numero. "
            "En permisos latinoamericanos o no europeos tambien reconoce etiquetas como Apellido/Last name, "
            "Nombre/First name, Fecha de Nac./Date of birth, Otorgamiento/Date of issue, "
            "Vencimiento/Expires, N Licencia/License N y Domicilio/Address. "
            "El arrendatario debe ser Nombre + Apellidos, por ejemplo Nombre/First name seguido de Apellido/Last name. "
            "No uses como nombre textos de cabecera como Licencia Nacional de Conducir, Republica, Ciudad, Seguridad Vial, "
            "Ministerio, Clase o pais. En una licencia argentina, Apellido=QUEIROT y Nombre=FERNANDO DANIEL debe devolver "
            "renter='FERNANDO DANIEL QUEIROT'. "
            "Identifica pais del permiso por cabecera o codigo. Devuelve JSON con keys: "
            "renter, license_number, license_country, license_issue, license_expiry, birth_date, address."
        )
    if scan_type == "id":
        return base + (
            "Tipo: documento de identidad o pasaporte. Devuelve JSON con keys: "
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
            "Tipo: tarjeta bancaria. Devuelve JSON con keys: credit_card_number, credit_card_expiry. "
            "No devuelvas CVV aunque aparezca."
        )
    return base + "Devuelve JSON con los campos que reconozcas."


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
    content = [{"type": "input_text", "text": vision_prompt(scan_type)}]
    content.extend({"type": "input_image", "image_url": image_url} for image_url in image_urls)
    request_body = {
        "model": OPENAI_MODEL,
        "input": [
            {
                "role": "user",
                "content": content,
            }
        ],
        "temperature": 0,
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
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
    return compact_fields(extract_json_object(text))


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
    return normalized


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
    return match.group(0) if match else ""


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


def parse_ocr(text, scan_type):
    lines = [clean_text(line) for line in text.splitlines() if clean_text(line)]
    normalized = normalize_key(text)
    result = parse_mrz(text)
    dates = extract_dates(text)
    document_number = find_document_number(text)

    if scan_type == "driver":
        license_number = clean_license_number(find_numbered_value(lines, 5) or find_after_labels(lines, ["5."]))
        if license_number:
            result["license_number"] = license_number
        result.setdefault("license_country", find_after_labels(lines, ["expedido por", "issued by", "4c", "espana", "spain"]))
        if "ESPANA" in normalized or "SPAIN" in normalized:
            result["license_country"] = "ESPANA"
        if len(dates) >= 1:
            result.setdefault("license_issue", dates[0])
        if len(dates) >= 2:
            result.setdefault("license_expiry", dates[1])
        if "PERMANENTE" in normalized:
            result["license_expiry"] = "Permanente"
        surname = clean_person_name(find_numbered_value(lines, 1))
        name = clean_person_name(find_numbered_value(lines, 2))
        renter = clean_text(f"{name} {surname}" if name and surname else name or surname)
        if not renter:
            renter = clean_person_name(find_after_labels(lines, ["apellidos y nombre", "nombre", "name"]))
        if renter and len(re.sub(r"[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]", "", renter)) >= 6:
            result.setdefault("renter", renter)

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
                self.send_json({"fields": fields})
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
