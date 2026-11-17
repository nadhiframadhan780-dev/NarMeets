import { useState } from 'react';
import {
  Captions,
  Disc,
  Hand,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  PhoneOff,
  PictureInPicture2,
  Smile,
  Sparkles,
  Users,
  Video,
  VideoOff,
} from 'lucide-react';
import type { Language, VirtualBgMode } from '../types/meeting';
import { t } from '../utils/i18n';

interface MeetingToolbarProps {
  lang: Language;
  isMuted: boolean;
  isCamOff: boolean;
  isScreenSharing: boolean;
  isHandRaised: boolean;
  captionsEnabled: boolean;
  isRecording: boolean;
  isFullscreen: boolean;
  virtualBg: VirtualBgMode;
  sidePanel: 'chat' | 'participants' | null;
  unreadChatCount: number;
  participantCount: number;
  waitingCount: number;
  isMainHost: boolean;
  onToggleMute: () => void;
  onToggleCam: () => void;
  onToggleScreenShare: () => void;
  onToggleHand: () => void;
  onSendReaction: (emoji: string) => void;
  onToggleCaptions: () => void;
  onToggleRecording: () => void;
  onTogglePiP: () => void;
  onToggleFullscreen: () => void;
  onChangeVirtualBg: (mode: VirtualBgMode) => void;
  onToggleSidePanel: (tab: 'chat' | 'participants') => void;
  onLeave: () => void;
  onEndForAll: () => void;
}

const REACTION_EMOJIS = ['👍', '👏', '❤️', '😂', '😮', '🎉'];

export function MeetingToolbar({
  lang,
  isMuted,
  isCamOff,
  isScreenSharing,
  isHandRaised,
  captionsEnabled,
  isRecording,
  isFullscreen,
  virtualBg,
  sidePanel,
  unreadChatCount,
  participantCount,
  waitingCount,
  isMainHost,
  onToggleMute,
  onToggleCam,
  onToggleScreenShare,
  onToggleHand,
  onSendReaction,
  onToggleCaptions,
  onToggleRecording,
  onTogglePiP,
  onToggleFullscreen,
  onChangeVirtualBg,
  onToggleSidePanel,
  onLeave,
  onEndForAll,
}: MeetingToolbarProps) {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [bgOpen, setBgOpen] = useState(false);
  const [leaveMenuOpen, setLeaveMenuOpen] = useState(false);

  return (
    <div className="relative z-30 px-2 sm:px-6 pb-3 pt-1 flex items-center justify-center">
      <div className="relative max-w-full flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0D1320]/95 backdrop-blur-md shadow-lg overflow-x-auto">
        {/* Mic (Shortcut: M) */}
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={isMuted ? 'Nyalakan mikrofon (M)' : 'Bisukan mikrofon (M)'}
          title="Mikrofon (M)"
          className={`p-2 sm:px-3.5 sm:py-2.5 rounded-xl flex items-center gap-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isMuted
              ? 'bg-rose-600 text-white hover:bg-rose-500'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          <span className="hidden md:inline">{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>

        {/* Camera (Shortcut: V) */}
        <button
          type="button"
          onClick={onToggleCam}
          aria-label={isCamOff ? 'Nyalakan kamera (V)' : 'Matikan kamera (V)'}
          title="Kamera (V)"
          className={`p-2 sm:px-3.5 sm:py-2.5 rounded-xl flex items-center gap-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isCamOff
              ? 'bg-rose-600 text-white hover:bg-rose-500'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          {isCamOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
          <span className="hidden md:inline">{isCamOff ? 'Start Cam' : 'Stop Cam'}</span>
        </button>

        {/* Share Screen (Shortcut: S) */}
        <button
          type="button"
          onClick={onToggleScreenShare}
          aria-label={isScreenSharing ? t('stopShare', lang) : t('shareScreen', lang)}
          title="Bagikan Layar (S)"
          className={`p-2 sm:px-3.5 sm:py-2.5 rounded-xl flex items-center gap-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isScreenSharing
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <MonitorUp className="w-4 h-4" />
          <span className="hidden lg:inline">{isScreenSharing ? t('stopShare', lang) : t('shareScreen', lang)}</span>
        </button>

        {/* Raise Hand (Shortcut: H) */}
        <button
          type="button"
          onClick={onToggleHand}
          aria-label={isHandRaised ? t('lowerHand', lang) : t('raiseHand', lang)}
          title="Angkat Tangan (H)"
          className={`p-2 sm:p-2.5 rounded-xl transition-colors shrink-0 ${
            isHandRaised
              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Hand className="w-4 h-4" />
        </button>

        {/* Reactions Picker */}
        <button
          type="button"
          onClick={() => {
            setReactionsOpen((o) => !o);
            setBgOpen(false);
          }}
          aria-label="Kirim reaksi emoji"
          title="Reaksi Emoji"
          className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
        >
          <Smile className="w-4 h-4" />
        </button>

        {/* Virtual Background */}
        <button
          type="button"
          onClick={() => {
            setBgOpen((o) => !o);
            setReactionsOpen(false);
          }}
          aria-label="Latar belakang virtual"
          title="Latar Virtual"
          className={`hidden sm:inline-flex p-2.5 rounded-xl transition-colors shrink-0 ${
            virtualBg !== 'none'
              ? 'bg-blue-600/15 text-blue-500 border border-blue-500/40'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Live Captions */}
        <button
          type="button"
          onClick={onToggleCaptions}
          aria-label={t('liveCaptions', lang)}
          title={t('liveCaptions', lang)}
          className={`hidden sm:inline-flex p-2.5 rounded-xl transition-colors shrink-0 ${
            captionsEnabled
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Captions className="w-4 h-4" />
        </button>

        {/* Record */}
        <button
          type="button"
          onClick={onToggleRecording}
          aria-label={isRecording ? t('stopRecording', lang) : t('recordMeeting', lang)}
          title={isRecording ? t('stopRecording', lang) : t('recordMeeting', lang)}
          className={`hidden md:inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            isRecording
              ? 'bg-rose-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Disc className="w-4 h-4" />
          <span>{isRecording ? t('stopRecording', lang) : t('recordMeeting', lang)}</span>
        </button>

        {/* PiP & Fullscreen */}
        <button
          type="button"
          onClick={onTogglePiP}
          aria-label="Picture in Picture"
          title="Picture-in-Picture"
          className="hidden lg:inline-flex p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
        >
          <PictureInPicture2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}
          title="Layar Penuh"
          className="hidden lg:inline-flex p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Chat Button (Shortcut: C) */}
        <button
          type="button"
          onClick={() => onToggleSidePanel('chat')}
          aria-label="Buka obrolan (C)"
          title="Obrolan (C)"
          className={`relative p-2 sm:p-2.5 rounded-xl transition-colors shrink-0 ${
            sidePanel === 'chat'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          {unreadChatCount > 0 && sidePanel !== 'chat' && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unreadChatCount}
            </span>
          )}
        </button>

        {/* Participants Button (Shortcut: P) */}
        <button
          type="button"
          onClick={() => onToggleSidePanel('participants')}
          aria-label={`Daftar peserta (${participantCount})`}
          title="Peserta (P)"
          className={`relative p-2 sm:px-2.5 sm:py-2.5 rounded-xl flex items-center gap-1 text-xs font-semibold transition-colors shrink-0 ${
            sidePanel === 'participants'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span className="tabular-nums">{participantCount}</span>
          {waitingCount > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-bold tabular-nums">
              +{waitingCount}
            </span>
          )}
        </button>

        {/* Leave / End Button */}
        <button
          type="button"
          onClick={() => {
            if (isMainHost) {
              setLeaveMenuOpen((o) => !o);
            } else {
              onLeave();
            }
          }}
          aria-label={t('leaveMeeting', lang)}
          title={t('leaveMeeting', lang)}
          className="p-2 sm:px-4 sm:py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
          <span className="hidden sm:inline">{t('leaveMeeting', lang)}</span>
        </button>
      </div>

      {leaveMenuOpen && isMainHost && (
        <div className="absolute bottom-18 right-3 sm:right-6 w-52 rounded-xl border border-slate-700 bg-slate-900 text-white shadow-xl p-1.5 space-y-1 z-40 text-xs">
          <button
            type="button"
            onClick={() => {
              setLeaveMenuOpen(false);
              onLeave();
            }}
            className="w-full px-3 py-2 rounded-lg text-left hover:bg-slate-800"
          >
            Keluar Sendiri
          </button>
          <button
            type="button"
            onClick={() => {
              setLeaveMenuOpen(false);
              onEndForAll();
            }}
            className="w-full px-3 py-2 rounded-lg text-left bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 font-semibold"
          >
            {t('endMeetingAll', lang)}
          </button>
        </div>
      )}

      {/* Reactions Floating Popover */}
      {reactionsOpen && (
        <div className="absolute bottom-18 px-3 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex items-center gap-2 z-40">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSendReaction(emoji);
                setReactionsOpen(false);
              }}
              className="p-1.5 rounded-xl text-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-transform hover:scale-110"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Virtual Background Popover */}
      {bgOpen && (
        <div className="absolute bottom-18 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl flex items-center gap-1.5 z-40 text-xs">
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
              onClick={() => {
                onChangeVirtualBg(bg.id);
                setBgOpen(false);
              }}
              className={`px-3 py-1.5 rounded-xl font-medium transition-colors ${
                virtualBg === bg.id
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {bg.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
