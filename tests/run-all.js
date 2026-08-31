const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const directory = __dirname;
const tests = readdirSync(directory).filter(name => name.endsWith('.test.js')).sort();
let failures = 0;

for (const name of tests) {
  const result = spawnSync(process.execPath, [join(directory, name)], { stdio: 'inherit' });
  if (result.status !== 0) failures += 1;
}

if (failures) {
  console.error(`${failures} prueba(s) fallaron.`);
  process.exit(1);
}

console.log(`${tests.length} pruebas completadas correctamente.`);
