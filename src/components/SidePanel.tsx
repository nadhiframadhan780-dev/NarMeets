import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Check,
  Download,
  Hand,
  Lock,
  Mic,
  MicOff,
  Paperclip,
  Send,
  ShieldCheck,
  Unlock,
  UserCheck,
  UserX,
  Video,
  VideoOff,
  X,
} from 'lucide-react';
import type { ChatMessage, Language, ParticipantState, WaitingParticipant } from '../types/meeting';
import { t } from '../utils/i18n';

interface SidePanelProps {
  activeTab: 'chat' | 'participants';
  onChangeTab: (tab: 'chat' | 'participants') => void;
  onClose: () => void;
  lang: Language;
  messages: ChatMessage[];
  onSendMessage: (payload: { text: string; fileName?: string; fileDataUrl?: string; fileSize?: number }) => void;
  participants: ParticipantState[];
  waitingQueue: WaitingParticipant[];
  selfId: string;
  canModerate: boolean;
  isLocked: boolean;
  waitingRoomEnabled: boolean;
  onAdmitWaiting: (id: string) => void;
  onRejectWaiting: (id: string) => void;
  onToggleLock: () => void;
  onToggleWaitingRoom: () => void;
  onMuteAll: () => void;
  onMuteOne: (id: string) => void;
  onKickOne: (id: string) => void;
}

const QUICK_EMOJIS = ['👍', '👏', '🔥', '✅', '🎉', '🙏'];

export function SidePanel({
  activeTab,
  onChangeTab,
  onClose,
  lang,
  messages,
  onSendMessage,
  participants,
  waitingQueue,
  selfId,
  canModerate,
  isLocked,
  waitingRoomEnabled,
  onAdmitWaiting,
  onRejectWaiting,
  onToggleLock,
  onToggleWaitingRoom,
  onMuteAll,
  onMuteOne,
  onKickOne,
}: SidePanelProps) {
  const [text, setText] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSendMessage({ text: text.trim() });
    setText('');
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    if (file.size > 512 * 1024) {
      setFileError('Ukuran berkas maksimal 512 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSendMessage({
          text: text.trim() || `Mengirim berkas: ${file.name}`,
          fileName: file.name,
          fileDataUrl: reader.result,
          fileSize: file.size,
        });
        setText('');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const filteredParticipants = participants.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <aside
      aria-label="Panel samping meeting"
      className="w-full sm:w-88 lg:w-96 h-full flex flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1320] text-slate-900 dark:text-slate-100 shrink-0"
    >
      {/* Header Tabs */}
      <div className="h-14 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => onChangeTab('chat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t('chatTab', lang)} ({messages.length})
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('participants')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              activeTab === 'participants'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {t('participantsTab', lang)} ({participants.length})
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel samping"
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {activeTab === 'chat' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center px-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Belum ada pesan. Kirim pesan teks, emoji, atau berkas kecil (maks 512 KB) ke semua peserta.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const mine = msg.senderId === selfId;
                return (
                  <div key={msg.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {mine ? 'Anda' : msg.senderName}
                      </span>
                      <span className="tabular-nums">
                        {new Date(msg.createdAt).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        mine
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {msg.text && <p className="whitespace-pre-wrap break-words">{msg.text}</p>}
                      {msg.fileDataUrl && msg.fileName && (
                        <a
                          href={msg.fileDataUrl}
                          download={msg.fileName}
                          className={`mt-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium ${
                            mine ? 'bg-blue-700 text-white' : 'bg-white dark:bg-slate-900 text-blue-500'
                          }`}
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{msg.fileName}</span>
                        </a>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Emoji Quick Bar & Composer */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setText((prev) => `${prev}${emoji}`)}
                  className="px-2 py-1 rounded-lg text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {emoji}
                </button>
              ))}
            </div>
            {fileError && <p className="text-[11px] text-rose-500">{fileError}</p>}
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Pilih berkas untuk dikirim"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Lampirkan berkas kecil"
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('sendMessagePlaceholder', lang)}
                className="flex-1 px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                aria-label="Kirim pesan"
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 space-y-5">
          {/* Host Security Controls */}
          {canModerate && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 space-y-2.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Kontrol Keamanan Host
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onToggleLock}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    isLocked
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-500'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                  <span>{isLocked ? t('unlockRoom', lang) : t('lockRoom', lang)}</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleWaitingRoom}
                  className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                    waitingRoomEnabled
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-500'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t('waitingRoomToggle', lang)}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={onMuteAll}
                className="w-full py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Bisukan Semua Peserta Lain
              </button>
            </div>
          )}

          {/* Waiting Room Queue */}
          {canModerate && waitingQueue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-amber-500">
                Menunggu Persetujuan ({waitingQueue.length})
              </p>
              <div className="space-y-2">
                {waitingQueue.map((w) => (
                  <div
                    key={w.id}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2"
                  >
                    <span className="text-xs font-medium truncate">{w.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onAdmitWaiting(w.id)}
                        aria-label={`Izinkan ${w.name}`}
                        className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectWaiting(w.id)}
                        aria-label={`Tolak ${w.name}`}
                        className="p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Participant Search */}
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari peserta..."
            className="w-full px-3 py-2 rounded-xl text-xs border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
          />

          {/* Participants List */}
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {filteredParticipants.map((p) => (
              <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ backgroundColor: p.avatarColor }}
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">
                      {p.name} {p.id === selfId ? '(Anda)' : ''}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {p.role === 'host' ? 'Host' : p.role === 'cohost' ? 'Co-Host' : 'Peserta'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {p.isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-500" />}
                  {p.isMuted ? (
                    <MicOff className="w-3.5 h-3.5 text-rose-500" />
                  ) : (
                    <Mic className="w-3.5 h-3.5 text-emerald-500" />
                  )}
                  {p.isCamOff ? (
                    <VideoOff className="w-3.5 h-3.5 text-rose-500" />
                  ) : (
                    <Video className="w-3.5 h-3.5 text-slate-400" />
                  )}

                  {canModerate && p.id !== selfId && (
                    <>
                      <button
                        type="button"
                        onClick={() => onMuteOne(p.id)}
                        aria-label={`Bisukan ${p.name}`}
                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onKickOne(p.id)}
                        aria-label={`Keluarkan ${p.name}`}
                        className="p-1 rounded hover:bg-rose-500/10 text-rose-500"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
