import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MeetingRecord, UserProfile } from '../../src/types/meeting';

export interface VercelRequest extends IncomingMessage {
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  headers: IncomingMessage['headers'];
}

export interface VercelResponse extends ServerResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
}

const STORE_FILE = path.join('/tmp', 'ketemu-vercel-store.json');
const SECRET = process.env.SESSION_SECRET || 'ketemu-vercel-ephemeral-secret-key';

interface StoreData {
  meetings: Record<string, MeetingRecord & { passwordHash?: string | null }>;
  users: Record<string, UserProfile & { passwordHash?: string | null }>;
}

export function readStore(): StoreData {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      return JSON.parse(raw) as StoreData;
    }
  } catch {
    // ignore read error on cold /tmp
  }
  return { meetings: {}, users: {} };
}

export function writeStore(data: StoreData): void {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(data), 'utf-8');
  } catch {
    // ignore ephemeral /tmp write errors
  }
}

export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(secret: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(secret, salt, 64);
  const keyBuf = Buffer.from(key, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function signStatelessToken(payloadObj: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyStatelessToken<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as T;
  } catch {
    return null;
  }
}

export function getSeedMeetings(): MeetingRecord[] {
  const now = Date.now();
  return [
    {
      id: 'mtg_seed_1',
      code: 'ktm-4821-x9q',
      title: 'Sinkronisasi Produk Q4 & Roadmap SFU',
      hostId: 'usr_seed_nadia',
      hostName: 'Nadia Kusuma',
      status: 'scheduled',
      scheduledAt: new Date(now + 3600_000 * 2).toISOString(),
      hasPassword: false,
      isLocked: false,
      waitingRoomEnabled: true,
      region: process.env.LIVEKIT_REGION || 'sin1',
      createdAt: new Date(now - 3600_000).toISOString(),
      endedAt: null,
      participantPeak: 0,
      durationSec: 0,
    },
    {
      id: 'mtg_seed_2',
      code: 'ktm-7392-m4p',
      title: 'Tinjauan Desain Antarmuka Mobile',
      hostId: 'usr_seed_nadia',
      hostName: 'Nadia Kusuma',
      status: 'scheduled',
      scheduledAt: new Date(now + 86400_000).toISOString(),
      hasPassword: false,
      isLocked: false,
      waitingRoomEnabled: false,
      region: process.env.LIVEKIT_REGION || 'sin1',
      createdAt: new Date(now - 7200_000).toISOString(),
      endedAt: null,
      participantPeak: 0,
      durationSec: 0,
    },
    {
      id: 'mtg_seed_3',
      code: 'ktm-1950-r7w',
      title: 'Evaluasi Latensi WebRTC Region Singapore',
      hostId: 'usr_seed_nadia',
      hostName: 'Nadia Kusuma',
      status: 'ended',
      scheduledAt: new Date(now - 86400_000).toISOString(),
      hasPassword: false,
      isLocked: false,
      waitingRoomEnabled: false,
      region: process.env.LIVEKIT_REGION || 'sin1',
      createdAt: new Date(now - 86400_000 * 2).toISOString(),
      endedAt: new Date(now - 86400_000 + 2700_000).toISOString(),
      participantPeak: 14,
      durationSec: 2700,
    },
  ];
}

export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}

export function parseBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return req.body as Record<string, unknown>;
}
