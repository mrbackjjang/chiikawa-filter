import { ImageSegmenter } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const HAIR_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite";

export async function createHairSegmenter(fileset) {
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: HAIR_MODEL, delegate },
    runningMode: "VIDEO",
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
  try {
    return await ImageSegmenter.createFromOptions(fileset, opts("GPU"));
  } catch {
    return await ImageSegmenter.createFromOptions(fileset, opts("CPU"));
  }
}

// 머리카락 마스크를 만들고, 화면의 머리카락 부분만 떼어서 다시 덮어씌우는 레이어
export class HairLayer {
  constructor(segmenter) {
    this.segmenter = segmenter;
    this.mask = document.createElement("canvas");
    this.mctx = this.mask.getContext("2d");
    this.layer = document.createElement("canvas");
    this.lctx = this.layer.getContext("2d");
    this.ready = false;
    this.lastTs = -1;
  }

  update(src) {
    let ts = performance.now();
    if (ts <= this.lastTs) ts = this.lastTs + 1;
    this.lastTs = ts;
    this.segmenter.segmentForVideo(src, ts, (res) => {
      const masks = res.confidenceMasks;
      if (!masks?.length) return;
      const m = masks[masks.length - 1]; // 마지막 채널 = 머리카락 확률
      if (this.mask.width !== m.width || this.mask.height !== m.height) {
        this.mask.width = m.width;
        this.mask.height = m.height;
        this.img = this.mctx.createImageData(m.width, m.height);
        this.img.data.fill(255);
      }
      const prob = m.getAsFloat32Array();
      const px = this.img.data;
      for (let i = 0; i < prob.length; i++) {
        const v = (prob[i] - 0.25) * 2; // 0.25~0.75 구간을 부드러운 경계로
        px[4 * i + 3] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
      }
      this.mctx.putImageData(this.img, 0, 0);
      this.ready = true;
    });
  }

  reset() {
    this.ready = false;
  }

  // start(px)에서 dir 방향으로 maxLen(px)까지 가며, 머리카락이 마지막으로 있는 거리(px)
  hairExtent(start, dir, maxLen, canvasW) {
    if (!this.ready) return null;
    const s = this.mask.width / canvasW;
    const { width: mw, height: mh } = this.mask;
    let last = 0;
    for (let t = 0; t <= maxLen; t += 2) {
      const x = Math.round((start.x + dir.x * t) * s), y = Math.round((start.y + dir.y * t) * s);
      if (x < 0 || y < 0 || x >= mw || y >= mh) break;
      if (this.img.data[4 * (y * mw + x) + 3] > 128) last = t;
    }
    return last;
  }

  // paint(c): 머리카락 레이어 색 바꾸기 (선택), behind(): 머리카락 뒤에 그릴 것 (귀)
  composite(ctx, paint, behind) {
    const { width: w, height: h } = ctx.canvas;
    if (this.layer.width !== w || this.layer.height !== h) {
      this.layer.width = w;
      this.layer.height = h;
    }
    const c = this.lctx;
    c.globalCompositeOperation = "copy";
    c.drawImage(ctx.canvas, 0, 0);
    c.globalCompositeOperation = "source-over";
    paint?.(c);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(this.mask, 0, 0, w, h);
    c.globalCompositeOperation = "source-over";

    behind();
    ctx.drawImage(this.layer, 0, 0);
  }
}
