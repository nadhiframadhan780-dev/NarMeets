import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMqttConnectPacket,
  buildMqttPublishPacket,
  buildMqttSubscribePacket,
  decryptRoomEnvelope,
  deriveRoomCrypto,
  encodeMqttRemainingLength,
  encryptRoomEnvelope,
  mergeServerlessParticipant,
  parseMqttBuffer,
} from './serverlessRelay.ts';

test('encodeMqttRemainingLength encodes single and multi-byte lengths per MQTT 3.1.1', () => {
  assert.deepEqual(Array.from(encodeMqttRemainingLength(64)), [64]);
  assert.deepEqual(Array.from(encodeMqttRemainingLength(128)), [0x80, 0x01]);
  assert.deepEqual(Array.from(encodeMqttRemainingLength(321)), [0xc1, 0x02]);
});

test('buildMqttPublishPacket and parseMqttBuffer handle fragmented & coalesced payloads', () => {
  const bigMsg = new TextEncoder().encode('x'.repeat(260));
  const pkt1 = buildMqttPublishPacket('ketemu/v2/abc', bigMsg);
  const pkt2 = buildMqttPublishPacket('ketemu/v2/abc', new TextEncoder().encode('hi'));
  const combined = new Uint8Array(pkt1.length + pkt2.length);
  combined.set(pkt1, 0);
  combined.set(pkt2, pkt1.length);

  // Split in the middle of pkt1
  const splitIdx = 120;
  const partA = combined.subarray(0, splitIdx);
  const resA = parseMqttBuffer(partA);
  assert.equal(resA.packets.length, 0);
  assert.equal(resA.remainder.length, splitIdx);

  const rest = new Uint8Array(resA.remainder.length + (combined.length - splitIdx));
  rest.set(resA.remainder, 0);
  rest.set(combined.subarray(splitIdx), resA.remainder.length);

  const resB = parseMqttBuffer(rest);
  assert.equal(resB.packets.length, 2);
  assert.equal(resB.remainder.length, 0);
  assert.equal(resB.packets[0].type, 'PUBLISH');
  if (resB.packets[0].type === 'PUBLISH') {
    assert.equal(resB.packets[0].topic, 'ketemu/v2/abc');
    assert.equal(resB.packets[0].payload.length, 260);
  }
  if (resB.packets[1].type === 'PUBLISH') {
    assert.equal(new TextDecoder().decode(resB.packets[1].payload), 'hi');
  }
});

test('MQTT CONNECT and SUBSCRIBE packets produce valid headers', () => {
  const conn = buildMqttConnectPacket('ktm_test123');
  assert.equal(conn[0], 0x10);
  assert.equal(new TextDecoder().decode(conn.subarray(4, 8)), 'MQTT');

  const sub = buildMqttSubscribePacket(1, 'ketemu/v2/room');
  assert.equal(sub[0], 0x82);
});

test('deriveRoomCrypto + AES-GCM encrypt/decrypt isolates rooms by meeting code', async () => {
  const roomA = await deriveRoomCrypto('ktm-4821-x9q');
  const roomB = await deriveRoomCrypto('ktm-9999-z1a');
  assert.notEqual(roomA.topic, roomB.topic);

  const cipher = await encryptRoomEnvelope(roomA.aesKey, {
    type: 'dc:chat',
    text: 'Halo satu room!',
  });

  const ok = await decryptRoomEnvelope<{ type: string; text: string }>(roomA.aesKey, cipher);
  assert.equal(ok?.text, 'Halo satu room!');

  const wrongRoom = await decryptRoomEnvelope(roomB.aesKey, cipher);
  assert.equal(wrongRoom, null);
});

test('mergeServerlessParticipant inserts new participants and updates existing ones', () => {
  const host = {
    id: 'pid_1',
    name: 'Host',
    role: 'host' as const,
    isMuted: false,
    isCamOff: false,
    isScreenSharing: false,
    isHandRaised: false,
    isSpeaking: false,
    connectionQuality: 'good' as const,
    joinedAt: '2026-01-01T00:00:00.000Z',
    avatarColor: '#2563EB',
  };
  const guest = { ...host, id: 'pid_2', name: 'Teman', role: 'participant' as const };

  let list = mergeServerlessParticipant([host], guest);
  assert.equal(list.length, 2);

  list = mergeServerlessParticipant(list, { ...guest, isMuted: true, isHandRaised: true });
  assert.equal(list.length, 2);
  assert.equal(list[1].isMuted, true);
  assert.equal(list[1].isHandRaised, true);
});
