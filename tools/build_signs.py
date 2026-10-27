#!/usr/bin/env python3
"""Build data/signs.json: every sign / marking / signal image in The Highway Code with its official meaning.

Meanings come from the Highway Code captions. A few images have no caption on gov.uk (the meaning is in
the following paragraph or the referenced rule) — those are filled in from OVERRIDES, worded from the rule text.
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'sources', 'hc')
SECTIONS = ['traffic-signs', 'road-markings', 'light-signals-controlling-traffic', 'vehicle-markings',
            'signals-by-authorised-persons', 'signals-to-other-road-users']

# basename -> dict of field overrides. quiz=False keeps the image in the gallery but out of "what does this sign mean" questions.
OVERRIDES = {
    'direction-sign-blue-route-sign': {'meaning': 'Route confirmatory sign after a motorway junction'},
    'direction-sign-green-route-sign': {'meaning': 'Route confirmatory sign after a primary route junction'},
    'sign-giving-order-manually-stop': {'meaning': 'Manually operated temporary STOP sign (stop and wait)'},
    'sign-giving-order-manually-go': {'meaning': 'Manually operated temporary GO sign (proceed with care)'},
    'warning-sign-distance-to-stop-line-ahead-100-yards': {'meaning': "Distance to 'STOP' line ahead"},
    'warning-sign-distance-to-stop-line-ahead-50-yards': {'meaning': "Distance to 'Give Way' line ahead"},
    'warning-sign-plate-below-some-signs': {'quiz': False},
    # gov.uk serves the round school crossing patrol sign under this name (byte-identical image), so keep it out of quizzes
    'warning-sign-school-crossing-patrol-ahead': {'quiz': False},
    'warning-sign-worded-sign-ford': {'quiz': False},
    'warning-sign-level-crossing-without-barrier-ahead': {'meaning': 'Level crossing without barrier (cross shown at the crossing)'},
    'Information-sign-lane-for-hov': {'meaning': 'Lane for high occupancy vehicles (HOV) during the times shown'},
    'information-sign-motorway-exit-countdown-markers': {'meaning': "Countdown markers to an exit from the motorway (each bar about 100 yards)"},
    'variable_speed_limit': {'meaning': 'Variable speed limit with camera enforcement'},
    'road-work-sign-back-vehicle-800-yards': {'meaning': 'Lane closed ahead by a works vehicle (sign on back of works vehicle, no cones)'},
    'road-work-sign-back-vehicle450-yards': {'meaning': 'Lane closed ahead by a works vehicle (sign on back of works vehicle, no cones)', 'quiz': False},
    'road-work-sign-back-vehicle-direction-arrow': {'meaning': 'Slow-moving or stationary works vehicle blocking a lane; pass in the direction of the arrow'},
    'along-carriageway-centre-line': {'meaning': 'Centre line', 'rule': '127'},
    'along-carriageway-hazard-warn-line': {'meaning': 'Hazard warning line (longer markings, shorter gaps) – do not cross unless you can see the road is clear', 'rule': '127'},
    'along-carriageway-double-white-broken-line': {'meaning': 'Double white lines where the line nearest you is broken – you may cross to overtake if it is safe', 'rule': '128'},
    'along-carriageway-double-white-line': {'meaning': 'Double white lines – you MUST NOT cross or straddle a solid line nearest you', 'rule': '129'},
    'along-carriageway-diagonal-line': {'meaning': 'Diagonal stripes (hatch markings) separating traffic lanes – do not enter unless necessary', 'rule': '130'},
    'along-carriageway-lane-line': {'meaning': 'Lane line', 'rule': '131'},
    'along-carriageway-edge-line': {'meaning': 'Edge line marking the edge of the carriageway'},
    'along-edge-carriageway-park-times': {'meaning': 'Parking limited to 20 minutes, Mon–Sat 8am–7pm; no return within 40 minutes', 'quiz': False},
    'along-edge-carriageway-single_yellow-with-parking': {'meaning': 'Single yellow line – no waiting during the times shown on the sign'},
    'along-edge-carriageway-double-yellow': {'meaning': 'Double yellow lines – no waiting at any time'},
    'along-edge-carriageway-red-route-no-stopping-at-any-time': {'meaning': 'Red Route – no stopping at any time', 'quiz': False},
    'along-edge-carriageway-red-route-no-stopping-double-red-line': {'meaning': 'Double red lines – no stopping at any time'},
    'along-edge-carriageway-red-route-no-stopping-times': {'meaning': 'Red Route – no stopping during the times shown', 'quiz': False},
    'along-edge-carriageway-red-route-no-stopping-red-line': {'meaning': 'Single red line – no stopping during the times shown on the sign'},
    'along-edge-carriageway-red-route-parking': {'meaning': 'Red Route parking – limited duration during the days and times shown', 'quiz': False},
    'along-edge-carriageway-red-route-parking-space': {'meaning': 'Red Route parking bay – parking limited to the duration shown'},
    'along-edge-carriageway-red-route-except-loading-time': {'meaning': 'Red Route – loading allowed only at the times shown, max 20 minutes', 'quiz': False},
    'along-edge-carriageway-red-route-loading-space': {'meaning': 'Red Route loading bay – only loading may take place at the times shown, up to 20 minutes'},
    'on-kerb-no-loading-anytime': {'meaning': 'No loading at any time', 'quiz': False},
    'on-kerb-double-line-no-loading': {'meaning': 'Double kerb marks – no loading or unloading at any time'},
    'on-kerb-no-loading-times': {'meaning': 'No loading during the times shown', 'quiz': False},
    'on-kerb-single-line-no-loading-times': {'meaning': 'Single kerb mark – no loading or unloading at the times shown'},
    'on-kerb-loading-only-sign': {'meaning': 'Loading only', 'quiz': False},
    'on-kerb-loading-only-space': {'meaning': 'Loading bay'},
    'other-road-markings-bus-stop-road': {'meaning': 'Bus stop – do not stop or park here', 'rule': '243'},
    'other-road-markings-bus-lane-road': {'meaning': 'Bus lane marking', 'rule': '141'},
    'other-road-markings-box-junction': {'meaning': 'Box junction – do not enter unless your exit road or lane is clear', 'rule': '174'},
    'other-road-markings-school-keep-clear': {'meaning': 'School entrance – keep clear of stationary vehicles, even when picking up or setting down children'},
    'lane-control-signals': {'meaning': 'Lane control signals: green arrow – lane open; red cross – lane closed; white diagonal arrow – change lanes', 'quiz': False},
    'traffic-light-red': {'meaning': "RED means 'Stop'. Wait behind the stop line"},
    'traffic-light-red-amber': {'meaning': "RED AND AMBER also means 'Stop'. Do not go until GREEN shows"},
    'traffic-light-green': {'meaning': 'GREEN means you may go on if the way is clear'},
    'traffic-light-amber': {'meaning': "AMBER means 'Stop' at the stop line unless you have crossed it or are so close that pulling up might cause a collision"},
    'traffic-light-green-arrow': {'meaning': 'Green filter arrow – you may go in the direction of the arrow if the way is clear'},
    'motorway-signal-temporary-speed-limit-message': {'meaning': 'Temporary maximum speed advised and information message'},
    'Obstruction_FINAL_': {'meaning': 'Do not enter or proceed in the left lane; temporary mandatory speed limit and information message'},
    'large-goods-vehicle-markings': {'meaning': 'Rear markings for large goods vehicles and long vehicles', 'quiz': False},
    'hazard-warning-hazard-info-label': {'meaning': 'Hazard information panel on a tanker carrying dangerous goods (flammable liquid)', 'quiz': False},
    'hazard-warning-dangerous-goods': {'meaning': 'Vehicle carrying dangerous goods in packages'},
    'projection-marker-side': {'meaning': 'Side marker for a projecting load'},
    'projection-marker-end': {'meaning': 'End marker for a projecting load'},
    'police-officers-traffic-from-front': {'meaning': 'Police officer signalling STOP to traffic approaching from the front'},
    'police-officers-traffic-from-front-and-behind': {'meaning': 'Police officer signalling STOP to traffic approaching from both front and behind'},
    'police-officers-traffic-from-behind': {'meaning': 'Police officer signalling STOP to traffic approaching from behind'},
    'police-officer-beckon-from-the-side': {'meaning': 'Police officer beckoning traffic on from the side'},
    'police-officer-beckon-from-the-front': {'meaning': 'Police officer beckoning traffic on from the front'},
    'police-officer-beckon-from-behind': {'meaning': 'Police officer beckoning traffic on from behind'},
    'traffic-officer-car': {'meaning': 'Traffic officer vehicle', 'quiz': False},
    'dvsa-officer-car': {'meaning': 'DVSA officer vehicle', 'quiz': False},
    'direction-indicator-signals-right': {'meaning': 'I intend to move out to the right or turn right'},
    'direction-indicator-signals-left': {'meaning': 'I intend to move in to the left or turn left or stop on the left'},
    '077-Edit_2__v0_2': {'meaning': 'Hazard warning lights – temporarily obstructing traffic or warning of a hazard ahead', 'rule': '116'},
    'school-crossing-patrol-not-ready': {'meaning': 'School crossing patrol: not ready to cross pedestrians'},
    'school-crossing-patrol-barrier-to-stop': {'meaning': 'School crossing patrol: barrier to stop pedestrians crossing'},
    'school-crossing-patrol-vehicle-prepare-stop': {'meaning': 'School crossing patrol: ready to cross pedestrians – be prepared to stop'},
    'school-crossing-patrol-all-vehicles-stop': {'meaning': 'School crossing patrol: all vehicles must stop'},
}

# Group the images so that wrong answers are drawn from similar-looking signs.
def group_for(slug, h2, h3, base):
    if slug == 'traffic-signs':
        if h2.startswith('Signs giving orders'):
            return 'order-blue' if h3.startswith('Signs with blue circles') else 'order-red'
        if h2.startswith('Warning'):
            return 'warning'
        if h2.startswith('Direction'):
            if 'blue' in h3:
                return 'direction-motorway'
            if 'green' in h3:
                return 'direction-primary'
            if 'black borders' in h3:
                return 'direction-local'
            return 'direction-other'
        if h2.startswith('Information'):
            return 'information'
        if h2.startswith('Road work'):
            return 'roadworks'
    if slug == 'road-markings':
        if 'Across' in h2:
            return 'markings-across'
        if h2 == 'Along the carriageway':
            return 'markings-along'
        if 'edge' in h2 or 'kerb' in h2:
            return 'markings-edge'
        return 'markings-other'
    if slug == 'light-signals-controlling-traffic':
        return 'motorway-signals' if ('Motorway' in h2 or 'Lane control' in h2) else 'traffic-lights'
    if slug == 'vehicle-markings':
        return 'hazard-plates' if 'Hazard' in h2 else 'vehicle-markings'
    if slug == 'signals-by-authorised-persons':
        if 'School' in h2:
            return 'school-patrol'
        if 'Arm signals' in h2:
            return 'arm-signals-control'
        if 'Police' in h2:
            return 'police'
        return 'officers'
    if slug == 'signals-to-other-road-users':
        if 'Arm' in h2:
            return 'arm-signals'
        return 'vehicle-signals'
    return 'other'


GROUP_TITLES = {
    'order-red': 'Signs giving orders – red circles (mostly prohibitive)',
    'order-blue': 'Signs giving orders – blue circles (positive instruction)',
    'warning': 'Warning signs',
    'direction-motorway': 'Direction signs – motorways (blue)',
    'direction-primary': 'Direction signs – primary routes (green)',
    'direction-local': 'Direction signs – non-primary and local routes',
    'direction-other': 'Other direction signs',
    'information': 'Information signs',
    'roadworks': 'Road works signs',
    'markings-across': 'Road markings – across the carriageway',
    'markings-along': 'Road markings – along the carriageway',
    'markings-edge': 'Road markings – waiting, loading and Red Routes',
    'markings-other': 'Other road markings',
    'traffic-lights': 'Traffic light signals',
    'motorway-signals': 'Motorway and lane control signals',
    'vehicle-markings': 'Vehicle markings',
    'hazard-plates': 'Hazard warning plates',
    'police': 'Signals by police officers',
    'officers': 'Traffic officers and DVSA officers',
    'arm-signals-control': 'Arm signals to persons controlling traffic',
    'school-patrol': 'School crossing patrols',
    'vehicle-signals': 'Signals to other road users',
    'arm-signals': 'Arm signals',
}


def strip(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    s = s.replace('**', '')
    return re.sub(r'\s+', ' ', html.unescape(s)).strip()


def main():
    out = []
    seen = {}
    for slug in SECTIONS:
        body = json.load(open(os.path.join(SRC, slug + '.json')))['details']['body']
        h2 = h3 = ''
        pat = re.compile(r'<h2[^>]*>(.*?)</h2>|<h3[^>]*>(.*?)</h3>|<img src="([^"]+)"[^>]*>\s*(?:</p>)?\s*(?:<figcaption>(.*?)</figcaption>)?', re.S)
        for m in pat.finditer(body):
            g2, g3, img, cap = m.groups()
            if g2:
                h2, h3 = strip(g2), ''
                continue
            if g3:
                h3 = strip(g3)
                continue
            media = img.split('/media/')[1]
            mid, name = media.split('/', 1)
            base = os.path.splitext(name)[0]
            sid = base
            if sid in seen:
                seen[sid] += 1
                sid = f'{sid}-{seen[sid]}'
            else:
                seen[sid] = 1
            meaning = strip(cap)
            if slug == 'signals-by-authorised-persons' and base.startswith('car-arm-signal'):
                meaning = meaning + ' (arm signal to a person controlling traffic)'
            item = {
                'id': sid,
                'img': f'assets/hc/{mid}_{base}.webp',
                'meaning': meaning,
                'group': group_for(slug, h2, h3, base),
                'section': slug,
                'quiz': True,
            }
            item.update(OVERRIDES.get(base, {}))
            if not item['meaning']:
                item['quiz'] = False
                item['meaning'] = h3 or h2
            if item['group'].startswith('direction-') and 'confirmatory' not in item['meaning'] and item['group'] != 'direction-other':
                item['quiz'] = False
            if 'emergency diversion' in item['meaning']:
                item['quiz'] = base.endswith('triangle')
            out.append(item)
    data = {'groups': GROUP_TITLES, 'signs': out}
    with open(os.path.join(ROOT, 'data', 'signs.json'), 'w') as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    q = [s for s in out if s['quiz']]
    print('signs', len(out), 'quizzable', len(q))
    dup = {}
    for s in q:
        dup.setdefault(s['meaning'], []).append(s['id'])
    for k, v in dup.items():
        if len(v) > 1:
            print('DUP MEANING', k, v)


if __name__ == '__main__':
    main()
