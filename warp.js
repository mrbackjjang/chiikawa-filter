import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import Delaunator from "https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm";
import { IDX, FACE_OVAL, faceFrame } from "./makeup.js";

const MESH_POINTS = 468; // 홍채 점(468~477)은 메시에서 제외
const RING_SCALE = 1.6;  // 얼굴 윤곽 바깥 고정 고리의 크기 (윤곽 대비)
const EDGE_STEPS = 6;    // 화면 테두리 고정점 간격
const TOTAL = MESH_POINTS + FACE_OVAL.length + 4 * EDGE_STEPS;

const smoothstep = (t) => t * t * (3 - 2 * t);
const dot = (a, b) => a.x * b.x + a.y * b.y;

// 원본 랜드마크(px)를 받아 변형된 랜드마크를 돌려줌. s = 세기 0~1
export function deformFace(p, s) {
  const f = faceFrame(p);
  const out = p.map((q) => ({ x: q.x, y: q.y }));

  // 1) 떡 얼굴: 눈 높이 아래쪽을 위로 눌러 납작하게, 아래로 갈수록 살짝 옆으로 통통하게
  const eyeLine = { x: (p[IDX.irisR].x + p[IDX.irisL].x) / 2, y: (p[IDX.irisR].y + p[IDX.irisL].y) / 2 };
  for (const q of out) {
    const d = { x: q.x - eyeLine.x, y: q.y - eyeLine.y };
    const dy = dot(d, f.up);
    if (dy >= 0) continue;
    const dx = dot(d, f.u);
    const lift = -dy * 0.3 * s;
    const widen = dx * 0.12 * s * Math.min(1, -dy / (0.5 * f.fw));
    q.x += f.up.x * lift + f.u.x * widen;
    q.y += f.up.y * lift + f.u.y * widen;
  }

  // 2) 작은 입: 입 중심으로 모으기 (가운데는 최대 55%까지, 반경 끝에서는 0)
  const m = [13, 14, IDX.mouthR, IDX.mouthL].reduce(
    (a, i) => ({ x: a.x + out[i].x / 4, y: a.y + out[i].y / 4 }), { x: 0, y: 0 });
  const R = 0.34 * f.fw;
  for (const q of out) {
    const d = Math.hypot(q.x - m.x, q.y - m.y);
    if (d >= R) continue;
    const k = 1 - 0.55 * s * smoothstep(1 - d / R);
    q.x = m.x + (q.x - m.x) * k;
    q.y = m.y + (q.y - m.y) * k;
  }
  return out;
}

// 얼굴 바깥 고리 + 화면 테두리: 움직이지 않는 점들
function anchors(orig, w, h) {
  const c = FACE_OVAL.reduce((a, i) => ({ x: a.x + orig[i].x / FACE_OVAL.length, y: a.y + orig[i].y / FACE_OVAL.length }), { x: 0, y: 0 });
  const pts = FACE_OVAL.map((i) => ({ x: c.x + (orig[i].x - c.x) * RING_SCALE, y: c.y + (orig[i].y - c.y) * RING_SCALE }));
  for (let i = 0; i < EDGE_STEPS; i++) {
    const t = i / EDGE_STEPS;
    pts.push({ x: t * w, y: 0 }, { x: w, y: t * h }, { x: (1 - t) * w, y: h }, { x: 0, y: (1 - t) * h });
  }
  return pts;
}

export class Warper {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);

    this.positions = new THREE.BufferAttribute(new Float32Array(TOTAL * 3), 3);
    this.uvs = new THREE.BufferAttribute(new Float32Array(TOTAL * 2), 2);
    this.index = new THREE.BufferAttribute(new Uint32Array(TOTAL * 6), 1); // 삼각형 수 상한 2n
    for (const a of [this.positions, this.uvs, this.index]) a.setUsage(THREE.DynamicDrawUsage);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", this.positions);
    this.geometry.setAttribute("uv", this.uvs);
    this.geometry.setIndex(this.index);
    this.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.coords = new Float64Array(TOTAL * 2);
  }

  // src(비디오/이미지)를 orig → warped 로 변형해서 this.canvas에 그림
  render(src, orig, warped, w, h) {
    if (!this.texture || this.texture.image !== src) {
      this.texture?.dispose();
      this.texture = new THREE.Texture(src);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.minFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = false;
      this.material.map = this.texture;
      this.material.needsUpdate = true;
    }
    this.texture.needsUpdate = true;

    if (this.w !== w || this.h !== h) {
      this.w = w;
      this.h = h;
      this.renderer.setSize(w, h, false);
      Object.assign(this.camera, { left: 0, right: w, top: h, bottom: 0 });
      this.camera.updateProjectionMatrix();
    }

    const fixed = anchors(orig, w, h);
    const pos = this.positions.array, uv = this.uvs.array, xy = this.coords;
    for (let i = 0; i < TOTAL; i++) {
      const s = i < MESH_POINTS ? orig[i] : fixed[i - MESH_POINTS];
      const d = i < MESH_POINTS ? warped[i] : s;
      xy[2 * i] = s.x;
      xy[2 * i + 1] = s.y;
      uv[2 * i] = s.x / w;
      uv[2 * i + 1] = 1 - s.y / h;
      pos[3 * i] = d.x;
      pos[3 * i + 1] = h - d.y;
      pos[3 * i + 2] = 0;
    }
    // 원본 위치로 삼각분할 → 같은 삼각형을 변형된 위치에 그리면 그림이 따라 늘어나거나 줄어듦
    const tris = new Delaunator(xy).triangles;
    this.index.array.set(tris);
    this.geometry.setDrawRange(0, tris.length);
    this.positions.needsUpdate = this.uvs.needsUpdate = this.index.needsUpdate = true;

    this.renderer.render(this.scene, this.camera);
  }
}
