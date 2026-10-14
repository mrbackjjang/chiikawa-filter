// MediaPipe Face Mesh 랜드마크 인덱스
export const IDX = {
  faceL: 234, faceR: 454, top: 10, chin: 152,
  irisR: 468, irisL: 473, // R = 사용자의 오른쪽(이미지 왼쪽)
  mouthR: 61, mouthL: 291,
};
export const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const FOREHEAD_TOP = [127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356];

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

function chiikawaEars(ctx, f, p) {
  local(ctx, f, offset(f, p[IDX.top], 0, 0.2), () => {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * 0.28, 0.06, 0.15, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = "#fffdfa";
      ctx.fill();
      ctx.stroke();
    }
  });
}

function hachiwareCap(ctx, f, p) {
  const blue = "#5f86a8";
  // 고양이 귀
  local(ctx, f, offset(f, p[IDX.top], 0, 0.3), () => {
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * 0.14, 0.1);
      ctx.lineTo(side * 0.34, -0.17);
      ctx.lineTo(side * 0.44, 0.12);
      ctx.closePath();
      ctx.fillStyle = blue;
      ctx.fill();
      ctx.stroke();
    }
  });
  // 가운데가 ㅅ자로 갈라진 파란 머리
  const upper = FOREHEAD_TOP.map((i) => offset(f, p[i], 0, 0.28)).reverse(); // 오른쪽 → 왼쪽으로 돌아오며 다각형을 닫음
  const lowerRight = [127, 70, 63, 105].map((i, k) => (k ? offset(f, p[i], 0, 0.06) : p[i]));
  const apex = offset(f, p[IDX.top], 0, 0.05);
  const lowerLeft = [334, 293, 300, 356].map((i, k) => (k < 3 ? offset(f, p[i], 0, 0.06) : p[i]));
  ctx.save();
  ctx.fillStyle = blue;
  ctx.strokeStyle = INK;
  ctx.lineWidth = f.fw * 0.014;
  ctx.lineJoin = "round";
  tracePath(ctx, [...lowerRight, apex, ...lowerLeft, ...upper]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function usagiEars(ctx, f, p) {
  local(ctx, f, offset(f, p[IDX.top], 0, 0.2), () => {
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * 0.17, 0);
      ctx.rotate(side * 0.12);
      ctx.beginPath();
      ctx.ellipse(0, -0.42, 0.1, 0.47, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#f5df8e";
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -0.42, 0.045, 0.33, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#eaa6b8";
      ctx.fill();
      ctx.restore();
    }
  });
}

// 까만 콩 눈: 눈을 감으면 ^ 모양으로 바뀜
const EYES = [
  { iris: IDX.irisR, corners: [33, 133], lids: [159, 145] },
  { iris: IDX.irisL, corners: [362, 263], lids: [386, 374] },
];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function drawBeanEyes(ctx, p) {
  const f = faceFrame(p);
  for (const eye of EYES) {
    const eyeW = dist(p[eye.corners[0]], p[eye.corners[1]]) / f.fw; // 얼굴 너비 단위
    const open = dist(p[eye.lids[0]], p[eye.lids[1]]) / (eyeW * f.fw);
    const rx = eyeW * 0.62, ry = eyeW * 0.7;
    local(ctx, f, p[eye.iris], () => {
      if (open < 0.16) {
        ctx.lineWidth = rx * 0.28;
        ctx.beginPath();
        ctx.moveTo(-rx * 0.8, rx * 0.15);
        ctx.quadraticCurveTo(0, -rx * 0.6, rx * 0.8, rx * 0.15);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = "#1d1919";
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-rx * 0.3, -ry * 0.35, rx * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(rx * 0.28, ry * 0.32, rx * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

export function drawMakeup(ctx, p, character) {
  if (character === "none") return;
  const f = faceFrame(p);

  if (character === "usagi") {
    skinTint(ctx, f, p, "rgba(255, 214, 90, 0.4)", "multiply");
    usagiEars(ctx, f, p);
    worriedBrows(ctx, f, p);
  } else {
    skinTint(ctx, f, p, "rgba(255, 255, 255, 0.2)", "screen");
    if (character === "chiikawa") {
      chiikawaEars(ctx, f, p);
      worriedBrows(ctx, f, p);
    } else {
      hachiwareCap(ctx, f, p);
    }
  }
  blush(ctx, f, p);
}
