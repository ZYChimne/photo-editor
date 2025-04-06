// src/workers/lutWorker.ts
interface WorkerMessage {
  type: "start" | "progress" | "result" | "error";
  imageData?: ImageData;
  lutData?: Uint8Array;
  lutSize?: number;
  value?: number;
  message?: string;
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === "start") {
    processImage(e.data.imageData!, e.data.lutData!, e.data.lutSize!);
  }
};

function processImage(
  imageData: ImageData,
  lutData: Uint8Array,
  lutSize: number
) {
  const pixels = imageData.data;
  const totalPixels = pixels.length / 4;
  const updateInterval = Math.floor(totalPixels / 100); // 每1%更新一次

  try {
    for (let i = 0; i < pixels.length; i += 4) {
      // 三线性插值处理
      const [r, g, b] = trilinearInterpolation(
        pixels[i],
        pixels[i + 1],
        pixels[i + 2],
        lutSize,
        lutData
      );

      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;

      // 更新进度
      if ((i / 4) % updateInterval === 0) {
        const progress = Math.round((i / pixels.length) * 100);
        self.postMessage({ type: "progress", value: progress });
      }
    }
    self.postMessage({ type: "result", imageData });
  } catch (err) {
    self.postMessage({ type: "error", message: "Processing failed" });
  }
}

function trilinearInterpolation(
  r: number,
  g: number,
  b: number,
  size: number,
  lut: Uint8Array
) {
  const scale = (size - 1) / 255;
  const x = r * scale;
  const y = g * scale;
  const z = b * scale;

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const z1 = Math.min(z0 + 1, size - 1);

  const xd = x - x0;
  const yd = y - y0;
  const zd = z - z0;

  // 获取8个相邻点颜色
  const c000 = getLUTColor(x0, y0, z0, size, lut);
  const c001 = getLUTColor(x0, y0, z1, size, lut);
  const c010 = getLUTColor(x0, y1, z0, size, lut);
  const c011 = getLUTColor(x0, y1, z1, size, lut);
  const c100 = getLUTColor(x1, y0, z0, size, lut);
  const c101 = getLUTColor(x1, y0, z1, size, lut);
  const c110 = getLUTColor(x1, y1, z0, size, lut);
  const c111 = getLUTColor(x1, y1, z1, size, lut);

  // 三线性插值计算
  const c00 = lerp(c000, c100, xd);
  const c01 = lerp(c001, c101, xd);
  const c0 = lerp(c00, c01, zd);

  const c10 = lerp(c010, c110, xd);
  const c11 = lerp(c011, c111, xd);
  const c1 = lerp(c10, c11, zd);

  return lerp(c0, c1, yd);
}

function getLUTColor(
  x: number,
  y: number,
  z: number,
  size: number,
  lut: Uint8Array
) {
  const index = (x + y * size + z * size * size) * 3;
  return [lut[index], lut[index + 1], lut[index + 2]];
}

function lerp(a: number[], b: number[], t: number) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
