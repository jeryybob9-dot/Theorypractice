# Theory Practice — UK car theory test

A web app for iPhone (it works on any phone or computer) for practising both parts of the UK car theory test:

- **Multiple-choice questions.** Endless mock tests laid out and marked like the real test: 50 questions, 57 minutes, pass mark 43. Three of the questions are about a short video clip, which you can replay. You can flag questions, review them and change answers before ending the test. There's also practice by topic with instant feedback.
- **Hazard perception.** 14 clips per test. Each clip has one developing hazard, except one clip that has two, giving 15 hazards and 75 marks (pass mark 44). Each hazard scores 5 to 0 depending on how early you respond. Continuous or patterned tapping scores zero for that clip. After the test you can replay any clip with its scoring window shown.
- **Revision.** The full Highway Code (all 307 rules plus H1–H3, searchable and available offline) and every sign, road marking and signal image from it. Every answer explanation links to the rule it comes from.
- **Progress.** Test history, results by topic, a list of questions you got wrong to retry, and a readiness summary.

## Where the content comes from

Facts come only from official sources:

- **The Highway Code** on GOV.UK, including its traffic sign, road marking and signal images (`sources/hc/`).
- **DVSA/GOV.UK guidance** on the theory test format and pass marks, plus MOT, licences, penalty points, insurance, vehicle tax, towing, eyesight, seat belts, child seats, mobile phones and drink-driving (`sources/dvsa/`).

The 750 questions in `data/questions/` are written for this app in the DVSA style. Each one cites the Highway Code rule or GOV.UK page it is based on, and each was fact-checked against those sources. They are **not** the DVSA's licensed revision questions, and the real test questions are confidential. On top of these, about 400 more questions are generated from the Highway Code sign images, the stopping distance table and the speed limit table.

The hazard perception clips are created in 3D on the phone (three.js). They follow the DVSA format and scoring rules, but they are not the DVSA's own CGI clips. There are 20 kinds of developing hazard, each randomised for place (residential street, town centre, village, country lane, dual carriageway, motorway), time of day (day, dusk, night) and weather (clear, overcast, rain, fog). Each scoring window opens when the hazard first starts to develop **and** is in the driver's line of sight.

Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/). © Crown copyright. three.js is MIT licensed (`vendor/three.LICENSE`).

## Put it on your iPhone

The app is a static website, so any static host works. To use GitHub Pages:

1. On GitHub, open the repository's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**. Select the branch with this code and the `/ (root)` folder, then save.
3. After a minute the site is live at `https://<your-username>.github.io/<repository>/`.
4. Open that address in **Safari** on your iPhone, tap **Share**, then tap **Add to Home Screen**.

It then opens full screen like an app and works offline: the service worker caches everything, including the Highway Code and sign images. Your progress is saved on the phone.

Turn the phone sideways for hazard perception clips.

## Run it locally

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

No build step is needed. The app is plain HTML, CSS and ES modules.

## Developer notes

| Path | What it is |
|---|---|
| `js/main.js` | Routing, home, practice, progress and settings screens |
| `js/mcq.js` | Mock test and practice runner, results |
| `js/questions.js` | Test blueprint (topic mix), weighted question selection, generated sign/table questions |
| `js/hc.js` | Highway Code reader, rule pop-ups, sign gallery |
| `js/hpt/scenarios.js` | Hazard clip generator: environments and the 20 hazard templates |
| `js/hpt/world.js` | Builds and animates the three.js scene for a clip |
| `js/hpt/models.js`, `textures.js` | Procedural road users, street furniture and textures |
| `js/hpt/scoring.js` | DVSA-style 5-band scoring and pattern detection |
| `js/hpt/ui.js` | Hazard perception test, practice, results and review screens |
| `js/hpt/casestudy.js` | The video clip questions in the mock test |
| `data/questions/*.json` | Question bank, one file per DVSA topic (see `tools/QUESTION_GUIDE.md`) |

Rebuild the generated files after changing sources or questions:

```sh
python3 tools/build_hc.py      # Highway Code -> data/hc.json and sources/text/
python3 tools/build_signs.py   # sign catalogue -> data/signs.json
python3 tools/build_bank.py    # validate questions -> data/bank.json
python3 tools/build_sw.py      # refresh the offline cache list in sw.js
node tools/check_clips.mjs 10  # check hazard clips for collisions and window lengths
```

Two preview pages are useful when working on clips: `tools/preview.html?template=zebra&seed=3&t=20` and `tools/showroom.html`.
