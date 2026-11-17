import { VideoPresets, type RoomConnectOptions, type RoomOptions } from 'livekit-client';

const SAFE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generates an unpredictable, URL-safe meeting code in the format xxx-yyyy-zzz.
 */
export function generateMeetingCode(randomFn?: () => number): string {
  const pick = (len: number): string => {
    let out = '';
    for (let i = 0; i < len; i += 1) {
      let rand: number;
      if (randomFn) {
        rand = randomFn();
      } else if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        const arr = new Uint32Array(1);
        globalThis.crypto.getRandomValues(arr);
        rand = arr[0] / 0xffffffff;
      } else {
        rand = Math.random();
      }
      const idx = Math.min(SAFE_ALPHABET.length - 1, Math.floor(rand * SAFE_ALPHABET.length));
      out += SAFE_ALPHABET[idx];
    }
    return out;
  };
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

/**
 * Normalizes a full Ketemu URL or raw meeting code into lowercase xxx-yyyy-zzz, or null if invalid.
 */
export function normalizeMeetingCode(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  try {
    if (trimmed.includes('://') || trimmed.includes('/room/') || trimmed.includes('?room=')) {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://ketemu.app/${trimmed.replace(/^\/+/, '')}`);
      const roomParam = url.searchParams.get('room');
      if (roomParam) {
        candidate = roomParam;
      } else {
        const parts = url.pathname.split('/').filter(Boolean);
        candidate = parts[parts.length - 1] || '';
      }
    }
  } catch {
    // Fall back to direct string parsing
  }

  const cleaned = candidate.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (/^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

export interface MeetingValidationResult {
  valid: boolean;
  error?: string;
}

export function validateMeetingPayload(input: {
  title?: string;
  scheduledAt?: string | null;
  password?: string | null;
}): MeetingValidationResult {
  const title = (input.title ?? '').trim();
  if (title.length < 2 || title.length > 100) {
    return { valid: false, error: 'Judul meeting harus antara 2 hingga 100 karakter.' };
  }
  if (input.scheduledAt) {
    const parsed = Date.parse(input.scheduledAt);
    if (Number.isNaN(parsed)) {
      return { valid: false, error: 'Format jadwal waktu meeting tidak valid.' };
    }
  }
  if (input.password && input.password.length > 0 && input.password.length < 4) {
    return { valid: false, error: 'Kata sandi ruangan minimal 4 karakter.' };
  }
  return { valid: true };
}

export interface GridDimensions {
  cols: number;
  rows: number;
  maxVisible: number;
}

/**
 * Computes balanced grid columns & rows for 60fps rendering across 1..25 participants.
 */
export function computeGridLayout(participantCount: number, hasStageSpotlight = false): GridDimensions {
  const count = Math.max(1, participantCount);
  if (hasStageSpotlight) {
    return { cols: 1, rows: 1, maxVisible: Math.min(count, 6) };
  }
  if (count === 1) return { cols: 1, rows: 1, maxVisible: 1 };
  if (count === 2) return { cols: 2, rows: 1, maxVisible: 2 };
  if (count <= 4) return { cols: 2, rows: 2, maxVisible: 4 };
  if (count <= 6) return { cols: 3, rows: 2, maxVisible: 6 };
  if (count <= 9) return { cols: 3, rows: 3, maxVisible: 9 };
  if (count <= 12) return { cols: 4, rows: 3, maxVisible: 12 };
  return { cols: 4, rows: 4, maxVisible: 16 };
}

/**
 * Builds ultra-low-delay LiveKit SFU RoomOptions with simulcast, dynacast,
 * adaptive stream, audio priority (DTX/RED), and hardware DSP constraints.
 */
export function buildLiveKitRoomOptions(params?: {
  audioDeviceId?: string;
  videoDeviceId?: string;
}): RoomOptions {
  return {
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: true,
    videoCaptureDefaults: {
      deviceId: params?.videoDeviceId || undefined,
      resolution: VideoPresets.h720.resolution,
      facingMode: 'user',
    },
    audioCaptureDefaults: {
      deviceId: params?.audioDeviceId || undefined,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    publishDefaults: {
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
      dtx: true,
      red: true,
      audioPreset: {
        maxBitrate: 48_000,
        priority: 'high',
      },
      screenShareSimulcastLayers: [VideoPresets.h720, VideoPresets.h1080],
    },
  };
}

export function buildLiveKitConnectOptions(iceServers?: RTCIceServer[]): RoomConnectOptions {
  return {
    autoSubscribe: true,
    rtcConfig: iceServers?.length
      ? {
          iceServers,
          iceTransportPolicy: 'all',
        }
      : undefined,
  };
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly hits = new Map<string, number[]>();

  constructor(maxRequests = 60, windowMs = 60_000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  public check(key: string, now = Date.now()): { allowed: boolean; remaining: number } {
    const cutoff = now - this.windowMs;
    const prev = this.hits.get(key) ?? [];
    const active = prev.filter((ts) => ts > cutoff);

    if (active.length >= this.maxRequests) {
      this.hits.set(key, active);
      return { allowed: false, remaining: 0 };
    }

    active.push(now);
    this.hits.set(key, active);
    return { allowed: true, remaining: this.maxRequests - active.length };
  }
}

const AVATAR_PALETTE = [
  '#2563EB',
  '#4F46E5',
  '#0EA5E9',
  '#0D9488',
  '#7C3AED',
  '#D97706',
  '#E11D48',
];

export function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
