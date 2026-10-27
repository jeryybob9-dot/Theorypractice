#!/usr/bin/env python3
"""Build app data from the official Highway Code (gov.uk content API dumps).

Inputs : sources/hc/*.json   (raw responses from https://www.gov.uk/api/content/guidance/the-highway-code/...)
Outputs: data/hc.json        (sections with cleaned HTML, rule index) for the in-app reader
         sources/text/*.txt  (plain-text corpus, used when writing/checking questions)

The Highway Code is Crown copyright, published under the Open Government Licence v3.0.
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'sources', 'hc')
OUT = os.path.join(ROOT, 'data', 'hc.json')
TXT = os.path.join(ROOT, 'sources', 'text')
HC_PREFIX = '/guidance/the-highway-code/'

# Text transcriptions of infographic images, so the facts in them are searchable in the text corpus.
IMAGE_TEXT = {
    'the-highway-code-stopping-distance': (
        'Typical stopping distances (transcription of the Highway Code diagram). Thinking distance + braking distance = overall stopping distance. '
        '20 mph (32 km/h): 6 m + 6 m = 12 metres (40 feet) or three car lengths. '
        '30 mph (48 km/h): 9 m + 14 m = 23 metres (75 feet) or six car lengths. '
        '40 mph (64 km/h): 12 m + 24 m = 36 metres (118 feet) or nine car lengths. '
        '50 mph (80 km/h): 15 m + 38 m = 53 metres (175 feet) or thirteen car lengths. '
        '60 mph (96 km/h): 18 m + 55 m = 73 metres (240 feet) or eighteen car lengths. '
        '70 mph (112 km/h): 21 m + 75 m = 96 metres (315 feet) or twenty-four car lengths. '
        'The distances shown are a general guide. The distance will depend on your attention (thinking distance), the road surface, '
        'the weather conditions and the condition of your vehicle at the time. Average car length = 4 metres (13 feet).'),
}


def img_local(url):
    media = url.split('/media/')[1]
    mid, name = media.split('/', 1)
    base = os.path.splitext(name)[0]
    return f'assets/hc/{mid}_{base}.webp'


def clean_html(body, slug):
    b = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', body, flags=re.S | re.I)
    b = re.sub(r'\son\w+="[^"]*"', '', b)
    b = re.sub(r'<img src="([^"]+)"[^>]*>',
               lambda m: f'<img src="{img_local(m.group(1))}" alt="" loading="lazy">', b)

    def fix_href(m):
        href = html.unescape(m.group(1))
        if href.startswith(HC_PREFIX):
            rest = href[len(HC_PREFIX):]
            s, _, frag = rest.partition('#')
            return f'href="#/hc/{s}' + (f'/{frag}' if frag else '') + '"'
        if href.startswith('#'):
            return f'href="#/hc/{slug}/{href[1:]}"'
        if href.startswith('/'):
            href = 'https://www.gov.uk' + href
        return f'href="{html.escape(href)}" target="_blank" rel="noopener"'

    b = re.sub(r'href="([^"]+)"', fix_href, b)
    b = re.sub(r'\srel="external"', '', b)
    return b.strip()


def to_text(body):
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', body, flags=re.S)
    t = re.sub(r'<img[^>]*>\s*(</p>)?\s*<figcaption>(.*?)</figcaption>',
               lambda m: '\n[Image: ' + re.sub('<[^>]+>', '', m.group(2)).strip() + ']\n', t, flags=re.S)
    def img_text(m):
        for key, val in IMAGE_TEXT.items():
            if key in m.group(0):
                return '\n[Image: ' + val + ']\n'
        return '\n[Image]\n'
    t = re.sub(r'<img[^>]*>', img_text, t)
    t = re.sub(r'<h2[^>]*>(.*?)</h2>', lambda m: '\n\n## ' + m.group(1) + '\n', t, flags=re.S)
    t = re.sub(r'<h3[^>]*>(.*?)</h3>', lambda m: '\n\n### ' + m.group(1) + '\n', t, flags=re.S)
    t = re.sub(r'<h4[^>]*>(.*?)</h4>', lambda m: '\n#### ' + m.group(1) + '\n', t, flags=re.S)
    t = re.sub(r'<li[^>]*>', '\n- ', t)
    t = re.sub(r'</(p|li|tr|table|ul|ol|div)>', '\n', t)
    t = re.sub(r'</t[dh]>', ' | ', t)
    t = re.sub(r'<br\s*/?>', '\n', t)
    t = re.sub(r'<[^>]+>', '', t)
    t = html.unescape(t)
    t = re.sub(r'[ \t]+', ' ', t)
    t = re.sub(r'\n\s*\n\s*\n+', '\n\n', t)
    return t.strip()


def main():
    index = json.load(open(os.path.join(SRC, '_index.json')))
    sections = []
    rules = {}
    os.makedirs(TXT, exist_ok=True)
    order = [s for g in index['details']['child_section_groups'] for s in g['child_sections']]
    for sec in order:
        slug = sec['base_path'].split('/')[-1]
        if slug == 'index':
            continue
        d = json.load(open(os.path.join(SRC, slug + '.json')))
        body = d['details']['body']
        title = sec['title'].strip()
        cleaned = clean_html(body, slug)
        nums = [n.upper() for n in re.findall(r'<h3 id="rule(h?\d+[a-z]?)"', body)]
        for n in nums:
            rules[n] = slug
        sections.append({'slug': slug, 'title': title, 'html': cleaned, 'rules': nums})
        with open(os.path.join(TXT, f'{len(sections):02d}-{slug}.txt'), 'w') as f:
            f.write(f'# THE HIGHWAY CODE — {title}\n# Source: https://www.gov.uk{sec["base_path"]}\n\n')
            f.write(to_text(body))
    data = {
        'source': 'https://www.gov.uk/guidance/the-highway-code',
        'licence': 'Contains public sector information licensed under the Open Government Licence v3.0. © Crown copyright.',
        'updated': index.get('public_updated_at'),
        'sections': sections,
        'rules': rules,
    }
    with open(OUT, 'w') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('sections', len(sections), 'rules', len(rules), 'bytes', os.path.getsize(OUT))


if __name__ == '__main__':
    main()
