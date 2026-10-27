// Video clip questions for the multiple-choice test. The real test has a short, silent clip of a normal
// driving situation followed by 3 questions; the clip can be watched as many times as you like.
import { h, rng } from '../util.js';
import { makeClip } from './scenarios.js';

// For each clip type: one question about what happened in the clip, plus Highway Code questions about the situation.
// The first option of each is the correct one (options are shuffled when shown).
const CASES = {
  zebra: [
    { watch: true, q: 'What type of crossing did you approach in the clip?', o: ['A zebra crossing', 'A pelican crossing', 'A toucan crossing', 'A level crossing'], e: 'The crossing had black and white stripes and flashing amber Belisha beacons: a zebra crossing.', r: ['HC 195'] },
    { q: 'A pedestrian has stepped onto a zebra crossing ahead. What MUST you do?', o: ['Give way to them', 'Sound your horn to warn them', 'Drive on if they are still near the kerb', 'Wave them across'], e: 'You MUST give way when a pedestrian has moved onto a zebra crossing.', r: ['HC 195'] },
    { q: 'Why should you not wave pedestrians across a zebra crossing?', o: ['Another vehicle may be approaching', "It's against the law to wave", 'They always have priority anyway', "It slows the traffic behind you"], e: "Don't wave, flash your lights or use your horn to invite pedestrians across; this could be dangerous if another vehicle is approaching.", r: ['HC 195'] },
    { q: 'What MUST you not do in the area marked by zig-zag lines at a crossing?', o: ['Park', 'Slow down', 'Use your mirrors', 'Drive in a low gear'], e: 'You MUST NOT park on a crossing or in the area covered by the zig-zag lines, or overtake the vehicle nearest the crossing.', r: ['HC 191'] },
  ],
  busPullsOut: [
    { watch: true, q: 'What did the bus at the stop do in the clip?', o: ['Signalled right and pulled out', 'Stayed at the stop with its hazard lights on', 'Turned left into a side road', 'Reversed away from the stop'], e: 'The bus signalled right and pulled away from the stop.', r: [] },
    { q: 'A bus ahead is signalling to pull away from a stop. What should you do?', o: ['Give way to it if it is safe to do so', 'Speed up to pass it before it moves', 'Sound your horn as you pass', 'Flash your headlights to make it wait'], e: 'Give priority to buses when you can do so safely, especially when they signal to pull away from stops.', r: ['HC 223'] },
    { q: 'Why should you take care when driving past a bus stop?', o: ['People getting off may cross the road', 'Buses never signal when they move off', 'Bus stops are only used at night', 'You must always stop behind a bus'], e: 'Drive carefully past bus stops: pedestrians may emerge suddenly into the road, and people getting off may cross.', r: ['HC 206', 'HC 223'] },
  ],
  pedestrianStepsOut: [
    { watch: true, q: 'Where did the pedestrian come from in the clip?', o: ['Between parked vehicles', 'A zebra crossing', 'A bus stop', 'A side road'], e: 'The pedestrian stepped out between the parked vehicles on the side of the road.', r: [] },
    { q: 'You are driving along a street with parked cars on both sides. Why should you drive slowly?', o: ['Pedestrians may step out between them', 'Parked cars make the road slippery', 'The speed limit is always 20 mph', 'Parked drivers have priority over you'], e: 'There is a risk of pedestrians, especially children, stepping unexpectedly into the road. Drive carefully and slowly in residential areas and when passing parked vehicles.', r: ['HC 205', 'HC 206'] },
    { q: 'The road in the clip has a 30 mph limit. What does the limit mean?', o: ["It's a maximum, not a target speed", 'You should always drive at 30 mph', 'You may do 40 mph if the road is clear', 'It only applies during school hours'], e: 'The speed limit is the absolute maximum and does not mean it is safe to drive at that speed irrespective of conditions.', r: ['HC 125'] },
  ],
  emergingCar: [
    { watch: true, q: 'What did the car in the side road do?', o: ["Pulled out without stopping", 'Waited for you to pass', 'Reversed back up the side road', 'Turned away from you'], e: "The car didn't stop at the give way lines and pulled out in front of you.", r: [] },
    { q: 'There are double broken white lines across the end of a side road. What do they mean?', o: ['Give way to traffic on the major road', 'Stop even if the road is clear', 'No entry for all vehicles', 'The side road is a bus lane'], e: 'Broken lines across the end of a side road mean give way to traffic on the major road.', r: ['HC Road markings'] },
    { q: "You're approaching a side road on the left. What should you be ready for?", o: ['A vehicle pulling out in front of you', 'Pedestrians giving way to you', 'The speed limit going up', 'Traffic from the side road always stopping'], e: 'Take extra care at junctions: other road users may not have seen you, and vehicles may pull out.', r: ['HC 170'] },
  ],
  parkedCarPullsOut: [
    { watch: true, q: 'What was the first sign that the parked car was going to move off?', o: ['Its right indicator came on', 'Its hazard lights came on', 'Its reversing lights came on', 'Its driver opened the door'], e: "The parked car's right indicator came on before it started to move away from the kerb.", r: [] },
    { q: 'A parked car ahead signals to pull out. What should you do?', o: ['Slow down and be ready to stop', 'Speed up to get past it', 'Sound your horn and carry on', 'Flash your headlights to make it wait'], e: 'A vehicle signalling to move off is a developing hazard: ease off and be prepared to let it out.', r: [] },
  ],
  carAheadTurns: [
    { watch: true, q: 'Why did the vehicle in front slow down and stop?', o: ['It was waiting to turn right', 'It had broken down', 'It stopped at a zebra crossing', 'The traffic lights were red'], e: 'It signalled right and stopped to wait for a gap in the oncoming traffic before turning.', r: [] },
    { q: 'Why should you keep a safe gap behind the vehicle in front?', o: ['So you can stop if it slows suddenly', 'So you can overtake it more easily', 'So other drivers can see your number plate', 'So you can use your mirrors less'], e: 'Leave enough space between you and the vehicle in front so you can pull up safely if it suddenly slows down or stops.', r: ['HC 126'] },
    { q: 'What gap should you leave behind the vehicle in front on a fast road in good conditions?', o: ['At least two seconds', 'At least one second', 'About one car length', 'Half a second'], e: 'Allow at least a two-second gap on high-speed roads, at least doubled on wet roads.', r: ['HC 126'] },
  ],
  cyclistMovesOut: [
    { watch: true, q: 'What did the cyclist do just before moving out?', o: ['Looked over their shoulder', 'Gave a left arm signal', 'Stopped at the kerb', 'Got off and walked'], e: 'The cyclist looked over their right shoulder, then moved out to pass the parked vehicle.', r: [] },
    { q: "You're overtaking a cyclist at 30 mph. How much room should you leave?", o: ['At least 1.5 metres', 'At least 0.5 metres', 'At least 1 metre', 'As little as possible'], e: 'Leave at least 1.5 metres when overtaking cyclists at speeds of up to 30 mph, and more at higher speeds.', r: ['HC 163'] },
    { q: 'Why might a cyclist ride in the centre of the lane?', o: ['To make themselves clearly visible', 'Because they want you to overtake', 'Because cycle lanes are closed', 'Because they are about to stop'], e: 'On narrow or quiet roads, at junctions and in slower traffic, cyclists may ride in the centre of the lane so they can see and be seen.', r: ['HC 213'] },
  ],
  horses: [
    { watch: true, q: 'What was on the road ahead after the bend?', o: ['Horse riders', 'A tractor', 'A group of cyclists', 'A broken-down car'], e: 'There were horse riders on the road ahead.', r: [] },
    { q: 'How should you pass horse riders on the road?', o: ['Wide and slow, at no more than 10 mph', 'Quickly, to spend less time near them', 'Close in, with a short toot of the horn', 'At normal speed if they are on the left'], e: 'Slow down to a maximum of 10 mph and, when it is safe, pass wide and slow, allowing at least 2 metres of space.', r: ['HC 215'] },
    { q: 'What should you avoid doing when driving near horses?', o: ['Revving your engine or sounding your horn', 'Waiting patiently behind them', 'Driving slowly past them', 'Giving them plenty of room'], e: "Be patient; don't sound your horn or rev your engine.", r: ['HC 215'] },
  ],
  schoolPatrol: [
    { watch: true, q: 'What did the person in the high-visibility coat do?', o: ['Stepped into the road with a STOP sign', 'Waved you through', 'Stayed on the pavement', 'Signalled you to speed up'], e: "A school crossing patrol stepped out holding a 'Stop for children' sign.", r: [] },
    { q: "A school crossing patrol shows a 'Stop for children' sign. What MUST you do?", o: ['Stop', 'Slow down and pass carefully', 'Sound your horn', 'Carry on if no children are in the road'], e: "You MUST stop when a school crossing patrol shows a 'Stop for children' sign.", r: ['HC 210'] },
    { q: 'How should you drive near a school?', o: ['Slowly, looking out for children', 'At the speed limit to clear the area', 'With your hazard lights on', 'Close to the kerb'], e: 'Near schools, drive slowly and be particularly aware of young cyclists and pedestrians.', r: ['HC 208'] },
  ],
  queue: [
    { watch: true, q: 'What happened to the traffic ahead of you?', o: ['It slowed down and queued', 'It moved onto the hard shoulder', 'It sped up', 'It left at the next exit'], e: 'The traffic ahead slowed and stopped in a queue.', r: [] },
    { q: 'When may you use hazard warning lights while driving?', o: ['On a motorway, to warn of a hazard ahead', 'When you are parked on double yellow lines', 'To thank another driver', 'When towing in heavy rain'], e: 'You MUST NOT use hazard warning lights while driving unless on a motorway or unrestricted dual carriageway, to warn drivers behind of a hazard or obstruction ahead.', r: ['HC 116'] },
    { q: 'What gap should you leave behind the vehicle in front on a motorway in good conditions?', o: ['At least two seconds', 'At least one second', 'One car length', 'Four car lengths at any speed'], e: 'Allow at least a two-second gap on high-speed roads.', r: ['HC 126'] },
  ],
  oncomingTurnsAcross: [
    { watch: true, q: 'What did the oncoming car do?', o: ['Turned right across your path', 'Stopped to let you pass', 'Overtook a cyclist', 'Flashed its headlights'], e: 'The oncoming car turned right across your path into the side road.', r: [] },
    { q: 'An oncoming car is signalling right towards a side road on your left. What should you do?', o: ['Be ready to slow down or stop', 'Speed up to pass it first', 'Flash your headlights at it', 'Move into the middle of the road'], e: "Be aware that other drivers may not have seen you or may misjudge your speed. Ease off and be ready to stop.", r: ['HC 170'] },
  ],
  iceCream: [
    { watch: true, q: 'What did the child do in the clip?', o: ['Ran out from behind the ice-cream van', 'Waited on the pavement', 'Used a zebra crossing', 'Rode a bike into the road'], e: 'A child ran out into the road from behind the parked ice-cream van.', r: [] },
    { q: 'Why should you drive slowly past an ice-cream van?', o: ['Children may run into the road', 'Ice-cream vans may reverse suddenly', "It's an offence to pass at speed", 'The van may need to overtake'], e: 'Children are more interested in ice cream than traffic and may run into the road unexpectedly.', r: ['HC 206'] },
  ],
  ballChild: [
    { watch: true, q: 'What gave you an early warning that a child might run into the road?', o: ['A ball rolling into the road', 'A school warning sign', 'A school crossing patrol', 'Flashing amber lights'], e: 'A ball rolled into the road, and a child ran after it.', r: [] },
    { q: 'Who is most at risk of stepping unexpectedly into the road?', o: ['Children', 'Cyclists', 'Horse riders', 'Bus drivers'], e: 'There is a risk of pedestrians, especially children, stepping unexpectedly into the road.', r: ['HC 205'] },
  ],
  deer: [
    { watch: true, q: 'What ran across the road?', o: ['A deer', 'A dog', 'A horse', 'A cyclist'], e: 'A deer ran across the road.', r: [] },
    { q: 'How should you pass animals near the road?', o: ['Slowly, giving them plenty of room', 'Quickly, sounding your horn', 'Accelerating hard once alongside', 'With your hazard lights on'], e: 'When passing animals, drive slowly, give them plenty of room and be ready to stop. Do not scare them by sounding your horn or revving your engine.', r: ['HC 214'] },
  ],
  dog: [
    { watch: true, q: 'What ran into the road?', o: ['A dog', 'A child', 'A ball', 'A cyclist'], e: 'A dog ran off the pavement into the road.', r: [] },
    { q: 'What should you do when you see an animal near the road?', o: ['Slow down and be ready to stop', 'Sound your horn to scare it away', 'Speed up to pass it quickly', 'Flash your headlights at it'], e: 'Drive slowly, give animals plenty of room and be ready to stop.', r: ['HC 214'] },
  ],
  doorOpens: [
    { watch: true, q: 'What happened as you approached the parked car?', o: ['Its door opened into the road', 'It pulled out', 'It reversed towards you', 'Its hazard lights came on'], e: "The parked car's door opened and its driver got out into the road.", r: [] },
    { q: 'Why should you leave room when passing parked cars?', o: ['A door may open or someone may step out', 'Parked cars may suddenly reverse', "It's illegal to pass them closely", "Their drivers can't see your lights"], e: 'Give parked vehicles room: doors may open and people may step out. Cyclists are advised to keep at least a door\'s width or 1 metre away for this reason.', r: ['HC 206', 'HC 213'] },
  ],
  reversing: [
    { watch: true, q: 'What warned you that the car on the driveway was going to move?', o: ['Its reversing lights came on', 'Its right indicator came on', 'Its headlights flashed', 'Its hazard lights came on'], e: "The car's white reversing lights came on before it backed out.", r: [] },
    { q: 'What does it mean when a car shows white lights at the rear?', o: ['It is about to reverse', 'It is braking', 'It is turning left', 'Its fog lights are on'], e: "Reversing lights signal 'I intend to reverse'.", r: ['HC Signals to other road users'] },
  ],
  tractorOut: [
    { watch: true, q: 'What came out of the field gateway?', o: ['A tractor', 'A horse rider', 'A bus', 'A deer'], e: 'A tractor pulled out of the field into the road ahead.', r: [] },
    { q: "You're behind a slow tractor on a narrow country road. What should you do?", o: ['Be patient and only overtake when safe', 'Sound your horn to make it pull over', 'Overtake on the next bend', 'Flash your headlights to hurry it'], e: "Only overtake when it is safe and legal. Don't overtake where you can't see far enough ahead, such as on bends.", r: ['HC 162', 'HC 166'] },
  ],
  oncomingOvertaker: [
    { watch: true, q: 'What did the oncoming car do?', o: ['Overtook onto your side of the road', 'Turned into a field', 'Broke down in the road', 'Stopped to let you pass'], e: 'The car behind the slow vehicle pulled out to overtake and came towards you on your side of the road.', r: [] },
    { q: 'An oncoming vehicle is overtaking towards you on your side of the road. What should you do?', o: ['Slow down and keep left', 'Flash your headlights and keep going', 'Move to the centre of the road', 'Speed up to get past quickly'], e: 'Slow down, keep left and give the other driver room to get back to their own side.', r: ['HC 160'] },
  ],
  laneCutIn: [
    { watch: true, q: 'What did the vehicle in the next lane do?', o: ['Moved into your lane and braked', 'Left the motorway', 'Overtook on the hard shoulder', 'Stopped in its lane'], e: 'It signalled left, moved in front of you and slowed down.', r: [] },
    { q: 'A vehicle pulls into the gap you have left in front of you. What should you do?', o: ['Drop back to restore a safe gap', 'Flash your headlights at the driver', 'Close up to stop it happening again', 'Overtake it on the left'], e: 'If someone cuts in, drop back to keep a safe separation distance.', r: ['HC 126'] },
  ],
};

const TOPIC = 'video';

export function makeCaseStudy(seed) {
  const r = rng(seed ^ 0xc0ffee);
  const name = r.pick(Object.keys(CASES));
  const clipSeed = (seed * 13 + 7) >>> 0;
  const clip = makeClip(clipSeed, { template: name, short: true });
  const pool = CASES[name];
  const watch = pool.filter((q) => q.watch);
  const rest = r.shuffle(pool.filter((q) => !q.watch));
  // the real test always has 3 video questions; top up from general hazard questions if needed
  let chosen = [watch[0], ...rest].slice(0, 3);
  if (chosen.length < 3) chosen = [...chosen, ...r.shuffle(GENERAL).slice(0, 3 - chosen.length)];
  const questions = chosen.map((q, i) => instantiate(q, `VID-${name}-${pool.indexOf(q) >= 0 ? pool.indexOf(q) : 'G' + GENERAL.indexOf(q)}`, (seed + i * 31) >>> 0));
  return { video: { seed: clipSeed, template: name, env: clip.env, duration: clip.duration }, questions };
}

const GENERAL = [
  { q: 'What is a developing hazard?', o: ['Something that would make you change speed or direction', 'Any vehicle parked at the side of the road', 'A road sign warning of a bend', 'A pedestrian walking along the pavement'], e: 'A developing hazard is something that would cause you to take action, like changing speed or direction.', r: ['GOV.UK theory-test'] },
  { q: 'Why should you scan the road well ahead as you drive?', o: ['To spot hazards early and have time to react', 'So you can keep up with the car in front', 'To read the number plates of other cars', 'So you need to check your mirrors less'], e: 'Looking well ahead gives you time to plan and react to hazards as they develop.', r: ['HC 126', 'HC 146'] },
];

function instantiate(q, id, seed) {
  const r = rng(seed);
  const order = r.shuffle([0, 1, 2, 3]);
  return {
    id, topic: TOPIC, q: q.q, img: null, imageOptions: false,
    options: order.map((i) => ({ text: q.o[i] })), correct: order.indexOf(0),
    explain: q.e, ref: q.r, seed, video: true,
  };
}

// Inline clip player for the test screen. Returns { destroy }.
export function mountCaseVideo(holder, video) {
  const wrap = h('div', { class: 'vid-wrap' });
  const bar = h('div', { class: 'vid-bar' }, h('i', { style: { width: '0%' } }));
  const overlay = h('div', { class: 'vid-overlay' }, 'Loading clip…');
  wrap.appendChild(bar);
  wrap.appendChild(overlay);
  holder.appendChild(wrap);
  let p = null;
  let dead = false;
  import('./player.js').then(async ({ ClipPlayer }) => {
    if (dead) return;
    p = new ClipPlayer(wrap, { mode: 'video' });
    wrap.insertBefore(p.r.domElement, bar);
    const clip = makeClip(video.seed, { template: video.template, env: video.env, short: true });
    await p.load(clip);
    if (dead) { p.dispose(); return; }
    const showPlay = (label) => {
      overlay.innerHTML = '';
      overlay.style.display = '';
      overlay.appendChild(h('button', { class: 'btn', onclick: () => { overlay.style.display = 'none'; p.seek(0); p.play(); } }, label));
    };
    p.onTick = (t) => { bar.firstChild.style.width = `${(100 * t) / clip.duration}%`; };
    p.onEnd = () => showPlay('Watch again');
    showPlay('Play clip');
  }).catch((e) => { overlay.textContent = `The clip couldn't be played: ${e.message || e}`; });
  return {
    destroy() {
      dead = true;
      if (p) p.dispose();
      wrap.remove();
    },
  };
}
