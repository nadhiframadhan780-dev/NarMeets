import {
  getSeedMeetings,
  readStore,
  type VercelRequest,
  type VercelResponse,
} from '../_lib/vercelStore';
import { normalizeMeetingCode } from '../../src/utils/meetingLogic';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const raw = Array.isArray(req.query.rawCode) ? req.query.rawCode[0] : req.query.rawCode;
  const code = normalizeMeetingCode(String(raw ?? ''));
  if (!code) {
    res.status(400).json({ error: 'Format kode meeting tidak valid.' });
    return;
  }

  const store = readStore();
  const stored = store.meetings[code];
  if (stored) {
    const { passwordHash: _ph, ...publicMeeting } = stored;
    res.status(200).json({ meeting: publicMeeting });
    return;
  }

  const seed = getSeedMeetings().find((m) => m.code === code);
  if (seed) {
    res.status(200).json({ meeting: seed });
    return;
  }

  // On serverless Vercel, allow instant room creation by valid code
  res.status(200).json({
    meeting: {
      id: `mtg_${code}`,
      code,
      title: `Ruang ${code}`,
      hostId: '',
      hostName: 'Host Ketemu',
      status: 'live',
      scheduledAt: null,
      hasPassword: false,
      isLocked: false,
      waitingRoomEnabled: false,
      region: process.env.LIVEKIT_REGION || 'sin1',
      createdAt: new Date().toISOString(),
      endedAt: null,
      participantPeak: 1,
      durationSec: 0,
    },
  });
}
