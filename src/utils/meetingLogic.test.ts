import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateMeetingCode,
  normalizeMeetingCode,
  validateMeetingPayload,
  computeGridLayout,
  buildLiveKitRoomOptions,
  buildLiveKitConnectOptions,
  formatDuration,
  SlidingWindowRateLimiter,
} from './meetingLogic';

test('generateMeetingCode produces xxx-yyyy-zzz URL-safe format', () => {
  const code = generateMeetingCode();
  assert.match(code, /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/);
  assert.equal(code.length, 12);
});

test('normalizeMeetingCode extracts code from full URL and rejects invalid input', () => {
  assert.equal(normalizeMeetingCode('https://ketemu.app/room/ktm-4821-x9q'), 'ktm-4821-x9q');
  assert.equal(normalizeMeetingCode('?room=ABC-1234-XYZ'), 'abc-1234-xyz');
  assert.equal(normalizeMeetingCode('ktm-4821-x9q'), 'ktm-4821-x9q');
  assert.equal(normalizeMeetingCode('invalid'), null);
  assert.equal(normalizeMeetingCode('   '), null);
});

test('validateMeetingPayload validates title length and optional password', () => {
  assert.equal(validateMeetingPayload({ title: 'A' }).valid, false);
  assert.equal(validateMeetingPayload({ title: 'Standup Tim Produk', password: '12' }).valid, false);
  assert.equal(validateMeetingPayload({ title: 'Standup Tim Produk', password: 'aman123' }).valid, true);
  assert.equal(validateMeetingPayload({ title: 'Sprint Review', scheduledAt: 'not-a-date' }).valid, false);
});

test('computeGridLayout returns balanced cols and rows for participant counts', () => {
  assert.deepEqual(computeGridLayout(1), { cols: 1, rows: 1, maxVisible: 1 });
  assert.deepEqual(computeGridLayout(2), { cols: 2, rows: 1, maxVisible: 2 });
  assert.deepEqual(computeGridLayout(4), { cols: 2, rows: 2, maxVisible: 4 });
  assert.deepEqual(computeGridLayout(6), { cols: 3, rows: 2, maxVisible: 6 });
  assert.deepEqual(computeGridLayout(11), { cols: 4, rows: 3, maxVisible: 12 });
  assert.deepEqual(computeGridLayout(5, true), { cols: 1, rows: 1, maxVisible: 5 });
});

test('buildLiveKitRoomOptions enforces anti-delay SFU flags and audio priority', () => {
  const opts = buildLiveKitRoomOptions();
  const conn = buildLiveKitConnectOptions([{ urls: 'stun:stun.l.google.com:19302' }]);
  assert.equal(opts.adaptiveStream, true);
  assert.equal(opts.dynacast, true);
  assert.equal(opts.publishDefaults?.simulcast, true);
  assert.equal(opts.publishDefaults?.dtx, true);
  assert.equal(opts.publishDefaults?.red, true);
  assert.equal(opts.publishDefaults?.audioPreset?.priority, 'high');
  assert.equal((opts.audioCaptureDefaults as { echoCancellation?: boolean })?.echoCancellation, true);
  assert.equal((opts.audioCaptureDefaults as { noiseSuppression?: boolean })?.noiseSuppression, true);
  assert.equal((opts.audioCaptureDefaults as { autoGainControl?: boolean })?.autoGainControl, true);
  assert.equal(conn.rtcConfig?.iceServers?.length, 1);
});

test('formatDuration renders tabular MM:SS and HH:MM:SS', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(3661), '01:01:01');
});

test('SlidingWindowRateLimiter blocks requests past limit and resets after window', () => {
  const limiter = new SlidingWindowRateLimiter(3, 1000);
  assert.equal(limiter.check('ip1', 100).allowed, true);
  assert.equal(limiter.check('ip1', 200).allowed, true);
  assert.equal(limiter.check('ip1', 300).allowed, true);
  assert.equal(limiter.check('ip1', 400).allowed, false);
  assert.equal(limiter.check('ip1', 1200).allowed, true);
});
