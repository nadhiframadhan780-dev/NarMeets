import { memo, useEffect, useRef, useState } from 'react';
import {
  Crown,
  Hand,
  MicOff,
  MoreVertical,
  Pin,
  PinOff,
  Shield,
  Signal,
  SignalLow,
  SignalMedium,
  UserX,
  VideoOff,
} from 'lucide-react';
import type { Language, ParticipantState } from '../types/meeting';
import { t } from '../utils/i18n';

interface VideoTileProps {
  participant: ParticipantState;
  stream: MediaStream | null;
  isSelf: boolean;
  isPinned: boolean;
  canModerate: boolean;
  isMainHost: boolean;
  lang: Language;
  compact?: boolean;
  onTogglePin: (id: string) => void;
  onMuteParticipant: (id: string) => void;
  onDisableCam: (id: string) => void;
  onKickParticipant: (id: string) => void;
  onToggleCoHost: (id: string) => void;
  onTransferHost: (id: string) => void;
}

export const VideoTile = memo(function VideoTile({
  participant,
  stream,
  isSelf,
  isPinned,
  canModerate,
  isMainHost,
  lang,
  compact = false,
  onTogglePin,
  onMuteParticipant,
  onDisableCam,
  onKickParticipant,
  onToggleCoHost,
  onTransferHost,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasLiveVideo =
    !participant.isCamOff &&
    Boolean(stream) &&
    (stream?.getVideoTracks().some((tr) => tr.readyState === 'live' && tr.enabled) ?? false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (stream && (hasLiveVideo || participant.isScreenSharing)) {
      if (el.srcObject !== stream) {
        el.srcObject = stream;
      }
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [stream, hasLiveVideo, participant.isScreenSharing]);

  const qualityLabel =
    participant.connectionQuality === 'good'
      ? t('qualityGood', lang)
      : participant.connectionQuality === 'medium'
        ? t('qualityMedium', lang)
        : t('qualityPoor', lang);

  return (
    <div
      data-testid={`video-tile-${participant.id}`}
      className={`group relative w-full h-full min-h-[160px] rounded-2xl overflow-hidden bg-slate-900 border transition-colors ${
        participant.isSpeaking && !participant.isMuted
          ? 'border-blue-500 ring-2 ring-blue-500/40'
          : 'border-slate-800'
      }`}
    >
      {hasLiveVideo || participant.isScreenSharing ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isSelf}
          className={`w-full h-full ${
            participant.isScreenSharing ? 'object-contain bg-black' : 'object-cover'
          } ${isSelf && !participant.isScreenSharing ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-[#111827] to-slate-950 p-4">
          <div
            className={`${compact ? 'w-12 h-12 text-base' : 'w-18 h-18 text-xl'} rounded-2xl flex items-center justify-center font-display font-bold text-white shadow-md`}
            style={{ backgroundColor: participant.avatarColor }}
          >
            {participant.name.slice(0, 2).toUpperCase()}
          </div>
        </div>
      )}

      {/* Top Overlay: Hand Raised & Actions */}
      <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5">
          {participant.isHandRaised && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-semibold shadow-sm">
              <Hand className="w-3.5 h-3.5" />
              <span>Angkat Tangan</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onTogglePin(participant.id)}
            aria-label={isPinned ? `Lepas pin ${participant.name}` : `Pin ${participant.name}`}
            className="p-1.5 rounded-lg bg-black/65 hover:bg-black/85 text-white border border-white/10 transition-colors"
          >
            {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
          </button>

          {canModerate && !isSelf && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={`Aksi moderasi untuk ${participant.name}`}
                aria-expanded={menuOpen}
                className="p-1.5 rounded-lg bg-black/65 hover:bg-black/85 text-white border border-white/10 transition-colors"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-1 w-48 rounded-xl border border-slate-700 bg-slate-900 text-slate-100 shadow-xl py-1 z-30 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      onMuteParticipant(participant.id);
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2"
                  >
                    <MicOff className="w-3.5 h-3.5" />
                    <span>Bisukan Mikrofon</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onDisableCam(participant.id);
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2"
                  >
                    <VideoOff className="w-3.5 h-3.5" />
                    <span>Matikan Kamera</span>
                  </button>
                  {isMainHost && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleCoHost(participant.id);
                          setMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{participant.role === 'cohost' ? 'Cabut Co-Host' : 'Jadikan Co-Host'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onTransferHost(participant.id);
                          setMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2"
                      >
                        <Crown className="w-3.5 h-3.5" />
                        <span>Pindahkan Hak Host</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onKickParticipant(participant.id);
                      setMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-rose-950/60 text-rose-400 flex items-center gap-2"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Keluarkan Peserta</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Scrim & Participant Metadata */}
      <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/35 to-transparent flex items-end justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-2 min-w-0">
          {participant.isMuted && (
            <span
              aria-label="Mikrofon dibisukan"
              className="p-1 rounded-md bg-rose-600/90 text-white shrink-0"
            >
              <MicOff className="w-3 h-3" />
            </span>
          )}
          <span className="text-xs font-medium text-white truncate">
            {participant.name}
            {isSelf ? ' (Anda)' : ''}
            {participant.role === 'host' ? ' · Host' : participant.role === 'cohost' ? ' · Co-Host' : ''}
          </span>
        </div>

        <div
          title={`Kualitas koneksi: ${qualityLabel}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/75 text-[11px] font-medium text-slate-100 shrink-0"
        >
          {participant.connectionQuality === 'good' && <Signal className="w-3 h-3 text-emerald-400" />}
          {participant.connectionQuality === 'medium' && <SignalMedium className="w-3 h-3 text-amber-400" />}
          {participant.connectionQuality === 'poor' && <SignalLow className="w-3 h-3 text-rose-400" />}
          <span>{qualityLabel}</span>
        </div>
      </div>
    </div>
  );
});
