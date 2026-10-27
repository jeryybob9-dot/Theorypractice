# Question bank guide

The multiple-choice bank is **original** questions written in the DVSA style. Every fact comes from:

- **The Highway Code** (`sources/text/01-…30-*.txt`, from gov.uk, OGL v3.0)
- **DVSA / GOV.UK driving guidance** (`sources/text/govuk-*.txt`)
- **Highway Code sign images** (`sources/text/signs-catalogue.txt`, ids match `data/signs.json`)

Official DVSA revision questions are licensed and are **not** copied. Commercial practice sites are only a reference for format and difficulty.

## File format

One file per topic: `data/questions/<topic>.json`, a JSON array:

```json
[
  {
    "id": "ALE-001",
    "q": "You're driving at night and an oncoming driver dazzles you with their headlights. What should you do?",
    "options": [
      "Slow down or stop",
      "Flash your headlights at them",
      "Close your eyes briefly",
      "Switch on your main beam"
    ],
    "answer": 0,
    "explain": "If you are dazzled by oncoming headlights, slow down and, if necessary, stop. Don't retaliate by flashing your own headlights.",
    "ref": ["HC 115", "HC 93"],
    "sign": null
  }
]
```

| field | rules |
|---|---|
| `id` | topic prefix + 3-digit number, unique |
| `q` | question stem. Scenario first, then the question ("You're … What should you do?") |
| `options` | exactly 4 strings. The app shuffles them, so `answer` is just the index of the correct one |
| `answer` | index 0–3 of the one correct option |
| `explain` | 1–3 sentences, written like DVSA feedback ("You should…"), grounded in the source |
| `ref` | where the fact comes from: `"HC 126"` (a Highway Code rule number), `"HC Traffic signs"`, `"HC Road markings"`, `"HC Annex 6"`, `"GOV.UK penalty-points-endorsements"` (slug of a `govuk-*.txt` file) |
| `sign` | optional id from `signs-catalogue.txt`. The image is shown above the question ("You see this sign…") |

## Style (match the real test)

- British English, mph, metres, "you're", "car park", "carriageway", "dual carriageway", "kerb", "tyre".
- One clearly correct answer. Every distractor must be clearly wrong by the Highway Code, but believable: a common misconception, a near-miss number, or a rule that applies somewhere else.
- Options are short (usually under 12 words), parallel in grammar and similar in length. The correct answer must not stand out as the longest or most detailed.
- No "all of the above", "none of the above", joke options, or trick wording ("NOT" questions are allowed sparingly, with NOT in capitals).
- No full stop at the end of options unless the option is two sentences.
- Numbers asked must be in the sources exactly (stopping distances, speed limits, tread depth, alcohol limits, distances such as 10 metres from a junction, 45 metres for a warning triangle…).
- Car drivers' test only. Don't ask about motorcycle, lorry or bus licensing, but do ask about how a car driver should behave around those vehicles.
- Don't ask anything whose answer is only in *Driving – the essential skills* or *Know Your Traffic Signs* and isn't in the provided sources.
- Spread questions across the topic's subtopics. Don't write near-duplicates (same fact, same angle). Two questions on the same rule from different angles are fine.
