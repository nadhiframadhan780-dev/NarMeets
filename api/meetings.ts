import crypto from 'node:crypto';
import {
  getSeedMeetings,
  hashSecret,
  parseBody,
  readStore,
  writeStore,
  type VercelRequest,
  type VercelResponse,
} from './_lib/vercelStore';
import { generateMeetingCode, validateMeetingPayload } from '../src/utils/meetingLogic';
import type { MeetingRecord } from '../src/types/meeting';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const store = readStore();

  if (req.method === 'GET') {
    const stored = Object.values(store.meetings).map(({ passwordHash: _ph, ...rest }) => rest);
    const seeds = getSeedMeetings().filter((s) => !store.meetings[s.code]);
    const combined = [...stored, ...seeds].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
    res.status(200).json({ meetings: combined });
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const title = typeof body.title === 'string' ? body.title : '';
    const scheduledAt = typeof body.scheduledAt === 'string' ? body.scheduledAt : null;
    const password = typeof body.password === 'string' ? body.password : null;

    const validation = validateMeetingPayload({ title, scheduledAt, password });
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    let code = generateMeetingCode();
    while (store.meetings[code]) {
      code = generateMeetingCode();
    }

    const hostId =
      typeof body.hostId === 'string' && body.hostId
        ? body.hostId
        : `usr_${crypto.randomUUID().slice(0, 10)}`;
    const hostName =
      typeof body.hostName === 'string' && body.hostName.trim()
        ? body.hostName.trim()
        : 'Host Ketemu';

    const meeting: MeetingRecord & { passwordHash?: string | null } = {
      id: `mtg_${crypto.randomUUID().slice(0, 12)}`,
      code,
      title: title.trim(),
      hostId,
      hostName,
      status: body.instant ? 'live' : 'scheduled',
      scheduledAt,
      hasPassword: Boolean(password && password.trim().length > 0),
      isLocked: false,
      waitingRoomEnabled: Boolean(body.waitingRoomEnabled),
      region: process.env.LIVEKIT_REGION || 'sin1',
      createdAt: new Date().toISOString(),
      endedAt: null,
      participantPeak: 1,
      durationSec: 0,
      passwordHash: password && password.trim().length > 0 ? hashSecret(password.trim()) : null,
    };

    store.meetings[code] = meeting;
    writeStore(store);

    const { passwordHash: _ph, ...publicMeeting } = meeting;
    res.status(201).json({ meeting: publicMeeting });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
