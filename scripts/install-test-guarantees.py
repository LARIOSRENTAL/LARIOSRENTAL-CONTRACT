from pathlib import Path
import hashlib
import os
import re
import subprocess
import tempfile
import shutil

if os.environ.get('GITHUB_REF', 'refs/heads/test/mobile-v84') != 'refs/heads/test/mobile-v84':
    raise RuntimeError('This installer is restricted to TEST')
root = Path('app-v84/www')
expected = {
    'reservation-compact-v1.js': 'a107fa0587c8d6c85c5b45485cefde4ea0aec0d12ff946c73e5c513bc4fd94e2',
    'index.html': 'dd09c6dda5bd5845bf1faa1a6030e44992d1b391bd1c02ecea443f1a2d9294fa',
}
if 'guarantees1-sync' not in (root / 'reservation-compact-v1.js').read_text():
    for name, digest in expected.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
            raise RuntimeError('Unreviewed file revision: ' + name)
    with tempfile.TemporaryDirectory() as temp:
        stage = Path(temp)
        s = (root / 'reservation-compact-v1.js').read_text()
        start = s.index('function syncDepositState()')
        end = s.index('function installDeposit()', start)
        s = s[:start] + 'function syncDepositState(){window.LariosGuarantees?.syncForm()} // guarantees1-sync\n' + s[end:]
        start = s.index("let loadedId='';")
        end = s.index('const originalFetch=', start)
        s = s[:start] + 'function loadDepositForCurrentContract(){/* Hydration belongs to guarantee controller. */}\n\n' + s[end:]
        (stage / 'reservation-compact-v1.js').write_text(s)
        s = (root / 'index.html').read_text()
        s = re.sub(r'(src="reservation-compact-v1.js\?v=)[^"]+', r'\g<1>guarantees1-20260913', s)
        s = s.replace('</body>', '<script src="guarantee-panel-v1.js?v=guarantees1-20260913"></script></body>')
        s = s.replace('PRUEBAS · ESTABILIDAD 2', 'PRUEBAS · GARANTÍAS 1')
        s = s.replace('V8.4 · ESTABILIDAD 2', 'V8.4 · GARANTÍAS 1')
        (stage / 'index.html').write_text(s)
        subprocess.run(['node', '--check', str(stage / 'reservation-compact-v1.js')], check=True)
        subprocess.run(['node', '--check', str(root / 'guarantee-panel-v1.js')], check=True)
        for name in expected:
            shutil.copyfile(stage / name, root / name)
else:
    print('Guarantee UI already activated')
print('TEST guarantee UI ready for publication')
