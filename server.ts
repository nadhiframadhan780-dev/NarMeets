import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { AccessToken } from 'livekit-server-sdk';
import { createServer as createViteServer } from 'vite';
import {
  authenticateUserWithEmail,
  createMeetingRecord,
  createSession,
  createUserWithEmail,
  endMeetingRecord,
  getMeetingByCode,
  getMeetingMessages,
  getUserBySessionToken,
  listMeetings,
  recordMeetingPeakAndDuration,
  saveChatMessage,
  updateMeetingSecurity,
  upsertOAuthOrGuestUser,
  verifyMeetingPassword,
} from './src/db/database.ts';
import {
  generateMeetingCode,
  normalizeMeetingCode,
  SlidingWindowRateLimiter,
  validateMeetingPayload,
} from './src/utils/meetingLogic.ts';
import type {
  ChatMessage,
  ParticipantState,
  WaitingParticipant,
  WsClientMessage,
  WsServerMessage,
} from './src/types/meeting.ts';

const PORT = Number(process.env.PORT ?? 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Rate limiters per endpoint group
const apiLimiter = new SlidingWindowRateLimiter(120, 60_000);
const authLimiter = new SlidingWindowRateLimiter(30, 60_000);
const tokenLimiter = new SlidingWindowRateLimiter(40, 60_000);

// Ephemeral HMAC token for verified meeting password access
const SERVER_HMAC_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function signPasswordGrant(code: string, participantId: string): string {
  const payload = `${code}:${participantId}:${Date.now() + 3600_000}`;
  const sig = crypto.createHmac('sha256', SERVER_HMAC_SECRET).update(payload).digest('hex');
  return `${payload}:${sig}`;
}

function verifyPasswordGrant(token: string | undefined, code: string, participantId: string): boolean {
  if (!token) return false;
  const parts = token.split(':');
  if (parts.length !== 4) return false;
  const [tCode, tPid, expStr, sig] = parts;
  if (tCode !== code || tPid !== participantId) return false;
  if (Number(expStr) < Date.now()) return false;
  const expected = crypto.createHmac('sha256', SERVER_HMAC_SECRET).update(`${tCode}:${tPid}:${expStr}`).digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function rateLimitMiddleware(limiter: SlidingWindowRateLimiter) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getClientIp(req);
    const result = limiter.check(key);
    if (!result.allowed) {
      res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.' });
      return;
    }
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    next();
  };
}

function getIceServers(): RTCIceServer[] {
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

// Authoritative Live Room State
interface ConnectedClient {
  ws: WebSocket;
  participant: ParticipantState;
  code: string;
}

interface WaitingClient {
  ws: WebSocket;
  waiting: WaitingParticipant;
  initialState: { isMuted: boolean; isCamOff: boolean };
}

interface LiveRoomState {
  code: string;
  hostId: string;
  coHostIds: Set<string>;
  isLocked: boolean;
  waitingRoomEnabled: boolean;
  startedAtMs: number;
  clients: Map<string, ConnectedClient>;
  waiting: Map<string, WaitingClient>;
}

const liveRooms = new Map<string, LiveRoomState>();

function sendWs(ws: WebSocket, payload: WsServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(room: LiveRoomState, payload: WsServerMessage, excludeId?: string): void {
  for (const [pid, client] of room.clients.entries()) {
    if (excludeId && pid === excludeId) continue;
    sendWs(client.ws, payload);
  }
}

function syncRoomState(room: LiveRoomState): void {
  const participants = Array.from(room.clients.values()).map((c) => c.participant);
  const waitingQueue = Array.from(room.waiting.values()).map((w) => w.waiting);
  broadcastRoom(room, {
    type: 'room:state-sync',
    participants,
    waitingQueue,
    isLocked: room.isLocked,
    waitingRoomEnabled: room.waitingRoomEnabled,
    hostId: room.hostId,
  });
}

function getOrCreateLiveRoom(code: string): LiveRoomState {
  const existing = liveRooms.get(code);
  if (existing) return existing;

  const dbMeeting = getMeetingByCode(code);
  const room: LiveRoomState = {
    code,
    hostId: dbMeeting?.hostId ?? '',
    coHostIds: new Set(),
    isLocked: dbMeeting?.isLocked ?? false,
    waitingRoomEnabled: dbMeeting?.waitingRoomEnabled ?? false,
    startedAtMs: Date.now(),
    clients: new Map(),
    waiting: new Map(),
  };
  liveRooms.set(code, room);
  return room;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api', rateLimitMiddleware(apiLimiter));

  // Healthcheck
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      region: process.env.LIVEKIT_REGION || 'sin1',
      livekitConfigured: Boolean(
        process.env.LIVEKIT_API_KEY &&
          process.env.LIVEKIT_API_SECRET &&
          process.env.LIVEKIT_URL &&
          !process.env.LIVEKIT_API_KEY.startsWith('MY_')
      ),
    });
  });

  // Auth endpoints
  app.post('/api/auth/register', rateLimitMiddleware(authLimiter), (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ error: 'Nama minimal 2 karakter.' });
      return;
    }
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Format email tidak valid.' });
      return;
    }
    if (typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' });
      return;
    }

    try {
      const user = createUserWithEmail(name, email, password);
      const token = createSession(user.id);
      res.status(201).json({ user, sessionToken: token });
    } catch {
      res.status(409).json({ error: 'Email sudah terdaftar.' });
    }
  });

  app.post('/api/auth/login', rateLimitMiddleware(authLimiter), (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Email dan kata sandi wajib diisi.' });
      return;
    }
    const user = authenticateUserWithEmail(email, password);
    if (!user) {
      res.status(401).json({ error: 'Email atau kata sandi salah.' });
      return;
    }
    const token = createSession(user.id);
    res.json({ user, sessionToken: token });
  });

  app.post('/api/auth/google', rateLimitMiddleware(authLimiter), (req, res) => {
    const { name, email } = req.body ?? {};
    if (typeof name !== 'string' || name.trim().length < 2 || typeof email !== 'string') {
      res.status(400).json({ error: 'Profil Google tidak lengkap.' });
      return;
    }
    const user = upsertOAuthOrGuestUser({ name, email, provider: 'google' });
    const token = createSession(user.id);
    res.json({ user, sessionToken: token });
  });

  app.post('/api/auth/guest', rateLimitMiddleware(authLimiter), (req, res) => {
    const { name } = req.body ?? {};
    const safeName = typeof name === 'string' && name.trim().length >= 2 ? name.trim() : 'Tamu Ketemu';
    const user = upsertOAuthOrGuestUser({ name: safeName, provider: 'guest' });
    const token = createSession(user.id);
    res.json({ user, sessionToken: token });
  });

  app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      res.status(401).json({ error: 'Tidak ada sesi aktif.' });
      return;
    }
    const user = getUserBySessionToken(token);
    if (!user) {
      res.status(401).json({ error: 'Sesi kedaluwarsa.' });
      return;
    }
    res.json({ user });
  });

  // Meetings API
  app.get('/api/meetings', (_req, res) => {
    const items = listMeetings();
    res.json({ meetings: items });
  });

  app.post('/api/meetings', (req, res) => {
    const { title, hostId, hostName, scheduledAt, password, waitingRoomEnabled, instant } = req.body ?? {};
    const validation = validateMeetingPayload({ title, scheduledAt, password });
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    let code = generateMeetingCode();
    while (getMeetingByCode(code)) {
      code = generateMeetingCode();
    }

    const safeHostId = typeof hostId === 'string' && hostId ? hostId : `usr_${crypto.randomUUID().slice(0, 10)}`;
    const safeHostName = typeof hostName === 'string' && hostName.trim() ? hostName.trim() : 'Host Ketemu';

    const meeting = createMeetingRecord({
      code,
      title: title.trim(),
      hostId: safeHostId,
      hostName: safeHostName,
      status: instant ? 'live' : 'scheduled',
      scheduledAt: scheduledAt ?? null,
      password: typeof password === 'string' ? password : null,
      waitingRoomEnabled: Boolean(waitingRoomEnabled),
      region: process.env.LIVEKIT_REGION || 'sin1',
    });

    res.status(201).json({ meeting });
  });

  app.get('/api/meetings/:rawCode', (req, res) => {
    const code = normalizeMeetingCode(req.params.rawCode);
    if (!code) {
      res.status(400).json({ error: 'Format kode meeting tidak valid.' });
      return;
    }
    const meeting = getMeetingByCode(code);
    if (!meeting) {
      res.status(404).json({ error: 'Ruang meeting tidak ditemukan.' });
      return;
    }
    const live = liveRooms.get(code);
    res.json({
      meeting: {
        ...meeting,
        isLocked: live ? live.isLocked : meeting.isLocked,
        waitingRoomEnabled: live ? live.waitingRoomEnabled : meeting.waitingRoomEnabled,
      },
    });
  });

  app.post('/api/meetings/:rawCode/verify-password', rateLimitMiddleware(authLimiter), (req, res) => {
    const code = normalizeMeetingCode(req.params.rawCode);
    if (!code) {
      res.status(400).json({ error: 'Format kode meeting tidak valid.' });
      return;
    }
    const { password, participantId } = req.body ?? {};
    if (typeof password !== 'string' || typeof participantId !== 'string') {
      res.status(400).json({ error: 'Kata sandi dan ID peserta wajib diisi.' });
      return;
    }
    if (!verifyMeetingPassword(code, password)) {
      res.status(403).json({ error: 'Kata sandi meeting tidak cocok.' });
      return;
    }
    const passwordToken = signPasswordGrant(code, participantId);
    res.json({ verified: true, passwordToken });
  });

  // LiveKit SFU Short-Lived Token Endpoint
  app.post('/api/livekit/token', rateLimitMiddleware(tokenLimiter), async (req, res) => {
    const { code: rawCode, participantId, participantName, passwordToken } = req.body ?? {};
    const code = normalizeMeetingCode(String(rawCode ?? ''));
    if (!code) {
      res.status(400).json({ error: 'Kode meeting tidak valid.' });
      return;
    }
    if (typeof participantName !== 'string' || participantName.trim().length < 1) {
      res.status(400).json({ error: 'Nama peserta wajib diisi.' });
      return;
    }
    if (typeof participantId !== 'string' || participantId.trim().length < 2) {
      res.status(400).json({ error: 'ID peserta tidak valid.' });
      return;
    }

    let meeting = getMeetingByCode(code);
    if (!meeting) {
      meeting = createMeetingRecord({
        code,
        title: `Ruang ${code}`,
        hostId: participantId,
        hostName: participantName.trim(),
        status: 'live',
        scheduledAt: null,
        waitingRoomEnabled: false,
      });
    }

    const live = getOrCreateLiveRoom(code);
    const isHost = meeting.hostId === participantId || live.hostId === participantId;

    if (live.isLocked && !isHost) {
      res.status(423).json({ error: 'Ruangan telah dikunci oleh host.' });
      return;
    }

    if (meeting.hasPassword && !isHost && !verifyPasswordGrant(passwordToken, code, participantId)) {
      res.status(403).json({ error: 'Verifikasi kata sandi diperlukan.', requiresPassword: true });
      return;
    }

    if (meeting.status === 'scheduled') {
      updateMeetingSecurity(code, { status: 'live' });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;
    const hasLivekit =
      Boolean(apiKey && apiSecret && livekitUrl) &&
      !apiKey!.startsWith('MY_') &&
      !apiSecret!.startsWith('MY_') &&
      !livekitUrl!.includes('your-project.livekit.cloud');

    let token: string | null = null;
    if (hasLivekit && apiKey && apiSecret) {
      const at = new AccessToken(apiKey, apiSecret, {
        identity: participantId,
        name: participantName.trim(),
        ttl: '2h',
        metadata: JSON.stringify({
          role: isHost ? 'host' : 'participant',
          region: process.env.LIVEKIT_REGION || 'sin1',
        }),
      });
      at.addGrant({
        roomJoin: true,
        room: code,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: isHost,
      });
      token = await at.toJwt();
    }

    res.json({
      mode: hasLivekit ? 'livekit' : 'webrtc-mesh',
      token,
      livekitUrl: hasLivekit ? livekitUrl : null,
      region: process.env.LIVEKIT_REGION || 'sin1',
      iceServers: getIceServers(),
      roomState: {
        code,
        title: meeting.title,
        hostId: live.hostId || meeting.hostId,
        isLocked: live.isLocked,
        waitingRoomEnabled: live.waitingRoomEnabled,
      },
    });
  });

  // HTTP & WebSocket Server
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let activeCode: string | null = null;
    let activeParticipantId: string | null = null;

    ws.on('message', (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'room:join') {
        const code = normalizeMeetingCode(msg.code);
        if (!code || !msg.participant?.id || !msg.participant?.name?.trim()) {
          sendWs(ws, { type: 'room:error', message: 'Data bergabung ke ruangan tidak valid.' });
          return;
        }

        let dbMeeting = getMeetingByCode(code);
        if (!dbMeeting) {
          dbMeeting = createMeetingRecord({
            code,
            title: `Ruang ${code}`,
            hostId: msg.participant.id,
            hostName: msg.participant.name.trim(),
            status: 'live',
            scheduledAt: null,
            waitingRoomEnabled: false,
          });
        }

        const room = getOrCreateLiveRoom(code);
        if (!room.hostId) {
          room.hostId = dbMeeting.hostId || msg.participant.id;
        }

        const isHost = room.hostId === msg.participant.id;
        const isCoHost = room.coHostIds.has(msg.participant.id);

        if (room.isLocked && !isHost && !isCoHost) {
          sendWs(ws, { type: 'room:rejected', reason: 'Ruangan telah dikunci oleh host.' });
          return;
        }

        if (dbMeeting.hasPassword && !isHost && !verifyPasswordGrant(msg.passwordToken, code, msg.participant.id)) {
          sendWs(ws, { type: 'room:rejected', reason: 'Kata sandi ruangan tidak valid.' });
          return;
        }

        activeCode = code;
        activeParticipantId = msg.participant.id;

        if (room.waitingRoomEnabled && !isHost && !isCoHost) {
          const waitingEntry: WaitingParticipant = {
            id: msg.participant.id,
            name: msg.participant.name.trim(),
            requestedAt: new Date().toISOString(),
            avatarColor: msg.participant.avatarColor || '#2563EB',
          };
          room.waiting.set(waitingEntry.id, {
            ws,
            waiting: waitingEntry,
            initialState: {
              isMuted: Boolean(msg.participant.isMuted),
              isCamOff: Boolean(msg.participant.isCamOff),
            },
          });
          sendWs(ws, { type: 'room:waiting', code, title: dbMeeting.title });
          syncRoomState(room);
          return;
        }

        const participant: ParticipantState = {
          id: msg.participant.id,
          name: msg.participant.name.trim(),
          role: isHost ? 'host' : isCoHost ? 'cohost' : 'participant',
          isMuted: Boolean(msg.participant.isMuted),
          isCamOff: Boolean(msg.participant.isCamOff),
          isScreenSharing: false,
          isHandRaised: false,
          isSpeaking: false,
          connectionQuality: 'good',
          joinedAt: new Date().toISOString(),
          avatarColor: msg.participant.avatarColor || '#2563EB',
        };

        room.clients.set(participant.id, { ws, participant, code });
        updateMeetingSecurity(code, { status: 'live' });
        recordMeetingPeakAndDuration(code, room.clients.size);

        sendWs(ws, {
          type: 'room:joined',
          self: participant,
          participants: Array.from(room.clients.values()).map((c) => c.participant),
          waitingQueue: Array.from(room.waiting.values()).map((w) => w.waiting),
          messages: getMeetingMessages(code),
          isLocked: room.isLocked,
          waitingRoomEnabled: room.waitingRoomEnabled,
          hostId: room.hostId,
        });
        syncRoomState(room);
        return;
      }

      if (!activeCode || !activeParticipantId) return;
      const room = liveRooms.get(activeCode);
      if (!room) return;
      const senderClient = room.clients.get(activeParticipantId);
      if (!senderClient) return;

      const isMod = senderClient.participant.role === 'host' || senderClient.participant.role === 'cohost';

      switch (msg.type) {
        case 'participant:update': {
          Object.assign(senderClient.participant, msg.patch);
          syncRoomState(room);
          break;
        }

        case 'chat:send': {
          const text = (msg.text ?? '').trim().slice(0, 2000);
          if (!text && !msg.fileDataUrl) return;
          if (msg.fileSize && msg.fileSize > 600_000) {
            sendWs(ws, { type: 'room:error', message: 'Ukuran file maksimal 512 KB.' });
            return;
          }
          const chatMsg: ChatMessage = {
            id: `msg_${crypto.randomUUID().slice(0, 12)}`,
            meetingCode: room.code,
            senderId: senderClient.participant.id,
            senderName: senderClient.participant.name,
            text,
            fileName: msg.fileName,
            fileDataUrl: msg.fileDataUrl,
            fileSize: msg.fileSize,
            createdAt: new Date().toISOString(),
          };
          saveChatMessage(chatMsg);
          broadcastRoom(room, { type: 'chat:message', message: chatMsg });
          break;
        }

        case 'reaction:send': {
          const emoji = String(msg.emoji ?? '').slice(0, 8);
          if (!emoji) return;
          broadcastRoom(room, {
            type: 'reaction:broadcast',
            reaction: {
              id: `rx_${crypto.randomUUID().slice(0, 8)}`,
              senderId: senderClient.participant.id,
              senderName: senderClient.participant.name,
              emoji,
              timestamp: Date.now(),
            },
          });
          break;
        }

        case 'waiting:admit': {
          if (!isMod) return;
          const waitingClient = room.waiting.get(msg.targetId);
          if (!waitingClient) return;
          room.waiting.delete(msg.targetId);
          const participant: ParticipantState = {
            id: waitingClient.waiting.id,
            name: waitingClient.waiting.name,
            role: 'participant',
            isMuted: waitingClient.initialState.isMuted,
            isCamOff: waitingClient.initialState.isCamOff,
            isScreenSharing: false,
            isHandRaised: false,
            isSpeaking: false,
            connectionQuality: 'good',
            joinedAt: new Date().toISOString(),
            avatarColor: waitingClient.waiting.avatarColor,
          };
          room.clients.set(participant.id, {
            ws: waitingClient.ws,
            participant,
            code: room.code,
          });
          recordMeetingPeakAndDuration(room.code, room.clients.size);
          sendWs(waitingClient.ws, {
            type: 'room:joined',
            self: participant,
            participants: Array.from(room.clients.values()).map((c) => c.participant),
            waitingQueue: Array.from(room.waiting.values()).map((w) => w.waiting),
            messages: getMeetingMessages(room.code),
            isLocked: room.isLocked,
            waitingRoomEnabled: room.waitingRoomEnabled,
            hostId: room.hostId,
          });
          syncRoomState(room);
          break;
        }

        case 'waiting:reject': {
          if (!isMod) return;
          const waitingClient = room.waiting.get(msg.targetId);
          if (!waitingClient) return;
          room.waiting.delete(msg.targetId);
          sendWs(waitingClient.ws, {
            type: 'room:rejected',
            reason: 'Permintaan masuk Anda ditolak oleh host.',
          });
          syncRoomState(room);
          break;
        }

        case 'host:mute-participant': {
          if (!isMod) return;
          const target = room.clients.get(msg.targetId);
          if (!target) return;
          target.participant.isMuted = true;
          sendWs(target.ws, { type: 'host:force-mute' });
          syncRoomState(room);
          break;
        }

        case 'host:mute-all': {
          if (!isMod) return;
          for (const [pid, client] of room.clients.entries()) {
            if (pid !== senderClient.participant.id) {
              client.participant.isMuted = true;
              sendWs(client.ws, { type: 'host:force-mute' });
            }
          }
          syncRoomState(room);
          break;
        }

        case 'host:disable-cam': {
          if (!isMod) return;
          const target = room.clients.get(msg.targetId);
          if (!target) return;
          target.participant.isCamOff = true;
          sendWs(target.ws, { type: 'host:force-cam-off' });
          syncRoomState(room);
          break;
        }

        case 'host:kick-participant': {
          if (!isMod || msg.targetId === room.hostId) return;
          const target = room.clients.get(msg.targetId);
          if (!target) return;
          room.clients.delete(msg.targetId);
          sendWs(target.ws, { type: 'room:kicked', reason: 'Anda dikeluarkan dari ruangan oleh host.' });
          syncRoomState(room);
          break;
        }

        case 'host:toggle-lock': {
          if (!isMod) return;
          room.isLocked = Boolean(msg.isLocked);
          updateMeetingSecurity(room.code, { isLocked: room.isLocked });
          syncRoomState(room);
          break;
        }

        case 'host:toggle-waiting-room': {
          if (!isMod) return;
          room.waitingRoomEnabled = Boolean(msg.enabled);
          updateMeetingSecurity(room.code, { waitingRoomEnabled: room.waitingRoomEnabled });
          syncRoomState(room);
          break;
        }

        case 'host:toggle-cohost': {
          if (senderClient.participant.role !== 'host') return;
          const target = room.clients.get(msg.targetId);
          if (!target || target.participant.id === room.hostId) return;
          if (room.coHostIds.has(msg.targetId)) {
            room.coHostIds.delete(msg.targetId);
            target.participant.role = 'participant';
          } else {
            room.coHostIds.add(msg.targetId);
            target.participant.role = 'cohost';
          }
          syncRoomState(room);
          break;
        }

        case 'host:transfer-host': {
          if (senderClient.participant.role !== 'host') return;
          const target = room.clients.get(msg.targetId);
          if (!target) return;
          senderClient.participant.role = 'participant';
          target.participant.role = 'host';
          room.hostId = target.participant.id;
          room.coHostIds.delete(target.participant.id);
          updateMeetingSecurity(room.code, { hostId: room.hostId });
          syncRoomState(room);
          break;
        }

        case 'host:end-meeting': {
          if (senderClient.participant.role !== 'host') return;
          const durationSec = Math.floor((Date.now() - room.startedAtMs) / 1000);
          endMeetingRecord(room.code, durationSec);
          broadcastRoom(room, { type: 'room:ended', endedBy: senderClient.participant.name });
          for (const w of room.waiting.values()) {
            sendWs(w.ws, { type: 'room:rejected', reason: 'Meeting telah diakhiri oleh host.' });
          }
          liveRooms.delete(room.code);
          break;
        }

        case 'rtc:signal': {
          const target = room.clients.get(msg.targetId);
          if (!target) return;
          sendWs(target.ws, {
            type: 'rtc:signal',
            fromId: senderClient.participant.id,
            signal: msg.signal,
          });
          break;
        }
      }
    });

    ws.on('close', () => {
      if (!activeCode || !activeParticipantId) return;
      const room = liveRooms.get(activeCode);
      if (!room) return;

      room.waiting.delete(activeParticipantId);
      const removed = room.clients.get(activeParticipantId);
      room.clients.delete(activeParticipantId);

      if (removed && room.clients.size > 0 && room.hostId === activeParticipantId) {
        const nextHost = room.clients.values().next().value;
        if (nextHost) {
          room.hostId = nextHost.participant.id;
          nextHost.participant.role = 'host';
          updateMeetingSecurity(room.code, { hostId: room.hostId });
        }
      }

      if (room.clients.size === 0 && room.waiting.size === 0) {
        const durationSec = Math.floor((Date.now() - room.startedAtMs) / 1000);
        recordMeetingPeakAndDuration(room.code, 1, durationSec);
        liveRooms.delete(activeCode);
      } else {
        syncRoomState(room);
      }
    });
  });

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Ketemu server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
