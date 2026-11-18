import type { VercelRequest, VercelResponse } from './_lib/vercelStore';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;
  res.status(200).json({
    status: 'ok',
    platform: 'vercel',
    region: process.env.LIVEKIT_REGION || 'sin1',
    livekitConfigured: Boolean(
      apiKey && apiSecret && livekitUrl && !apiKey.startsWith('MY_')
    ),
  });
}
