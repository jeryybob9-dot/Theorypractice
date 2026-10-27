#!/usr/bin/env python3
"""Write sw.js with a precache list of every app file and a content hash as the cache version."""
import hashlib
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INCLUDE = ['index.html', 'manifest.webmanifest', 'css', 'js', 'data/bank.json', 'data/signs.json', 'data/hc.json', 'vendor', 'assets']

files = []
for inc in INCLUDE:
    p = os.path.join(ROOT, inc)
    if os.path.isdir(p):
        for dp, _, fs in os.walk(p):
            for f in sorted(fs):
                if f.endswith(('.LICENSE', '.md')):
                    continue
                files.append(os.path.relpath(os.path.join(dp, f), ROOT))
    elif os.path.exists(p):
        files.append(inc)
files.sort()
h = hashlib.sha256()
for f in files:
    h.update(f.encode())
    h.update(open(os.path.join(ROOT, f), 'rb').read())
version = h.hexdigest()[:12]
template = open(os.path.join(ROOT, 'tools', 'sw.template.js')).read()
out = template.replace('__VERSION__', version).replace('__FILES__', ',\n  '.join(f"'./{f}'" for f in files))
open(os.path.join(ROOT, 'sw.js'), 'w').write(out)
print('sw.js', version, len(files), 'files')
