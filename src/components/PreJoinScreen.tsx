import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Lock,
  Mic,
  MicOff,
  ShieldCheck,
  Sparkles,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import type { Language, MeetingRecord, ThemeMode, VirtualBgMode } from '../types/meeting';
import { t } from '../utils/i18n';
import { createVirtualBgProcessor, type VirtualBgProcessor } from '../utils/virtualBackground';
import { ThemeLangControls } from './ThemeLangControls';

export interface PreJoinConfig {
  code: string;
  displayName: string;
  isMuted: boolean;
  isCamOff: boolean;
  audioDeviceId: string;
  videoDeviceId: string;
  speakerDeviceId: string;
  virtualBg: VirtualBgMode;
  passwordToken?: string;
}

interface PreJoinScreenProps {
  code: string;
  initialName: string;
  participantId: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  lang: Language;
  onToggleLang: () => void;
  onBack: () => void;
  onJoinReady: (config: PreJoinConfig) => void;
}

export function PreJoinScreen({
  code,
  initialName,
  participantId,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  onBack,
  onJoinReady,
}: PreJoinScreenProps) {
  const [meetingInfo, setMeetingInfo] = useState<MeetingRecord | null>(null);
  const [displayName, setDisplayName] = useState(initialName);
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [virtualBg, setVirtualBg] = useState<VirtualBgMode>('none');
  const [mediaNotice, setMediaNotice] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [copied, setCopied] = useState(false);

  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rawStreamRef = useRef<MediaStream | null>(null);
  const bgProcessorRef = useRef<VirtualBgProcessor | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/meetings/${encodeURIComponent(code)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.meeting) {
          setMeetingInfo(data.meeting);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [code]);

  // Enumerate & initialize camera/mic preview with echoCancellation, noiseSuppression, autoGainControl
  useEffect(() => {
    let cancelled = false;
    let levelRaf = 0;

    const cleanupMedia = () => {
      cancelAnimationFrame(levelRaf);
      bgProcessorRef.current?.destroy();
      bgProcessorRef.current = null;
      if (rawStreamRef.current) {
        rawStreamRef.current.getTracks().forEach((tr) => tr.stop());
        rawStreamRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };

    const startPreview = async () => {
      cleanupMedia();
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaNotice('Peramban tidak mendukung akses kamera/mikrofon langsung. Anda tetap bisa bergabung dengan mode teks/audio.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: !isCamOff
            ? {
                deviceId: selectedVideoId ? { exact: selectedVideoId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : false,
          audio: {
            deviceId: selectedAudioId ? { exact: selectedAudioId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        rawStreamRef.current = stream;
        setMediaNotice(null);

        // Apply virtual background processor if video exists
        if (!isCamOff && stream.getVideoTracks().length > 0) {
          if (virtualBg === 'none') {
            if (videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } else {
            const proc = createVirtualBgProcessor(stream, virtualBg);
            bgProcessorRef.current = proc;
            if (videoRef.current) {
              videoRef.current.srcObject = proc.outputStream;
            }
          }
        } else if (videoRef.current) {
          videoRef.current.srcObject = null;
        }

        // Real-time microphone volume meter via Web Audio API
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.enabled = !isMuted;
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
              if (cancelled) return;
              analyser.getByteFrequencyData(data);
              const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
              setMicLevel(isMuted ? 0 : Math.min(100, Math.round((avg / 90) * 100)));
              levelRaf = requestAnimationFrame(tick);
            };
            levelRaf = requestAnimationFrame(tick);
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
          setVideoInputs(devices.filter((d) => d.kind === 'videoinput'));
          setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'));
        }
      } catch {
        if (!cancelled) {
          setMediaNotice('Kamera atau mikrofon tidak terdeteksi / izin ditolak. Anda tetap bisa masuk ruangan.');
        }
      }
    };

    void startPreview();

    return () => {
      cancelled = true;
      cleanupMedia();
    };
  }, [isCamOff, selectedAudioId, selectedVideoId, virtualBg]);

  useEffect(() => {
    if (rawStreamRef.current) {
      rawStreamRef.current.getAudioTracks().forEach((tr) => {
        tr.enabled = !isMuted;
      });
    }
    if (isMuted) setMicLevel(0);
  }, [isMuted]);

  const handleTestSpeaker = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {
      // ignore audio autoplay block
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?room=${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (displayName.trim().length < 2) {
      setFormError(t('nameRequiredError', lang));
      return;
    }

    setJoining(true);
    try {
      let passwordToken: string | undefined;
      if (meetingInfo?.hasPassword && meetingInfo.hostId !== participantId) {
        if (!password.trim()) {
          setFormError('Ruangan ini dilindungi kata sandi.');
          setJoining(false);
          return;
        }
        const pwRes = await fetch(`/api/meetings/${encodeURIComponent(code)}/verify-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, participantId }),
        });
        const pwData = await pwRes.json();
        if (!pwRes.ok) {
          setFormError(pwData.error || 'Kata sandi salah.');
          setJoining(false);
          return;
        }
        passwordToken = pwData.passwordToken;
      }

      onJoinReady({
        code,
        displayName: displayName.trim(),
        isMuted,
        isCamOff,
        audioDeviceId: selectedAudioId,
        videoDeviceId: selectedVideoId,
        speakerDeviceId: selectedSpeakerId,
        virtualBg,
        passwordToken,
      });
    } catch {
      setFormError('Gagal memverifikasi ruangan.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('backToDashboard', lang)}</span>
          </button>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{code}</span>
        </div>

        <ThemeLangControls
          theme={theme}
          onToggleTheme={onToggleTheme}
          lang={lang}
          onToggleLang={onToggleLang}
        />
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Camera Preview + Controls */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 flex items-center justify-center">
              {!isCamOff && !mediaNotice ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-20 h-20 rounded-2xl bg-blue-600 flex items-center justify-center text-2xl font-bold text-white">
                    {(displayName.trim() || 'KT').slice(0, 2).toUpperCase()}
                  </div>
                  <p className="text-sm text-slate-300">
                    {isCamOff ? 'Kamera dimatikan' : mediaNotice}
                  </p>
                </div>
              )}

              {/* Preview Floating Media Toggles */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-950/80 backdrop-blur-md border border-white/10">
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted ? 'Nyalakan mikrofon' : 'Bisukan mikrofon'}
                  className={`p-3 rounded-xl transition-colors ${
                    isMuted
                      ? 'bg-rose-600 text-white hover:bg-rose-500'
                      : 'bg-slate-800 text-white hover:bg-slate-700'
                  }`}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCamOff((c) => !c)}
                  aria-label={isCamOff ? 'Nyalakan kamera' : 'Matikan kamera'}
                  className={`p-3 rounded-xl transition-colors ${
                    isCamOff
                      ? 'bg-rose-600 text-white hover:bg-rose-500'
                      : 'bg-slate-800 text-white hover:bg-slate-700'
                  }`}
                >
                  {isCamOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Mic Level Meter & Speaker Test */}
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{t('micTestLabel', lang)}</span>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {isMuted ? 'Bisukan' : `${micLevel}%`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all duration-75"
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTestSpeaker}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{t('speakerTestBtn', lang)}</span>
                </button>
              </div>

              {/* Device Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="select-mic" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Mikrofon
                  </label>
                  <select
                    id="select-mic"
                    value={selectedAudioId}
                    onChange={(e) => setSelectedAudioId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="">Mikrofon Default</option>
                    {audioInputs.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Mikrofon ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="select-cam" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Kamera
                  </label>
                  <select
                    id="select-cam"
                    value={selectedVideoId}
                    onChange={(e) => setSelectedVideoId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="">Kamera Default</option>
                    {videoInputs.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Kamera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="select-spk" className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Speaker
                  </label>
                  <select
                    id="select-spk"
                    value={selectedSpeakerId}
                    onChange={(e) => setSelectedSpeakerId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  >
                    <option value="">Speaker Default</option>
                    {audioOutputs.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Speaker ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Virtual Background Selector */}
              <div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  <span>{t('virtualBgLabel', lang)}</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'none', label: t('bgNone', lang) },
                      { id: 'blur', label: t('bgBlur', lang) },
                      { id: 'studio', label: t('bgStudio', lang) },
                      { id: 'lounge', label: t('bgLounge', lang) },
                    ] as const
                  ).map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setVirtualBg(bg.id)}
                      className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors ${
                        virtualBg === bg.id
                          ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                          : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {bg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Join Form */}
          <div className="lg:col-span-5 p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-6">
            <div className="space-y-1.5">
              <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                {t('preJoinTitle', lang)}
              </p>
              <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {meetingInfo?.title || `Ruang ${code}`}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Region Singapore · Echo Cancellation & Noise Suppression Aktif
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label htmlFor="prejoin-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('displayNameLabel', lang)}
                </label>
                <input
                  id="prejoin-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder={t('displayNamePlaceholder', lang)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {meetingInfo?.hasPassword && meetingInfo.hostId !== participantId && (
                <div>
                  <label htmlFor="prejoin-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('roomPasswordLabel', lang)}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="prejoin-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('roomPasswordPlaceholder', lang)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {meetingInfo?.waitingRoomEnabled && meetingInfo.hostId !== participantId && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-100 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <span>Ruang tunggu diaktifkan. Host akan menyetujui permintaan masuk Anda.</span>
                </div>
              )}

              {formError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={joining}
                className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition-all disabled:opacity-60"
              >
                {joining ? 'Menghubungkan...' : t('joinNowBtn', lang)}
              </button>
            </form>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Bagikan kode ke peserta lain:</span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tautan Tersalin' : code}</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
