#!/usr/bin/env python3
"""Empacota o Duck Everything para enviar ao Firefox Add-ons (AMO).

  python tools/release.py pack
      Gera dist/duck-everything-<versão>.zip com o conteúdo de extension/
      (manifest.json na raiz do zip). Envie como nova versão no AMO; depois da
      revisão, quem instalou pela página do AMO recebe a atualização sozinho.
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / 'extension'


def pack():
    manifest = json.loads((EXT / 'manifest.json').read_text(encoding='utf-8'))
    out = ROOT / 'dist' / f"duck-everything-{manifest['version']}.zip"
    out.parent.mkdir(exist_ok=True)
    out.unlink(missing_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(EXT.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(EXT).as_posix())
    print(f'{out}\nEnvie como nova versão em https://addons.mozilla.org/developers/.')


if __name__ == '__main__':
    if sys.argv[1:] == ['pack']:
        pack()
    else:
        sys.exit(__doc__)
