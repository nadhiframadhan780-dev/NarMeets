import {
  parseBody,
  readStore,
  signStatelessToken,
  verifySecret,
  type VercelRequest,
  type VercelResponse,
} from '../../_lib/vercelStore';
import { normalizeMeetingCode } from '../../../src/utils/meetingLogic';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const raw = Array.isArray(req.query.rawCode) ? req.query.rawCode[0] : req.query.rawCode;
  const code = normalizeMeetingCode(String(raw ?? ''));
  if (!code) {
    res.status(400).json({ error: 'Format kode meeting tidak valid.' });
    return;
  }

  const body = parseBody(req);
  const password = typeof body.password === 'string' ? body.password : '';
  const participantId = typeof body.participantId === 'string' ? body.participantId : '';

  if (!password || !participantId) {
    res.status(400).json({ error: 'Kata sandi dan ID peserta wajib diisi.' });
    return;
  }

  const store = readStore();
  const meeting = store.meetings[code];
  if (meeting?.passwordHash && !verifySecret(password, meeting.passwordHash)) {
    res.status(403).json({ error: 'Kata sandi meeting tidak cocok.' });
    return;
  }

  const passwordToken = signStatelessToken({
    code,
    participantId,
    exp: Date.now() + 3600_000,
  });
  res.status(200).json({ verified: true, passwordToken });
}
