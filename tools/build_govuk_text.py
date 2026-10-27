#!/usr/bin/env python3
"""Convert gov.uk (DVSA / DVLA) guidance dumps in sources/dvsa/*.json into plain text in sources/text/govuk-*.txt."""
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_hc import to_text  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for f in sorted(glob.glob(os.path.join(ROOT, 'sources', 'dvsa', '*.json'))):
    slug = os.path.basename(f)[:-5]
    if '__' in slug:  # duplicate sub-page fetches of a multi-part guide
        continue
    d = json.load(open(f))
    det = d.get('details', {})
    parts = det.get('parts') or [{'title': d.get('title'), 'body': det.get('body') or det.get('introductory_paragraph') or ''}]
    out = [f'# GOV.UK — {d.get("title")}\n# Source: https://www.gov.uk{d.get("base_path")}\n']
    for p in parts:
        body = p.get('body') or ''
        if isinstance(body, list):
            body = ''.join(x.get('content', '') for x in body)
        out.append(f'\n## {p.get("title")}\n\n' + to_text(body))
    if det.get('introductory_paragraph'):
        out.append(to_text(det['introductory_paragraph'] if isinstance(det['introductory_paragraph'], str) else ''.join(x.get('content', '') for x in det['introductory_paragraph'])))
    text = '\n'.join(out)
    if len(text) < 300:
        continue
    open(os.path.join(ROOT, 'sources', 'text', f'govuk-{slug}.txt'), 'w').write(text)
    print(slug, len(text))
