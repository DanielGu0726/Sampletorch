import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = () => innerWidth < 760;
const { clamp, lerp, smoothstep } = THREE.MathUtils;
const V2 = (x, y) => new THREE.Vector2(x, y);
const tri = x => 1 - Math.abs(2 * (x - Math.floor(x)) - 1);

const nav = document.querySelector('.nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 40), { passive: true });

// ---------- 섹션별 배치 ----------
// x/y: 화면 위치, s: 크기, tilt: 앞으로 기울기(교합면이 보이도록)
const SCENES = [
  { x:  2.45, y: -0.15, s: 0.80, tilt: .48 },
  { x:  2.00, y: -0.05, s: 0.82, tilt: .30 },
  { x:  3.05, y:  0.00, s: 0.66, tilt: .55 },
  { x: -3.00, y: -0.05, s: 0.64, tilt: .45 },
  { x:  2.90, y: -0.05, s: 0.76, tilt: .50 },
];

// ---------- 크라운 재료 ----------
const MATERIALS = {
  zirconia: { color: '#F3EEE4', roughness: .34, metalness: 0, transmission: .04, clearcoat: .7 },
  emax:     { color: '#EEDFC6', roughness: .10, metalness: 0, transmission: .55, clearcoat: 1 },
  pfm:      { color: '#EFE2CA', roughness: .18, metalness: 0, transmission: .08, clearcoat: 1 },
  gold:     { color: '#DDAA45', roughness: .18, metalness: 1, transmission: .02, clearcoat: .3 },
  ti:       { color: '#E9F0F6', roughness: .04, metalness: 0, transmission: .92, clearcoat: 1 },
  pmma:     { color: '#F1D9C4', roughness: .45, metalness: 0, transmission: .12, clearcoat: .2 },
};

// ---------- 형상 만들기 ----------
function crownGeometry() {
  let g = new THREE.SphereGeometry(1, 180, 130);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const cusps = [[.43, .36], [-.43, .36], [.43, -.36], [-.43, -.36], [0, .5]];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // 치경부로 갈수록 좁아짐
    const cerv = smoothstep(-y, -.1, 1);
    const bulge = 1 + .07 * Math.exp(-((y - .12) ** 2) / .08);
    const nx = x * (1 - .34 * cerv) * bulge;
    const nz = z * .9 * (1 - .34 * cerv) * bulge;
    let ny = y > 0 ? y * .6 : y * 1.05;
    // 교합면: 교두 4+1개, 중심와, 중심 열구
    if (y > 0) {
      const w = smoothstep(y, .3, .95);
      let h = 0;
      for (const [cx, cz] of cusps) h += .3 * Math.exp(-((nx - cx) ** 2 + (nz - cz) ** 2) / .05);
      h -= .2 * Math.exp(-(nx * nx + nz * nz) / .05);
      h -= .07 * Math.exp(-(nz * nz) / .004) * Math.exp(-(nx * nx) / .35);
      h -= .05 * Math.exp(-(nx * nx) / .004) * Math.exp(-(nz * nz) / .5);
      ny += w * h;
    }
    p.setXYZ(i, nx, ny, nz);
  }
  g.computeVertexNormals();
  return g;
}

function fixtureGeometry() {
  const pts = [V2(0, -2.6), V2(.12, -2.6)];
  for (let y = -2.56; y < -.22; y += .018) {
    const core = lerp(.24, .35, smoothstep(y, -2.6, -1.5));
    const thread = .075 * tri(y / .2) * smoothstep(y, -2.6, -2.3);
    pts.push(V2(core + thread, y));
  }
  pts.push(V2(.38, -.2), V2(.40, -.04), V2(.37, 0), V2(.18, 0), V2(.18, -.12), V2(0, -.12));
  return new THREE.LatheGeometry(pts, 72);
}

function abutmentGeometry() {
  const pts = [V2(0, 0), V2(.34, 0), V2(.40, .12), V2(.49, .3), V2(.55, .42), V2(.47, .46),
    V2(.41, .52), V2(.38, .9), V2(.35, 1.22), V2(.28, 1.33), V2(0, 1.35)];
  return new THREE.LatheGeometry(pts, 72);
}

function screwGeometry() {
  const pts = [V2(0, -.75), V2(.07, -.74)];
  for (let y = -.72; y < .1; y += .012) pts.push(V2(.085 + .025 * tri(y / .06), y));
  pts.push(V2(.09, .12), V2(.09, 1.0), V2(.17, 1.02), V2(.17, 1.16), V2(.12, 1.2), V2(0, 1.2));
  return new THREE.LatheGeometry(pts, 48);
}

function boot() {
  const canvas = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall() ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  const BG_LIGHT = new THREE.Color('#E8EDF1');
  const BG_DARK = new THREE.Color('#0F1B2D');
  scene.background = BG_LIGHT.clone();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
  scene.environmentIntensity = .8;

  const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, .1, 100);
  camera.position.set(0, 0, 10);

  const key = new THREE.DirectionalLight('#ffffff', 1.6);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#7FA2FF', 1.2);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  // ---------- 임플란트 보철 세트 ----------
  const rig = new THREE.Group();        // 화면상 위치·크기
  const body = new THREE.Group();       // 회전
  rig.add(body);
  scene.add(rig);

  const crownMat = new THREE.MeshPhysicalMaterial({
    color: MATERIALS.zirconia.color, roughness: .34, metalness: 0,
    transmission: .04, thickness: 1.2, ior: 1.55,
    clearcoat: .7, clearcoatRoughness: .12,
  });
  const tiMat = new THREE.MeshPhysicalMaterial({ color: '#BAC3CD', metalness: 1, roughness: .26, clearcoat: .4 });
  const fixMat = new THREE.MeshPhysicalMaterial({ color: '#9EA9B6', metalness: 1, roughness: .38 });
  const screwMat = new THREE.MeshPhysicalMaterial({ color: '#D4A84E', metalness: 1, roughness: .24 });

  const crown = new THREE.Mesh(crownGeometry(), crownMat);
  crown.scale.setScalar(.95);
  const abutment = new THREE.Mesh(abutmentGeometry(), tiMat);
  const screw = new THREE.Mesh(screwGeometry(), screwMat);
  const fixture = new THREE.Mesh(fixtureGeometry(), fixMat);
  const parts = [crown, abutment, screw, fixture];
  // 조립 상태 기준 높이
  const HOME = [1.42, 0, 0, 0];
  // 분해 시 이동량
  const SPREAD = [2.3, 1.05, .45, -1.0];
  parts.forEach(m => body.add(m));
  body.position.y = .2;

  // ---------- 구조 섹션 ----------
  const structure = document.querySelector('.structure');
  const partItems = [...document.querySelectorAll('.parts li')];
  const meter = document.querySelector('.structure-meter');

  function structureProgress() {
    const top = structure.offsetTop, h = structure.offsetHeight;
    return clamp((scrollY - top) / (h - innerHeight), 0, 1);
  }

  // ---------- 섹션 → 장면 ----------
  const sections = [...document.querySelectorAll('[data-scene]')];
  function scrollScene() {
    const mid = scrollY + innerHeight / 2;
    for (let i = 0; i < sections.length; i++) {
      const top = sections[i].offsetTop, h = sections[i].offsetHeight;
      if (mid < top + h || i === sections.length - 1) {
        const local = clamp((mid - top) / h, 0, 1);
        const k = smoothstep(local, .78, 1);
        return { a: i, b: Math.min(i + 1, sections.length - 1), k };
      }
    }
    return { a: 0, b: 0, k: 0 };
  }

  // ---------- 제작 품목 → 크라운 재료 ----------
  const rows = [...document.querySelectorAll('.menu tbody tr')];
  const products = document.querySelector('.products');
  let hoverMat = null, autoIdx = 0, autoTimer = 0;
  rows.forEach(row => {
    row.addEventListener('mouseenter', () => { hoverMat = row.dataset.mat; rows.forEach(r => r.classList.toggle('on', r === row)); });
    row.addEventListener('mouseleave', () => { hoverMat = null; row.classList.remove('on'); });
    row.addEventListener('click', () => { hoverMat = row.dataset.mat; rows.forEach(r => r.classList.toggle('on', r === row)); });
  });
  const matTarget = { color: new THREE.Color(), roughness: 0, metalness: 0, transmission: 0, clearcoat: 0 };

  // ---------- 입력 ----------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => {
    mouse.tx = (e.clientX / innerWidth - .5) * 2;
    mouse.ty = (e.clientY / innerHeight - .5) * 2;
  }, { passive: true });
  let lastScroll = scrollY, scrollVel = 0;

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ---------- 루프 ----------
  const clock = new THREE.Clock();
  const state = { ...SCENES[0], ex: 0 };
  let t = 0, spin = 0;
  const start = performance.now();
  const easeOutCubic = x => 1 - Math.pow(1 - x, 3);
  const easeOutBounce = x => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375;
    return n * (x -= 2.625 / d) * x + .984375;
  };
  const phase = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

  function frame() {
    const dt = Math.min(clock.getDelta(), .1);
    const speed = reduceMotion ? .2 : 1;
    t += dt * speed;
    const intro = reduceMotion ? 2 : (performance.now() - start) / 1000;

    // 스크롤 속도 → 추가 회전
    scrollVel = lerp(scrollVel, (scrollY - lastScroll) / Math.max(dt, .001), .15);
    lastScroll = scrollY;

    // 장면 목표
    const { a, b, k } = scrollScene();
    const goal = {};
    for (const key in SCENES[a]) goal[key] = lerp(SCENES[a][key], SCENES[b][key], k);
    if (isSmall()) { goal.x = .55; goal.y = 1.15 + goal.y * .2; goal.s *= .55; }

    // 분해 정도: 구조 섹션 진행률
    const p = structureProgress();
    goal.ex = smoothstep(p, .04, .3) * (1 - smoothstep(p, .86, 1));
    const active = goal.ex > .6 ? clamp(Math.floor(phase(p, .3, .86) * 4), 0, 3) : -1;
    partItems.forEach((li, i) => li.classList.toggle('on', i === active));
    meter.style.setProperty('--p', p.toFixed(3));

    // 어두운 무대 전환
    const r = structure.getBoundingClientRect();
    const dark = r.top < innerHeight * .5 && r.bottom > innerHeight * .5;
    document.body.classList.toggle('dark', dark);
    scene.background.lerp(dark ? BG_DARK : BG_LIGHT, 1 - Math.pow(.02, dt));

    const ease = 1 - Math.pow(.015, dt);
    for (const key in state) state[key] = lerp(state[key], goal[key], ease);

    // 제작 품목: 마우스가 없으면 자동으로 재료 순환
    const pr = products.getBoundingClientRect();
    const inProducts = pr.top < innerHeight * .6 && pr.bottom > innerHeight * .4;
    let matKey = 'zirconia';
    if (hoverMat) matKey = hoverMat;
    else if (inProducts) {
      autoTimer += dt;
      if (autoTimer > 2.2) { autoTimer = 0; autoIdx = (autoIdx + 1) % rows.length; }
      matKey = rows[autoIdx].dataset.mat;
      rows.forEach((row, i) => row.classList.toggle('on', i === autoIdx));
    }
    const M = MATERIALS[matKey];
    matTarget.color.set(M.color);
    const me = 1 - Math.pow(.03, dt);
    crownMat.color.lerp(matTarget.color, me);
    crownMat.roughness = lerp(crownMat.roughness, M.roughness, me);
    crownMat.metalness = lerp(crownMat.metalness, M.metalness, me);
    crownMat.transmission = lerp(crownMat.transmission, M.transmission, me);
    crownMat.clearcoat = lerp(crownMat.clearcoat, M.clearcoat, me);

    // 등장 애니메이션: 픽스처가 올라오고, 어버트먼트·크라운이 떨어져 끼워짐
    const iFix = easeOutCubic(phase(intro, 0, .8));
    const iAbut = easeOutCubic(phase(intro, .35, 1.1));
    const iCrown = easeOutBounce(phase(intro, .7, 1.9));
    const INTRO = [(1 - iCrown) * 6, (1 - iAbut) * 4, (1 - iAbut) * 4, -(1 - iFix) * 4];

    parts.forEach((m, i) => {
      m.position.y = HOME[i] + SPREAD[i] * state.ex + INTRO[i];
      const pulse = i === active ? 1 + .035 * Math.sin(t * 5) : 1;
      m.scale.setScalar((i === 0 ? .95 : 1) * pulse);
    });
    screw.position.x = 0;
    crown.rotation.x = state.ex * .35;
    crown.rotation.z = (1 - iCrown) * .6;
    fixture.visible = abutment.visible = true;

    // 위치·회전
    mouse.x = lerp(mouse.x, mouse.tx, ease * .5);
    mouse.y = lerp(mouse.y, mouse.ty, ease * .5);
    const bob = Math.sin(t * 1.3) * .09;
    rig.position.set(state.x + mouse.x * .2, state.y + bob - mouse.y * .12, 0);
    rig.scale.setScalar(state.s * (1 - .36 * state.ex));
    body.position.y = .2 - .65 * state.ex;
    spin += dt * speed * (.55 + clamp(Math.abs(scrollVel) * .004, 0, 4));
    body.rotation.y = spin + mouse.x * .5;
    rig.rotation.x = state.tilt + mouse.y * .25;
    rig.rotation.z = Math.sin(t * .8) * .06 - mouse.x * .08;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
}

try {
  boot();
} catch (err) {
  console.warn('WebGL을 쓸 수 없어 3D 없이 표시합니다.', err);
  document.getElementById('stage').remove();
}
