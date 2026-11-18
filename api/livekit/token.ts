import { AccessToken } from 'livekit-server-sdk';
import {
  getIceServers,
  getSeedMeetings,
  parseBody,
  readStore,
  verifyStatelessToken,
  type VercelRequest,
  type VercelResponse,
} from '../_lib/vercelStore';
import { normalizeMeetingCode } from '../../src/utils/meetingLogic';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req);
  const code = normalizeMeetingCode(String(body.code ?? ''));
  const participantId = typeof body.participantId === 'string' ? body.participantId : '';
  const participantName = typeof body.participantName === 'string' ? body.participantName.trim() : '';
  const passwordToken = typeof body.passwordToken === 'string' ? body.passwordToken : undefined;

  if (!code) {
    res.status(400).json({ error: 'Kode meeting tidak valid.' });
    return;
  }
  if (!participantName) {
    res.status(400).json({ error: 'Nama peserta wajib diisi.' });
    return;
  }
  if (!participantId || participantId.length < 2) {
    res.status(400).json({ error: 'ID peserta tidak valid.' });
    return;
  }

  const store = readStore();
  const meeting =
    store.meetings[code] ||
    getSeedMeetings().find((m) => m.code === code) || {
      id: `mtg_${code}`,
      code,
      title: `Ruang ${code}`,
      hostId: participantId,
      hostName: participantName,
      status: 'live' as const,
      scheduledAt: null,
      hasPassword: false,
      isLocked: false,
      waitingRoomEnabled: false,
      region: process.env.LIVEKIT_REGION || 'sin1',
      createdAt: new Date().toISOString(),
      endedAt: null,
      participantPeak: 1,
      durationSec: 0,
    };

  const isHost = meeting.hostId === participantId || !meeting.hostId;

  if (meeting.hasPassword && !isHost) {
    const grant = verifyStatelessToken<{ code: string; participantId: string; exp: number }>(
      passwordToken
    );
    if (!grant || grant.code !== code || grant.participantId !== participantId || grant.exp < Date.now()) {
      res.status(403).json({ error: 'Verifikasi kata sandi diperlukan.', requiresPassword: true });
      return;
    }
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
      name: participantName,
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

  res.status(200).json({
    mode: hasLivekit ? 'livekit' : 'webrtc-mesh',
    serverless: true,
    token,
    livekitUrl: hasLivekit ? livekitUrl : null,
    region: process.env.LIVEKIT_REGION || 'sin1',
    iceServers: getIceServers(),
    roomState: {
      code,
      title: meeting.title,
      hostId: meeting.hostId || participantId,
      isLocked: meeting.isLocked,
      waitingRoomEnabled: false,
    },
  });
}
