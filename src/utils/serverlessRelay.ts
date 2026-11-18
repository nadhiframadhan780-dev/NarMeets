import type { ParticipantState } from '../types/meeting';

const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

function encodeUtf8(str: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(str) as Uint8Array<ArrayBuffer>;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function encodeMqttString(value: string): Uint8Array {
  const utf8 = encodeUtf8(value);
  const header = new Uint8Array([(utf8.length >> 8) & 0xff, utf8.length & 0xff]);
  return concatBytes(header, utf8);
}

export function encodeMqttRemainingLength(len: number): Uint8Array {
  const bytes: number[] = [];
  let x = len;
  do {
    let encodedByte = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) {
      encodedByte |= 128;
    }
    bytes.push(encodedByte);
  } while (x > 0);
  return new Uint8Array(bytes);
}

export function buildMqttConnectPacket(clientId: string, keepAliveSec = 25): Uint8Array {
  const varHeader = new Uint8Array([
    0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
    0x04, // Protocol level 4 (MQTT 3.1.1)
    0x02, // Clean session
    (keepAliveSec >> 8) & 0xff,
    keepAliveSec & 0xff,
  ]);
  const payload = encodeMqttString(clientId);
  const remainingLen = varHeader.length + payload.length;
  return concatBytes(new Uint8Array([0x10]), encodeMqttRemainingLength(remainingLen), varHeader, payload);
}

export function buildMqttSubscribePacket(packetId: number, topic: string): Uint8Array {
  const varHeader = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const payload = concatBytes(encodeMqttString(topic), new Uint8Array([0x00])); // QoS 0
  const remainingLen = varHeader.length + payload.length;
  return concatBytes(new Uint8Array([0x82]), encodeMqttRemainingLength(remainingLen), varHeader, payload);
}

export function buildMqttPublishPacket(topic: string, message: Uint8Array): Uint8Array {
  const topicBytes = encodeMqttString(topic);
  const remainingLen = topicBytes.length + message.length;
  return concatBytes(new Uint8Array([0x30]), encodeMqttRemainingLength(remainingLen), topicBytes, message);
}

export interface ParsedMqttPublish {
  type: 'PUBLISH';
  topic: string;
  payload: Uint8Array;
}

export type ParsedMqttPacket =
  | { type: 'CONNACK'; returnCode: number }
  | { type: 'SUBACK' }
  | { type: 'PINGRESP' }
  | ParsedMqttPublish
  | { type: 'OTHER'; packetType: number };

/**
 * Consumes as many complete MQTT 3.1.1 packets from `buffer` as possible and returns
 * the parsed packets plus any leftover incomplete bytes.
 */
export function parseMqttBuffer(buffer: Uint8Array): {
  packets: ParsedMqttPacket[];
  remainder: Uint8Array;
} {
  const packets: ParsedMqttPacket[] = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const byte1 = buffer[offset];
    const packetType = (byte1 >> 4) & 0x0f;
    const flags = byte1 & 0x0f;

    let multiplier = 1;
    let remainingLength = 0;
    let headerLenBytes = 0;
    let incomplete = false;

    for (let i = 0; i < 4; i += 1) {
      const idx = offset + 1 + i;
      if (idx >= buffer.length) {
        incomplete = true;
        break;
      }
      const encodedByte = buffer[idx];
      remainingLength += (encodedByte & 0x7f) * multiplier;
      multiplier *= 128;
      headerLenBytes += 1;
      if ((encodedByte & 0x80) === 0) break;
    }

    if (incomplete) break;

    const totalLen = 1 + headerLenBytes + remainingLength;
    if (offset + totalLen > buffer.length) break;

    const bodyStart = offset + 1 + headerLenBytes;
    const body = buffer.subarray(bodyStart, offset + totalLen);

    if (packetType === 2 && body.length >= 2) {
      packets.push({ type: 'CONNACK', returnCode: body[1] });
    } else if (packetType === 9) {
      packets.push({ type: 'SUBACK' });
    } else if (packetType === 13) {
      packets.push({ type: 'PINGRESP' });
    } else if (packetType === 3 && body.length >= 2) {
      const topicLen = (body[0] << 8) | body[1];
      let pos = 2 + topicLen;
      const topic = decodeUtf8(body.subarray(2, pos));
      const qos = (flags >> 1) & 0x03;
      if (qos > 0) {
        pos += 2; // Skip 2-byte packet identifier for QoS 1/2
      }
      const payload = body.subarray(pos);
      packets.push({ type: 'PUBLISH', topic, payload });
    } else {
      packets.push({ type: 'OTHER', packetType });
    }

    offset += totalLen;
  }

  return {
    packets,
    remainder: buffer.subarray(offset),
  };
}

export async function deriveRoomCrypto(roomCode: string): Promise<{
  topic: string;
  aesKey: CryptoKey;
}> {
  const subtle = globalThis.crypto.subtle;
  const topicDigest = new Uint8Array(
    await subtle.digest('SHA-256', toArrayBuffer(encodeUtf8(`ketemu-topic-v2:${roomCode}`)))
  );
  const keyMaterial = new Uint8Array(
    await subtle.digest('SHA-256', toArrayBuffer(encodeUtf8(`ketemu-e2ee-v2:${roomCode}`)))
  );
  const aesKey = await subtle.importKey(
    'raw',
    toArrayBuffer(keyMaterial),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return {
    topic: `ketemu/v2/${toHex(topicDigest).slice(0, 24)}`,
    aesKey,
  };
}

export async function encryptRoomEnvelope(aesKey: CryptoKey, data: unknown): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encodeUtf8(JSON.stringify(data));
  const cipher = new Uint8Array(
    await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      aesKey,
      toArrayBuffer(plaintext)
    )
  );
  return encodeUtf8(JSON.stringify({ iv: toBase64(iv), ct: toBase64(cipher) }));
}

export async function decryptRoomEnvelope<T = unknown>(
  aesKey: CryptoKey,
  payloadBytes: Uint8Array
): Promise<T | null> {
  try {
    const parsed = JSON.parse(decodeUtf8(payloadBytes)) as { iv?: string; ct?: string };
    if (!parsed?.iv || !parsed?.ct) return null;
    const iv = fromBase64(parsed.iv);
    const ct = fromBase64(parsed.ct);
    const ivBuf = new ArrayBuffer(iv.byteLength);
    new Uint8Array(ivBuf).set(iv);
    const ctBuf = new ArrayBuffer(ct.byteLength);
    new Uint8Array(ctBuf).set(ct);
    const plainBuf = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuf },
      aesKey,
      ctBuf
    );
    return JSON.parse(decodeUtf8(new Uint8Array(plainBuf))) as T;
  } catch {
    return null;
  }
}

export interface ServerlessRelay {
  publish: (payload: unknown) => void;
  close: () => void;
}

/**
 * Opens an End-to-End Encrypted cross-device room relay combining BroadcastChannel
 * (instant local multi-tab sync) and MQTT-over-WSS (cross-device internet sync on Vercel
 * even before LiveKit Cloud keys are configured).
 */
export function createServerlessRoomRelay(opts: {
  roomCode: string;
  participantId: string;
  onMessage: (payload: unknown) => void;
  onConnected?: () => void;
}): ServerlessRelay {
  let closed = false;
  let bc: BroadcastChannel | null = null;
  let ws: WebSocket | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let brokerIndex = 0;
  let cryptoCtx: { topic: string; aesKey: CryptoKey } | null = null;
  let subscribed = false;
  const pendingQueue: unknown[] = [];

  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(`ketemu-room-${opts.roomCode}`);
    bc.onmessage = (ev) => {
      if (!closed) opts.onMessage(ev.data);
    };
  }

  const sendOverWs = async (payload: unknown) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !subscribed || !cryptoCtx) {
      if (pendingQueue.length < 40) pendingQueue.push(payload);
      return;
    }
    try {
      const encrypted = await encryptRoomEnvelope(cryptoCtx.aesKey, payload);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(toArrayBuffer(buildMqttPublishPacket(cryptoCtx.topic, encrypted)));
      }
    } catch {
      // ignore transient encryption/send failure
    }
  };

  const connectBroker = async () => {
    if (closed) return;
    if (!cryptoCtx) {
      cryptoCtx = await deriveRoomCrypto(opts.roomCode);
    }
    if (closed) return;

    const brokerUrl = MQTT_BROKERS[brokerIndex % MQTT_BROKERS.length];
    let rxBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    subscribed = false;

    try {
      const socket = new WebSocket(brokerUrl, 'mqtt');
      socket.binaryType = 'arraybuffer';
      ws = socket;

      socket.onopen = () => {
        if (closed) {
          socket.close();
          return;
        }
        const cid = `ktm_${opts.participantId.slice(-8)}_${Math.random().toString(36).slice(2, 7)}`;
        socket.send(toArrayBuffer(buildMqttConnectPacket(cid, 25)));
      };

      socket.onmessage = async (ev) => {
        if (closed || !(ev.data instanceof ArrayBuffer)) return;
        rxBuffer = concatBytes(rxBuffer, new Uint8Array(ev.data));
        const { packets, remainder } = parseMqttBuffer(rxBuffer);
        rxBuffer = remainder;

        for (const pkt of packets) {
          if (pkt.type === 'CONNACK' && pkt.returnCode === 0 && cryptoCtx) {
            socket.send(toArrayBuffer(buildMqttSubscribePacket(1, cryptoCtx.topic)));
            subscribed = true;
            opts.onConnected?.();
            while (pendingQueue.length > 0) {
              const queued = pendingQueue.shift();
              void sendOverWs(queued);
            }
            if (pingTimer) clearInterval(pingTimer);
            pingTimer = setInterval(() => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(new Uint8Array([0xc0, 0x00]));
              }
            }, 20_000);
          } else if (pkt.type === 'PUBLISH' && cryptoCtx) {
            const decrypted = await decryptRoomEnvelope<{ senderId?: string }>(
              cryptoCtx.aesKey,
              pkt.payload
            );
            if (decrypted && decrypted.senderId !== opts.participantId) {
              opts.onMessage(decrypted);
            }
          }
        }
      };

      const scheduleReconnect = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        subscribed = false;
        if (closed) return;
        brokerIndex += 1;
        reconnectTimer = setTimeout(() => {
          void connectBroker();
        }, 2500);
      };

      socket.onerror = () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      };
      socket.onclose = scheduleReconnect;
    } catch {
      brokerIndex += 1;
      if (!closed) {
        reconnectTimer = setTimeout(() => {
          void connectBroker();
        }, 3000);
      }
    }
  };

  void connectBroker();

  return {
    publish(payload: unknown) {
      if (closed) return;
      bc?.postMessage(payload);
      void sendOverWs(payload);
    },
    close() {
      closed = true;
      if (pingTimer) clearInterval(pingTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      bc?.close();
      bc = null;
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(new Uint8Array([0xe0, 0x00]));
          }
          ws.close();
        } catch {
          // ignore
        }
        ws = null;
      }
    },
  };
}

export function mergeServerlessParticipant(
  list: ParticipantState[],
  incoming: ParticipantState
): ParticipantState[] {
  const exists = list.some((p) => p.id === incoming.id);
  if (exists) {
    return list.map((p) => (p.id === incoming.id ? { ...p, ...incoming } : p));
  }
  return [...list, incoming];
}
