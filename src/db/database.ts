import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import path from 'node:path';
import type { ChatMessage, MeetingRecord, UserProfile } from '../types/meeting.ts';
import { pickAvatarColor } from '../utils/meetingLogic.ts';

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.cwd(), process.env.DATABASE_PATH)
  : path.resolve(process.cwd(), 'ketemu.db');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'email',
    avatar_color TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    host_id TEXT NOT NULL,
    host_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    scheduled_at TEXT,
    password_hash TEXT,
    is_locked INTEGER NOT NULL DEFAULT 0,
    waiting_room_enabled INTEGER NOT NULL DEFAULT 0,
    region TEXT NOT NULL DEFAULT 'sin1',
    created_at TEXT NOT NULL,
    ended_at TEXT,
    participant_peak INTEGER NOT NULL DEFAULT 1,
    duration_sec INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    meeting_code TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    text TEXT NOT NULL,
    file_name TEXT,
    file_data_url TEXT,
    file_size INTEGER,
    created_at TEXT NOT NULL
  );
`);

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

// Seed initial Indonesian SaaS workspace data if database is empty
const meetingCountRow = db.prepare('SELECT COUNT(*) as cnt FROM meetings').get() as { cnt: number };
if (meetingCountRow.cnt === 0) {
  const now = Date.now();
  const seedHostId = 'usr_seed_nadia';
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, password_hash, auth_provider, avatar_color, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    seedHostId,
    'Nadia Kusuma',
    'nadia@ketemu.id',
    hashSecret('ketemu2026'),
    'email',
    '#2563EB',
    new Date(now - 86400_000 * 5).toISOString()
  );

  const insertMeeting = db.prepare(
    `INSERT INTO meetings (id, code, title, host_id, host_name, status, scheduled_at, password_hash, is_locked, waiting_room_enabled, region, created_at, ended_at, participant_peak, duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  insertMeeting.run(
    'mtg_seed_1',
    'ktm-4821-x9q',
    'Sinkronisasi Produk Q4 & Roadmap SFU',
    seedHostId,
    'Nadia Kusuma',
    'scheduled',
    new Date(now + 3600_000 * 2).toISOString(),
    null,
    0,
    1,
    'sin1',
    new Date(now - 3600_000).toISOString(),
    null,
    0,
    0
  );

  insertMeeting.run(
    'mtg_seed_2',
    'ktm-7392-m4p',
    'Tinjauan Desain Antarmuka Mobile',
    seedHostId,
    'Nadia Kusuma',
    'scheduled',
    new Date(now + 86400_000).toISOString(),
    hashSecret('desain2026'),
    0,
    0,
    'sin1',
    new Date(now - 7200_000).toISOString(),
    null,
    0,
    0
  );

  insertMeeting.run(
    'mtg_seed_3',
    'ktm-1950-r7w',
    'Evaluasi Latensi WebRTC Region Singapore',
    seedHostId,
    'Nadia Kusuma',
    'ended',
    new Date(now - 86400_000).toISOString(),
    null,
    0,
    0,
    'sin1',
    new Date(now - 86400_000 * 2).toISOString(),
    new Date(now - 86400_000 + 2700_000).toISOString(),
    14,
    2700
  );

  insertMeeting.run(
    'mtg_seed_4',
    'ktm-6204-b3n',
    'Standup Engineering Mingguan',
    seedHostId,
    'Nadia Kusuma',
    'ended',
    new Date(now - 86400_000 * 3).toISOString(),
    null,
    0,
    0,
    'sin1',
    new Date(now - 86400_000 * 4).toISOString(),
    new Date(now - 86400_000 * 3 + 1500_000).toISOString(),
    8,
    1500
  );
}

interface RawMeetingRow {
  id: string;
  code: string;
  title: string;
  host_id: string;
  host_name: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduled_at: string | null;
  password_hash: string | null;
  is_locked: number;
  waiting_room_enabled: number;
  region: string;
  created_at: string;
  ended_at: string | null;
  participant_peak: number;
  duration_sec: number;
}

function mapMeetingRow(row: RawMeetingRow): MeetingRecord {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    hostId: row.host_id,
    hostName: row.host_name,
    status: row.status,
    scheduledAt: row.scheduled_at,
    hasPassword: Boolean(row.password_hash),
    isLocked: Boolean(row.is_locked),
    waitingRoomEnabled: Boolean(row.waiting_room_enabled),
    region: row.region,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    participantPeak: row.participant_peak,
    durationSec: row.duration_sec,
  };
}

export function createUserWithEmail(name: string, email: string, password: string): UserProfile {
  const id = `usr_${crypto.randomUUID().slice(0, 12)}`;
  const avatarColor = pickAvatarColor(name + email);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, auth_provider, avatar_color, created_at)
     VALUES (?, ?, ?, ?, 'email', ?, ?)`
  ).run(id, name.trim(), email.trim().toLowerCase(), hashSecret(password), avatarColor, createdAt);
  return { id, name: name.trim(), email: email.trim().toLowerCase(), authProvider: 'email', avatarColor };
}

export function authenticateUserWithEmail(email: string, password: string): UserProfile | null {
  const row = db
    .prepare('SELECT id, name, email, password_hash, auth_provider, avatar_color FROM users WHERE email = ?')
    .get(email.trim().toLowerCase()) as
    | {
        id: string;
        name: string;
        email: string;
        password_hash: string | null;
        auth_provider: 'email' | 'google' | 'guest';
        avatar_color: string;
      }
    | undefined;
  if (!row || !row.password_hash) return null;
  if (!verifySecret(password, row.password_hash)) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    authProvider: row.auth_provider,
    avatarColor: row.avatar_color,
  };
}

export function upsertOAuthOrGuestUser(params: {
  name: string;
  email?: string | null;
  provider: 'google' | 'guest';
}): UserProfile {
  if (params.email) {
    const existing = db
      .prepare('SELECT id, name, email, auth_provider, avatar_color FROM users WHERE email = ?')
      .get(params.email.trim().toLowerCase()) as
      | {
          id: string;
          name: string;
          email: string;
          auth_provider: 'email' | 'google' | 'guest';
          avatar_color: string;
        }
      | undefined;
    if (existing) {
      return {
        id: existing.id,
        name: existing.name,
        email: existing.email,
        authProvider: existing.auth_provider,
        avatarColor: existing.avatar_color,
      };
    }
  }

  const id = `usr_${crypto.randomUUID().slice(0, 12)}`;
  const avatarColor = pickAvatarColor(params.name + id);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, auth_provider, avatar_color, created_at)
     VALUES (?, ?, ?, NULL, ?, ?, ?)`
  ).run(
    id,
    params.name.trim(),
    params.email ? params.email.trim().toLowerCase() : null,
    params.provider,
    avatarColor,
    createdAt
  );

  return {
    id,
    name: params.name.trim(),
    email: params.email ? params.email.trim().toLowerCase() : null,
    authProvider: params.provider,
    avatarColor,
  };
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
  return token;
}

export function getUserBySessionToken(token: string): UserProfile | null {
  const row = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.auth_provider, u.avatar_color, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as
    | {
        id: string;
        name: string;
        email: string | null;
        auth_provider: 'email' | 'google' | 'guest';
        avatar_color: string;
        expires_at: number;
      }
    | undefined;

  if (!row || row.expires_at < Date.now()) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    authProvider: row.auth_provider,
    avatarColor: row.avatar_color,
  };
}

export function listMeetings(): MeetingRecord[] {
  const rows = db
    .prepare('SELECT * FROM meetings ORDER BY created_at DESC LIMIT 50')
    .all() as RawMeetingRow[];
  return rows.map(mapMeetingRow);
}

export function getMeetingByCode(code: string): MeetingRecord | null {
  const row = db.prepare('SELECT * FROM meetings WHERE code = ?').get(code) as RawMeetingRow | undefined;
  return row ? mapMeetingRow(row) : null;
}

export function verifyMeetingPassword(code: string, password: string): boolean {
  const row = db.prepare('SELECT password_hash FROM meetings WHERE code = ?').get(code) as
    | { password_hash: string | null }
    | undefined;
  if (!row) return false;
  if (!row.password_hash) return true;
  return verifySecret(password, row.password_hash);
}

export function createMeetingRecord(params: {
  code: string;
  title: string;
  hostId: string;
  hostName: string;
  status: 'scheduled' | 'live';
  scheduledAt: string | null;
  password?: string | null;
  waitingRoomEnabled: boolean;
  region?: string;
}): MeetingRecord {
  const id = `mtg_${crypto.randomUUID().slice(0, 12)}`;
  const createdAt = new Date().toISOString();
  const passwordHash = params.password && params.password.trim().length > 0 ? hashSecret(params.password.trim()) : null;
  const region = params.region ?? process.env.LIVEKIT_REGION ?? 'sin1';

  db.prepare(
    `INSERT INTO meetings (id, code, title, host_id, host_name, status, scheduled_at, password_hash, is_locked, waiting_room_enabled, region, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    id,
    params.code,
    params.title.trim(),
    params.hostId,
    params.hostName.trim(),
    params.status,
    params.scheduledAt,
    passwordHash,
    params.waitingRoomEnabled ? 1 : 0,
    region,
    createdAt
  );

  return getMeetingByCode(params.code)!;
}

export function updateMeetingSecurity(
  code: string,
  patch: { isLocked?: boolean; waitingRoomEnabled?: boolean; status?: 'scheduled' | 'live' | 'ended'; hostId?: string }
): void {
  const current = db.prepare('SELECT * FROM meetings WHERE code = ?').get(code) as RawMeetingRow | undefined;
  if (!current) return;

  db.prepare(
    `UPDATE meetings
     SET is_locked = ?, waiting_room_enabled = ?, status = ?, host_id = ?
     WHERE code = ?`
  ).run(
    patch.isLocked !== undefined ? (patch.isLocked ? 1 : 0) : current.is_locked,
    patch.waitingRoomEnabled !== undefined ? (patch.waitingRoomEnabled ? 1 : 0) : current.waiting_room_enabled,
    patch.status ?? current.status,
    patch.hostId ?? current.host_id,
    code
  );
}

export function recordMeetingPeakAndDuration(code: string, participantCount: number, durationSec?: number): void {
  const current = db.prepare('SELECT participant_peak, duration_sec FROM meetings WHERE code = ?').get(code) as
    | { participant_peak: number; duration_sec: number }
    | undefined;
  if (!current) return;

  const nextPeak = Math.max(current.participant_peak, participantCount);
  const nextDuration = durationSec !== undefined ? Math.max(current.duration_sec, durationSec) : current.duration_sec;
  db.prepare('UPDATE meetings SET participant_peak = ?, duration_sec = ? WHERE code = ?').run(nextPeak, nextDuration, code);
}

export function endMeetingRecord(code: string, durationSec: number): void {
  db.prepare(
    `UPDATE meetings
     SET status = 'ended', ended_at = ?, duration_sec = MAX(duration_sec, ?)
     WHERE code = ?`
  ).run(new Date().toISOString(), durationSec, code);
}

export function saveChatMessage(msg: ChatMessage): void {
  db.prepare(
    `INSERT INTO messages (id, meeting_code, sender_id, sender_name, text, file_name, file_data_url, file_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    msg.id,
    msg.meetingCode,
    msg.senderId,
    msg.senderName,
    msg.text,
    msg.fileName ?? null,
    msg.fileDataUrl ?? null,
    msg.fileSize ?? null,
    msg.createdAt
  );
}

export function getMeetingMessages(code: string): ChatMessage[] {
  const rows = db
    .prepare('SELECT * FROM messages WHERE meeting_code = ? ORDER BY created_at ASC LIMIT 200')
    .all(code) as Array<{
    id: string;
    meeting_code: string;
    sender_id: string;
    sender_name: string;
    text: string;
    file_name: string | null;
    file_data_url: string | null;
    file_size: number | null;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    meetingCode: r.meeting_code,
    senderId: r.sender_id,
    senderName: r.sender_name,
    text: r.text,
    fileName: r.file_name ?? undefined,
    fileDataUrl: r.file_data_url ?? undefined,
    fileSize: r.file_size ?? undefined,
    createdAt: r.created_at,
  }));
}
