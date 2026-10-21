import * as THREE from 'three';

const $ = id => document.getElementById(id);
const L = { // teks UI (tahap 3: tambah English + pilihan bahasa)
  over: 'Game Over', score: 'Skor', best: 'Rekor', time: 'Waktu', boss: 'Boss dikalahkan',
  again: 'Main lagi', menu: 'Menu'
};
const HI_KEY = 'spacex_highscore';
const getHi = () => { try { return +localStorage.getItem(HI_KEY) || 0; } catch { return 0; } };
const setHi = v => { try { localStorage.setItem(HI_KEY, v); } catch {} };

// ---------- scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050d);
const VH = 10; let VW = 16;
const cam = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
cam.position.z = 20;
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); VW = VH * w / h;
  cam.left = -VW / 2; cam.right = VW / 2; cam.top = VH / 2; cam.bottom = -VH / 2;
  cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
scene.add(new THREE.AmbientLight(0x8899bb, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3, 5, 8); scene.add(sun);

// bintang (2 lapis, bergerak ke kiri)
const layers = [0.6, 1.6].map((spd, i) => {
  const n = 120, pos = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { pos[k*3] = (Math.random() - .5) * 40; pos[k*3+1] = (Math.random() - .5) * VH * 1.4; pos[k*3+2] = -5 - i; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: i ? 0xffffff : 0x7f95c9, size: i ? 3 : 2, sizeAttenuation: false }));
  scene.add(p); return { p, spd, pos };
});

// ---------- pesawat low-poly ----------
const ship = new THREE.Group();
const mat = (c, e = 0) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, metalness: .3, roughness: .5, emissive: e });
const body = new THREE.Mesh(new THREE.ConeGeometry(.32, 1.5, 6).rotateZ(-Math.PI / 2), mat(0xdfe8f5));
const wing = new THREE.Mesh(new THREE.BoxGeometry(.55, 1.7, .1), mat(0x3aa7d9));
wing.position.x = -.35;
const tail = new THREE.Mesh(new THREE.BoxGeometry(.4, .12, .5), mat(0x3aa7d9)); tail.position.x = -.6;
const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), mat(0x4de1ff, 0x1b6f88)); cockpit.position.set(.1, 0, .22);
const flame = new THREE.Mesh(new THREE.ConeGeometry(.16, .6, 6).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
flame.position.x = -1.05;
ship.add(body, wing, tail, cockpit, flame); ship.rotation.x = .35; scene.add(ship);

// ---------- batu ----------
const TYPES = [
  { hp: 1, r: .35, c: 0x8a8f99, pts: 10, w: 50 },
  { hp: 2, r: .5,  c: 0xb08968, pts: 25, w: 28 },
  { hp: 4, r: .7,  c: 0xe07a3f, pts: 50, w: 15 },
  { hp: 7, r: .95, c: 0xd62839, pts: 70, w: 7 }
];
const rockGeo = new THREE.IcosahedronGeometry(1, 1);
{ const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const k = .82 + Math.random() * .36; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } rockGeo.computeVertexNormals(); }
function pickType() { let r = Math.random() * 100; for (const t of TYPES) { if ((r -= t.w) < 0) return t; } return TYPES[0]; }

// ---------- partikel ----------
const pGeo = new THREE.BoxGeometry(.09, .09, .09), pMats = {};
const pMat = c => pMats[c] || (pMats[c] = new THREE.MeshBasicMaterial({ color: c, transparent: true }));
let parts = [];
function burst(x, y, color, n, spd) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(pGeo, pMat(color).clone()); m.position.set(x, y, 0);
    const a = Math.random() * 6.283, s = spd * (.3 + Math.random());
    parts.push({ m, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: .5 + Math.random() * .4, max: .9 });
    scene.add(m);
  }
}
let rings = [];
function ring(x, y, color, size) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8 }));
  m.position.set(x, y, 0); m.scale.setScalar(size * .3); scene.add(m); rings.push({ m, size, t: 0 });
}
function explode(x, y, t) { burst(x, y, t.c, 22, 5); burst(x, y, 0xffd27a, 14, 6); ring(x, y, 0xffe2a8, t.r * 2.2); }

// ---------- state ----------
let state = 'menu', rocks = [], bullets = [], score = 0, time = 0, hp = 3, invuln = 0, cd = 0, spawnT = 0, bossKills = 0;
const keys = { l: 0, r: 0, u: 0, d: 0 };
let target = null, grab = { x: 0, y: 0 };
const SHIP_X = () => -VW / 2 + 1.6;

function hud() {
  $('score').textContent = score;
  $('time').textContent = String(Math.floor(time / 60)).padStart(2, '0') + ':' + String(Math.floor(time % 60)).padStart(2, '0');
  $('hearts').innerHTML = '\u2665'.repeat(Math.max(hp, 0)) + '<span class="dim">' + '\u2665'.repeat(3 - Math.max(hp, 0)) + '</span>';
}
function clearAll() {
  [...rocks, ...bullets, ...parts, ...rings].forEach(o => scene.remove(o.m));
  rocks = []; bullets = []; parts = []; rings = [];
}
function startRun() {
  clearAll(); score = 0; time = 0; hp = 3; invuln = 0; cd = 0; spawnT = .5; bossKills = 0;
  ship.position.set(SHIP_X(), 0, 0); target = null; hud();
  $('menu').classList.remove('on'); $('over').classList.remove('on'); $('hud').style.display = 'flex';
  state = 'count'; let n = 3; const c = $('count'); c.style.display = 'flex'; c.textContent = n;
  const iv = setInterval(() => {
    n--; if (n > 0) c.textContent = n; else { clearInterval(iv); c.style.display = 'none'; state = 'play'; }
  }, 1000);
}
function gameOver() {
  state = 'over'; const best = getHi(); if (score > best) setHi(score);
  $('hud').style.display = 'none';
  $('overTitle').textContent = L.over;
  $('stats').innerHTML = `<span>${L.score}</span><b>${score}</b><span>${L.best}</span><b>${Math.max(score, best)}</b><span>${L.time}</span><b>${$('time').textContent}</b><span>${L.boss}</span><b>${bossKills}</b>`;
  $('againBtn').textContent = L.again; $('menuBtn').textContent = L.menu;
  $('over').classList.add('on');
}
$('playBtn').onclick = startRun; $('againBtn').onclick = startRun;
$('menuBtn').onclick = () => { clearAll(); state = 'menu'; $('over').classList.remove('on'); $('menu').classList.add('on'); };

// ---------- input ----------
const K = { ArrowLeft: 'l', a: 'l', ArrowRight: 'r', d: 'r', ArrowUp: 'u', w: 'u', ArrowDown: 'd', s: 'd' };
addEventListener('keydown', e => { const k = K[e.key]; if (k) { keys[k] = 1; e.preventDefault(); } });
addEventListener('keyup', e => { const k = K[e.key]; if (k) keys[k] = 0; });
const wx = e => (e.clientX / innerWidth - .5) * VW, wy = e => -(e.clientY / innerHeight - .5) * VH;
renderer.domElement.addEventListener('pointerdown', e => { grab = { x: ship.position.x - wx(e), y: ship.position.y - wy(e) }; target = { x: ship.position.x, y: ship.position.y }; });
renderer.domElement.addEventListener('pointermove', e => { if (target) target = { x: wx(e) + grab.x, y: wy(e) + grab.y }; });
addEventListener('pointerup', () => { target = null; });

// ---------- loop ----------
function destroyRock(r, giveScore) {
  r.dead = true; explode(r.m.position.x, r.m.position.y, r.t); if (giveScore) score += r.t.pts;
}
function update(dt) {
  time += dt; invuln = Math.max(0, invuln - dt);
  // gerak pesawat
  const dx = keys.r - keys.l, dy = keys.u - keys.d, p = ship.position;
  if (dx || dy) { const l = Math.hypot(dx, dy); p.x += dx / l * 7 * dt; p.y += dy / l * 7 * dt; }
  else if (target) { const f = Math.min(1, 14 * dt); p.x += (target.x - p.x) * f; p.y += (target.y - p.y) * f; }
  p.x = THREE.MathUtils.clamp(p.x, -VW / 2 + .9, VW / 2 - .9); p.y = THREE.MathUtils.clamp(p.y, -VH / 2 + .8, VH / 2 - .8);
  ship.visible = invuln <= 0 || Math.floor(invuln * 10) % 2 === 0;
  flame.scale.x = .8 + Math.random() * .5;
  // tembak otomatis
  cd -= dt;
  if (cd <= 0) {
    cd = .25;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .55, 6).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4de1ff }));
    m.position.set(p.x + .9, p.y, 0); scene.add(m); bullets.push({ m });
  }
  // spawn batu
  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 1; const t = pickType();
    const m = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: t.c, flatShading: true, roughness: .9, emissive: 0x000000 }));
    m.scale.setScalar(t.r); m.position.set(VW / 2 + 1.5, (Math.random() - .5) * (VH - 1.6), 0);
    scene.add(m); rocks.push({ m, t, hp: t.hp, spin: new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1), flash: 0 });
  }
  const speed = (VW + 3) / 8; // lewat layar sekitar 8 detik
  for (const r of rocks) {
    r.m.position.x -= speed * dt; r.m.rotation.x += r.spin.x * dt; r.m.rotation.y += r.spin.y * dt; r.m.rotation.z += r.spin.z * dt;
    if (r.flash > 0 && (r.flash -= dt) <= 0) r.m.material.emissive.setHex(0);
    if (r.m.position.x < -VW / 2 - 2) { r.dead = true; r.silent = true; }
  }
  for (const b of bullets) {
    b.m.position.x += 16 * dt; if (b.m.position.x > VW / 2 + 1) b.dead = true;
    if (b.dead) continue;
    for (const r of rocks) {
      if (r.dead) continue;
      if (Math.hypot(r.m.position.x - b.m.position.x, r.m.position.y - b.m.position.y) < r.t.r + .1) {
        b.dead = true; r.hp -= 1;
        if (r.hp <= 0) destroyRock(r, true);
        else { r.m.material.emissive.setHex(0xffffff); r.flash = .08; burst(b.m.position.x, b.m.position.y, 0xfff1c9, 6, 3.5); }
        break;
      }
    }
  }
  // batu nabrak pesawat
  for (const r of rocks) {
    if (r.dead) continue;
    if (Math.hypot(r.m.position.x - p.x, r.m.position.y - p.y) < r.t.r * .9 + .4) {
      destroyRock(r, true);
      if (invuln <= 0) { hp--; invuln = 2; if (hp <= 0) { hud(); gameOver(); } }
    }
  }
  hud();
}
function cleanup(dt) {
  for (const o of [...rocks, ...bullets]) if (o.dead) { scene.remove(o.m); o.m.material.dispose?.(); if (o.t) { /* geo dipakai bersama */ } }
  rocks = rocks.filter(o => !o.dead); bullets = bullets.filter(o => !o.dead);
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
  for (const l of layers) {
    for (let k = 0; k < l.pos.length; k += 3) { l.pos[k] -= l.spd * dt; if (l.pos[k] < -20) l.pos[k] = 20; }
    l.p.geometry.attributes.position.needsUpdate = true;
  }
  if (state === 'play') update(dt);
  if (state !== 'menu') cleanup(dt);
  renderer.render(scene, cam);
});
