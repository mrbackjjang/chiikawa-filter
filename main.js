import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { drawMakeup, drawBeanEyes } from "./makeup.js";
import { Warper, deformFace } from "./warp.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const video = Object.assign(document.createElement("video"), { playsInline: true, muted: true });

let landmarker = null;
let character = "chiikawa";
let source = "camera"; // "camera" | "photo"
let photo = null;
let smoothed = null;
let lastTs = -1;
let warpOn = false;
let strength = 0.7;
const warper = new Warper();

const setStatus = (msg) => (statusEl.textContent = msg);

async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, opts("GPU"));
  } catch {
    return await FaceLandmarker.createFromOptions(fileset, opts("CPU"));
  }
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    source = "camera";
    canvas.classList.add("mirror");
    setStatus("");
  } catch (e) {
    console.warn(e);
    setStatus("카메라를 쓸 수 없어요. '사진 올리기'로 테스트해 보세요.");
  }
}

// 랜드마크 떨림을 줄이기 위한 지수 평활
function smooth(points) {
  if (!smoothed || smoothed.length !== points.length) {
    smoothed = points.map((p) => ({ x: p.x, y: p.y }));
  } else {
    const a = 0.55;
    for (let i = 0; i < points.length; i++) {
      smoothed[i].x += (points[i].x - smoothed[i].x) * a;
      smoothed[i].y += (points[i].y - smoothed[i].y) * a;
    }
  }
  return smoothed;
}

function loop() {
  const src = source === "camera" ? video : photo;
  const w = src && (src.videoWidth || src.naturalWidth);
  const h = src && (src.videoHeight || src.naturalHeight);
  if (landmarker && w && h) {
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.drawImage(src, 0, 0, w, h);

    let ts = performance.now();
    if (ts <= lastTs) ts = lastTs + 1;
    lastTs = ts;
    const face = landmarker.detectForVideo(src, ts).faceLandmarks[0];
    if (face) {
      const pts = smooth(face).map((p) => ({ x: p.x * w, y: p.y * h }));
      if (warpOn) {
        const warped = deformFace(pts, strength);
        warper.render(src, pts, warped, w, h);
        ctx.drawImage(warper.canvas, 0, 0);
        drawMakeup(ctx, warped, character);
        drawBeanEyes(ctx, warped);
      } else {
        drawMakeup(ctx, pts, character);
      }
      if (source === "photo") setStatus("");
    } else {
      smoothed = null;
      if (source === "photo") setStatus("얼굴을 찾지 못했어요.");
    }
  }
  requestAnimationFrame(loop);
}

function capture() {
  if (!canvas.width) return;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const c = out.getContext("2d");
  if (canvas.classList.contains("mirror")) {
    c.translate(out.width, 0);
    c.scale(-1, 1);
  }
  c.drawImage(canvas, 0, 0);
  out.toBlob((blob) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${character}-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  const flash = document.getElementById("flash");
  flash.style.opacity = "0.8";
  setTimeout(() => (flash.style.opacity = "0"), 80);
}

document.querySelectorAll("#chars .chip").forEach((btn) =>
  btn.addEventListener("click", () => {
    character = btn.dataset.char;
    document.querySelectorAll("#chars .chip").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  })
);
document.getElementById("warp").addEventListener("click", (e) => {
  warpOn = !warpOn;
  e.currentTarget.setAttribute("aria-pressed", String(warpOn));
});
document.getElementById("strength").addEventListener("input", (e) => (strength = e.target.value / 100));
document.getElementById("shutter").addEventListener("click", capture);
document.getElementById("camera").addEventListener("click", startCamera);
document.getElementById("upload").addEventListener("click", () => document.getElementById("file").click());
document.getElementById("file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    photo = img;
    source = "photo";
    smoothed = null;
    canvas.classList.remove("mirror");
  };
  img.src = URL.createObjectURL(file);
});

setStatus("얼굴 인식 모델 불러오는 중…");
landmarker = await createLandmarker();
setStatus("카메라 켜는 중…");
await startCamera();
requestAnimationFrame(loop);
