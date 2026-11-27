import { copyFile, mkdir } from 'node:fs/promises';

const modules = new URL('../node_modules/', import.meta.url);
const vendor = new URL('../www/vendor/tesseract-v5/', import.meta.url);
await mkdir(vendor, { recursive: true });

const assets = {
  'tesseract.min.js': 'tesseract.js/dist/tesseract.min.js',
  'LICENSE-tesseract-js.md': 'tesseract.js/LICENSE.md',
  'worker.min.js': 'tesseract.js/dist/worker.min.js',
  'LICENSE-tesseract-core.txt': 'tesseract.js-core/LICENSE',
  'tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'spa.traineddata.gz': '@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz',
};
await Promise.all(Object.entries(assets).map(([file, source]) =>
  copyFile(new URL(source, modules), new URL(file, vendor))
));
