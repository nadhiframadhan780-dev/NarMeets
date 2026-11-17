import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Room, RoomEvent, Track, ConnectionQuality as LkConnectionQuality } from 'livekit-client';
import {
  AlertTriangle,
  Check,
  Columns2,
  Copy,
  Grid2x2,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type {
  ChatMessage,
  ConnectionQualityLevel,
  Language,
  LayoutMode,
  ParticipantState,
  ReactionEvent,
  RoomTokenResponse,
  ThemeMode,
  VirtualBgMode,
  WaitingParticipant,
  WsClientMessage,
  WsServerMessage,
} from '../types/meeting';
import { t } from '../utils/i18n';
import {
  buildLiveKitRoomOptions,
  computeGridLayout,
  formatDuration,
  pickAvatarColor,
} from '../utils/meetingLogic';
import { createVirtualBgProcessor, type VirtualBgProcessor } from '../utils/virtualBackground';
import type { PreJoinConfig } from './PreJoinScreen';
import { VideoTile } from './VideoTile';
import { MeetingToolbar } from './MeetingToolbar';
import { ThemeLangControls } from './ThemeLangControls';

const LazySidePanel = lazy(() =>
  import('./SidePanel').then((mod) => ({ default: mod.SidePanel }))
);

interface MeetingRoomProps {
  config: PreJoinConfig;
  participantId: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  lang: Language;
  onToggleLang: () => void;
  onExitRoom: (reason?: string) => void;
}

export function MeetingRoom({
  config,
  participantId,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  onExitRoom,
}: MeetingRoomProps) {
  const [roomTitle, setRoomTitle] = useState(`Ruang ${config.code}`);
  const [phase, setPhase] = useState<'connecting' | 'waiting' | 'joined' | 'rejected'>('connecting');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [wsReconnecting, setWsReconnecting] = useState(false);

  const [participants, setParticipants] = useState<ParticipantState[]>([]);
  const [waitingQueue, setWaitingQueue] = useState<WaitingParticipant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [hostId, setHostId] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);

  const [isMuted, setIsMuted] = useState(config.isMuted);
  const [isCamOff, setIsCamOff] = useState(config.isCamOff);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [virtualBg, setVirtualBg] = useState<VirtualBgMode>(config.virtualBg);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid');
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<'chat' | 'participants' | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const [durationSec, setDurationSec] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Local & Remote MediaStreams keyed by participantId
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localDisplayStream, setLocalDisplayStream] = useState<MediaStream | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lkRoomRef = useRef<Room | null>(null);
  const rawLocalStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const bgProcessorRef = useRef<VirtualBgProcessor | null>(null);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<{ stop: () => void } | null>(null);
  const sidePanelRef = useRef(sidePanel);
  sidePanelRef.current = sidePanel;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 4000);
  }, []);

  const sendWs = useCallback((payload: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Meeting timer
  useEffect(() => {
    if (phase !== 'joined') return;
    const timer = setInterval(() => {
      setDurationSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  // Initialize local camera/mic with anti-delay audio DSP
  useEffect(() => {
    let cancelled = false;
    const setupLocalMedia = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: !config.isCamOff
            ? {
                deviceId: config.videoDeviceId ? { exact: config.videoDeviceId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : true,
          audio: {
            deviceId: config.audioDeviceId ? { exact: config.audioDeviceId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream.getAudioTracks().forEach((tr) => {
          tr.enabled = !config.isMuted;
        });
        stream.getVideoTracks().forEach((tr) => {
          tr.enabled = !config.isCamOff;
        });
        rawLocalStreamRef.current = stream;

        if (config.virtualBg !== 'none' && stream.getVideoTracks().length > 0) {
          const proc = createVirtualBgProcessor(stream, config.virtualBg);
          bgProcessorRef.current = proc;
          setLocalDisplayStream(proc.outputStream);
        } else {
          setLocalDisplayStream(stream);
        }
      } catch {
        // Headless or denied permissions: allow room participation without local media
      }
    };
    void setupLocalMedia();

    return () => {
      cancelled = true;
      bgProcessorRef.current?.destroy();
      rawLocalStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [config.audioDeviceId, config.isCamOff, config.isMuted, config.videoDeviceId, config.virtualBg]);

  // Helper to create/get WebRTC peer connection in mesh fallback mode
  const getOrCreatePeer = useCallback(
    (remoteId: string, initiator: boolean) => {
      const existing = peerConnsRef.current.get(remoteId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
      peerConnsRef.current.set(remoteId, pc);

      const streamToSend = screenStreamRef.current || rawLocalStreamRef.current;
      if (streamToSend) {
        for (const track of streamToSend.getTracks()) {
          pc.addTrack(track, streamToSend);
        }
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendWs({ type: 'rtc:signal', targetId: remoteId, signal: { candidate: ev.candidate } });
        }
      };

      pc.ontrack = (ev) => {
        const remoteStream = ev.streams[0];
        if (remoteStream) {
          setRemoteStreams((prev) => ({ ...prev, [remoteId]: remoteStream }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          sendWs({ type: 'participant:update', patch: { connectionQuality: 'poor' } });
        } else if (pc.connectionState === 'connected') {
          sendWs({ type: 'participant:update', patch: { connectionQuality: 'good' } });
        }
      };

      if (initiator) {
        void pc
          .createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (pc.localDescription) {
              sendWs({ type: 'rtc:signal', targetId: remoteId, signal: { sdp: pc.localDescription } });
            }
          })
          .catch(() => {});
      }

      return pc;
    },
    [sendWs]
  );

  // Connect Token API + WebSocket + Optional LiveKit SFU Room with auto-reconnect
  useEffect(() => {
    let unmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let activeMode: 'livekit' | 'webrtc-mesh' = 'webrtc-mesh';

    const connectRoom = async () => {
      try {
        const tokenRes = await fetch('/api/livekit/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: config.code,
            participantId,
            participantName: config.displayName,
            passwordToken: config.passwordToken,
          }),
        });

        const tokenData = (await tokenRes.json()) as RoomTokenResponse & { error?: string };
        if (!tokenRes.ok) {
          if (!unmounted) {
            setPhase('rejected');
            setRejectReason(tokenData.error || 'Tidak dapat masuk ke ruangan.');
          }
          return;
        }

        if (unmounted) return;
        setRoomTitle(tokenData.roomState.title);
        setIsLocked(tokenData.roomState.isLocked);
        setWaitingRoomEnabled(tokenData.roomState.waitingRoomEnabled);
        setHostId(tokenData.roomState.hostId);
        iceServersRef.current = tokenData.iceServers;
        activeMode = tokenData.mode;

        // If LiveKit Cloud SFU credentials are active, connect LiveKit SFU Room
        if (tokenData.mode === 'livekit' && tokenData.token && tokenData.livekitUrl) {
          const roomOpts = buildLiveKitRoomOptions({
            audioDeviceId: config.audioDeviceId,
            videoDeviceId: config.videoDeviceId,
          });
          const lkRoom = new Room(roomOpts);
          lkRoomRef.current = lkRoom;

          lkRoom
            .on(RoomEvent.Reconnecting, () => setWsReconnecting(true))
            .on(RoomEvent.Reconnected, () => setWsReconnecting(false))
            .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
              if (participant.isLocal) {
                const mapped: ConnectionQualityLevel =
                  quality === LkConnectionQuality.Excellent || quality === LkConnectionQuality.Good
                    ? 'good'
                    : quality === LkConnectionQuality.Poor
                      ? 'medium'
                      : 'poor';
                sendWs({ type: 'participant:update', patch: { connectionQuality: mapped } });
                if (mapped === 'poor') {
                  showToast(t('poorConnectionNotice', lang));
                }
              }
            })
            .on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
              if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
                setRemoteStreams((prev) => {
                  const stream = prev[participant.identity] || new MediaStream();
                  stream.addTrack(track.mediaStreamTrack);
                  return { ...prev, [participant.identity]: stream };
                });
              }
            });

          await lkRoom.connect(tokenData.livekitUrl, tokenData.token, {
            rtcConfig: tokenData.iceServers.length
              ? { iceServers: tokenData.iceServers, iceTransportPolicy: 'all' }
              : undefined,
          });
          await lkRoom.localParticipant.setMicrophoneEnabled(!config.isMuted);
          await lkRoom.localParticipant.setCameraEnabled(!config.isCamOff);
        }

        // Open authoritative WebSocket channel for state, chat, host moderation & signaling
        const openSocket = () => {
          if (unmounted) return;
          const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
          wsRef.current = ws;

          ws.onopen = () => {
            reconnectAttempt = 0;
            setWsReconnecting(false);
            ws.send(
              JSON.stringify({
                type: 'room:join',
                code: config.code,
                participant: {
                  id: participantId,
                  name: config.displayName,
                  isMuted: config.isMuted,
                  isCamOff: config.isCamOff,
                  avatarColor: pickAvatarColor(config.displayName + participantId),
                },
                passwordToken: config.passwordToken,
              } satisfies WsClientMessage)
            );
          };

          ws.onmessage = async (event) => {
            let msg: WsServerMessage;
            try {
              msg = JSON.parse(String(event.data)) as WsServerMessage;
            } catch {
              return;
            }

            switch (msg.type) {
              case 'room:waiting':
                setPhase('waiting');
                break;

              case 'room:rejected':
                setPhase('rejected');
                setRejectReason(msg.reason);
                break;

              case 'room:error':
                showToast(msg.message);
                break;

              case 'room:joined':
                setPhase('joined');
                setParticipants(msg.participants);
                setWaitingQueue(msg.waitingQueue);
                setMessages(msg.messages);
                setIsLocked(msg.isLocked);
                setWaitingRoomEnabled(msg.waitingRoomEnabled);
                setHostId(msg.hostId);
                if (activeMode === 'webrtc-mesh') {
                  msg.participants.forEach((p) => {
                    if (p.id !== participantId && p.id > participantId) {
                      getOrCreatePeer(p.id, true);
                    }
                  });
                }
                break;

              case 'room:state-sync':
                setParticipants(msg.participants);
                setWaitingQueue(msg.waitingQueue);
                setIsLocked(msg.isLocked);
                setWaitingRoomEnabled(msg.waitingRoomEnabled);
                setHostId(msg.hostId);
                if (activeMode === 'webrtc-mesh') {
                  msg.participants.forEach((p) => {
                    if (p.id !== participantId && !peerConnsRef.current.has(p.id) && p.id > participantId) {
                      getOrCreatePeer(p.id, true);
                    }
                  });
                }
                break;

              case 'chat:message':
                setMessages((prev) => (prev.some((m) => m.id === msg.message.id) ? prev : [...prev, msg.message]));
                if (sidePanelRef.current !== 'chat' && msg.message.senderId !== participantId) {
                  setUnreadChatCount((c) => c + 1);
                }
                break;

              case 'reaction:broadcast':
                setReactions((prev) => [...prev.slice(-10), msg.reaction]);
                setTimeout(() => {
                  setReactions((prev) => prev.filter((r) => r.id !== msg.reaction.id));
                }, 3200);
                break;

              case 'host:force-mute':
                setIsMuted(true);
                rawLocalStreamRef.current?.getAudioTracks().forEach((tr) => {
                  tr.enabled = false;
                });
                void lkRoomRef.current?.localParticipant.setMicrophoneEnabled(false);
                showToast('Host membisukan mikrofon Anda.');
                break;

              case 'host:force-cam-off':
                setIsCamOff(true);
                rawLocalStreamRef.current?.getVideoTracks().forEach((tr) => {
                  tr.enabled = false;
                });
                void lkRoomRef.current?.localParticipant.setCameraEnabled(false);
                showToast('Host mematikan kamera Anda.');
                break;

              case 'room:kicked':
                onExitRoom(msg.reason);
                break;

              case 'room:ended':
                onExitRoom(`Meeting telah diakhiri oleh ${msg.endedBy}.`);
                break;

              case 'rtc:signal': {
                if (activeMode !== 'webrtc-mesh') return;
                const pc = getOrCreatePeer(msg.fromId, false);
                const sig = msg.signal as { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
                if (sig.sdp) {
                  await pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
                  if (sig.sdp.type === 'offer') {
                    const ans = await pc.createAnswer();
                    await pc.setLocalDescription(ans);
                    if (pc.localDescription) {
                      sendWs({ type: 'rtc:signal', targetId: msg.fromId, signal: { sdp: pc.localDescription } });
                    }
                  }
                } else if (sig.candidate) {
                  await pc.addIceCandidate(new RTCIceCandidate(sig.candidate)).catch(() => {});
                }
                break;
              }
            }
          };

          ws.onclose = () => {
            if (unmounted) return;
            setWsReconnecting(true);
            const delay = Math.min(8000, 1000 * Math.pow(1.6, reconnectAttempt));
            reconnectAttempt += 1;
            reconnectTimer = setTimeout(openSocket, delay);
          };
        };

        openSocket();
      } catch {
        if (!unmounted) {
          showToast('Gagal menginisialisasi koneksi meeting.');
        }
      }
    };

    void connectRoom();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      void lkRoomRef.current?.disconnect();
      for (const pc of peerConnsRef.current.values()) {
        pc.close();
      }
      peerConnsRef.current.clear();
    };
  }, [
    config.audioDeviceId,
    config.code,
    config.displayName,
    config.isCamOff,
    config.isMuted,
    config.passwordToken,
    config.videoDeviceId,
    getOrCreatePeer,
    lang,
    onExitRoom,
    participantId,
    sendWs,
    showToast,
  ]);

  // Controls handlers
  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      rawLocalStreamRef.current?.getAudioTracks().forEach((tr) => {
        tr.enabled = !next;
      });
      void lkRoomRef.current?.localParticipant.setMicrophoneEnabled(!next);
      sendWs({ type: 'participant:update', patch: { isMuted: next } });
      return next;
    });
  }, [sendWs]);

  const handleToggleCam = useCallback(() => {
    setIsCamOff((prev) => {
      const next = !prev;
      rawLocalStreamRef.current?.getVideoTracks().forEach((tr) => {
        tr.enabled = !next;
      });
      void lkRoomRef.current?.localParticipant.setCameraEnabled(!next);
      sendWs({ type: 'participant:update', patch: { isCamOff: next } });
      return next;
    });
  }, [sendWs]);

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      screenStreamRef.current = null;
      setIsScreenSharing(false);
      setLocalDisplayStream(bgProcessorRef.current ? bgProcessorRef.current.outputStream : rawLocalStreamRef.current);
      void lkRoomRef.current?.localParticipant.setScreenShareEnabled(false);
      sendWs({ type: 'participant:update', patch: { isScreenSharing: false } });
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      showToast('Peramban tidak mendukung berbagi layar.');
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      screenStreamRef.current = screenStream;
      setIsScreenSharing(true);
      setLocalDisplayStream(screenStream);
      sendWs({ type: 'participant:update', patch: { isScreenSharing: true } });

      screenStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        screenStreamRef.current = null;
        setIsScreenSharing(false);
        setLocalDisplayStream(bgProcessorRef.current ? bgProcessorRef.current.outputStream : rawLocalStreamRef.current);
        sendWs({ type: 'participant:update', patch: { isScreenSharing: false } });
      });
    } catch {
      showToast('Berbagi layar dibatalkan.');
    }
  }, [isScreenSharing, sendWs, showToast]);

  const handleToggleHand = useCallback(() => {
    setIsHandRaised((prev) => {
      const next = !prev;
      sendWs({ type: 'participant:update', patch: { isHandRaised: next } });
      return next;
    });
  }, [sendWs]);

  const handleChangeVirtualBg = useCallback((mode: VirtualBgMode) => {
    setVirtualBg(mode);
    const raw = rawLocalStreamRef.current;
    if (!raw || raw.getVideoTracks().length === 0) return;
    if (mode === 'none') {
      bgProcessorRef.current?.destroy();
      bgProcessorRef.current = null;
      setLocalDisplayStream(raw);
    } else if (bgProcessorRef.current) {
      bgProcessorRef.current.setMode(mode);
    } else {
      const proc = createVirtualBgProcessor(raw, mode);
      bgProcessorRef.current = proc;
      setLocalDisplayStream(proc.outputStream);
    }
  }, []);

  // Live Captions via Web Speech API
  const handleToggleCaptions = useCallback(() => {
    if (captionsEnabled) {
      speechRecRef.current?.stop();
      speechRecRef.current = null;
      setCaptionsEnabled(false);
      setCaptionText('');
      return;
    }
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRec) {
      showToast('Teks langsung (Web Speech API) belum didukung di peramban ini.');
      return;
    }

    const rec = new SpeechRec() as {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: (ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      start: () => void;
      stop: () => void;
    };
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang === 'id' ? 'id-ID' : 'en-US';
    rec.onresult = (ev) => {
      const last = ev.results[ev.results.length - 1];
      if (last && last[0]) {
        setCaptionText(last[0].transcript);
      }
    };
    rec.onerror = () => {
      setCaptionsEnabled(false);
    };
    rec.start();
    speechRecRef.current = rec;
    setCaptionsEnabled(true);
  }, [captionsEnabled, lang, showToast]);

  // Recording via MediaRecorder
  const handleToggleRecording = useCallback(() => {
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    const stream = localDisplayStream || rawLocalStreamRef.current;
    if (!stream || typeof MediaRecorder === 'undefined') {
      showToast('Rekaman lokal membutuhkan stream kamera/mikrofon aktif.');
      return;
    }

    try {
      recordedChunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ketemu-${config.code}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Rekaman meeting disimpan ke perangkat Anda.');
      };
      rec.start(1000);
      mediaRecorderRef.current = rec;
      setIsRecording(true);
    } catch {
      showToast('Gagal memulai perekaman lokal.');
    }
  }, [config.code, isRecording, localDisplayStream, showToast]);

  const handleTogglePiP = useCallback(async () => {
    const videoEl = document.querySelector('video');
    if (!videoEl || !document.pictureInPictureEnabled) {
      showToast('Picture-in-Picture membutuhkan video aktif.');
      return;
    }
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoEl.requestPictureInPicture();
      }
    } catch {
      showToast('Gagal mengaktifkan Picture-in-Picture.');
    }
  }, [showToast]);

  const handleToggleFullscreen = useCallback(async () => {
    if (!rootRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await rootRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // ignore fullscreen rejection
    }
  }, []);

  // Keyboard shortcuts (M, V, S, H, C, P)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      if (key === 'm') {
        e.preventDefault();
        handleToggleMute();
      } else if (key === 'v') {
        e.preventDefault();
        handleToggleCam();
      } else if (key === 's') {
        e.preventDefault();
        void handleToggleScreenShare();
      } else if (key === 'h') {
        e.preventDefault();
        handleToggleHand();
      } else if (key === 'c') {
        e.preventDefault();
        setSidePanel((curr) => {
          if (curr === 'chat') return null;
          setUnreadChatCount(0);
          return 'chat';
        });
      } else if (key === 'p') {
        e.preventDefault();
        setSidePanel((curr) => (curr === 'participants' ? null : 'participants'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleToggleCam, handleToggleHand, handleToggleMute, handleToggleScreenShare]);

  const selfParticipant = useMemo(
    () => participants.find((p) => p.id === participantId),
    [participants, participantId]
  );
  const canModerate = selfParticipant?.role === 'host' || selfParticipant?.role === 'cohost';
  const isMainHost = selfParticipant?.role === 'host' || hostId === participantId;

  const spotlightParticipant = useMemo(() => {
    if (pinnedId) return participants.find((p) => p.id === pinnedId) || null;
    if (layoutMode === 'speaker') {
      return (
        participants.find((p) => p.isScreenSharing) ||
        participants.find((p) => p.isSpeaking && !p.isMuted) ||
        participants[0] ||
        null
      );
    }
    return participants.find((p) => p.isScreenSharing) || null;
  }, [layoutMode, participants, pinnedId]);

  const gridDims = computeGridLayout(participants.length, Boolean(spotlightParticipant));

  // Waiting Room / Rejected / Connecting Screens
  if (phase === 'waiting') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/15 text-blue-500 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="font-display text-xl font-bold">{t('waitingRoomTitle', lang)}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t('waitingRoomDesc', lang)}</p>
          <p className="font-mono text-xs text-slate-500">{config.code}</p>
          <button
            type="button"
            onClick={() => onExitRoom()}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Batalkan & Kembali
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'rejected') {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-600/15 text-rose-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h1 className="font-display text-xl font-bold">Tidak Dapat Bergabung</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">{rejectReason}</p>
          <button
            type="button"
            onClick={() => onExitRoom()}
            className="px-5 py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500"
          >
            Kembali ke Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="h-screen w-screen overflow-hidden flex flex-col bg-slate-100 dark:bg-[#090D16] text-slate-900 dark:text-slate-100"
    >
      {/* Top Bar */}
      <header className="h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0D1320]/90 backdrop-blur-md flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display font-bold text-base text-slate-900 dark:text-white truncate">
            {roomTitle}
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}/?room=${config.code}`);
              setCopiedLink(true);
              setTimeout(() => setCopiedLink(false), 2000);
            }}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono text-slate-600 dark:text-slate-300 hover:text-blue-500"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Tersalin' : config.code}</span>
          </button>
          {isLocked && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500">
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Terkunci</span>
            </span>
          )}
          {isRecording && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-500">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>REC</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span
            data-testid="meeting-timer"
            className="font-mono text-xs tabular-nums px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            {formatDuration(durationSec)}
          </span>

          <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setLayoutMode('grid')}
              aria-label={t('layoutGrid', lang)}
              className={`p-1.5 rounded-md transition-colors ${
                layoutMode === 'grid'
                  ? 'bg-white dark:bg-slate-800 text-blue-500 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              <Grid2x2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('speaker')}
              aria-label={t('layoutSpeaker', lang)}
              className={`p-1.5 rounded-md transition-colors ${
                layoutMode === 'speaker'
                  ? 'bg-white dark:bg-slate-800 text-blue-500 shadow-xs'
                  : 'text-slate-500'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="hidden md:block">
            <ThemeLangControls
              theme={theme}
              onToggleTheme={onToggleTheme}
              lang={lang}
              onToggleLang={onToggleLang}
            />
          </div>
        </div>
      </header>

      {/* Auto-reconnect or status banner */}
      {wsReconnecting && (
        <div role="status" className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-400 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>{t('reconnectingBanner', lang)}</span>
        </div>
      )}

      {/* Main Stage + Optional SidePanel */}
      <div className="flex-1 flex min-h-0 relative">
        <main className="flex-1 p-3 sm:p-4 min-h-0 flex flex-col justify-center relative">
          {phase === 'connecting' ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Menghubungkan ke server SFU Singapore...</p>
              </div>
            </div>
          ) : spotlightParticipant && participants.length > 1 ? (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
              <div className="flex-1 min-h-0">
                <VideoTile
                  participant={spotlightParticipant}
                  stream={
                    spotlightParticipant.id === participantId
                      ? localDisplayStream
                      : remoteStreams[spotlightParticipant.id] || null
                  }
                  isSelf={spotlightParticipant.id === participantId}
                  isPinned={pinnedId === spotlightParticipant.id}
                  canModerate={canModerate}
                  isMainHost={isMainHost}
                  lang={lang}
                  onTogglePin={(id) => setPinnedId((curr) => (curr === id ? null : id))}
                  onMuteParticipant={(targetId) => sendWs({ type: 'host:mute-participant', targetId })}
                  onDisableCam={(targetId) => sendWs({ type: 'host:disable-cam', targetId })}
                  onKickParticipant={(targetId) => sendWs({ type: 'host:kick-participant', targetId })}
                  onToggleCoHost={(targetId) => sendWs({ type: 'host:toggle-cohost', targetId })}
                  onTransferHost={(targetId) => sendWs({ type: 'host:transfer-host', targetId })}
                />
              </div>

              <div className="lg:w-64 flex lg:flex-col gap-3 overflow-auto shrink-0">
                {participants
                  .filter((p) => p.id !== spotlightParticipant.id)
                  .map((p) => (
                    <div key={p.id} className="w-44 lg:w-full h-32 lg:h-40 shrink-0">
                      <VideoTile
                        participant={p}
                        stream={p.id === participantId ? localDisplayStream : remoteStreams[p.id] || null}
                        isSelf={p.id === participantId}
                        isPinned={pinnedId === p.id}
                        canModerate={canModerate}
                        isMainHost={isMainHost}
                        lang={lang}
                        compact
                        onTogglePin={(id) => setPinnedId((curr) => (curr === id ? null : id))}
                        onMuteParticipant={(targetId) => sendWs({ type: 'host:mute-participant', targetId })}
                        onDisableCam={(targetId) => sendWs({ type: 'host:disable-cam', targetId })}
                        onKickParticipant={(targetId) => sendWs({ type: 'host:kick-participant', targetId })}
                        onToggleCoHost={(targetId) => sendWs({ type: 'host:toggle-cohost', targetId })}
                        onTransferHost={(targetId) => sendWs({ type: 'host:transfer-host', targetId })}
                      />
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div
              className="flex-1 min-h-0 grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${gridDims.cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${gridDims.rows}, minmax(0, 1fr))`,
              }}
            >
              {participants.slice(0, gridDims.maxVisible).map((p) => (
                <VideoTile
                  key={p.id}
                  participant={p}
                  stream={p.id === participantId ? localDisplayStream : remoteStreams[p.id] || null}
                  isSelf={p.id === participantId}
                  isPinned={pinnedId === p.id}
                  canModerate={canModerate}
                  isMainHost={isMainHost}
                  lang={lang}
                  onTogglePin={(id) => setPinnedId((curr) => (curr === id ? null : id))}
                  onMuteParticipant={(targetId) => sendWs({ type: 'host:mute-participant', targetId })}
                  onDisableCam={(targetId) => sendWs({ type: 'host:disable-cam', targetId })}
                  onKickParticipant={(targetId) => sendWs({ type: 'host:kick-participant', targetId })}
                  onToggleCoHost={(targetId) => sendWs({ type: 'host:toggle-cohost', targetId })}
                  onTransferHost={(targetId) => sendWs({ type: 'host:transfer-host', targetId })}
                />
              ))}
            </div>
          )}

          {/* Floating Emoji Reactions */}
          {reactions.length > 0 && (
            <div className="pointer-events-none absolute bottom-6 left-6 flex flex-col gap-1.5 z-20">
              {reactions.map((rx) => (
                <div
                  key={rx.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/85 text-white text-sm shadow-lg"
                >
                  <span>{rx.emoji}</span>
                  <span className="text-xs text-slate-300">{rx.senderName}</span>
                </div>
              ))}
            </div>
          )}

          {/* Live Captions Overlay */}
          {captionsEnabled && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 max-w-xl px-4 py-2 rounded-xl bg-black/80 text-white text-sm text-center z-20">
              {captionText || 'Mendengarkan ucapan Anda...'}
            </div>
          )}

          {/* Toast Notification */}
          {toast && (
            <div
              role="status"
              className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-medium shadow-xl border border-white/10 z-30"
            >
              {toast}
            </div>
          )}
        </main>

        {/* Lazy-loaded SidePanel (Chat & Participants) */}
        {sidePanel && (
          <div className="fixed inset-0 z-40 sm:static sm:z-auto flex justify-end bg-black/50 sm:bg-transparent">
            <Suspense
              fallback={
                <div className="w-80 h-full bg-white dark:bg-[#0D1320] border-l border-slate-800 p-4 text-xs text-slate-400">
                  Memuat panel...
                </div>
              }
            >
              <LazySidePanel
                activeTab={sidePanel}
                onChangeTab={(tab) => {
                  setSidePanel(tab);
                  if (tab === 'chat') setUnreadChatCount(0);
                }}
                onClose={() => setSidePanel(null)}
                lang={lang}
                messages={messages}
                onSendMessage={(payload) => sendWs({ type: 'chat:send', ...payload })}
                participants={participants}
                waitingQueue={waitingQueue}
                selfId={participantId}
                canModerate={canModerate}
                isLocked={isLocked}
                waitingRoomEnabled={waitingRoomEnabled}
                onAdmitWaiting={(targetId) => sendWs({ type: 'waiting:admit', targetId })}
                onRejectWaiting={(targetId) => sendWs({ type: 'waiting:reject', targetId })}
                onToggleLock={() => sendWs({ type: 'host:toggle-lock', isLocked: !isLocked })}
                onToggleWaitingRoom={() =>
                  sendWs({ type: 'host:toggle-waiting-room', enabled: !waitingRoomEnabled })
                }
                onMuteAll={() => sendWs({ type: 'host:mute-all' })}
                onMuteOne={(targetId) => sendWs({ type: 'host:mute-participant', targetId })}
                onKickOne={(targetId) => sendWs({ type: 'host:kick-participant', targetId })}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* Bottom Floating Toolbar */}
      <MeetingToolbar
        lang={lang}
        isMuted={isMuted}
        isCamOff={isCamOff}
        isScreenSharing={isScreenSharing}
        isHandRaised={isHandRaised}
        captionsEnabled={captionsEnabled}
        isRecording={isRecording}
        isFullscreen={isFullscreen}
        virtualBg={virtualBg}
        sidePanel={sidePanel}
        unreadChatCount={unreadChatCount}
        participantCount={participants.length}
        waitingCount={waitingQueue.length}
        isMainHost={isMainHost}
        onToggleMute={handleToggleMute}
        onToggleCam={handleToggleCam}
        onToggleScreenShare={() => void handleToggleScreenShare()}
        onToggleHand={handleToggleHand}
        onSendReaction={(emoji) => sendWs({ type: 'reaction:send', emoji })}
        onToggleCaptions={handleToggleCaptions}
        onToggleRecording={handleToggleRecording}
        onTogglePiP={() => void handleTogglePiP()}
        onToggleFullscreen={() => void handleToggleFullscreen()}
        onChangeVirtualBg={handleChangeVirtualBg}
        onToggleSidePanel={(tab) => {
          setSidePanel((curr) => {
            if (curr === tab) return null;
            if (tab === 'chat') setUnreadChatCount(0);
            return tab;
          });
        }}
        onLeave={() => onExitRoom()}
        onEndForAll={() => sendWs({ type: 'host:end-meeting' })}
      />
    </div>
  );
}
