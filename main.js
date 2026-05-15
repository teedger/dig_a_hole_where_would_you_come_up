import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Adjust this if reference markers don't sit on their cities.
// Positive value shifts read-out coordinates eastward.
const LON_OFFSET_DEG = 0;

const canvas = document.getElementById('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 0.8, 3.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.5;
controls.minDistance = 1.25;
controls.maxDistance = 8;
controls.enablePan = false;

scene.add(new THREE.AmbientLight(0x4466aa, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 3, 5);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x6cf6ff, 0.4);
rim.position.set(-4, -2, -3);
scene.add(rim);

const stars = (() => {
  const g = new THREE.BufferGeometry();
  const n = 2500;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 80 + Math.random() * 40;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0xaaddff, size: 0.25, sizeAttenuation: true, transparent: true, opacity: 0.8 });
  return new THREE.Points(g, m);
})();
scene.add(stars);

const earthGroup = new THREE.Group();
scene.add(earthGroup);

const loader = new THREE.TextureLoader();
loader.crossOrigin = 'anonymous';
const earthMap = loader.load('https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg');
const bumpMap = loader.load('https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png');

const earthGeom = new THREE.SphereGeometry(1, 96, 96);
const earthMat = new THREE.MeshPhongMaterial({
  map: earthMap,
  bumpMap: bumpMap,
  bumpScale: 0.02,
  specular: new THREE.Color(0x6cf6ff),
  shininess: 18,
  emissive: new THREE.Color(0x041826),
  emissiveIntensity: 0.6,
});
const earth = new THREE.Mesh(earthGeom, earthMat);
earthGroup.add(earth);

const wire = new THREE.Mesh(
  new THREE.SphereGeometry(1.002, 48, 24),
  new THREE.MeshBasicMaterial({ color: 0x6cf6ff, wireframe: true, transparent: true, opacity: 0.08 })
);
earthGroup.add(wire);

const atmosphereMat = new THREE.ShaderMaterial({
  uniforms: { c: { value: 0.6 }, p: { value: 3.5 }, glowColor: { value: new THREE.Color(0x6cf6ff) } },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPositionNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 glowColor;
    uniform float c;
    uniform float p;
    varying vec3 vNormal;
    varying vec3 vPositionNormal;
    void main() {
      float intensity = pow(c - dot(vNormal, vPositionNormal), p);
      gl_FragColor = vec4(glowColor, 1.0) * intensity;
    }
  `,
  side: THREE.BackSide,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.18, 64, 64), atmosphereMat);
scene.add(atmosphere);

// Reference markers — if these don't sit on their cities visually,
// adjust LON_OFFSET_DEG until they do.
const REF_CITIES = [
  { name: 'London',     lat:  51.51, lon:    -0.13, color: 0xff4d4d },
  { name: 'New York',   lat:  40.71, lon:   -74.01, color: 0xffd24d },
  { name: 'Tokyo',      lat:  35.68, lon:   139.69, color: 0x4dff8b },
  { name: 'Sydney',     lat: -33.87, lon:   151.21, color: 0xff8bff },
  { name: 'Ulaanbaatar',lat:  47.92, lon:   106.92, color: 0x6cf6ff },
];

function makeRefMarker(color) {
  const grp = new THREE.Group();
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 12, 12),
    new THREE.MeshBasicMaterial({ color })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.028, 12, 12),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  grp.add(dot, halo);
  return grp;
}

const refGroup = new THREE.Group();
for (const c of REF_CITIES) {
  const m = makeRefMarker(c.color);
  m.position.copy(latLonToVec(c.lat, c.lon, 1.01));
  m.userData = c;
  refGroup.add(m);
}
earthGroup.add(refGroup);

let spear = null;
let entryMarker = null;
let exitMarker = null;

function makeMarker(color) {
  const grp = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 16, 16),
    new THREE.MeshBasicMaterial({ color })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 16, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  grp.add(core, halo);
  return grp;
}

function clearSpear() {
  for (const o of [spear, entryMarker, exitMarker]) {
    if (o) {
      earthGroup.remove(o);
      o.traverse?.((c) => { c.geometry?.dispose?.(); c.material?.dispose?.(); });
    }
  }
  spear = entryMarker = exitMarker = null;
}

function drawSpear(entryVec, exitVec) {
  clearSpear();
  const tubeLen = entryVec.distanceTo(exitVec);
  const tubeGeom = new THREE.CylinderGeometry(0.006, 0.006, tubeLen, 16, 1, true);
  const tubeMat = new THREE.MeshBasicMaterial({ color: 0xff58d8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  spear = new THREE.Mesh(tubeGeom, tubeMat);
  const mid = entryVec.clone().add(exitVec).multiplyScalar(0.5);
  spear.position.copy(mid);
  spear.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), exitVec.clone().sub(entryVec).normalize());
  earthGroup.add(spear);

  entryMarker = makeMarker(0x6cf6ff);
  entryMarker.position.copy(entryVec.clone().multiplyScalar(1.02));
  earthGroup.add(entryMarker);

  exitMarker = makeMarker(0xff58d8);
  exitMarker.position.copy(exitVec.clone().multiplyScalar(1.02));
  earthGroup.add(exitMarker);
}

// Three.js SphereGeometry default UV mapping puts u=0.5 (texture center) on
// the +x axis. The blue-marble equirectangular has the prime meridian at
// u=0.5, so lon=0 → +x, lon=90°E → -z, lon=180° → -x.
function vecToLatLon(v) {
  const n = v.clone().normalize();
  const lat = Math.asin(THREE.MathUtils.clamp(n.y, -1, 1)) * 180 / Math.PI;
  let lon = Math.atan2(-n.z, n.x) * 180 / Math.PI + LON_OFFSET_DEG;
  while (lon < -180) lon += 360;
  while (lon > 180) lon -= 360;
  return { lat, lon };
}

function latLonToVec(lat, lon, r = 1) {
  const phi = lat * Math.PI / 180;
  const lambda = (lon - LON_OFFSET_DEG) * Math.PI / 180;
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.cos(lambda),
    r * Math.sin(phi),
    -r * Math.cos(phi) * Math.sin(lambda),
  );
}

function antipode({ lat, lon }) {
  const aLon = lon + 180;
  return { lat: -lat, lon: aLon > 180 ? aLon - 360 : aLon };
}

function fmtCoord(lat, lon) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

const placeCache = new Map();
async function reverseGeocode(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (placeCache.has(key)) return placeCache.get(key);
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    const country = j.countryName || '';
    const city = j.city || j.locality || j.principalSubdivision || '';
    const label = country ? (city ? `${city}, ${country}` : country) : 'Open Ocean';
    placeCache.set(key, label);
    return label;
  } catch {
    return 'Open Ocean';
  }
}

const panel = document.getElementById('hud-panel');
const entryCoordsEl = document.getElementById('entry-coords');
const entryPlaceEl = document.getElementById('entry-place');
const exitCoordsEl = document.getElementById('exit-coords');
const exitPlaceEl = document.getElementById('exit-place');
const cursorReadout = document.getElementById('cursor-readout');

let lastResult = null;

async function selectPoint(latLon) {
  const exit = antipode(latLon);
  lastResult = { entry: latLon, exit };

  const entryVec = latLonToVec(latLon.lat, latLon.lon, 1);
  const exitVec = latLonToVec(exit.lat, exit.lon, 1);
  drawSpear(entryVec, exitVec);
  audio.ping(660);
  setTimeout(() => audio.ping(990), 180);

  panel.classList.remove('hidden');
  entryCoordsEl.textContent = fmtCoord(latLon.lat, latLon.lon);
  exitCoordsEl.textContent = fmtCoord(exit.lat, exit.lon);
  entryPlaceEl.textContent = 'locating…';
  exitPlaceEl.textContent = 'locating…';

  const [entryPlace, exitPlace] = await Promise.all([
    reverseGeocode(latLon.lat, latLon.lon),
    reverseGeocode(exit.lat, exit.lon),
  ]);
  entryPlaceEl.textContent = entryPlace;
  exitPlaceEl.textContent = exitPlace;
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointerDown = null;
let pointerMoved = false;

canvas.addEventListener('pointerdown', (e) => {
  pointerDown = { x: e.clientX, y: e.clientY };
  pointerMoved = false;
});

canvas.addEventListener('pointermove', (e) => {
  if (pointerDown) {
    const dx = e.clientX - pointerDown.x;
    const dy = e.clientY - pointerDown.y;
    if (dx * dx + dy * dy > 16) pointerMoved = true;
  }

  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(earth);
  if (hits.length) {
    const local = earth.worldToLocal(hits[0].point.clone());
    const ll = vecToLatLon(local);
    cursorReadout.textContent = fmtCoord(ll.lat, ll.lon);
    cursorReadout.style.left = e.clientX + 'px';
    cursorReadout.style.top = e.clientY + 'px';
    cursorReadout.classList.add('visible');
  } else {
    cursorReadout.classList.remove('visible');
  }
});

canvas.addEventListener('pointerup', (e) => {
  const wasClick = pointerDown && !pointerMoved;
  pointerDown = null;
  if (!wasClick) return;

  ndc.x = (e.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(earth);
  if (!hits.length) return;
  const local = earth.worldToLocal(hits[0].point.clone());
  selectPoint(vecToLatLon(local));
});

canvas.addEventListener('pointerleave', () => cursorReadout.classList.remove('visible'));

document.getElementById('clear').addEventListener('click', () => {
  clearSpear();
  panel.classList.add('hidden');
  lastResult = null;
});

document.getElementById('copy-coords').addEventListener('click', () => {
  if (!lastResult) return;
  const { entry, exit } = lastResult;
  const text = `Entry: ${fmtCoord(entry.lat, entry.lon)}\nExit:  ${fmtCoord(exit.lat, exit.lon)}`;
  navigator.clipboard?.writeText(text);
  const btn = document.getElementById('copy-coords');
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => (btn.textContent = orig), 1200);
});

document.getElementById('spin-to-exit').addEventListener('click', () => {
  if (!lastResult) return;
  const target = latLonToVec(lastResult.exit.lat, lastResult.exit.lon, 1);
  const worldTarget = target.clone().applyMatrix4(earthGroup.matrixWorld).normalize();
  const dist = camera.position.length();
  const desired = worldTarget.multiplyScalar(dist);
  const start = camera.position.clone();
  const startTime = performance.now();
  const dur = 900;
  function tween() {
    const t = Math.min(1, (performance.now() - startTime) / dur);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.position.lerpVectors(start, desired, e);
    camera.lookAt(0, 0, 0);
    if (t < 1) requestAnimationFrame(tween);
  }
  tween();
});

// Galactic ambience — swap this YouTube video ID to change the soundtrack.
// Must be an embeddable video (uploader hasn't disabled embeds).
const YT_VIDEO_ID = 'tNkZsRW7h2c';
const YT_VOLUME = 35; // 0–100

const audio = (() => {
  let player = null;
  let ready = false;
  let muted = true;
  let pendingStart = false;

  // YT IFrame API
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);

  const container = document.createElement('div');
  container.id = 'yt-host';
  container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;opacity:0;';
  container.innerHTML = '<div id="yt-player"></div>';
  document.body.appendChild(container);

  window.onYouTubeIframeAPIReady = () => {
    player = new YT.Player('yt-player', {
      height: '1',
      width: '1',
      videoId: YT_VIDEO_ID,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, playsinline: 1, rel: 0 },
      events: {
        onReady: () => {
          ready = true;
          player.setVolume(YT_VOLUME);
          if (pendingStart) {
            pendingStart = false;
            start();
          }
        },
        onStateChange: (e) => {
          // Loop when video ends
          if (e.data === YT.PlayerState.ENDED) player.playVideo();
        },
      },
    });
  };

  // Local AudioContext for the click chimes (so they layer over YouTube audio)
  let ctx = null;
  function chimeCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  async function start() {
    if (!ready) { pendingStart = true; return; }
    muted = false;
    player.unMute?.();
    player.setVolume(YT_VOLUME);
    player.playVideo();
  }

  function stop() {
    muted = true;
    if (ready) player.pauseVideo();
  }

  function toggle() {
    if (muted) return start();
    return stop();
  }

  function ping(freq = 880) {
    if (muted) return;
    const c = chimeCtx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = freq;
    o.type = 'sine';
    const now = c.currentTime;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.15, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    o.connect(g).connect(c.destination);
    o.start(now);
    o.stop(now + 1);
  }

  return { start, stop, toggle, ping, isMuted: () => muted, isStarted: () => !muted };
})();

const audioBtn = document.getElementById('audio-toggle');
audioBtn.classList.add('muted');
audioBtn.addEventListener('click', async () => {
  await audio.toggle();
  audioBtn.classList.toggle('muted', audio.isMuted() || !audio.isStarted());
  audioBtn.classList.toggle('playing', !audio.isMuted() && audio.isStarted());
});

// Auto-start on first globe interaction (browsers require user gesture)
const autoStart = async () => {
  if (!audio.isStarted()) {
    await audio.start();
    audioBtn.classList.remove('muted');
    audioBtn.classList.add('playing');
  }
};
canvas.addEventListener('pointerdown', autoStart, { once: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (!pointerDown) earthGroup.rotation.y += dt * 0.03;
  stars.rotation.y += dt * 0.005;
  controls.update();
  renderer.render(scene, camera);
}
animate();
