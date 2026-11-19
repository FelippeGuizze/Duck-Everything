#!/usr/bin/env python3
"""Empacota e publica versões do Duck Everything para quem usa o .xpi.

  python tools/release.py pack
      Gera dist/duck-everything-<versão>.zip com o conteúdo de extension/,
      pronto para enviar ao AMO (distribuição própria / não listada) e assinar.

  python tools/release.py publish <arquivo-assinado.xpi>
      Cria a GitHub Release v<versão> com o .xpi assinado e acrescenta a versão
      ao updates.json. Depois é só commitar e dar push do updates.json na main:
      o Firefox de quem instalou o .xpi encontra a versão nova sozinho.
"""
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / 'extension'
UPDATES = ROOT / 'updates.json'
REPO = 'FelippeGuizze/Duck-Everything'


def fail(msg):
    sys.exit('erro: ' + msg)


def gecko(manifest):
    return manifest.get('browser_specific_settings', {}).get('gecko', {})


def pack():
    manifest = json.loads((EXT / 'manifest.json').read_text(encoding='utf-8'))
    out = ROOT / 'dist' / f"duck-everything-{manifest['version']}.zip"
    out.parent.mkdir(exist_ok=True)
    out.unlink(missing_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(EXT.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(EXT).as_posix())
    print(f'{out}\nEnvie em https://addons.mozilla.org/developers/ (On your own / não listada) e baixe o .xpi assinado.')


def publish(xpi_arg):
    xpi = Path(xpi_arg).resolve()
    if not xpi.is_file():
        fail(f'{xpi} não existe')
    with zipfile.ZipFile(xpi) as z:
        names = set(z.namelist())
        manifest = json.loads(z.read('manifest.json'))
    if not any(n.startswith('META-INF/') for n in names):
        fail('o .xpi não está assinado (falta META-INF/). Baixe a versão assinada do AMO.')
    version, info = manifest['version'], gecko(manifest)
    addon_id = info.get('id')
    if not info.get('update_url'):
        fail('o manifest do .xpi não tem update_url; quem instalar não recebe atualizações.')

    data = json.loads(UPDATES.read_text(encoding='utf-8'))
    updates = data['addons'].setdefault(addon_id, {'updates': []})['updates']
    if any(u['version'] == version for u in updates):
        fail(f'a versão {version} já está no updates.json')

    tag, asset = f'v{version}', f'duck-everything-{version}.xpi'
    staged = ROOT / 'dist' / asset
    staged.parent.mkdir(exist_ok=True)
    if staged != xpi:
        shutil.copyfile(xpi, staged)
    subprocess.run(['gh', 'release', 'create', tag, str(staged), '--repo', REPO,
                    '--title', f'Duck Everything {version}', '--notes', f'Versão {version} assinada para Firefox.'],
                   check=True)

    updates.append({
        'version': version,
        'update_link': f'https://github.com/{REPO}/releases/download/{tag}/{asset}',
        'applications': {'gecko': {'strict_min_version': info.get('strict_min_version', '142.0')}},
    })
    UPDATES.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    print(f'Release {tag} criada e updates.json atualizado.\n'
          f'Agora: git add updates.json && git commit -m "Release {version}" e push na main.')


if __name__ == '__main__':
    if sys.argv[1:2] == ['pack']:
        pack()
    elif sys.argv[1:2] == ['publish'] and len(sys.argv) == 3:
        publish(sys.argv[2])
    else:
        sys.exit(__doc__)
