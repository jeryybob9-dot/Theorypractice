#!/usr/bin/env python3
"""Validate data/questions/*.json and merge them into data/bank.json.

Checks: schema, unique ids, 4 distinct options, answer index, Highway Code rule refs exist,
sign ids exist, GOV.UK refs point at a downloaded source page. Exits non-zero on errors.
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPICS = {
    'alertness': 'ALE', 'attitude': 'ATT', 'safety-vehicle': 'SAF', 'safety-margins': 'MAR',
    'hazard-awareness': 'HAZ', 'vulnerable-road-users': 'VUL', 'other-vehicles': 'OTH',
    'vehicle-handling': 'HAN', 'motorway-rules': 'MOT', 'rules-of-the-road': 'RUL',
    'road-signs': 'SIG', 'documents': 'DOC', 'incidents': 'INC', 'vehicle-loading': 'LOA',
}


def main():
    hc = json.load(open(os.path.join(ROOT, 'data', 'hc.json')))
    rules = set(hc['rules'])
    signs = {s['id'] for s in json.load(open(os.path.join(ROOT, 'data', 'signs.json')))['signs']}
    govuk = {os.path.basename(p)[6:-4] for p in glob.glob(os.path.join(ROOT, 'sources', 'text', 'govuk-*.txt'))}
    errors, warnings = [], []
    out, ids = [], set()
    counts = {}
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'questions', '*.json'))):
        topic = os.path.basename(path)[:-5]
        if topic not in TOPICS:
            errors.append(f'{path}: unknown topic file')
            continue
        try:
            data = json.load(open(path))
        except Exception as e:  # noqa: BLE001
            errors.append(f'{path}: invalid JSON: {e}')
            continue
        counts[topic] = len(data)
        for q in data:
            qid = q.get('id', '?')
            where = f'{topic}/{qid}'
            if not re.fullmatch(TOPICS[topic] + r'-\d{3}', str(qid)):
                errors.append(f'{where}: bad id')
            if qid in ids:
                errors.append(f'{where}: duplicate id')
            ids.add(qid)
            opts = q.get('options')
            if not isinstance(opts, list) or len(opts) != 4 or not all(isinstance(o, str) and o.strip() for o in opts):
                errors.append(f'{where}: needs exactly 4 non-empty string options')
                continue
            if len({o.strip().lower() for o in opts}) != 4:
                errors.append(f'{where}: duplicate options')
            a = q.get('answer')
            if not isinstance(a, int) or not 0 <= a <= 3:
                errors.append(f'{where}: answer must be 0-3')
            if not q.get('q') or not q.get('explain'):
                errors.append(f'{where}: missing q or explain')
            if re.search(r'\b(all|none) of the above\b', ' '.join(opts), re.I):
                errors.append(f'{where}: "all/none of the above" option')
            refs = q.get('ref') or []
            if not refs:
                warnings.append(f'{where}: no ref')
            for r in refs:
                m = re.match(r'^HC\s+(?:rule\s+)?(H?\d+[a-z]?)\b', r, re.I)
                if m:
                    if m.group(1).upper() not in rules:
                        errors.append(f'{where}: unknown rule {r}')
                    continue
                g = re.match(r'^GOV\.?UK\s+(\S+)', r, re.I)
                if g and g.group(1).strip('/') not in govuk:
                    warnings.append(f'{where}: gov.uk ref not in sources: {r}')
            s = q.get('sign')
            if s and s not in signs:
                errors.append(f'{where}: unknown sign id {s}')
            lens = sorted(len(o) for o in opts)
            if len(opts[a if isinstance(a, int) and 0 <= a <= 3 else 0]) == lens[-1] and lens[-1] > 1.6 * lens[-2] + 10:
                warnings.append(f'{where}: correct option is much longer than the rest')
            item = {'id': qid, 'topic': topic, 'q': q['q'].strip(), 'options': [o.strip() for o in opts],
                    'answer': a, 'explain': q['explain'].strip(), 'ref': refs}
            if s:
                item['sign'] = s
            out.append(item)
    with open(os.path.join(ROOT, 'data', 'bank.json'), 'w') as f:
        json.dump({'questions': out}, f, ensure_ascii=False, separators=(',', ':'))
    for w in warnings:
        print('warning:', w)
    for e in errors:
        print('ERROR:', e)
    print(json.dumps(counts), 'total', len(out))
    pos = [q['answer'] for q in out]
    print('answer positions', {i: pos.count(i) for i in range(4)})
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
