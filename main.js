import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
import { drawMakeup, drawChiikawaEyes, EarSpring } from "./makeup.js";
import { createHairSegmenter, HairLayer } from "./hair.js";
import { Warper, deformFace } from "./warp.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const preview = document.getElementById("preview");
const shotEl = document.getElementById("shot");
let shot = null; // 마지막으로 찍은 사진 (File)
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
const spring = new EarSpring();
let hair = null;

const setStatus = (msg) => (statusEl.textContent = msg);

async function createLandmarker(fileset) {
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
  if (landmarker && w && h && preview.hidden) { // 미리보기 중에는 멈춤 (저장 처리 빠르게)
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
      const shown = warpOn ? deformFace(pts, strength) : pts;
      if (warpOn) {
        warper.render(src, pts, shown, w, h);
        ctx.drawImage(warper.canvas, 0, 0);
      }
      // 머리카락은 (변형된) 화면 자체에서 찾아야 위치가 정확히 맞음
      if (hair && character !== "none") hair.update(canvas);
      drawMakeup(ctx, shown, character, { hair, sway: spring.update(shown) });
      if (warpOn) drawChiikawaEyes(ctx, shown);
      if (source === "photo") setStatus("");
    } else {
      smoothed = null;
      spring.reset();
      hair?.reset();
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
    shot = new File([blob], `${character}-${Date.now()}.jpg`, { type: "image/jpeg" });
    shotEl.src = URL.createObjectURL(shot);
  }, "image/jpeg", 0.92);
  shot = null;
  shotEl.removeAttribute("src");
  preview.hidden = false;
  const flash = document.getElementById("flash");
  flash.style.opacity = "0.8";
  setTimeout(() => (flash.style.opacity = "0"), 80);
}

// 폰: 공유 시트("이미지 저장" / 갤러리) · PC: 파일 다운로드
async function saveShot() {
  if (!shot) return;
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [shot] })) {
    try {
      await navigator.share({ files: [shot] });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // 사용자가 공유 창을 닫음
    }
  }
  const a = document.createElement("a");
  a.href = shotEl.src;
  a.download = shot.name;
  a.click();
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
document.getElementById("save").addEventListener("click", saveShot);
document.getElementById("retake").addEventListener("click", () => {
  if (shotEl.src) URL.revokeObjectURL(shotEl.src);
  preview.hidden = true;
});
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
const fileset = await FilesetResolver.forVisionTasks(WASM);
landmarker = await createLandmarker(fileset);
createHairSegmenter(fileset)
  .then((seg) => (hair = new HairLayer(seg)))
  .catch((e) => console.warn("머리카락 인식 모델을 불러오지 못했어요", e));
setStatus("카메라 켜는 중…");
await startCamera();
requestAnimationFrame(loop);
