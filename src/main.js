import * as THREE from 'three';

const $ = id => document.getElementById(id);
const LSget = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } };
const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const isTouch = matchMedia('(pointer:coarse)').matches;
const cfg = Object.assign({ audio: true, quality: 'mid', ctrl: isTouch ? 'joy' : 'key', lang: 'id' }, LSget('spacex_cfg', {}));
const getHi = () => LSget('spacex_highscore', 0), setHi = v => LSset('spacex_highscore', v);

const T = {
  id: { over: 'Game Over', score: 'Skor', best: 'Rekor', time: 'Waktu', boss: 'Boss dikalahkan', again: 'Main lagi', menu: 'Menu', settings: 'Pengaturan', audio: 'Audio', quality: 'Kualitas', ctrl: 'Kontrol', lang: 'Bahasa', on: 'Nyala', off: 'Mati', low: 'Rendah', mid: 'Sedang', high: 'Tinggi', key: 'Keyboard', joy: 'Joystick', drag: 'Drag', close: 'Lanjut', ult: 'ULTI', dmg: 'Damage', rate: 'Tembak', shots: 'peluru', shield: 'Kebal' },
  en: { over: 'Game Over', score: 'Score', best: 'Best', time: 'Time', boss: 'Bosses defeated', again: 'Play again', menu: 'Menu', settings: 'Settings', audio: 'Audio', quality: 'Quality', ctrl: 'Controls', lang: 'Language', on: 'On', off: 'Off', low: 'Low', mid: 'Medium', high: 'High', key: 'Keyboard', joy: 'Joystick', drag: 'Drag', close: 'Resume', ult: 'ULTI', dmg: 'Damage', rate: 'Fire rate', shots: 'shots', shield: 'Shield' }
};
const tr = k => T[cfg.lang][k];
const QM = { low: { m: .35, dpr: 1 }, mid: { m: .7, dpr: 1.5 }, high: { m: 1.2, dpr: 2 } };
const Q = () => QM[cfg.quality];
// inset poni/kamera (dikirim dari Android lewat MainActivity)
const ins = { l: 0, t: 0, r: 0, b: 0 };
window.setInsets = (l, t, r, b) => {
  Object.assign(ins, { l, t, r, b }); const s = document.documentElement.style;
  s.setProperty('--sal', l + 'px'); s.setProperty('--sat', t + 'px'); s.setProperty('--sar', r + 'px'); s.setProperty('--sab', b + 'px');
};
if (window.__ins) window.setInsets(...window.__ins);

// ================= AUDIO (sintetis) =================
let ac = null, master, sfxG, musG, step = 0;
function initAudio() {
  if (ac) { ac.resume && ac.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  ac = new C(); master = ac.createGain(); master.connect(ac.destination);
  sfxG = ac.createGain(); sfxG.connect(master); musG = ac.createGain(); musG.gain.value = .5; musG.connect(master);
  applyAudio();
  const bass = [55, 55, 82.4, 73.4], arp = [220, 261.6, 329.6, 261.6, 220, 293.7, 349.2, 293.7];
  setInterval(() => {
    if (!cfg.audio || ac.state !== 'running') return;
    tone(arp[step % 8], .22, 'triangle', .05, 0, 0, musG);
    if (step % 4 === 0) tone(bass[(step >> 2) % 4], .9, 'sine', .12, 0, 0, musG);
    step++;
  }, 260);
}
function applyAudio() { if (master) master.gain.value = cfg.audio ? 1 : 0; }
function tone(f, d, type = 'square', vol = .1, slide = 0, when = 0, dest) {
  if (!ac || !cfg.audio) return;
  const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(dest || sfxG); o.start(t); o.stop(t + d + .02);
}
function noise(d, vol = .2, lp = 1200) {
  if (!ac || !cfg.audio) return;
  const n = Math.floor(ac.sampleRate * d), b = ac.createBuffer(1, n, ac.sampleRate), a = b.getChannelData(0);
  for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = b; f.type = 'lowpass'; f.frequency.value = lp; g.gain.value = vol; s.connect(f); f.connect(g); g.connect(sfxG); s.start();
}
const sfx = {
  shoot: () => tone(900, .06, 'square', .025, -500),
  hit: () => tone(220, .05, 'square', .04),
  boom: () => { noise(.35, .25, 900); tone(90, .3, 'sawtooth', .1, -60); },
  pick: () => { tone(523, .08, 'triangle', .12); tone(659, .08, 'triangle', .12, 0, .07); tone(784, .12, 'triangle', .12, 0, .14); },
  hurt: () => { noise(.3, .3, 600); tone(160, .35, 'sawtooth', .18, -110); },
  siren: () => { for (let i = 0; i < 4; i++) tone(i % 2 ? 900 : 520, .5, 'sawtooth', .07, i % 2 ? -380 : 380, i * .5); },
  ult: () => { noise(.9, .35, 2500); tone(110, .9, 'sawtooth', .2, 500); },
  bossDie: () => { noise(1, .4, 700); tone(70, 1, 'sawtooth', .22, -40); }
};

// ================= SCENE =================
const renderer = new THREE.WebGLRenderer({ antialias: true });
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x03050d);
const VH = 10; let VW = 16;
const cam = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 100); cam.position.z = 20;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q().dpr)); renderer.setSize(w, h);
  VW = VH * w / h; cam.left = -VW / 2; cam.right = VW / 2; cam.top = VH / 2; cam.bottom = -VH / 2; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
scene.add(new THREE.AmbientLight(0x8899bb, .7));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3, 5, 8); scene.add(sun);

const layers = [.6, 1.6].map((spd, i) => {
  const n = 120, pos = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { pos[k * 3] = (Math.random() - .5) * 40; pos[k * 3 + 1] = (Math.random() - .5) * VH * 1.4; pos[k * 3 + 2] = -5 - i; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: i ? 0xffffff : 0x7f95c9, size: i ? 3 : 2, sizeAttenuation: false }));
  scene.add(p); return { p, spd, pos };
});

const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, metalness: .3, roughness: .5, emissive: e });
// pesawat
const ship = new THREE.Group();
const flame = new THREE.Mesh(new THREE.ConeGeometry(.16, .6, 6).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb347 })); flame.position.x = -1.05;
const wing = new THREE.Mesh(new THREE.BoxGeometry(.55, 1.7, .1), mat(0x3aa7d9)); wing.position.x = -.35;
const tail = new THREE.Mesh(new THREE.BoxGeometry(.4, .12, .5), mat(0x3aa7d9)); tail.position.x = -.6;
const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), mat(0x4de1ff, 0x1b6f88)); cockpit.position.set(.1, 0, .22);
const shieldM = new THREE.Mesh(new THREE.SphereGeometry(1.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: .25 })); shieldM.visible = false;
ship.add(new THREE.Mesh(new THREE.ConeGeometry(.32, 1.5, 6).rotateZ(-Math.PI / 2), mat(0xdfe8f5)), wing, tail, cockpit, flame, shieldM);
ship.rotation.x = .35; scene.add(ship);

// batu
const TYPES = [
  { hp: 1, r: .35, c: 0x8a8f99, pts: 10, w: 50, d: [['dmg', .03]] }, { hp: 2, r: .5, c: 0xb08968, pts: 25, w: 28, d: [['dmg', .03]] },
  { hp: 4, r: .7, c: 0xe07a3f, pts: 50, w: 15, d: [['s3', .06]] }, { hp: 7, r: .95, c: 0xd62839, pts: 70, w: 7, d: [['s5', .03], ['rate', .10]] }
];
const PUSHER = { hp: 5, r: .62, c: 0xb14dff, pts: 100, sp: true, d: [['shield', .03]] };
const rockGeo = new THREE.IcosahedronGeometry(1, 1);
{ const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = .82 + Math.random() * .36; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } rockGeo.computeVertexNormals(); }
const pushGeo = new THREE.OctahedronGeometry(1, 0);
function pickType() { let r = Math.random() * 100; for (const t of TYPES) { if ((r -= t.w) < 0) return t; } return TYPES[0]; }

// partikel
const pGeo = new THREE.BoxGeometry(.09, .09, .09);
let parts = [], rings = [];
function burst(x, y, color, n, spd) {
  n = Math.max(2, Math.round(n * Q().m));
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pGeo, new THREE.MeshBasicMaterial({ color, transparent: true }));
    m.position.set(x, y, 0); const a = Math.random() * 6.283, s = spd * (.3 + Math.random());
    parts.push({ m, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .5 + Math.random() * .4, max: .9 }); scene.add(m);
  }
}
function ring(x, y, color, size) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8 }));
  m.position.set(x, y, 0); m.scale.setScalar(size * .3); scene.add(m); rings.push({ m, size, t: 0 });
}
const explode = (x, y, t) => { burst(x, y, t.c, 22, 5); burst(x, y, 0xffd27a, 14, 6); ring(x, y, 0xffe2a8, t.r * 2.2); sfx.boom(); };

// buff
const BUFFS = [{ k: 'dmg', c: 0xffa133, w: 60 }, { k: 'rate', c: 0x5dff8a, w: 40 }, { k: 's3', c: 0x4de1ff, w: 25 }, { k: 's5', c: 0xc77dff, w: 10 }, { k: 'shield', c: 0xdfe8ff, w: 3 }];
const BUFF_W = BUFFS.reduce((a, b) => a + b.w, 0);
const DMG_STEP = 1.10, RATE_STEP = 1.075, SIDE_DIV = 5, PUSH_TAKE = .7, PUSH_DASH = 10;
const orbGeo = new THREE.SphereGeometry(.28, 14, 10), halGeo = new THREE.TorusGeometry(.42, .03, 6, 20);

// peluru
const bGeo = new THREE.CylinderGeometry(.05, .05, .55, 6).rotateZ(Math.PI / 2);
const bMat = new THREE.MeshBasicMaterial({ color: 0x4de1ff }), bMatS = new THREE.MeshBasicMaterial({ color: 0x9fb8ff });

// ================= STATE =================
let state = 'menu', prevState = 'menu', rocks = [], bullets = [], orbs = [], boss = null;
let score, time, hp, invuln, cd, spawnT, bossKills, bossSpawned, bossTimer, warn, cdT;
let nDmg, nRate, shots, shield, ultN, ultPts;
const keys = { l: 0, r: 0, u: 0, d: 0 };
let target = null, grab = { x: 0, y: 0 }, joyV = { x: 0, y: 0 };
const BASE_FIRE = .35; // lebih pelan dari sebelumnya (.25)

function resetStats() {
  score = 0; time = 0; hp = 3; invuln = 0; cd = .3; spawnT = .5; bossKills = 0; bossSpawned = 0; bossTimer = 30; warn = 0;
  nDmg = 0; nRate = 0; shots = 1; shield = false; ultN = 0; ultPts = 0;
}
resetStats();
const cache = {};
function put(id, v, html) { if (cache[id] !== v) { cache[id] = v; const e = $(id); html ? e.innerHTML = v : e.textContent = v; } }
function hud() {
  put('score', score);
  put('time', String(Math.floor(time / 60)).padStart(2, '0') + ':' + String(Math.floor(time % 60)).padStart(2, '0'));
  const h = Math.max(hp, 0); put('hearts', '\u2665'.repeat(h) + '<span class="dim">' + '\u2665'.repeat(3 - h) + '</span>', true);
  const b = [];
  if (nDmg) b.push(`${tr('dmg')} \u00d7${(DMG_STEP ** nDmg).toFixed(2)}`);
  if (nRate) b.push(`${tr('rate')} +${Math.round((RATE_STEP ** nRate - 1) * 100)}%`);
  if (shots > 1) b.push(`${shots} ${tr('shots')}`);
  if (shield) b.push(tr('shield'));
  put('buffs', b.join('  \u00b7  '));
  put('ultN', `${tr('ult')} \u00d7${ultN}`);
  const bar = $('ultBar'), pct = ultN >= 3 ? 100 : ultPts; if (cache.bar !== pct) { cache.bar = pct; bar.style.width = pct + '%'; }
  $('ult').classList.toggle('ready', ultN > 0);
  if (boss) { const w = Math.max(0, boss.hp / boss.max * 100); if (cache.bw !== w) { cache.bw = w; $('bossFill').style.width = w + '%'; } }
}
function clearAll() {
  [...rocks, ...bullets, ...parts, ...rings, ...orbs].forEach(o => scene.remove(o.m));
  if (boss) scene.remove(boss.g);
  rocks = []; bullets = []; parts = []; rings = []; orbs = []; boss = null;
  $('bossbar').style.display = 'none'; $('danger').classList.remove('on');
}
function startRun() {
  initAudio(); clearAll(); resetStats(); ship.position.set(-VW / 2 + 1.6 + ins.l / innerWidth * VW, 0, 0); target = null;
  $('menu').classList.remove('on'); $('over').classList.remove('on'); document.body.classList.add('ingame');
  state = 'count'; cdT = 3; hud();
}
function gameOver() {
  state = 'over'; const best = getHi(); if (score > best) setHi(score);
  document.body.classList.remove('ingame'); $('danger').classList.remove('on'); $('bossbar').style.display = 'none';
  $('overTitle').textContent = tr('over');
  $('stats').innerHTML = `<span>${tr('score')}</span><b>${score}</b><span>${tr('best')}</span><b>${Math.max(score, best)}</b><span>${tr('time')}</span><b>${cache.time}</b><span>${tr('boss')}</span><b>${bossKills}</b>`;
  $('againBtn').textContent = tr('again'); $('menuBtn').textContent = tr('menu'); $('over').classList.add('on');
}
$('playBtn').onclick = startRun; $('againBtn').onclick = startRun;
$('menuBtn').onclick = () => { clearAll(); state = 'menu'; document.body.classList.remove('ingame'); $('over').classList.remove('on'); $('menu').classList.add('on'); };
addEventListener('pointerdown', initAudio, { once: true });

// ================= SETTINGS =================
function applyUI() {
  document.querySelectorAll('[data-i]').forEach(e => e.textContent = tr(e.dataset.i));
  document.querySelectorAll('.seg').forEach(s => s.querySelectorAll('button').forEach(b => b.classList.toggle('act', b.dataset.v === String(cfg[s.dataset.key]))));
  document.body.classList.toggle('joy', cfg.ctrl === 'joy');
  Object.keys(cache).forEach(k => delete cache[k]); hud();
}
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => {
  const k = b.parentElement.dataset.key, v = b.dataset.v; cfg[k] = v === 'true' ? true : v === 'false' ? false : v;
  LSset('spacex_cfg', cfg); if (k === 'audio') applyAudio(); if (k === 'quality') resize(); applyUI();
});
$('gear').onclick = () => {
  if ($('settings').classList.contains('on')) return;
  prevState = state; if (state === 'play' || state === 'count') state = 'paused';
  $('settings').classList.add('on');
};
$('closeSet').onclick = () => {
  $('settings').classList.remove('on');
  if (state === 'paused') { state = 'count'; cdT = 3; }
};
applyUI();

// ================= INPUT =================
const K = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' };
addEventListener('keydown', e => {
  const k = K[e.key]; if (k) { keys[k] = 1; e.preventDefault(); }
  if (e.key === ' ' || e.key === 'q' || e.key === 'e') { e.preventDefault(); useUlt(); }
});
addEventListener('keyup', e => { const k = K[e.key]; if (k) keys[k] = 0; });
const wx = e => (e.clientX / innerWidth - .5) * VW, wy = e => -(e.clientY / innerHeight - .5) * VH;
const cv = renderer.domElement;
cv.addEventListener('pointerdown', e => { if (cfg.ctrl !== 'drag') return; grab = { x: ship.position.x - wx(e), y: ship.position.y - wy(e) }; target = { x: ship.position.x, y: ship.position.y }; });
cv.addEventListener('pointermove', e => { if (target && cfg.ctrl === 'drag') target = { x: wx(e) + grab.x, y: wy(e) + grab.y }; });
addEventListener('pointerup', () => { target = null; });
// joystick virtual
let jOrigin = null, jId = null;
const jz = $('joy'), jb = $('jBase'), jk = $('jKnob');
jz.addEventListener('pointerdown', e => {
  jId = e.pointerId; jOrigin = { x: e.clientX, y: e.clientY };
  jb.style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px`; jk.style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px`;
});
jz.addEventListener('pointermove', e => {
  if (e.pointerId !== jId) return;
  let dx = e.clientX - jOrigin.x, dy = e.clientY - jOrigin.y; const l = Math.hypot(dx, dy), R = 55;
  if (l > R) { dx = dx / l * R; dy = dy / l * R; }
  joyV = { x: dx / R, y: -dy / R }; jk.style.left = jOrigin.x + dx + 'px'; jk.style.top = jOrigin.y + dy + 'px';
});
const jEnd = e => { if (e.pointerId !== jId) return; jId = null; joyV = { x: 0, y: 0 }; jb.style.display = jk.style.display = 'none'; };
jz.addEventListener('pointerup', jEnd); jz.addEventListener('pointercancel', jEnd);
$('ult').addEventListener('pointerdown', e => { e.preventDefault(); useUlt(); });

// ================= GAMEPLAY =================
function dropBuff(x, y, k) {
  const b = BUFFS.find(z => z.k === k);
  const m = new THREE.Mesh(orbGeo, new THREE.MeshStandardMaterial({ color: b.c, emissive: b.c, emissiveIntensity: .8, roughness: .3 }));
  const h = new THREE.Mesh(halGeo, new THREE.MeshBasicMaterial({ color: b.c })); m.add(h); m.position.set(x, y, 0); scene.add(m); orbs.push({ m, b, h });
}
function pickBuff(b) {
  if (b.k === 'dmg') nDmg++; else if (b.k === 'rate') nRate++; else if (b.k === 's3') shots = Math.max(shots, 3);
  else if (b.k === 's5') shots = 5; else shield = true;
  if (ultN < 3) { ultPts += 25; if (ultPts >= 100) { ultN++; ultPts = ultN >= 3 ? 0 : ultPts - 100; } }
  sfx.pick(); ring(ship.position.x, ship.position.y, b.c, 1.6);
}
function destroyRock(r, drop) {
  r.dead = true; explode(r.m.position.x, r.m.position.y, r.t); score += r.t.pts;
  if (drop) for (const [k, pr] of r.t.d) if (Math.random() < pr) { dropBuff(r.m.position.x, r.m.position.y, k); break; } // maks 1 buff per batu
}
function makeBoss() {
  const g = new THREE.Group(), wall = new THREE.Mesh(new THREE.BoxGeometry(1.4, VH + 2, 1), mat(0x2b3550, 0x050810));
  g.add(wall);
  for (let i = -4; i <= 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, .18, 1.1), mat(0x111827, 0x3a0a14)); s.position.y = i * VH / 8.5; g.add(s); }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.8, 1), new THREE.MeshStandardMaterial({ color: 0xff3b4d, emissive: 0xff1f33, emissiveIntensity: 1.2, flatShading: true }));
  core.position.set(-.75, 0, .5); g.add(core);
  const max = Math.ceil(60 * 1.5 ** bossSpawned); bossSpawned++;
  g.position.set(VW / 2 + .7, 0, 0); scene.add(g);
  boss = { g, wall, core, hp: max, max, flash: 0 }; $('bossbar').style.display = 'block'; cache.bw = -1;
}
function clearRocks() { for (const r of rocks) if (!r.dead) destroyRock(r, false); }
function killBoss() {
  score += 300; bossKills++; ring(boss.g.position.x, 0, 0xffb347, 7); burst(boss.g.position.x, 0, 0xff4d5e, 60, 8); sfx.bossDie();
  scene.remove(boss.g); boss = null; $('bossbar').style.display = 'none'; bossTimer = 30; clearRocks();
}
function damageBoss(d) {
  boss.hp -= d; boss.flash = .08; boss.wall.material.emissive.setHex(0x888888);
  if (boss.hp <= 1e-6) killBoss();
}
function hurt() {
  hp--; invuln = 2; sfx.hurt(); if (hp <= 0) { hud(); gameOver(); }
}
function useUlt() {
  if (state !== 'play' || ultN <= 0) return;
  ultN--; invuln = 2; sfx.ult(); ring(ship.position.x, ship.position.y, 0xffffff, 14);
  for (const r of rocks) if (!r.dead) destroyRock(r, false);
  if (boss) damageBoss(100 * (1 + .1 * bossKills));
}
function fire() {
  const p = ship.position, dm = DMG_STEP ** nDmg;
  const A = shots === 5 ? [0, .17, -.17, .34, -.34] : shots === 3 ? [0, .2, -.2] : [0];
  A.forEach((a, i) => {
    const m = new THREE.Mesh(bGeo, i ? bMatS : bMat); m.position.set(p.x + .9, p.y, 0); m.rotation.z = a; scene.add(m);
    bullets.push({ m, vx: Math.cos(a) * 16, vy: Math.sin(a) * 16, d: i ? dm / SIDE_DIV : dm });
  });
  sfx.shoot();
}

function update(dt) {
  time += dt; invuln = Math.max(0, invuln - dt);
  const p = ship.position;
  let dx = keys.r - keys.l, dy = keys.u - keys.d;
  if (cfg.ctrl === 'joy') { dx += joyV.x; dy += joyV.y; }
  const l = Math.hypot(dx, dy);
  if (l > .05) { const s = 7 * Math.min(1, l) / l; p.x += dx * s * dt; p.y += dy * s * dt; }
  else if (target) { const f = Math.min(1, 14 * dt); p.x += (target.x - p.x) * f; p.y += (target.y - p.y) * f; }
  p.x = THREE.MathUtils.clamp(p.x, -VW / 2 + .9 + ins.l / innerWidth * VW, VW / 2 - .9 - ins.r / innerWidth * VW); p.y = THREE.MathUtils.clamp(p.y, -VH / 2 + .8, VH / 2 - .8);
  ship.visible = invuln <= 0 || Math.floor(invuln * 10) % 2 === 0; shieldM.visible = shield;
  flame.scale.x = .8 + Math.random() * .5;

  cd -= dt; if (cd <= 0) { cd = BASE_FIRE / RATE_STEP ** nRate; fire(); }

  const diffS = 1.02 ** bossKills, diffN = 1.05 ** bossKills, base = (VW + 3) / 8 * diffS;
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 1 / (diffN * 2.5);
    const t = bossKills >= 3 && Math.random() < .12 ? PUSHER : pickType();
    const m = new THREE.Mesh(t.sp ? pushGeo : rockGeo, new THREE.MeshStandardMaterial({ color: t.c, flatShading: true, roughness: .9, emissive: t.sp ? 0x3a1060 : 0x000000 }));
    m.scale.setScalar(t.r); m.position.set(VW / 2 + 1.5, (Math.random() - .5) * (VH - 1.6), 0); scene.add(m);
    const r = { m, t, hp: t.hp, base: t.sp ? 0x3a1060 : 0, flash: 0, spin: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1) };
    if (t.sp) { r.ph = 'in'; r.stopX = -VW / 2 + .4 * VW + Math.random() * (.6 * VW - 1.2); } // berhenti di 60% bagian kanan layar
    rocks.push(r);
  }
  for (const r of rocks) {
    const x = r.m.position;
    if (r.t.sp) {
      if (r.ph === 'in') { x.x -= base * dt; if (x.x <= r.stopX) { r.ph = 'wait'; r.w = 1; } }
      else if (r.ph === 'wait') { r.w -= dt; if (r.w <= 0) r.ph = 'dash'; }
      else x.x -= base * PUSH_DASH * dt;
    } else x.x -= base * dt;
    r.m.rotation.x += r.spin.x * dt; r.m.rotation.y += r.spin.y * dt; r.m.rotation.z += r.spin.z * dt;
    if (r.flash > 0 && (r.flash -= dt) <= 0) r.m.material.emissive.setHex(r.base);
    if (x.x < -VW / 2 - 2) r.dead = true;
  }
  for (const o of orbs) {
    o.m.position.x -= base * dt; o.h.rotation.x += 2 * dt; o.h.rotation.y += 3 * dt;
    if (Math.hypot(o.m.position.x - p.x, o.m.position.y - p.y) < .75) { o.dead = true; pickBuff(o.b); }
    if (o.m.position.x < -VW / 2 - 1) o.dead = true;
  }
  for (const b of bullets) {
    b.m.position.x += b.vx * dt; b.m.position.y += b.vy * dt;
    const bp = b.m.position;
    if (bp.x > VW / 2 + 1 || Math.abs(bp.y) > VH / 2 + 1) { b.dead = true; continue; }
    if (boss && bp.x >= boss.g.position.x - .8 && bp.x <= boss.g.position.x + .7) {
      b.dead = true; burst(bp.x, bp.y, 0xffb0a0, 5, 3); sfx.hit(); damageBoss(b.d); if (!boss && state !== 'play') return; continue;
    }
    for (const r of rocks) {
      if (r.dead) continue;
      if (Math.hypot(r.m.position.x - bp.x, r.m.position.y - bp.y) < r.t.r + .1) {
        b.dead = true; r.hp -= b.d * (r.t.sp ? PUSH_TAKE : 1);
        if (r.hp <= 1e-6) destroyRock(r, true);
        else { r.m.material.emissive.setHex(0xffffff); r.flash = .08; burst(bp.x, bp.y, 0xfff1c9, 6, 3.5); sfx.hit(); }
        break;
      }
    }
  }
  // batu nabrak pesawat
  for (const r of rocks) {
    if (r.dead || Math.hypot(r.m.position.x - p.x, r.m.position.y - p.y) >= r.t.r * .9 + .4) continue;
    destroyRock(r, false);
    if (invuln > 0) continue;
    if (shield) { shield = false; sfx.pick(); } else { hurt(); if (state !== 'play') return; }
  }
  // boss
  if (boss) {
    boss.g.position.x -= (VW + .7) / 15 * dt;
    boss.core.scale.setScalar(1 + Math.sin(time * 6) * .12); boss.core.rotation.y += dt;
    if (boss.flash > 0 && (boss.flash -= dt) <= 0) boss.wall.material.emissive.setHex(0x050810);
    if (invuln <= 0 && Math.abs(boss.g.position.x - p.x) < .7 + .35) {
      boss.hp *= .5; hurt(); if (state !== 'play') return;
      if (boss.hp < boss.max * .3) killBoss();
    }
    if (boss && boss.g.position.x <= -VW / 2) { // lolos sampai kiri
      scene.remove(boss.g); boss = null; $('bossbar').style.display = 'none'; bossTimer = 30; hurt(); if (state !== 'play') return;
    }
  } else if (warn > 0) {
    warn -= dt; if (warn <= 0) { $('danger').classList.remove('on'); makeBoss(); }
  } else if ((bossTimer -= dt) <= 0) {
    warn = 2; $('danger').classList.add('on'); sfx.siren();
  }
  hud();
}
function cleanup(dt) {
  for (const o of [...rocks, ...bullets, ...orbs]) if (o.dead) { scene.remove(o.m); if (o.t || o.b) o.m.material.dispose(); }
  rocks = rocks.filter(o => !o.dead); bullets = bullets.filter(o => !o.dead); orbs = orbs.filter(o => !o.dead);
  parts = parts.filter(o => {
    o.life -= dt; o.m.position.x += o.vx * dt; o.m.position.y += o.vy * dt; o.m.material.opacity = Math.max(0, o.life / o.max);
    if (o.life <= 0) { scene.remove(o.m); o.m.material.dispose(); return false; } return true;
  });
  rings = rings.filter(o => {
    o.t += dt * 3.5; o.m.scale.setScalar(o.size * (.3 + o.t)); o.m.material.opacity = Math.max(0, .8 - o.t);
    if (o.t >= .8) { scene.remove(o.m); o.m.geometry.dispose(); o.m.material.dispose(); return false; } return true;
  });
}
let last = performance.now();
renderer.setAnimationLoop(now => {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (state !== 'paused') {
    for (const l of layers) {
      for (let k = 0; k < l.pos.length; k += 3) { l.pos[k] -= l.spd * dt; if (l.pos[k] < -20) l.pos[k] = 20; }
      l.p.geometry.attributes.position.needsUpdate = true;
    }
  }
  const c = $('count');
  if (state === 'count') {
    cdT -= dt; c.style.display = 'flex'; c.textContent = Math.max(1, Math.ceil(cdT));
    if (cdT <= 0) { state = 'play'; c.style.display = 'none'; }
  } else c.style.display = 'none';
  if (state === 'play') update(dt);
  if (state !== 'menu' && state !== 'paused') cleanup(dt);
  renderer.render(scene, cam);
});
