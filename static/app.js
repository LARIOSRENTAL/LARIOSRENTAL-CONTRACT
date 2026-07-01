const { PDFDocument, StandardFonts, rgb } = PDFLib;

const form = document.querySelector("#contractForm");
const statusEl = document.querySelector("#status");
const photos = document.querySelector("#photos");
const photoGrid = document.querySelector("#photoGrid");
const generateBtn = document.querySelector("#generateBtn");
const sampleBtn = document.querySelector("#sampleBtn");
const installBtn = document.querySelector("#installBtn");
const damageCanvas = document.querySelector("#damageCanvas");
const signatureCanvas = document.querySelector("#signatureCanvas");
const clearDamageBtn = document.querySelector("#clearDamageBtn");
const clearSignatureBtn = document.querySelector("#clearSignatureBtn");
const scanReview = document.querySelector("#scanReview");
const scanReviewTitle = document.querySelector("#scanReviewTitle");
const scanReviewHint = document.querySelector("#scanReviewHint");
const scanReviewImage = document.querySelector("#scanReviewImage");
const scanCropStatus = document.querySelector("#scanCropStatus");
const scanReviewFields = document.querySelector("#scanReviewFields");
const autoScanReviewBtn = document.querySelector("#autoScanReviewBtn");
const applyScanReviewBtn = document.querySelector("#applyScanReviewBtn");
const clearScanReviewBtn = document.querySelector("#clearScanReviewBtn");
const closeScanReviewBtn = document.querySelector("#closeScanReviewBtn");

let deferredInstallPrompt = null;
let damageHasInk = false;
let signatureHasInk = false;
let lastAutoReturnDate = "";
let lastAutoReturnTime = "";
let lastAutoReturnPlace = "";
let scanReviewState = { scanType: "", fields: [], files: [], processed: [] };
const attachedPhotos = [];

const firstContractNumber = 62600;
const contractCounterKey = "larios_contract_next_number_62600";

const carTariffs = {
  "Grupo A": { days: [78, 137, 170, 216, 249, 268, 293], extra: 42 },
  "Grupo B": { days: [87, 157, 197, 239, 275, 305, 334], extra: 49 },
  "Grupo C": { days: [99, 175, 217, 259, 301, 338, 365], extra: 53 },
  "Grupo D": { days: [115, 199, 271, 334, 396, 450, 484], extra: 71 },
  "Grupo F": { days: [137, 223, 301, 365, 426, 489, 530], extra: 76 },
  "Grupo G": { days: [187, 312, 406, 490, 562, 624, 676], extra: 96 },
  "Grupo I": { days: [199, 375, 487, 586, 674, 749, 811], extra: 115 },
  "Grupo J": { days: [146, 230, 312, 386, 438, 489, 541], extra: 78 },
  "Grupo K": { days: [175, 276, 374, 463, 526, 587, 649], extra: 94 },
  "Grupo H": { days: [209, 396, 554, 683, 803, 916, 999], extra: 137 },
  "Grupo L": { days: [210, 398, 570, 685, 809, 920, 1020], extra: 142 },
  "Grupo Q": { days: [269, 479, 708, 860, 1010, 1155, 1285], extra: 182 },
};

const dayRateTariffs = {
  "BICICLETA": [
    { max: 3, price: 15 },
    { max: 7, price: 12 },
    { max: Infinity, price: 10 },
  ],
  "E-BIKE": [
    { max: 3, price: 40 },
    { max: 7, price: 30 },
    { max: Infinity, price: 25 },
  ],
  "50cc": [
    { max: 3, price: 36 },
    { max: 7, price: 31 },
    { max: Infinity, price: 27 },
  ],
  "125cc": [
    { max: 3, price: 41 },
    { max: 7, price: 35 },
    { max: Infinity, price: 31 },
  ],
};

const franchiseByCategory = {
  "BICICLETA": 50,
  "E-BIKE": 150,
  "50cc": 400,
  "125cc": 400,
  "Grupo A": 600,
  "Grupo B": 600,
  "Grupo C": 600,
  "Grupo D": 800,
  "Grupo F": 800,
  "Grupo G": 800,
  "Grupo I": 800,
  "Grupo J": 800,
  "Grupo K": 800,
  "Grupo H": 1000,
  "Grupo L": 1000,
  "Grupo Q": 1500,
};

const insuranceTariffsByFranchise = {
  600: { firstDay: 15, extraDay: 5 },
  800: { firstDay: 20, extraDay: 10 },
  1000: { firstDay: 25, extraDay: 15 },
  1500: { firstDay: 35, extraDay: 20 },
};

const fieldSpecs = {
  renter: { x: 72, y: 680, width: 285, size: 8.3, align: "center" },
  license_number: { x: 92, y: 660, width: 95, size: 7.9, align: "center" },
  license_issue: { x: 252, y: 660, width: 60, size: 7.9, align: "center" },
  license_country: { x: 92, y: 638, width: 95, size: 7.9, align: "center" },
  license_expiry: { x: 252, y: 638, width: 60, size: 7.9, align: "center" },
  nationality: { x: 92, y: 616, width: 95, size: 7.9, align: "center" },
  birth_date: { x: 252, y: 616, width: 60, size: 7.9, align: "center" },
  passport_id: { x: 92, y: 596, width: 95, size: 7.9, align: "center" },
  address_1: { x: 74, y: 562, width: 220, size: 7.4, align: "left" },
  address_2: { x: 38, y: 542, width: 255, size: 7.4, align: "left" },
  phone: { x: 94, y: 544, width: 92, size: 7.4, align: "left" },
  email: { x: 74, y: 522, width: 160, size: 7.4, align: "center" },

  additional_name: { x: 86, y: 486, width: 110, size: 7.4, align: "left" },
  additional_birth_date: { x: 252, y: 486, width: 60, size: 7.4, align: "center" },
  additional_license_number: { x: 86, y: 464, width: 95, size: 7.4, align: "left" },
  additional_license_issue: { x: 252, y: 464, width: 60, size: 7.4, align: "center" },
  additional_license_country: { x: 86, y: 442, width: 95, size: 7.4, align: "left" },
  additional_license_expiry: { x: 252, y: 442, width: 60, size: 7.4, align: "center" },

  vehicle_model: { x: 355, y: 703, width: 90, size: 7.9, align: "center" },
  vehicle_plate: { x: 355, y: 683, width: 72, size: 7.9, align: "center" },
  vehicle_color: { x: 481, y: 678, width: 44, size: 7.9, align: "left" },

  delivery_date: { x: 347, y: 634, width: 70, size: 7.7, align: "center" },
  delivery_time: { x: 472, y: 634, width: 44, size: 7.7, align: "center" },
  delivery_place: { x: 347, y: 612, width: 100, size: 7.4, align: "left" },
  delivery_gas: { x: 492, y: 612, width: 34, size: 7.4, align: "center" },
  agency: { x: 365, y: 590, width: 105, size: 7.2, align: "left" },
  delivery_km: { x: 510, y: 590, width: 34, size: 7.2, align: "center" },
  return_date: { x: 347, y: 548, width: 70, size: 7.7, align: "center" },
  return_time: { x: 472, y: 548, width: 44, size: 7.7, align: "center" },
  return_place: { x: 347, y: 531, width: 100, size: 7.4, align: "center" },
  return_gas: { x: 492, y: 526, width: 34, size: 7.4, align: "center" },
  extras: { x: 360, y: 500, width: 105, size: 7.2, align: "left" },
  return_km: { x: 510, y: 500, width: 34, size: 7.2, align: "center" },

  rent_days_units: { x: 405, y: 461, width: 22, size: 6.2, align: "center" },
  rent_days_total: { x: 504, y: 461, width: 44, size: 6.2, align: "center" },
  insurance_units: { x: 405, y: 436, width: 22, size: 6.2, align: "center" },
  insurance_total: { x: 504, y: 436, width: 44, size: 6.2, align: "center" },
  young_driver_units: { x: 405, y: 414, width: 22, size: 6.2, align: "center" },
  young_driver_total: { x: 504, y: 414, width: 44, size: 6.2, align: "center" },
  extra_1_concept: { x: 323, y: 392, width: 72, size: 6.0, align: "left" },
  extra_1_units: { x: 405, y: 392, width: 22, size: 6.2, align: "center" },
  extra_1_total: { x: 504, y: 392, width: 44, size: 6.2, align: "center" },
  extra_2_concept: { x: 323, y: 370, width: 72, size: 6.0, align: "left" },
  extra_2_units: { x: 405, y: 370, width: 22, size: 6.2, align: "center" },
  extra_2_total: { x: 504, y: 370, width: 44, size: 6.2, align: "center" },
  discount_units: { x: 405, y: 348, width: 22, size: 6.2, align: "center" },
  discount_total: { x: 504, y: 348, width: 44, size: 6.2, align: "center" },
  vat_units: { x: 405, y: 326, width: 22, size: 6.2, align: "center" },
  vat_total: { x: 504, y: 326, width: 44, size: 6.2, align: "center" },
  subtotal: { x: 504, y: 306, width: 44, size: 6.8, align: "center" },
  payment_method: { x: 350, y: 204, width: 70, size: 7.1, align: "left" },
  deposit: { x: 382, y: 190, width: 70, size: 8.0, align: "left" },
  damage_excess: { x: 498, y: 190, width: 50, size: 8.0, align: "center" },

  billing_notes_1: { x: 45, y: 221, width: 245, size: 7.2, align: "left" },
  billing_notes_2: { x: 45, y: 207, width: 245, size: 7.2, align: "left" },
  billing_notes_3: { x: 45, y: 193, width: 245, size: 7.2, align: "left" },
  delivered_by: { x: 340, y: 92, width: 70, size: 7.2, align: "center" },
  received_by: { x: 418, y: 92, width: 70, size: 7.2, align: "center" },
};

const checkboxMarks = {
  doc_documents: { x: 49, y: 299 },
  doc_triangle: { x: 49, y: 288 },
  doc_vest: { x: 49, y: 277 },
  doc_child_seat: { x: 49, y: 266 },
  no_commercial_info: { x: 323, y: 88 },
};

const fuelBoxes = {
  gasolina: { x: 323, y: 667 },
  diesel: { x: 482, y: 667 },
};

const scanReviewConfigs = {
  driver: {
    title: "Carnet principal",
    hint: "La app intentara leer el permiso. Revisa los campos antes de aplicar.",
    fields: [
      ["renter", "Arrendatario", "text"],
      ["license_number", "Nº permiso conducir", "text"],
      ["license_country", "País permiso", "text"],
      ["license_issue", "Fecha expedición", "text"],
      ["license_expiry", "Fecha caducidad", "text"],
      ["birth_date", "Fecha nacimiento", "text"],
      ["address", "Domicilio", "textarea"],
    ],
  },
  id: {
    title: "DNI / Pasaporte",
    hint: "La app intentara leer el documento. Revisa los campos antes de aplicar.",
    fields: [
      ["renter", "Nombre completo", "text"],
      ["passport_id", "DNI / Pasaporte", "text"],
      ["nationality", "Nacionalidad", "text"],
      ["birth_date", "Fecha nacimiento", "text"],
      ["address", "Domicilio", "textarea"],
    ],
  },
  additional: {
    title: "Carnet adicional",
    hint: "La app intentara leer el permiso. Estos campos se aplican al segundo conductor.",
    fields: [
      ["additional_name", "Nombre", "text"],
      ["additional_license_number", "Nº permiso conducir", "text"],
      ["additional_license_country", "País permiso", "text"],
      ["additional_license_issue", "Fecha expedición", "text"],
      ["additional_license_expiry", "Fecha caducidad", "text"],
      ["additional_birth_date", "Fecha nacimiento", "text"],
    ],
  },
  car: {
    title: "Vehículo",
    hint: "Copia matricula, modelo y combustible desde la ficha, llavero o foto del coche.",
    fields: [
      ["vehicle_model", "Modelo", "text"],
      ["vehicle_plate", "Matrícula", "text"],
      ["vehicle_color", "Color", "text"],
      ["fuel_type", "Combustible", "fuel"],
    ],
  },
  card: {
    title: "Tarjeta",
    hint: "Introduce solo numeracion y caducidad. No se aplica nada hasta pulsar el boton.",
    fields: [
      ["credit_card_number", "Número tarjeta", "text"],
      ["credit_card_expiry", "Caducidad", "text"],
    ],
  },
};

function readNextContractNumber() {
  const stored = Number.parseInt(localStorage.getItem(contractCounterKey) || "", 10);
  return Number.isFinite(stored) && stored >= firstContractNumber ? stored : firstContractNumber;
}

function saveNextContractNumber(number) {
  localStorage.setItem(contractCounterKey, String(number));
}

function formatContractNumber(number) {
  return new Intl.NumberFormat("es-ES", { useGrouping: true, maximumFractionDigits: 0 }).format(number);
}

function setStatus(message) {
  statusEl.textContent = message;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function ensureBrowserOcr() {
  if (window.Tesseract) return true;
  const sources = [
    "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
    "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js",
  ];
  for (const src of sources) {
    try {
      setStatus("Cargando lector OCR...");
      await loadExternalScript(src);
      if (window.Tesseract) return true;
    } catch (_error) {
      // Try the next source.
    }
  }
  return false;
}

function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = reject;
    image.src = url;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function postJson(url, payload, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || "No se pudo leer la imagen.");
    return data;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return Math.abs(area / 2);
}

function solveLinearSystem(matrix, values) {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    }
    if (Math.abs(rows[pivot][col]) < 1e-9) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const divider = rows[col][col];
    for (let item = col; item <= size; item += 1) rows[col][item] /= divider;
    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = rows[row][col];
      for (let item = col; item <= size; item += 1) rows[row][item] -= factor * rows[col][item];
    }
  }
  return rows.map((row) => row[size]);
}

function perspectiveCoefficients(points, width, height) {
  const targets = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  const matrix = [];
  const values = [];
  targets.forEach((target, index) => {
    const source = points[index];
    matrix.push([target.x, target.y, 1, 0, 0, 0, -target.x * source.x, -target.y * source.x]);
    values.push(source.x);
    matrix.push([0, 0, 0, target.x, target.y, 1, -target.x * source.y, -target.y * source.y]);
    values.push(source.y);
  });
  return solveLinearSystem(matrix, values);
}

function warpDocument(sourceCanvas, points) {
  const topWidth = pointDistance(points[0], points[1]);
  const bottomWidth = pointDistance(points[3], points[2]);
  const leftHeight = pointDistance(points[0], points[3]);
  const rightHeight = pointDistance(points[1], points[2]);
  const rawWidth = Math.max(topWidth, bottomWidth);
  const rawHeight = Math.max(leftHeight, rightHeight);
  const scale = Math.min(1, 1800 / Math.max(rawWidth, rawHeight));
  const width = Math.max(420, Math.round(rawWidth * scale));
  const height = Math.max(260, Math.round(rawHeight * scale));
  const coeffs = perspectiveCoefficients(points, width, height);
  if (!coeffs) return null;

  const sourceCtx = sourceCanvas.getContext("2d", { alpha: false });
  const source = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext("2d", { alpha: false });
  const imageData = outputCtx.createImageData(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const denom = coeffs[6] * x + coeffs[7] * y + 1;
      const sourceX = clamp(Math.round((coeffs[0] * x + coeffs[1] * y + coeffs[2]) / denom), 0, sourceCanvas.width - 1);
      const sourceY = clamp(Math.round((coeffs[3] * x + coeffs[4] * y + coeffs[5]) / denom), 0, sourceCanvas.height - 1);
      const sourceIndex = (sourceY * sourceCanvas.width + sourceX) * 4;
      const targetIndex = (y * width + x) * 4;
      imageData.data[targetIndex] = source.data[sourceIndex];
      imageData.data[targetIndex + 1] = source.data[sourceIndex + 1];
      imageData.data[targetIndex + 2] = source.data[sourceIndex + 2];
      imageData.data[targetIndex + 3] = 255;
    }
  }
  outputCtx.putImageData(imageData, 0, 0);
  return output;
}

function detectDocumentContour(sourceCanvas, scanType) {
  const sampleWidth = 360;
  const sampleScale = sampleWidth / sourceCanvas.width;
  const sampleHeight = Math.max(1, Math.round(sourceCanvas.height * sampleScale));
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleCtx = sampleCanvas.getContext("2d", { alpha: false });
  sampleCtx.drawImage(sourceCanvas, 0, 0, sampleWidth, sampleHeight);
  const image = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const cornerSize = Math.max(8, Math.round(Math.min(sampleWidth, sampleHeight) * 0.08));
  const cornerSamples = [
    [0, 0],
    [sampleWidth - cornerSize, 0],
    [0, sampleHeight - cornerSize],
    [sampleWidth - cornerSize, sampleHeight - cornerSize],
  ];
  const background = { r: 0, g: 0, b: 0, count: 0 };
  cornerSamples.forEach(([startX, startY]) => {
    for (let y = startY; y < startY + cornerSize; y += 4) {
      for (let x = startX; x < startX + cornerSize; x += 4) {
        const index = (y * sampleWidth + x) * 4;
        background.r += image[index];
        background.g += image[index + 1];
        background.b += image[index + 2];
        background.count += 1;
      }
    }
  });
  background.r /= background.count;
  background.g /= background.count;
  background.b /= background.count;

  const mask = new Uint8Array(sampleWidth * sampleHeight);
  const diffThreshold = scanType === "car" ? 22 : 30;
  let globalMinX = sampleWidth;
  let globalMinY = sampleHeight;
  let globalMaxX = 0;
  let globalMaxY = 0;
  let globalHits = 0;
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = (y * sampleWidth + x) * 4;
      const r = image[index];
      const g = image[index + 1];
      const b = image[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const gray = (r + g + b) / 3;
      const saturation = max - min;
      const backgroundDiff = (Math.abs(r - background.r) + Math.abs(g - background.g) + Math.abs(b - background.b)) / 3;
      const likelyObject = backgroundDiff > diffThreshold || saturation > 38 || gray < 115;
      if (likelyObject) {
        mask[y * sampleWidth + x] = 1;
        globalMinX = Math.min(globalMinX, x);
        globalMinY = Math.min(globalMinY, y);
        globalMaxX = Math.max(globalMaxX, x);
        globalMaxY = Math.max(globalMaxY, y);
        globalHits += 1;
      }
    }
  }

  function scaledBoxToPoints(minX, minY, maxX, maxY, padding) {
    const padX = Math.round((maxX - minX + 1) * padding);
    const padY = Math.round((maxY - minY + 1) * padding);
    const left = clamp(minX - padX, 0, sampleWidth - 1);
    const top = clamp(minY - padY, 0, sampleHeight - 1);
    const right = clamp(maxX + padX, 0, sampleWidth - 1);
    const bottom = clamp(maxY + padY, 0, sampleHeight - 1);
    const scaleBack = sourceCanvas.width / sampleWidth;
    return [
      { x: left * scaleBack, y: top * scaleBack },
      { x: right * scaleBack, y: top * scaleBack },
      { x: right * scaleBack, y: bottom * scaleBack },
      { x: left * scaleBack, y: bottom * scaleBack },
    ].map((point) => ({
      x: clamp(point.x, 0, sourceCanvas.width - 1),
      y: clamp(point.y, 0, sourceCanvas.height - 1),
    }));
  }

  const globalWidth = globalMaxX - globalMinX + 1;
  const globalHeight = globalMaxY - globalMinY + 1;
  const globalBoxArea = globalWidth * globalHeight;
  const imageArea = sampleWidth * sampleHeight;
  const globalAspect = globalWidth / Math.max(1, globalHeight);
  const documentAspectOk = scanType === "car" ? globalAspect < 5.5 : globalAspect > 1.15 && globalAspect < 2.4;
  if (
    globalHits > imageArea * 0.012 &&
    globalBoxArea > imageArea * 0.035 &&
    globalBoxArea < imageArea * 0.7 &&
    documentAspectOk
  ) {
    return scaledBoxToPoints(globalMinX, globalMinY, globalMaxX, globalMaxY, scanType === "car" ? 0.12 : 0.08);
  }

  const visited = new Uint8Array(mask.length);
  let best = null;
  const stack = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let area = 0;
    let minX = sampleWidth;
    let minY = sampleHeight;
    let maxX = 0;
    let maxY = 0;
    const points = [];
    visited[start] = 1;
    stack.push(start);
    while (stack.length) {
      const current = stack.pop();
      const x = current % sampleWidth;
      const y = Math.floor(current / sampleWidth);
      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      points.push({ x, y });
      const neighbors = [current - 1, current + 1, current - sampleWidth, current + sampleWidth];
      neighbors.forEach((next) => {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) return;
        const nextX = next % sampleWidth;
        if (Math.abs(nextX - x) > 1) return;
        visited[next] = 1;
        stack.push(next);
      });
    }
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const boxArea = boxWidth * boxHeight;
    const aspect = boxWidth / Math.max(1, boxHeight);
    if (area < imageArea * 0.018 || boxArea < imageArea * 0.06 || boxArea > imageArea * 0.92) continue;
    if (scanType !== "car" && (aspect < 1.15 || aspect > 2.4)) continue;
    if (scanType === "car" && aspect > 5.5) continue;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerPenalty = Math.hypot(centerX - sampleWidth / 2, centerY - sampleHeight / 2) / Math.hypot(sampleWidth / 2, sampleHeight / 2);
    const score = area * (1 - centerPenalty * 0.35);
    if (!best || score > best.score) best = { area, minX, minY, maxX, maxY, points, score };
  }

  if (!best) return null;
  const points = scaledBoxToPoints(best.minX, best.minY, best.maxX, best.maxY, scanType === "car" ? 0.12 : 0.08);
  if (polygonArea(points) < sourceCanvas.width * sourceCanvas.height * 0.05) return null;
  return points;
}

function detectContentCrop(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  const sample = 6;
  let left = width;
  let top = height;
  let right = 0;
  let bottom = 0;
  let hits = 0;

  for (let y = 0; y < height; y += sample) {
    for (let x = 0; x < width; x += sample) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const gray = (r + g + b) / 3;
      const saturation = max - min;
      const isInk = gray < 115;
      const isDocumentColor = saturation > 10 && gray > 45 && gray < 245;
      if (!isInk && !isDocumentColor) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      hits += 1;
    }
  }

  if (hits < 120 || right <= left || bottom <= top) return { x: 0, y: 0, width, height };
  const padX = Math.round(width * 0.04);
  const padY = Math.round(height * 0.04);
  const x = Math.max(0, left - padX);
  const y = Math.max(0, top - padY);
  const cropWidth = Math.min(width, right + padX) - x;
  const cropHeight = Math.min(height, bottom + padY) - y;
  if (cropWidth * cropHeight < width * height * 0.04) return { x: 0, y: 0, width, height };
  return { x, y, width: cropWidth, height: cropHeight };
}

function enhanceForOcr(processedCanvas) {
  const softCanvas = document.createElement("canvas");
  softCanvas.width = processedCanvas.width;
  softCanvas.height = processedCanvas.height;
  const softCtx = softCanvas.getContext("2d", { alpha: false });
  softCtx.drawImage(processedCanvas, 0, 0);
  const softImage = softCtx.getImageData(0, 0, softCanvas.width, softCanvas.height);
  const softData = softImage.data;
  for (let index = 0; index < softData.length; index += 4) {
    const gray = softData[index] * 0.299 + softData[index + 1] * 0.587 + softData[index + 2] * 0.114;
    const value = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 136));
    softData[index] = value;
    softData[index + 1] = value;
    softData[index + 2] = value;
    softData[index + 3] = 255;
  }
  softCtx.putImageData(softImage, 0, 0);

  const hardCanvas = document.createElement("canvas");
  hardCanvas.width = processedCanvas.width;
  hardCanvas.height = processedCanvas.height;
  const hardCtx = hardCanvas.getContext("2d", { alpha: false });
  hardCtx.drawImage(processedCanvas, 0, 0);
  const imageData = hardCtx.getImageData(0, 0, hardCanvas.width, hardCanvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const boosted = gray < 150 ? Math.max(0, gray - 34) : Math.min(255, gray + 28);
    const value = boosted < 148 ? 0 : 255;
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  hardCtx.putImageData(imageData, 0, 0);
  return {
    soft: softCanvas.toDataURL("image/png"),
    hard: hardCanvas.toDataURL("image/png"),
  };
}

async function prepareOcrImages(file, scanType = "") {
  const { image, url } = await imageFromFile(file);
  try {
    const targetWidth = 2200;
    const ratio = targetWidth / image.naturalWidth;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const contour = detectDocumentContour(canvas, scanType);
    let processedCanvas = contour ? warpDocument(canvas, contour) : null;
    if (!processedCanvas) {
      const crop = detectContentCrop(ctx, canvas.width, canvas.height);
      processedCanvas = document.createElement("canvas");
      const cropRatio = targetWidth / crop.width;
      processedCanvas.width = targetWidth;
      processedCanvas.height = Math.max(1, Math.round(crop.height * cropRatio));
      const processedCtx = processedCanvas.getContext("2d", { alpha: false });
      processedCtx.fillStyle = "#fff";
      processedCtx.fillRect(0, 0, processedCanvas.width, processedCanvas.height);
      processedCtx.imageSmoothingEnabled = true;
      processedCtx.imageSmoothingQuality = "high";
      processedCtx.drawImage(canvas, crop.x, crop.y, crop.width, crop.height, 0, 0, processedCanvas.width, processedCanvas.height);
    }

    const enhanced = enhanceForOcr(processedCanvas);
    return {
      vision: processedCanvas.toDataURL("image/jpeg", 0.92),
      preview: processedCanvas.toDataURL("image/jpeg", 0.84),
      soft: enhanced.soft,
      hard: enhanced.hard,
      cropFound: Boolean(contour),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function normalizeOcrText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[|]/g, "I")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cleanOcrValue(value) {
  return normalizeOcrText(value).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function formatOcrDate(day, month, year) {
  const d = Number(day);
  const m = /^\d+$/.test(String(month || "")) ? Number(month) : ocrMonthNumber(month);
  let y = String(year || "");
  if (y.length === 2) y = Number(y) > 35 ? `19${y}` : `20${y}`;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y.length !== 4) return "";
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

function ocrDates(text) {
  const normalized = normalizeOcrText(text);
  const dates = [];
  const add = (date) => {
    if (date && !dates.includes(date)) dates.push(date);
  };
  for (const match of normalized.matchAll(/\b(19\d{2}|20\d{2})[.\-/\s](\d{1,2})[.\-/\s](\d{1,2})\b/g)) {
    add(formatOcrDate(match[3], match[2], match[1]));
  }
  for (const match of normalized.matchAll(/\b(\d{1,2})[.\-/\s](\d{1,2})[.\-/\s](19\d{2}|20\d{2}|\d{2})\b/g)) {
    add(formatOcrDate(match[1], match[2], match[3]));
  }
  return dates;
}

function ocrMonthNumber(value) {
  const key = normalizeOcrText(value).slice(0, 3);
  return {
    ENE: 1, JAN: 1,
    FEB: 2, FEV: 2,
    MAR: 3,
    ABR: 4, APR: 4,
    MAY: 5, MAI: 5,
    JUN: 6,
    JUL: 7,
    AGO: 8, AUG: 8,
    SEP: 9,
    OCT: 10, OKT: 10,
    NOV: 11,
    DEC: 12, DIC: 12,
  }[key] || 0;
}

function textDateNearLabel(text, labelPattern) {
  const normalized = normalizeOcrText(text);
  const labelIndex = normalized.search(labelPattern);
  if (labelIndex < 0) return "";
  const slice = normalized.slice(labelIndex, labelIndex + 120);
  const textMonth = slice.match(/\b(\d{1,2})\s+([A-Z]{3,})\s+(19\d{2}|20\d{2})\b/);
  if (textMonth) return formatOcrDate(textMonth[1], ocrMonthNumber(textMonth[2]), textMonth[3]);
  const numeric = slice.match(/\b(\d{1,2})[.\-/\s](\d{1,2})[.\-/\s](19\d{2}|20\d{2})\b/);
  return numeric ? formatOcrDate(numeric[1], numeric[2], numeric[3]) : "";
}

function ocrLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(cleanOcrValue)
    .filter(Boolean);
}

function titleName(value) {
  return cleanOcrValue(value)
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function likelyName(value) {
  const blocked = /BELGIE|BELGIQUE|BELGIEN|BELGIUM|MAGYAR|HUNGARY|ESPANA|REINO|DOCUMENT|IDENTITY|CARD|PERMISO|CONDU|VEZETO|ENGEDELY|NATIONALITY|SIGNATURE|DATE|BIRTH|EXPIRY|FERFI|BELUGY|MINISZTERIUM|EUROPAI|UNIOS|MATRICULA|MARCA|MODELO|FUEL|GASOLINA|DIESEL/;
  const cleanName = cleanOcrValue(value);
  const words = cleanName.split(" ").filter(Boolean);
  if (blocked.test(cleanName) || words.length < 2 || words.length > 4) return false;
  if (cleanName.length < 8) return false;
  return words.every((word) => /^[A-Z]{3,}$/.test(word));
}

function findName(lines) {
  for (const line of lines) {
    if (likelyName(line)) return titleName(line);
    const words = cleanOcrValue(line).split(" ").filter((word) => /^[A-Z]{3,}$/.test(word));
    for (let index = 0; index < words.length - 1; index += 1) {
      const pair = `${words[index]} ${words[index + 1]}`;
      if (likelyName(pair)) return titleName(pair);
    }
  }
  return "";
}

function findLabelValue(text, labelPattern, stopPattern = /(?:\d[.)]?|FECHA|DATE|DOMICILIO|ADDRESS|FIRMA|SIGNATURE|CLASES|CLASS|VENCIMIENTO|EXPIRES|OTORGAMIENTO)/) {
  const normalized = normalizeOcrText(text);
  const match = normalized.match(new RegExp(`${labelPattern}\\s*[:\\-/]*\\s*([A-Z0-9 ]{2,42}?)(?=\\s+${stopPattern.source}\\b|$)`));
  return match ? cleanOcrValue(match[1]) : "";
}

function findDocumentNumber(text) {
  const normalizedWithSymbols = normalizeOcrText(text);
  const card = normalizedWithSymbols.match(/\b(?:CARD\s*NO|KAARTNR)[^A-Z0-9]*(\d{3}[- ]?\d{7}[- ]?\d{2})\b/);
  if (card) return card[1].replace(/\s+/g, "-");
  const normalized = normalizedWithSymbols.replace(/\s+/g, "");
  const matches = normalized.match(/\b[A-Z]{1,3}\d{5,9}[A-Z]{0,3}\b|\b\d{6,9}[A-Z]{1,3}\b|\b\d{8}[A-Z]\b/g) || [];
  const blocked = /2019|2020|2021|2022|2023|2024|2025|2026|2027|2028|1971|1994/;
  return matches.find((value) => !blocked.test(value)) || "";
}

function numberedValue(text, number) {
  const normalized = normalizeOcrText(text);
  const escaped = String(number).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalized.match(new RegExp(`\\b${escaped}[.)]?\\s*([A-Z0-9, .\\-/]{2,42})`));
  return match ? cleanOcrValue(match[1].replace(/\b(?:1|2|3|4A|4B|4C|5|7|8|9)[.)]?.*$/, "")) : "";
}

function findLicenseNumber(text) {
  const normalized = normalizeOcrText(text);
  const explicit = normalized.match(/\b(?:N\s*LICENCIA|LICENCIA|LICENSE\s*N)[^A-Z0-9]*(\d{5,12})\b/);
  if (explicit) return explicit[1];
  const label = normalized.match(/\b5[.)]?\s*([A-Z0-9 ]{5,16})/);
  if (label) {
    const value = cleanOcrValue(label[1]).replace(/\s+/g, "");
    if (/^[A-Z0-9-]{5,14}$/.test(value) && /\d/.test(value)) return value;
  }
  return findDocumentNumber(text);
}

function findExplicitLicenseNumber(text) {
  const normalized = normalizeOcrText(text);
  const explicit = normalized.match(/\b(?:N\s*LICENCIA|LICENCIA|LICENSE\s*N)[^A-Z0-9]*(\d{5,12})\b/);
  if (explicit) return explicit[1];
  const label = normalized.match(/\b5[.)]?\s*([A-Z0-9 -]{5,18})/);
  if (!label) return "";
  const value = cleanOcrValue(label[1]).replace(/\s+/g, "");
  return /^[A-Z0-9-]{5,14}$/.test(value) && /\d/.test(value) ? value : "";
}

function findCountryFromLicense(text) {
  const normalized = normalizeOcrText(text);
  const countries = [
    [/ARGENTINA|BUENOS AIRES|LICENCIA NACIONAL DE CONDUCIR/, "ARGENTINA"],
    [/OSTERREICH|ÖSTERREICH|AUSTRIA|FUHRERSCHEIN.*\bA\b/, "AUSTRIA"],
    [/REINO DE ESPANA|REINO DE ESPAÑA|ESPANA|ESPAÑA/, "ESPANA"],
    [/DEUTSCHLAND|GERMANY|FUHRERSCHEIN.*\bD\b/, "ALEMANIA"],
    [/FRANCE|\bF\b/, "FRANCIA"],
    [/ITALIA|ITALY|\bI\b/, "ITALIA"],
    [/PORTUGAL|\bP\b/, "PORTUGAL"],
    [/BELGIQUE|BELGIE|BELGIEN|BELGIUM|\bB\b/, "BELGICA"],
    [/NEDERLAND|NETHERLANDS|\bNL\b/, "HOLANDA"],
    [/MAGYAR|HUNGARY|\bH\b|\bHUN\b/, "HUNGRIA"],
  ];
  return countries.find(([pattern]) => pattern.test(normalized))?.[1] || "";
}

function findAddress(text) {
  const address = valueAfterLabel(text, ["DOMICILIO", "ADDRESS", "DIRECCION", "DIRECCIÓN", "ADRESSE", "ADRES"], ["NACIONALIDAD", "NATIONALITY", "FECHA", "DATE", "VALID", "EXPIRY", "FIRMA", "SIGNATURE"]);
  return address && address.length > 8 ? titleName(address) : "";
}

function valueAfterLabel(text, labels, stops) {
  const normalized = normalizeOcrText(text);
  const labelGroup = labels.join("|");
  const stopGroup = stops.join("|");
  const match = normalized.match(new RegExp(`(?:${labelGroup})\\s*[:\\-]?\\s*([A-Z0-9ÁÉÍÓÚÜÑ .\\-/]+?)(?=\\s+(?:${stopGroup})\\b|$)`));
  return match ? cleanOcrValue(match[1]) : "";
}

function findVehiclePlate(text) {
  const labeled = valueAfterLabel(text, ["MATRICULA", "MATR[IÍ]CULA"], ["MARCA", "MODELO", "FUEL", "COMBUSTIBLE"]);
  const match = (labeled || normalizeOcrText(text)).match(/\b\d{4}\s?[A-Z]{3}\b/);
  return match ? match[0].replace(/\s+/, " ") : "";
}

function findVehicleModel(text) {
  const normalized = normalizeOcrText(text)
    .replace(/\bCITRO[EÉ]N\b/g, "CITROEN")
    .replace(/\bC\s*3\b/g, "C3")
    .replace(/\bC\s*4\b/g, "C4");
  const brand = valueAfterLabel(text, ["MARCA"], ["MODELO", "MATRICULA", "FUEL", "COMBUSTIBLE"]);
  const modelValue = valueAfterLabel(text, ["MODELO"], ["FUEL", "COMBUSTIBLE", "MATRICULA", "MARCA"]);
  if (brand || modelValue) {
    const labeled = cleanOcrValue(`${brand} ${modelValue}`);
    if (labeled.includes("VOLKSWAGEN") && labeled.includes("TAIGO")) return "VOLKSWAGEN TAIGO";
    if (labeled.includes("VOLKSWAGEN") && /\b(?:TAIGO|TA1GO|TAI6O|TAIG0|TNG)\b/.test(labeled)) return "VOLKSWAGEN TAIGO";
    if (labeled.includes("CITROEN") && labeled.includes("C3")) return "CITROEN C3";
    if (labeled.includes("CITROEN") && labeled.includes("C4")) return "CITROEN C4";
    if (brand && modelValue && /^[A-Z0-9 ]{3,28}$/.test(labeled)) return titleName(labeled).toUpperCase();
  }
  const known = [
    "CITROEN C3",
    "CITROEN C4",
    "VOLKSWAGEN TAIGO",
    "VOLKSWAGEN POLO",
    "VOLKSWAGEN T-ROC",
    "SEAT IBIZA",
    "SEAT ARONA",
    "PEUGEOT 208",
    "PEUGEOT 308",
    "FIAT 500",
    "RENAULT CLIO",
    "OPEL CORSA",
    "HYUNDAI I10",
    "HYUNDAI I20",
    "KIA PICANTO",
    "KIA RIO",
    "NISSAN MICRA",
    "TOYOTA YARIS",
    "DACIA SANDERO",
  ];
  const found = known.find((model) => normalized.includes(model));
  if (found) return found;
  const brandModel = normalized.match(/\b(?:CITROEN|VOLKSWAGEN|SEAT|PEUGEOT|FIAT|RENAULT|OPEL|HYUNDAI|KIA|NISSAN|TOYOTA|DACIA)\s+[A-Z0-9-]{1,12}\b/);
  return brandModel ? brandModel[0] : "";
}

function parseOcrFields(text, scanType) {
  const normalized = normalizeOcrText(text);
  const appUiHits = (normalized.match(/ARRENDATARIO|PERMISO CONDUCIR|PAIS PERMISO|FECHA EXPEDICION|APLICAR AL CONTRATO|GENERAR CONTRATO/g) || []).length;
  if (appUiHits >= 3) return {};
  const lines = ocrLines(text);
  const dates = ocrDates(text);
  const fields = {};
  const isHungary = /HUNGARY|MAGYAR|HUN\b|MAGYARORSZAG/.test(normalized);
  const isGermany = /DEUTSCHLAND|BUNDESREPUBLIK|FUHRERSCHEIN|GERMANY/.test(normalized);
  const isSpain = /ESPANA|ESPAÑA|REINO DE ESPANA|REINO DE ESPAÑA/.test(normalized);

  if (scanType === "car") {
    const model = findVehicleModel(text);
    const plate = findVehiclePlate(text);
    if (model) fields.vehicle_model = model;
    if (plate) fields.vehicle_plate = plate;
    if (/DIESEL|GASOLEO|GASOIL/.test(normalized)) fields.fuel_type = "diesel";
    if (/GASOLINA|PETROL|UNLEADED|95/.test(normalized)) fields.fuel_type = "gasolina";
    return fields;
  }

  if (scanType === "driver" || scanType === "additional") {
    const surname = numberedValue(text, "1");
    const given = numberedValue(text, "2");
    const labeledSurname = findLabelValue(text, "(?:APELLIDO|LAST\\s*NAME)");
    const labeledGiven = findLabelValue(text, "(?:NOMBRE|FIRST\\s*NAME)");
    const composedName = (labeledSurname && labeledGiven)
      ? titleName(`${labeledGiven} ${labeledSurname}`)
      : (surname && given ? titleName(`${given} ${surname}`) : findName(lines));
    if (composedName && likelyName(composedName)) fields.renter = composedName;
    let number = findExplicitLicenseNumber(text);
    const value4b = numberedValue(text, "4B");
    if (!number && value4b && !ocrDates(value4b).length && /\d/.test(value4b)) number = value4b.replace(/\s+/g, "");
    if (number && (!isSpain || /^\d{6,8}[A-Z]$/.test(number.replace(/[^A-Z0-9]/g, "")))) fields.license_number = number;
    fields.license_country = findCountryFromLicense(text) || fields.license_country;
    if (isSpain) fields.license_country = "ESPANA";
    if (isHungary) fields.license_country = "HUNGRIA";
    if (isGermany) fields.license_country = "ALEMANIA";
    const address = findAddress(text);
    if (address && scanType === "driver") fields.address = address;

    const birth = normalized.match(/\b(?:FECHA\s*DE\s*NAC|DATE\s*OF\s*BIRTH)[^0-9]*(\d{1,2})\s+([A-Z]{3,})\s+(\d{4})/)
      || normalized.match(/\b3[.)]?\s*(\d{4})[.\-/\s](\d{1,2})[.\-/\s](\d{1,2})/)
      || normalized.match(/\b3[.)]?\s*(\d{1,2})[.\-/\s](\d{1,2})[.\-/\s](\d{4})/);
    if (birth) fields.birth_date = birth[1].length === 4 ? formatOcrDate(birth[3], birth[2], birth[1]) : formatOcrDate(birth[1], birth[2], birth[3]);
    const issue = normalized.match(/\b(?:OTORGAMIENTO|DATE\s*OF\s*ISSUE)[^0-9]*(\d{1,2})\s+([A-Z]{3,})\s+(\d{4})/)
      || normalized.match(/\b4A[.)]?\s*(\d{4})[.\-/\s](\d{1,2})[.\-/\s](\d{1,2})/)
      || normalized.match(/\b4A[.)]?\s*(\d{1,2})[.\-/\s](\d{1,2})[.\-/\s](\d{4})/);
    if (issue) fields.license_issue = issue[1].length === 4 ? formatOcrDate(issue[3], issue[2], issue[1]) : formatOcrDate(issue[1], issue[2], issue[3]);
    const expiry = normalized.match(/\b(?:VENCIMIENTO|EXPIRES)[^0-9]*(\d{1,2})\s+([A-Z]{3,})\s+(\d{4})/)
      || normalized.match(/\b4B[.)]?\s*(\d{4})[.\-/\s](\d{1,2})[.\-/\s](\d{1,2})/)
      || normalized.match(/\b4B[.)]?\s*(\d{1,2})[.\-/\s](\d{1,2})[.\-/\s](\d{4})/);
    if (expiry) fields.license_expiry = expiry[1].length === 4 ? formatOcrDate(expiry[3], expiry[2], expiry[1]) : formatOcrDate(expiry[1], expiry[2], expiry[3]);
    if (!fields.birth_date && dates[0]) fields.birth_date = dates[0];
    if (!fields.license_issue && dates[1]) fields.license_issue = dates[1];
    if (!fields.license_expiry && dates[2]) fields.license_expiry = dates[2];
    return fields;
  }

  if (scanType === "id") {
    const surname = valueAfterLabel(text, ["NAAM\\s*/?\\s*NAME", "NAME"], ["VOORNAMEN", "GIVEN", "GEBOORTE", "PLACE", "NATIONALITEIT", "NATIONALITY", "KAARTNR", "CARD"]);
    const given = valueAfterLabel(text, ["VOORNAMEN\\s*/?\\s*GIVEN\\s*NAMES", "GIVEN\\s*NAMES"], ["GEBOORTE", "PLACE", "NATIONALITEIT", "NATIONALITY", "KAARTNR", "CARD", "GELDIG", "VALID"]);
    const labelName = cleanOcrValue(`${given} ${surname}`);
    const name = likelyName(labelName) ? titleName(labelName) : findName(lines);
    if (name) fields.renter = name;
    const documentNumber = findDocumentNumber(text);
    if (documentNumber) fields.passport_id = documentNumber;
    const nationality = valueAfterLabel(text, ["NATIONALITEIT", "NATIONALITY", "ALLAMPOLGARSAG"], ["KAARTNR", "CARD", "GELDIG", "VALID", "SZULETESI", "DATE"]);
    if (nationality) fields.nationality = nationality.split(" ")[0];
    if (isHungary) fields.nationality = "HUN";
    if (isSpain) fields.nationality = "ESP";
    fields.birth_date = textDateNearLabel(text, /GEBOORTE|BIRTH|NACIMIENTO|SZULETESI/) || "";
    if (!fields.birth_date && !/VALID|GELDIG|EXPIRY/.test(normalized) && dates[0]) fields.birth_date = dates[0];
    const address = findAddress(text);
    if (address) fields.address = address;
    return fields;
  }

  return fields;
}

function fillScanReviewFields(fields) {
  const safeFields = sanitizeDetectedFields(fields, scanReviewState.scanType);
  let count = 0;
  scanReviewFields.querySelectorAll("[data-field]").forEach((field) => {
    let value = safeFields[field.dataset.field];
    if (value && scanReviewState.scanType === "id" && ["renter", "address", "birth_date"].includes(field.dataset.field)) {
      const existingValue = clean(form.elements[field.dataset.field]?.value);
      if (existingValue) return;
    }
    if (!value && scanReviewState.scanType === "additional") {
      const additionalSource = {
        additional_name: "renter",
        additional_license_number: "license_number",
        additional_license_country: "license_country",
        additional_license_issue: "license_issue",
        additional_license_expiry: "license_expiry",
        additional_birth_date: "birth_date",
      };
      value = safeFields[additionalSource[field.dataset.field]];
    }
    if (!value) return;
    field.value = value;
    count += 1;
  });
  return count;
}

function sanitizeDetectedFields(fields, scanType) {
  const safe = { ...(fields || {}) };
  if (scanType === "driver" || scanType === "additional") {
    const badName = /LICENCIA|LICENSE|CONDUCIR|REPUBLICA|REP[UÚ]BLICA|CIUDAD|SEGURIDAD|MINISTERIO|TRANSPORTE|CLASE|CLASS|VIAL|AFGEN|ARGEN$|ITALIA$/i;
    if (safe.renter && badName.test(safe.renter)) delete safe.renter;
    if (safe.additional_name && badName.test(safe.additional_name)) delete safe.additional_name;
    ["license_number", "additional_license_number"].forEach((key) => {
      if (safe[key]) {
        const compact = clean(safe[key]).replace(/[^A-Z0-9]/gi, "");
        if (compact.length < 5 || compact.length > 16 || !/\d/.test(compact)) delete safe[key];
      }
    });
  }
  if (scanType === "car") {
    if (safe.vehicle_plate && !/\d/.test(safe.vehicle_plate)) delete safe.vehicle_plate;
  }
  return safe;
}

async function readOcrImage(image, label) {
  setStatus(`Leyendo documento${label ? ` (${label})` : ""}...`);
  const pageSegMode = scanReviewState.scanType === "car" ? "11" : "6";
  const language = scanReviewState.scanType === "car" ? "eng" : "spa+eng";
  const result = await Tesseract.recognize(image, language, {
    tessedit_pageseg_mode: pageSegMode,
    preserve_interword_spaces: "1",
    logger: (event) => {
      if (event.status === "recognizing text" && event.progress) {
        setStatus(`Leyendo documento${label ? ` (${label})` : ""}... ${Math.round(event.progress * 100)}%`);
      }
    },
  });
  return result.data.text || "";
}

async function recognizeScanReview() {
  if (!scanReviewState.files.length) return;
  autoScanReviewBtn.disabled = true;
  const previousLabel = autoScanReviewBtn.textContent;
  autoScanReviewBtn.textContent = "Leyendo...";
  try {
    setStatus("Leyendo la foto original con vision...");
    scanReviewImage.src = URL.createObjectURL(scanReviewState.files[0]);
    scanCropStatus.textContent = "Lectura nueva: se usa la foto original completa, sin recortes automaticos.";
    const images = await Promise.all(scanReviewState.files.map((file) => fileToDataUrl(file)));
    const result = await postJson("/api/vision-ocr", {
      images,
      scan_type: scanReviewState.scanType,
    }, 70000);
    const fields = result.fields || {};
    const count = fillScanReviewFields(fields);
    setStatus(count ? `Lectura terminada: ${count} campos fiables detectados. Revisa y pulsa Aplicar al contrato.` : "No he encontrado datos fiables. La foto queda abierta para copiarlos manualmente.");
  } catch (error) {
    setStatus(`No se pudo leer automaticamente: ${error.message}. Puedes copiar los datos desde la foto.`);
  } finally {
    autoScanReviewBtn.disabled = false;
    autoScanReviewBtn.textContent = previousLabel;
  }
}

function parseAmount(value) {
  const normalized = clean(value).replace("%", "").replace(",", ".");
  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function formatAmount(value) {
  if (!value) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatEuro(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")}€`;
}

function rentalDaysValue() {
  return Math.max(0, Math.ceil(parseAmount(form.elements.rent_days_units?.value)));
}

function categoryValue() {
  return clean(form.elements.vehicle_category?.value);
}

function seasonMultiplier() {
  return form.elements.season_94?.checked ? 1.2 : 1;
}

function vehicleQuantityValue(category = categoryValue()) {
  if (category !== "BICICLETA" && category !== "E-BIKE") return 1;
  const value = Number.parseInt(form.elements.vehicle_quantity?.value || "1", 10);
  return Number.isFinite(value) ? Math.min(20, Math.max(1, value)) : 1;
}

function updateVehicleQuantityState() {
  const field = form.elements.vehicle_quantity;
  if (!field) return;
  const enabled = categoryValue() === "BICICLETA" || categoryValue() === "E-BIKE";
  field.disabled = !enabled;
  if (!enabled) field.value = "1";
}

function calculateRentalTotal(category, days) {
  if (!category || !days) return 0;
  const multiplier = seasonMultiplier();
  const quantity = vehicleQuantityValue(category);
  const carTariff = carTariffs[category];
  if (carTariff) {
    const total = days <= 7 ? carTariff.days[days - 1] || 0 : carTariff.days[6] + (days - 7) * carTariff.extra;
    return Math.round(total * multiplier);
  }

  const dayRates = dayRateTariffs[category];
  if (dayRates) {
    const rate = dayRates.find((tier) => days <= tier.max)?.price || 0;
    return Math.round(days * rate * quantity * multiplier);
  }

  return 0;
}

function calculateInsuranceTotal(category, days) {
  if (clean(form.elements.insurance_units?.value).toUpperCase() !== "SI" || !days) return 0;
  const franchise = franchiseByCategory[category];
  const tariff = insuranceTariffsByFranchise[franchise];
  if (!tariff) return 0;
  return tariff.firstDay + Math.max(0, days - 1) * tariff.extraDay;
}

function updateCategoryCalculations() {
  updateVehicleQuantityState();
  const category = categoryValue();
  const days = rentalDaysValue();
  const rentalTotal = calculateRentalTotal(category, days);
  const insuranceTotal = calculateInsuranceTotal(category, days);
  const franchise = franchiseByCategory[category];
  const insuranceSelected = clean(form.elements.insurance_units?.value).toUpperCase() === "SI";

  if (form.elements.rent_days_total) form.elements.rent_days_total.value = formatAmount(rentalTotal);
  if (form.elements.insurance_total) form.elements.insurance_total.value = formatAmount(insuranceTotal);
  if (form.elements.damage_excess) {
    if (insuranceSelected) {
      form.elements.damage_excess.value = formatEuro(0);
    } else if (category) {
      form.elements.damage_excess.value = formatEuro(franchise || 0);
    } else {
      form.elements.damage_excess.value = "";
    }
  }
}

function updateSubtotal() {
  const data = Object.fromEntries(new FormData(form).entries());
  const subtotal =
    parseAmount(data.rent_days_total) +
    parseAmount(data.insurance_total) +
    parseAmount(data.young_driver_total) +
    parseAmount(data.extra_1_total) +
    parseAmount(data.extra_2_total) -
    parseAmount(data.discount_total);

  form.elements.subtotal.value = formatAmount(subtotal);
}

function parseSpanishDate(value) {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function formatSpanishDate(date) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function updateReturnDefaults() {
  const deliveryDate = parseSpanishDate(form.elements.delivery_date?.value);
  const days = rentalDaysValue();
  if (deliveryDate && days) {
    const returnDate = new Date(deliveryDate);
    returnDate.setDate(returnDate.getDate() + days);
    const formatted = formatSpanishDate(returnDate);
    const field = form.elements.return_date;
    if (field && (!clean(field.value) || clean(field.value) === lastAutoReturnDate)) {
      field.value = formatted;
      lastAutoReturnDate = formatted;
    }
  }

  const deliveryTime = clean(form.elements.delivery_time?.value);
  const returnTime = form.elements.return_time;
  if (returnTime && deliveryTime && (!clean(returnTime.value) || clean(returnTime.value) === lastAutoReturnTime)) {
    returnTime.value = deliveryTime;
    lastAutoReturnTime = deliveryTime;
  }

  const deliveryPlace = clean(form.elements.delivery_place?.value);
  const returnPlace = form.elements.return_place;
  if (returnPlace && deliveryPlace && (!clean(returnPlace.value) || clean(returnPlace.value) === lastAutoReturnPlace)) {
    returnPlace.value = deliveryPlace;
    lastAutoReturnPlace = deliveryPlace;
  }
}

function fillDateTime() {
  const now = new Date();
  form.elements.delivery_date.value = formatSpanishDate(now);
  form.elements.delivery_time.value = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  updateReturnDefaults();
}

function splitLines(text, maxLength, maxLines) {
  const words = clean(text).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function payload() {
  const data = Object.fromEntries(new FormData(form).entries());
  const address = splitLines(data.address, 58, 2);
  data.address_1 = address[0] || "";
  data.address_2 = address[1] || "";
  const notes = splitLines(data.billing_notes, 62, 3);
  data.billing_notes_1 = notes[0] || "";
  data.billing_notes_2 = notes[1] || "";
  data.billing_notes_3 = notes[2] || "";
  return data;
}

function drawValue(page, font, key, value) {
  const spec = fieldSpecs[key];
  value = clean(value).slice(0, 90);
  if (!spec || !value) return;

  let size = spec.size;
  let textWidth = font.widthOfTextAtSize(value, size);
  while (textWidth > spec.width && size > 5.4) {
    size -= 0.3;
    textWidth = font.widthOfTextAtSize(value, size);
  }
  textWidth = Math.min(textWidth, spec.width);
  const x = spec.align === "center" ? spec.x + (spec.width - textWidth) / 2 : spec.x;

  page.drawRectangle({
    x: x - 1.2,
    y: spec.y - 0.8,
    width: textWidth + 2.4,
    height: size + 1.8,
    color: rgb(1, 1, 1),
    borderWidth: 0,
  });
  page.drawText(value, { x, y: spec.y, size, font, color: rgb(0.04, 0.04, 0.04) });
}

function drawCheck(page, bold, x, y) {
  page.drawText("X", { x: x + 1.3, y: y - 0.5, size: 12, font: bold, color: rgb(0.02, 0.02, 0.02) });
}

function drawContractNumber(page, bold, contractNumber) {
  const value = formatContractNumber(contractNumber);
  const size = 12.4;
  const width = bold.widthOfTextAtSize(value, size);
  const box = { x: 486, y: 697, width: 58, height: 28 };
  page.drawRectangle({ ...box, color: rgb(1, 1, 1), borderWidth: 0 });
  page.drawText(value, {
    x: box.x + (box.width - width) / 2,
    y: 708,
    size,
    font: bold,
    color: rgb(0.04, 0.04, 0.04),
  });
}

function drawCreditCardDetails(page, font, bold, data) {
  const cardNumber = clean(data.credit_card_number);
  const cardExpiry = clean(data.credit_card_expiry);
  if (!cardNumber && !cardExpiry) return;

  page.drawRectangle({ x: 88, y: 701, width: 214, height: 11, color: rgb(1, 1, 1), borderWidth: 0 });
  if (cardNumber) {
    page.drawText(cardNumber.slice(0, 32), { x: 92, y: 704, size: 7.0, font, color: rgb(0.04, 0.04, 0.04) });
  }
  if (cardExpiry) {
    page.drawText(cardExpiry.slice(0, 7), { x: 252, y: 704, size: 7.0, font, color: rgb(0.04, 0.04, 0.04) });
  }
}

async function embedCanvasImage(pdfDoc, page, canvas, placement, hasInk) {
  if (!hasInk) return;
  const dataUrl = canvas.toDataURL("image/png");
  const imageBytes = await fetch(dataUrl).then((res) => res.arrayBuffer());
  const png = await pdfDoc.embedPng(imageBytes);
  page.drawImage(png, placement);
}

async function embedPhoto(pdfDoc, file) {
  const { image, url } = await imageFromFile(file);
  try {
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
    const bytes = await fetch(dataUrl).then((res) => res.arrayBuffer());
    return pdfDoc.embedJpg(bytes);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function addAttachmentPages(pdfDoc, font, bold) {
  const photosForPdf = attachedPhotos.filter((photo) => photo.scanType !== "card");
  if (!photosForPdf.length) return;

  const pageWidth = 595.275;
  const pageHeight = 841.89;
  const margin = 34;
  const gap = 16;
  const titleHeight = 26;
  const cellWidth = (pageWidth - margin * 2 - gap) / 2;
  const cellHeight = (pageHeight - margin * 2 - titleHeight - gap) / 2;

  for (let index = 0; index < photosForPdf.length; index += 4) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawText("Fotos adjuntas", { x: margin, y: pageHeight - margin - 10, size: 13, font: bold, color: rgb(0.04, 0.04, 0.04) });
    const batch = photosForPdf.slice(index, index + 4);
    for (let item = 0; item < batch.length; item += 1) {
      const photo = batch[item];
      const col = item % 2;
      const row = Math.floor(item / 2);
      const x = margin + col * (cellWidth + gap);
      const y = pageHeight - margin - titleHeight - (row + 1) * cellHeight - row * gap;
      const embedded = await embedPhoto(pdfDoc, photo.file);
      const scaled = embedded.scaleToFit(cellWidth, cellHeight - 20);
      page.drawRectangle({ x, y, width: cellWidth, height: cellHeight, borderColor: rgb(0.72, 0.72, 0.72), borderWidth: 0.6 });
      page.drawText(photo.title, { x: x + 8, y: y + cellHeight - 14, size: 8, font, color: rgb(0.12, 0.12, 0.12) });
      page.drawImage(embedded, {
        x: x + (cellWidth - scaled.width) / 2,
        y: y + 8,
        width: scaled.width,
        height: scaled.height,
      });
    }
  }
}

async function generatePdf() {
  setStatus("Generando contrato en este dispositivo...");
  generateBtn.disabled = true;

  try {
    updateSubtotal();
    const templateBytes = await fetch("assets/contrato-larios-normalizado.pdf").then((res) => res.arrayBuffer());
    const pdfDoc = await PDFDocument.load(templateBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const page = pdfDoc.getPage(0);
    const data = payload();
    const contractNumber = readNextContractNumber();

    drawContractNumber(page, bold, contractNumber);
    Object.entries(fieldSpecs).forEach(([key]) => drawValue(page, font, key, data[key]));
    drawCreditCardDetails(page, font, bold, data);

    const fuel = clean(data.fuel_type).toLowerCase();
    const fuelBox = fuel.includes("diesel") ? fuelBoxes.diesel : fuel.includes("gasolina") ? fuelBoxes.gasolina : null;
    if (fuelBox) drawCheck(page, bold, fuelBox.x, fuelBox.y);

    Object.entries(checkboxMarks).forEach(([name, pos]) => {
      const field = form.elements[name];
      if (field?.checked) drawCheck(page, bold, pos.x, pos.y);
    });

    await embedCanvasImage(pdfDoc, page, damageCanvas, { x: 55, y: 279, width: 247, height: 128 }, damageHasInk);
    await embedCanvasImage(pdfDoc, page, signatureCanvas, { x: 462, y: 41, width: 84, height: 51 }, signatureHasInk);
    await addAttachmentPages(pdfDoc, font, bold);

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contrato-larios-${formatContractNumber(contractNumber)}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    saveNextContractNumber(contractNumber + 1);
    setStatus(`Contrato ${formatContractNumber(contractNumber)} generado. El siguiente sera ${formatContractNumber(contractNumber + 1)}.`);
  } catch (error) {
    setStatus(`No se pudo generar el PDF: ${error.message}`);
  } finally {
    generateBtn.disabled = false;
  }
}

function fillSample() {
  const sample = {
    renter: "IGNACIO CABEZAS CATALAN",
    license_number: "44651788W",
    license_country: "ESPANA",
    license_issue: "25/01/2018",
    license_expiry: "20/12/2027",
    nationality: "ESPANOLA",
    passport_id: "44651788W",
    birth_date: "13/05/1994",
    phone: "654331994",
    email: "info@lariosrental.com",
    address: "C/RIO BOLGAS AGUILAR 22, MALAGA",
    additional_name: "",
    vehicle_model: "CITROEN C3",
    vehicle_category: "Grupo C",
    vehicle_quantity: "1",
    vehicle_plate: "8486 MVJ",
    vehicle_color: "",
    fuel_type: "gasolina",
    delivery_place: "Larios Rental",
    delivery_gas: "1/2",
    agency: "",
    delivery_km: "",
    return_place: "Larios Rental",
    extras: "",
    rent_days_units: "3",
    season_94: "",
    insurance_units: "SI",
    young_driver_units: "NO",
    young_driver_total: "",
    extra_1_concept: "Silla nino",
    extra_1_total: "5.00",
    extra_2_concept: "",
    extra_2_total: "",
    discount_total: "",
    vat_units: "21",
    payment_method: "Tarjeta",
    credit_card_number: "4111 1111 1111 1111",
    credit_card_expiry: "12/28",
  };
  Object.entries(sample).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  fillDateTime();
  updateCategoryCalculations();
  updateReturnDefaults();
  updateSubtotal();
  setStatus("Ejemplo cargado. Puedes generar el PDF o sustituir los datos por los reales.");
}

function openScanReview(scanType, imageUrl, files = []) {
  const config = scanReviewConfigs[scanType] || scanReviewConfigs.driver;
  scanReviewState = { scanType, fields: config.fields.map(([name]) => name), files, processed: [] };
  scanReviewTitle.textContent = config.title;
  scanReviewHint.textContent = config.hint;
  scanReviewImage.src = imageUrl;
  scanCropStatus.textContent = "Imagen original. El OCR leera la foto completa sin recorte automatico.";
  scanReviewFields.replaceChildren();

  config.fields.forEach(([name, labelText, type]) => {
    const label = document.createElement("label");
    label.textContent = labelText;

    let field;
    if (type === "textarea") {
      field = document.createElement("textarea");
      field.rows = 3;
    } else if (type === "fuel") {
      field = document.createElement("select");
      [
        ["", "Sin seleccionar"],
        ["gasolina", "Gasolina 95"],
        ["diesel", "Diésel"],
      ].forEach(([value, text]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = text;
        field.appendChild(option);
      });
    } else {
      field = document.createElement("input");
      field.type = type || "text";
    }

    field.dataset.field = name;
    field.value = form.elements[name]?.value || "";
    label.appendChild(field);
    scanReviewFields.appendChild(label);
  });

  scanReview.hidden = false;
  scanReview.scrollIntoView({ behavior: "smooth", block: "start" });
  const firstField = scanReviewFields.querySelector("input, textarea, select");
  window.setTimeout(() => firstField?.focus({ preventScroll: true }), 250);
}

function closeScanReview() {
  scanReview.hidden = true;
  scanReviewFields.replaceChildren();
  scanCropStatus.textContent = "Imagen original";
  scanReviewState = { scanType: "", fields: [], files: [], processed: [] };
}

function clearScanReviewFields() {
  scanReviewFields.querySelectorAll("input, textarea, select").forEach((field) => {
    field.value = "";
  });
}

function applyScanReviewFields() {
  const fields = {};
  scanReviewFields.querySelectorAll("[data-field]").forEach((field) => {
    const value = clean(field.value);
    if (value) fields[field.dataset.field] = value;
  });

  Object.entries(fields).forEach(([key, value]) => {
    const target = form.elements[key];
    if (!target) return;
    target.value = value;
  });

  updateCategoryCalculations();
  updateReturnDefaults();
  updateSubtotal();

  const count = Object.keys(fields).length;
  closeScanReview();
  setStatus(count ? `Datos aplicados manualmente: ${count} campos. Revisa el contrato antes de generar el PDF.` : "No se aplico ningun campo porque estaban vacios.");
}

async function handlePhoto(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;

  const scanType = input.dataset.scan || "";
  const imageUrl = URL.createObjectURL(files[0]);
  files.forEach((file, index) => {
    const img = document.createElement("img");
    img.alt = input.dataset.scan || "Documento";
    img.src = URL.createObjectURL(file);
    photoGrid.appendChild(img);
    photos.hidden = false;
    if (scanType !== "card") {
      const label = input.closest(".scan-card")?.querySelector("span")?.textContent || "Documento";
      attachedPhotos.push({ file, scanType, title: files.length > 1 ? `${label} ${index + 1}` : label });
    }
  });

  openScanReview(scanType, imageUrl, files);
  setStatus("Foto guardada. Intentando leer los datos...");
  recognizeScanReview();
  input.value = "";
}

function setupCanvas(canvas, options = {}) {
  const ctx = canvas.getContext("2d");
  const state = { drawing: false, last: null };
  const setInk = options.onInk || (() => {});

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const snapshot = canvas.width && canvas.height ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = options.color || "#c31919";
    ctx.lineWidth = options.lineWidth || 3;
    if (snapshot) {
      const temp = document.createElement("canvas");
      temp.width = snapshot.width;
      temp.height = snapshot.height;
      temp.getContext("2d").putImageData(snapshot, 0, 0);
      ctx.drawImage(temp, 0, 0, rect.width, rect.height);
    }
  }

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0] || event.changedTouches?.[0] || event;
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function start(event) {
    event.preventDefault();
    state.drawing = true;
    state.last = point(event);
    setInk(true);
  }

  function move(event) {
    if (!state.drawing) return;
    event.preventDefault();
    const next = point(event);
    ctx.beginPath();
    ctx.moveTo(state.last.x, state.last.y);
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
    state.last = next;
  }

  function end(event) {
    if (!state.drawing) return;
    event.preventDefault();
    state.drawing = false;
    state.last = null;
  }

  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  window.addEventListener("resize", resize);
  resize();

  return {
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setInk(false);
    },
    resize,
  };
}

const damagePad = setupCanvas(damageCanvas, { color: "#c31919", lineWidth: 3, onInk: (value) => { damageHasInk = value; } });
const signaturePad = setupCanvas(signatureCanvas, { color: "#111", lineWidth: 2.5, onInk: (value) => { signatureHasInk = value; } });

document.querySelectorAll('input[type="file"]').forEach((input) => {
  input.addEventListener("change", () => handlePhoto(input));
});

document.querySelectorAll(".charge-total, [name='discount_total']").forEach((input) => {
  input.addEventListener("input", updateSubtotal);
});

["vehicle_category", "vehicle_quantity", "rent_days_units", "insurance_units", "season_94"].forEach((name) => {
  const field = form.elements[name];
  if (!field) return;
  const recalculate = () => {
    updateCategoryCalculations();
    updateReturnDefaults();
    updateSubtotal();
  };
  field.addEventListener("input", recalculate);
  field.addEventListener("change", recalculate);
});

["delivery_date", "delivery_time", "delivery_place"].forEach((name) => {
  const field = form.elements[name];
  if (!field) return;
  field.addEventListener("input", updateReturnDefaults);
  field.addEventListener("change", updateReturnDefaults);
});

clearDamageBtn.addEventListener("click", () => damagePad.clear());
clearSignatureBtn.addEventListener("click", () => signaturePad.clear());
generateBtn.addEventListener("click", generatePdf);
sampleBtn.addEventListener("click", fillSample);
autoScanReviewBtn.addEventListener("click", recognizeScanReview);
applyScanReviewBtn.addEventListener("click", applyScanReviewFields);
clearScanReviewBtn.addEventListener("click", clearScanReviewFields);
closeScanReviewBtn.addEventListener("click", closeScanReview);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

fillDateTime();
updateVehicleQuantityState();
