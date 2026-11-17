import type { VirtualBgMode } from '../types/meeting';

export const VIRTUAL_BG_ASSETS: Record<'studio' | 'lounge', string> = {
  studio: '/src/assets/images/vbg_studio_minimal_1794925233370.jpg',
  lounge: '/src/assets/images/vbg_library_warm_1794925233668.jpg',
};

export interface VirtualBgProcessor {
  outputStream: MediaStream;
  setMode: (mode: VirtualBgMode) => void;
  destroy: () => void;
}

/**
 * Processes a camera MediaStream with optional soft-blur or architectural backdrop
 * compositing via Canvas 2D captureStream without blocking the main thread.
 */
export function createVirtualBgProcessor(
  sourceStream: MediaStream,
  initialMode: VirtualBgMode = 'none'
): VirtualBgProcessor {
  let activeMode: VirtualBgMode = initialMode;
  let rafId = 0;
  let stopped = false;

  const videoTrack = sourceStream.getVideoTracks()[0];
  if (!videoTrack || initialMode === 'none') {
    // Still support dynamic mode switch later if a video track exists
  }

  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext('2d');

  const hiddenVideo = document.createElement('video');
  hiddenVideo.srcObject = new MediaStream(videoTrack ? [videoTrack] : []);
  hiddenVideo.muted = true;
  hiddenVideo.playsInline = true;
  void hiddenVideo.play().catch(() => {});

  const bgImages: Partial<Record<'studio' | 'lounge', HTMLImageElement>> = {};
  (['studio', 'lounge'] as const).forEach((key) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = VIRTUAL_BG_ASSETS[key];
    bgImages[key] = img;
  });

  const canvasStream = canvas.captureStream(30);
  const outputStream = new MediaStream();
  for (const t of sourceStream.getAudioTracks()) {
    outputStream.addTrack(t);
  }
  const canvasVideoTrack = canvasStream.getVideoTracks()[0];
  if (canvasVideoTrack) {
    outputStream.addTrack(canvasVideoTrack);
  }

  let lastDraw = 0;
  const drawFrame = (ts: number) => {
    if (stopped) return;
    rafId = requestAnimationFrame(drawFrame);
    if (ts - lastDraw < 33) return; // cap at ~30fps for 60fps UI responsiveness
    lastDraw = ts;

    if (!ctx || hiddenVideo.readyState < 2) return;
    const w = canvas.width;
    const h = canvas.height;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (activeMode === 'none') {
      ctx.drawImage(hiddenVideo, 0, 0, w, h);
    } else if (activeMode === 'blur') {
      ctx.filter = 'blur(12px)';
      ctx.drawImage(hiddenVideo, -16, -16, w + 32, h + 32);
      ctx.filter = 'none';

      // Center foreground portrait ellipse
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.56, w * 0.27, h * 0.44, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(hiddenVideo, 0, 0, w, h);
    } else {
      const bgImg = bgImages[activeMode];
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.filter = 'blur(2px)';
        ctx.drawImage(bgImg, 0, 0, w, h);
        ctx.filter = 'none';
      } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
      }

      // Soft studio foreground vignette
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.58, w * 0.28, h * 0.43, 0, 0, Math.PI * 2);
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 24;
      ctx.clip();
      ctx.drawImage(hiddenVideo, 0, 0, w, h);
      ctx.restore();
    }

    ctx.restore();
  };

  if (videoTrack) {
    rafId = requestAnimationFrame(drawFrame);
  }

  return {
    outputStream: videoTrack ? outputStream : sourceStream,
    setMode: (mode: VirtualBgMode) => {
      activeMode = mode;
    },
    destroy: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      hiddenVideo.pause();
      hiddenVideo.srcObject = null;
      canvasVideoTrack?.stop();
    },
  };
}
