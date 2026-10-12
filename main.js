import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmall = () => innerWidth < 760;

// 내비게이션 배경
const nav = document.querySelector('.nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 40), { passive: true });

// ---------- 팔레트 ----------
const PALETTES = {
  flame:  ['#FF3D7F', '#FFB23F', '#9FE8FF'],
  ember:  ['#FF4A1C', '#FFD36B', '#FF3D7F'],
  ice:    ['#2F6BFF', '#9FE8FF', '#FFFFFF'],
  acid:   ['#14C27A', '#E4FF5C', '#9FE8FF'],
  violet: ['#7A3DFF', '#FF6FD8', '#9FE8FF'],
  solar:  ['#FF8A2B', '#FFF1C2', '#FF3D7F'],
};

// ---------- 섹션별 장면 ----------
// x/y: 화면상 위치, s: 크기, amp: 출렁임 세기, freq: 주름 밀도, twist: 비틀림, spin: 회전 속도
const SCENES = [
  { x:  1.25, y:  0.05, s: 1.20, amp: .30, freq: 1.4, twist: 0.0, spin: .25 },
  { x:  2.45, y: -0.15, s: 0.85, amp: .48, freq: 1.0, twist: 0.4, spin: .15 },
  { x: -2.75, y: -0.10, s: 0.70, amp: .20, freq: 2.6, twist: 1.6, spin: .45 },
  { x:  2.70, y:  1.30, s: 0.48, amp: .36, freq: 1.9, twist: 0.8, spin: .35 },
  { x:  0.00, y: -0.25, s: 1.00, amp: .58, freq: 0.9, twist: 0.2, spin: .12 },
];

const NOISE = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

function boot() {
  const canvas = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, isSmall() ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0E1033);
  scene.fog = new THREE.FogExp2(0x0E1033, 0.08);
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 6);

  const rig = new THREE.Group();
  scene.add(rig);

  // ---------- 용암 불꽃 구체 ----------
  const uniforms = {
    uTime: { value: 0 },
    uAmp: { value: SCENES[0].amp },
    uFreq: { value: SCENES[0].freq },
    uTwist: { value: 0 },
    uColA: { value: new THREE.Color(PALETTES.flame[0]) },
    uColB: { value: new THREE.Color(PALETTES.flame[1]) },
    uRim: { value: new THREE.Color(PALETTES.flame[2]) },
  };

  const orbMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float uTime, uAmp, uFreq, uTwist;
      varying float vDisp;
      varying vec3 vViewPos;
      ${NOISE}
      vec3 twist(vec3 p, float k){
        float a = k * p.y; float c = cos(a), s = sin(a);
        return vec3(c*p.x - s*p.z, p.y, s*p.x + c*p.z);
      }
      void main(){
        vec3 p = twist(position, uTwist * sin(uTime * .35));
        float n  = snoise(p * uFreq + vec3(0., uTime * .45, 0.));
        float n2 = snoise(p * uFreq * 2.4 - vec3(uTime * .3)) * .35;
        float d = (n + n2) * uAmp;
        vDisp = n + n2;
        vec3 np = p + normalize(p) * d;
        vec4 mv = modelViewMatrix * vec4(np, 1.);
        vViewPos = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uColA, uColB, uRim;
      varying float vDisp;
      varying vec3 vViewPos;
      void main(){
        vec3 n = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
        vec3 v = normalize(-vViewPos);
        float fres = pow(1. - clamp(dot(n, v), 0., 1.), 2.2);
        float t = smoothstep(-.9, .9, vDisp);
        vec3 col = mix(uColA, uColB, t);
        // 깊은 골짜기는 어둡게, 솟은 곳은 뜨겁게
        col *= mix(.3, 1.15, t);
        // 용암 결
        float bands = sin(vDisp * 18. + uTime * 1.2) * .5 + .5;
        col += uColB * pow(bands, 10.) * .3 * t;
        col += uRim * fres * .75;
        gl_FragColor = vec4(col, 1.);
      }`,
  });

  const detail = isSmall() ? 40 : 72;
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, detail), orbMat);
  rig.add(orb);

  // ---------- 궤도 고리 ----------
  const ringMat = new THREE.MeshBasicMaterial({ color: PALETTES.flame[2], transparent: true, opacity: .55 });
  const rings = new THREE.Group();
  [[2.05, .006, 1.1, .3], [2.45, .004, -.6, .9], [2.9, .003, .3, -.5]].forEach(([r, tube, rx, rz]) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 8, 220), ringMat);
    m.rotation.set(rx, 0, rz);
    rings.add(m);
  });
  // 고리를 도는 작은 위성
  const moonMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const moons = rings.children.map((ring, i) => {
    const moon = new THREE.Mesh(new THREE.SphereGeometry(.035 + i * .01, 16, 16), moonMat);
    ring.add(moon);
    return { moon, r: ring.geometry.parameters.radius, speed: .5 + i * .23, phase: i * 2.1 };
  });
  rig.add(rings);

  // ---------- 불씨 입자 ----------
  const COUNT = isSmall() ? 700 : 1800;
  const pos = new Float32Array(COUNT * 3);
  const seed = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - .5) * 14;
    pos[i * 3 + 1] = (Math.random() - .5) * 9;
    pos[i * 3 + 2] = (Math.random() - .5) * 6 - 1;
    seed[i] = Math.random();
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  emberGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const emberMat = new THREE.ShaderMaterial({
    uniforms: { uTime: uniforms.uTime, uColA: uniforms.uColA, uColB: uniforms.uColB, uPR: { value: renderer.getPixelRatio() } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uPR;
      attribute float aSeed;
      varying float vSeed; varying float vLife;
      void main(){
        vec3 p = position;
        float speed = .15 + aSeed * .45;
        p.y = mod(p.y + uTime * speed + 4.5, 9.) - 4.5;
        p.x += sin(uTime * .6 + aSeed * 30.) * .25;
        vLife = 1. - smoothstep(-4.5, 4.5, p.y);
        vSeed = aSeed;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_PointSize = (2. + aSeed * 5.) * uPR * (6. / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColA, uColB;
      varying float vSeed; varying float vLife;
      void main(){
        float d = length(gl_PointCoord - .5);
        float a = smoothstep(.5, 0., d);
        vec3 col = mix(uColA, uColB, vSeed);
        gl_FragColor = vec4(col * 1.2, a * vLife * .7);
      }`,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  scene.add(embers);

  // ---------- 후처리: 빛 번짐 ----------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), .6, .45, .62);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // ---------- 스크롤 → 장면 보간 ----------
  const sections = [...document.querySelectorAll('[data-scene]')];
  function scrollScene() {
    const mid = scrollY + innerHeight / 2;
    for (let i = 0; i < sections.length; i++) {
      const top = sections[i].offsetTop, h = sections[i].offsetHeight;
      if (mid < top + h || i === sections.length - 1) {
        const local = THREE.MathUtils.clamp((mid - top) / h, 0, 1);
        // 섹션의 뒤쪽 40%에서 다음 장면으로 넘어감
        const k = THREE.MathUtils.smoothstep(local, .6, 1);
        return { a: i, b: Math.min(i + 1, sections.length - 1), k };
      }
    }
    return { a: 0, b: 0, k: 0 };
  }

  // ---------- 작업 목록 hover → 색 바꾸기 ----------
  let paletteKey = 'flame';
  document.querySelectorAll('.work-list li').forEach(li => {
    const on = () => { paletteKey = li.dataset.hue; };
    const off = () => { paletteKey = 'flame'; };
    li.addEventListener('mouseenter', on);
    li.addEventListener('mouseleave', off);
    li.addEventListener('focusin', on);
    li.addEventListener('focusout', off);
  });
  const target = PALETTES.flame.map(c => new THREE.Color(c));

  // ---------- 마우스 ----------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => {
    mouse.tx = (e.clientX / innerWidth - .5) * 2;
    mouse.ty = (e.clientY / innerHeight - .5) * 2;
  }, { passive: true });

  // ---------- 리사이즈 ----------
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  // ---------- 루프 ----------
  const clock = new THREE.Clock();
  const state = { ...SCENES[0] };
  const lerp = THREE.MathUtils.lerp;
  let t = 0, intro = 0, spinAngle = 0;

  function frame() {
    const dt = Math.min(clock.getDelta(), .05);
    const speed = reduceMotion ? .15 : 1;
    t += dt * speed;
    uniforms.uTime.value = t;
    intro = Math.min(intro + dt / 1.8, 1);
    const introEase = 1 - Math.pow(1 - intro, 4);

    // 장면 목표값
    const { a, b, k } = scrollScene();
    const A = SCENES[a], B = SCENES[b];
    const small = isSmall();
    const goal = {};
    for (const key in A) goal[key] = lerp(A[key], B[key], k);
    if (small) { goal.x = .75 + goal.x * .12; goal.y = 1.1 + goal.y * .2; goal.s *= .5; }

    const ease = 1 - Math.pow(.02, dt);
    for (const key in state) state[key] = lerp(state[key], goal[key], ease);

    uniforms.uAmp.value = state.amp;
    uniforms.uFreq.value = state.freq;
    uniforms.uTwist.value = state.twist;

    // 색
    PALETTES[paletteKey].forEach((c, i) => target[i].set(c));
    const ce = 1 - Math.pow(.01, dt);
    uniforms.uColA.value.lerp(target[0], ce);
    uniforms.uColB.value.lerp(target[1], ce);
    uniforms.uRim.value.lerp(target[2], ce);
    ringMat.color.copy(uniforms.uRim.value);

    // 위치·회전
    mouse.x = lerp(mouse.x, mouse.tx, ease * .6);
    mouse.y = lerp(mouse.y, mouse.ty, ease * .6);
    rig.position.set(state.x + mouse.x * .15, state.y - mouse.y * .1, 0);
    rig.scale.setScalar(state.s * (.2 + .8 * introEase));
    spinAngle += dt * speed * state.spin;
    orb.rotation.set(spinAngle * .6 + mouse.y * .3, spinAngle + mouse.x * .5, 0);
    rings.rotation.set(t * .07 + mouse.y * .2, t * .11 + mouse.x * .3, 0);
    moons.forEach(({ moon, r, speed: s, phase }) => {
      const ang = t * s + phase;
      moon.position.set(Math.cos(ang) * r, Math.sin(ang) * r, 0);
    });
    embers.rotation.y = mouse.x * .08;
    camera.position.x = mouse.x * .2;
    camera.position.y = -mouse.y * .15;
    camera.lookAt(0, 0, 0);

    bloom.strength = .45 + state.amp * .5;
    composer.render();
    requestAnimationFrame(frame);
  }
  frame();
}

try {
  boot();
} catch (err) {
  console.warn('WebGL을 쓸 수 없어 정적 배경으로 표시합니다.', err);
  document.body.classList.add('no-webgl');
}
