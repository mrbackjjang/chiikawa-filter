// MediaPipe Face Mesh 랜드마크 인덱스
export const IDX = {
  faceL: 234, faceR: 454, top: 10, chin: 152,
  irisR: 468, irisL: 473, // R = 사용자의 오른쪽(이미지 왼쪽)
  mouthR: 61, mouthL: 291,
};
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

const INK = "#2b2626";

// 얼굴 좌표계: u = 오른쪽(이미지 기준), up = 위쪽, fw = 얼굴 너비(px)
export function faceFrame(p) {
  const L = p[IDX.faceL], R = p[IDX.faceR];
  const fw = Math.hypot(R.x - L.x, R.y - L.y);
  const u = { x: (R.x - L.x) / fw, y: (R.y - L.y) / fw };
  const up = { x: u.y, y: -u.x };
  return { fw, u, up, roll: Math.atan2(u.y, u.x) };
}

// base에서 u 방향 dx, up 방향 dy 만큼 (얼굴 너비 단위) 이동한 점
const offset = (f, base, dx, dy) => ({
  x: base.x + (f.u.x * dx + f.up.x * dy) * f.fw,
  y: base.y + (f.u.y * dx + f.up.y * dy) * f.fw,
});

// origin을 원점으로, 얼굴 기울기에 맞춰 회전하고 얼굴 너비를 1로 둔 로컬 좌표에서 그리기 (y는 아래가 +)
function local(ctx, f, origin, draw) {
  ctx.save();
  ctx.translate(origin.x, origin.y);
  ctx.rotate(f.roll);
  ctx.scale(f.fw, f.fw);
  ctx.lineWidth = 0.014;
  ctx.lineJoin = ctx.lineCap = "round";
  ctx.strokeStyle = INK;
  draw();
  ctx.restore();
}

function tracePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
}

function skinTint(ctx, f, p, color, mode) {
  ctx.save();
  ctx.globalCompositeOperation = mode;
  ctx.filter = `blur(${Math.round(f.fw * 0.03)}px)`;
  ctx.fillStyle = color;
  tracePath(ctx, FACE_OVAL.map((i) => p[i]));
  ctx.fill();
  ctx.restore();
}

// 빗금이 들어간 분홍 볼터치
function blush(ctx, f, p) {
  for (const [eye, mouth, side] of [[IDX.irisR, IDX.mouthR, -1], [IDX.irisL, IDX.mouthL, 1]]) {
    const e = p[eye], m = p[mouth];
    const c = { x: e.x + (m.x - e.x) * 0.6, y: e.y + (m.y - e.y) * 0.6 };
    local(ctx, f, offset(f, c, side * 0.07, 0), () => {
      ctx.globalCompositeOperation = "multiply";
      ctx.filter = `blur(${Math.max(1, Math.round(f.fw * 0.006))}px)`;
      ctx.fillStyle = "rgba(240, 120, 150, 0.6)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.085, 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.filter = "none";
      ctx.strokeStyle = "rgba(190, 70, 110, 0.75)";
      ctx.lineWidth = 0.008;
      for (let i = -1.5; i <= 1.5; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 0.032 + 0.012, -0.028);
        ctx.lineTo(i * 0.032 - 0.012, 0.028);
        ctx.stroke();
      }
    });
  }
}

// 눈 위의 작은 '곤란한' 눈썹
function worriedBrows(ctx, f, p) {
  for (const [eye, side] of [[IDX.irisR, -1], [IDX.irisL, 1]]) {
    local(ctx, f, offset(f, p[eye], 0, 0.2), () => {
      ctx.lineWidth = 0.016;
      ctx.beginPath();
      ctx.moveTo(side * 0.04, 0.008);
      ctx.lineTo(-side * 0.035, -0.014);
      ctx.stroke();
    });
  }
}

// ---- 귀: 명암·그림자를 넣고, 머리카락 뒤에서 자라난 것처럼 그림 ----

// 로컬 좌표(단위 = 얼굴 너비)의 현재 path를 입체감 있게 칠하기
function shade(ctx, f, light, dark, cx, cy, r) {
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
  ctx.shadowBlur = f.fw * 0.03; // 그림자 값은 변환 영향을 받지 않아 px 단위
  ctx.shadowOffsetY = f.fw * 0.01;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(60, 45, 45, 0.3)";
  ctx.lineWidth = 0.006;
  ctx.stroke();
}

// 귀 모양: 원점 = 귀 뿌리, 위쪽(-y)으로 자람
const EARS = {
  chiikawa: {
    base: { x: 0.27, y: 0.16, tilt: 0.25 },
    draw(ctx, f) {
      ctx.beginPath();
      ctx.arc(0, -0.1, 0.13, 0, Math.PI * 2);
      shade(ctx, f, "#ffffff", "#e3dbd0", 0, -0.1, 0.15);
    },
  },
  hachiware: {
    base: { x: 0.25, y: 0.2, tilt: 0.3 },
    draw(ctx, f) {
      ctx.beginPath();
      ctx.moveTo(-0.11, 0.03);
      ctx.quadraticCurveTo(-0.08, -0.18, 0, -0.27);
      ctx.quadraticCurveTo(0.08, -0.18, 0.11, 0.03);
      ctx.closePath();
      shade(ctx, f, "#9bbad6", "#4c7090", 0, -0.12, 0.22);
    },
  },
  usagi: {
    base: { x: 0.14, y: 0.18, tilt: 0.12 },
    sway: 1.6, // 긴 귀는 더 크게 흔들림
    draw(ctx, f) {
      ctx.beginPath();
      ctx.ellipse(0, -0.42, 0.1, 0.47, 0, 0, Math.PI * 2);
      shade(ctx, f, "#fcefb8", "#d8b95a", 0, -0.42, 0.5);
      const g = ctx.createLinearGradient(0, -0.75, 0, -0.05);
      g.addColorStop(0, "rgba(234, 160, 180, 0.95)");
      g.addColorStop(1, "rgba(234, 160, 180, 0.2)");
      ctx.beginPath();
      ctx.ellipse(0, -0.42, 0.045, 0.33, 0, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    },
  },
};

// 귀 뿌리 높이: 머리카락 꼭대기에서 살짝 안쪽 (떨리지 않게 프레임 간 평활)
const earRoot = { [-1]: null, [1]: null };
function rootHeight(ctx, f, p, hair, side, ear) {
  const start = offset(f, p[IDX.top], side * ear.base.x, 0);
  const ext = hair?.hairExtent(start, f.up, f.fw * 0.8, ctx.canvas.width);
  const target = ext == null ? ear.base.y : Math.max(0.05, ext / f.fw - 0.05);
  earRoot[side] = earRoot[side] == null ? target : earRoot[side] + (target - earRoot[side]) * 0.3;
  return earRoot[side];
}

function drawEars(ctx, f, p, character, sway, hair) {
  const ear = EARS[character];
  if (!ear) return;
  for (const side of [-1, 1]) {
    local(ctx, f, offset(f, p[IDX.top], side * ear.base.x, rootHeight(ctx, f, p, hair, side, ear)), () => {
      ctx.rotate(side * ear.base.tilt + sway * (ear.sway ?? 1));
      ear.draw(ctx, f);
    });
  }
}

// 머리 움직임에 늦게 따라오며 출렁이는 귀 (스프링)
export class EarSpring {
  angle = 0;
  vel = 0;
  prev = null;

  update(p) {
    const f = faceFrame(p);
    const a = p[IDX.top];
    if (this.prev) {
      const dx = ((a.x - this.prev.x) * f.u.x + (a.y - this.prev.y) * f.u.y) / f.fw; // 좌우 이동량 (얼굴 너비 단위)
      const dRoll = f.roll - this.prev.roll;
      this.vel += -0.12 * this.angle - 0.15 * this.vel - dx * 3 - dRoll;
      this.angle = Math.max(-0.5, Math.min(0.5, this.angle + this.vel));
    }
    this.prev = { x: a.x, y: a.y, roll: f.roll };
    return this.angle;
  }

  reset() {
    this.prev = null;
  }
}

// 하치와레: 실제 머리카락을 파랗게 염색하고 가운데에 ㅅ자 흰 가르마
const HACHI_BLUE = "#5f86a8";
function hachiwareHair(f, p) {
  return (c) => {
    const { width, height } = c.canvas;
    c.globalCompositeOperation = "screen"; // 어두운 머리도 밝은 파랑이 되도록 먼저 밝힘
    c.fillStyle = "rgb(105, 130, 155)";
    c.fillRect(0, 0, width, height);
    c.globalCompositeOperation = "color"; // 밝기(머리결)는 유지하고 색만 바꿈
    c.fillStyle = HACHI_BLUE;
    c.fillRect(0, 0, width, height);
    c.globalCompositeOperation = "source-over";
    c.filter = `blur(${Math.round(f.fw * 0.02)}px)`;
    c.fillStyle = "rgba(246, 244, 240, 0.92)";
    tracePath(c, [
      offset(f, p[IDX.top], 0, -0.02),
      offset(f, p[IDX.top], -0.22, 0.7),
      offset(f, p[IDX.top], 0.22, 0.7),
    ]);
    c.fill();
    c.filter = "none";
  };
}

// 치이카와 눈: 실제 눈(변형으로 이미 커진 상태)을 짙게 물들이고 반짝이를 넣음.
// 눈꺼풀 윤곽 안에만 칠하므로 깜빡이면 자연스럽게 같이 감김
export const EYES = [
  { iris: IDX.irisR, corners: [33, 133], lids: [159, 145],
    contour: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] },
  { iris: IDX.irisL, corners: [362, 263], lids: [386, 374],
    contour: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398] },
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function drawChiikawaEyes(ctx, p) {
  const f = faceFrame(p);
  for (const eye of EYES) {
    const ew = dist(p[eye.corners[0]], p[eye.corners[1]]) / f.fw; // 눈 너비 (얼굴 너비 단위)
    const eh = dist(p[eye.lids[0]], p[eye.lids[1]]) / f.fw; // 눈 뜬 높이
    const hl = Math.min(ew * 0.15, eh * 0.4); // 반짝이 크기는 눈 뜬 만큼만
    const contour = eye.contour.map((i) => p[i]);
    ctx.save();
    // 흰자까지 짙게: multiply라서 속눈썹·눈꺼풀 결은 남고, 살짝 번지게 해서 아이라인처럼 보이게
    ctx.globalCompositeOperation = "multiply";
    ctx.filter = `blur(${Math.max(1, Math.round(f.fw * 0.005))}px)`;
    ctx.fillStyle = "rgb(45, 35, 38)";
    tracePath(ctx, contour);
    ctx.fill();
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    // 반짝이: 눈꺼풀 안쪽에만 보이게 잘라냄
    tracePath(ctx, contour);
    ctx.clip();
    local(ctx, f, p[eye.iris], () => {
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(-hl, -hl * 0.6, hl, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(hl * 1.1, hl * 0.7, hl * 0.42, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}

// hair: HairLayer (머리카락 마스크), sway: EarSpring 각도
export function drawMakeup(ctx, p, character, { hair, sway = 0 } = {}) {
  if (character === "none") return;
  const f = faceFrame(p);

  if (character === "usagi") skinTint(ctx, f, p, "rgba(255, 214, 90, 0.4)", "multiply");
  else skinTint(ctx, f, p, "rgba(255, 255, 255, 0.2)", "screen");

  // 귀를 먼저 그리고 그 위에 머리카락을 다시 덮어서, 귀 뿌리가 머리카락에 묻히게 함
  const ears = () => drawEars(ctx, f, p, character, sway, hair);
  if (hair?.ready) hair.composite(ctx, character === "hachiware" ? hachiwareHair(f, p) : null, ears);
  else ears();

  if (character !== "hachiware") worriedBrows(ctx, f, p);
  blush(ctx, f, p);
}
