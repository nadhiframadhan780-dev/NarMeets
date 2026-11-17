import { useEffect, useState, type FormEvent } from 'react';
import {
  CalendarPlus,
  Check,
  Copy,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Search,
  ServerCog,
  User as UserIcon,
  Video,
  X,
} from 'lucide-react';
import type { Language, MeetingRecord, ThemeMode, UserProfile } from '../types/meeting';
import { t } from '../utils/i18n';
import { formatDuration, normalizeMeetingCode } from '../utils/meetingLogic';
import { ThemeLangControls } from './ThemeLangControls';

interface DashboardProps {
  user: UserProfile | null;
  participantId: string;
  onUserChange: (user: UserProfile | null, token: string | null) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  lang: Language;
  onToggleLang: () => void;
  onBackToLanding: () => void;
  onStartInstantMeeting: () => void;
  onJoinMeetingCode: (code: string) => void;
}

type DashboardTab = 'workspace' | 'history' | 'setup';

export function Dashboard({
  user,
  participantId,
  onUserChange,
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  onBackToLanding,
  onStartInstantMeeting,
  onJoinMeetingCode,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('workspace');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Schedule form modal state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDate, setSchedDate] = useState(() => {
    const d = new Date(Date.now() + 3600_000 * 3);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [schedPassword, setSchedPassword] = useState('');
  const [schedWaitingRoom, setSchedWaitingRoom] = useState(true);
  const [schedError, setSchedError] = useState<string | null>(null);
  const [schedSaving, setSchedSaving] = useState(false);

  // Auth modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'guest'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const loadMeetings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meetings');
      if (res.ok) {
        const data = (await res.json()) as { meetings: MeetingRecord[] };
        setMeetings(data.meetings);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMeetings();
  }, []);

  const handleQuickJoin = (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeMeetingCode(joinCodeInput);
    if (!code) {
      setJoinError(t('invalidCodeError', lang));
      return;
    }
    setJoinError(null);
    onJoinMeetingCode(code);
  };

  const handleCopyInvite = async (code: string) => {
    const url = `${window.location.origin}/?room=${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    }
  };

  const handleScheduleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSchedError(null);
    if (schedTitle.trim().length < 2) {
      setSchedError('Judul meeting minimal 2 karakter.');
      return;
    }
    if (schedPassword.length > 0 && schedPassword.length < 4) {
      setSchedError('Kata sandi opsional minimal 4 karakter.');
      return;
    }
    setSchedSaving(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: schedTitle.trim(),
          hostId: user?.id || participantId,
          hostName: user?.name || 'Host Ketemu',
          scheduledAt: schedDate ? new Date(schedDate).toISOString() : null,
          password: schedPassword || null,
          waitingRoomEnabled: schedWaitingRoom,
          instant: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSchedError(data.error || 'Gagal menjadwalkan meeting.');
        return;
      }
      setSchedTitle('');
      setSchedPassword('');
      setScheduleOpen(false);
      await loadMeetings();
    } catch {
      setSchedError('Terjadi kesalahan jaringan.');
    } finally {
      setSchedSaving(false);
    }
  };

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      let endpoint = '/api/auth/login';
      let body: Record<string, string> = { email: authEmail, password: authPassword };
      if (authMode === 'register') {
        endpoint = '/api/auth/register';
        body = { name: authName, email: authEmail, password: authPassword };
      } else if (authMode === 'guest') {
        endpoint = '/api/auth/guest';
        body = { name: authName };
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Autentikasi gagal.');
        return;
      }
      onUserChange(data.user, data.sessionToken);
      setAuthModalOpen(false);
    } catch {
      setAuthError('Gagal menghubungi server autentikasi.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthSubmitting(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Nadhif Ramadhan',
          email: 'nadhiframadhan780@gmail.com',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Gagal masuk dengan Google.');
        return;
      }
      onUserChange(data.user, data.sessionToken);
      setAuthModalOpen(false);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const upcomingMeetings = meetings.filter(
    (m) =>
      m.status !== 'ended' &&
      (m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const endedMeetings = meetings.filter(
    (m) =>
      m.status === 'ended' &&
      (m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const navItems: Array<{ id: DashboardTab; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'workspace', label: 'Jadwal & Mulai', icon: LayoutDashboard },
    { id: 'history', label: t('meetingHistory', lang), icon: History },
    { id: 'setup', label: t('setupGuideTab', lang), icon: ServerCog },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between p-5">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToLanding}
            className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white hover:opacity-80 transition-opacity"
          >
            {t('brand', lang)}
          </button>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Tutup menu"
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav aria-label="Menu Dashboard" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        {user ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: user.avatarColor }}
              >
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{user.name}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {user.email || (user.authProvider === 'guest' ? 'Akun Tamu' : 'Aktif')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onUserChange(null, null)}
              aria-label="Keluar akun"
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            <span>Masuk / Akun Tamu</span>
          </button>
        )}

        <ThemeLangControls
          theme={theme}
          onToggleTheme={onToggleTheme}
          lang={lang}
          onToggleLang={onToggleLang}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[260px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D1320]">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileNavOpen(false)} />
          <aside className="relative w-72 max-w-[80vw] bg-white dark:bg-[#0D1320] border-r border-slate-200 dark:border-slate-800 z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 sm:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0D1320]/80 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <nav aria-label="Breadcrumb" className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <span>{t('dashboardTitle', lang)}</span>
              <span className="mx-2">/</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {navItems.find((n) => n.id === activeTab)?.label}
              </span>
            </nav>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setScheduleOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <CalendarPlus className="w-4 h-4" />
              <span>{t('scheduleMeetingBtn', lang)}</span>
            </button>
            <button
              type="button"
              onClick={onStartInstantMeeting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition-all whitespace-nowrap shrink-0"
            >
              <Video className="w-4 h-4" />
              <span>{t('instantMeetingCta', lang)}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-8">
          {/* Quick Join + Search Strip */}
          {activeTab !== 'setup' && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <form onSubmit={handleQuickJoin} noValidate className="lg:col-span-7">
                <label htmlFor="dash-join-input" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Gabung cepat lewat kode atau tautan meeting
                </label>
                <div className="flex gap-2">
                  <input
                    id="dash-join-input"
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => {
                      setJoinCodeInput(e.target.value);
                      if (joinError) setJoinError(null);
                    }}
                    placeholder={t('joinCodePlaceholder', lang)}
                    className="flex-1 px-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    {t('joinBtn', lang)}
                  </button>
                </div>
                {joinError && (
                  <p role="alert" className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
                    {joinError}
                  </p>
                )}
              </form>

              <div className="lg:col-span-5">
                <label htmlFor="dash-search" className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Cari judul atau kode ruang
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="dash-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter jadwal atau riwayat..."
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl text-sm border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </section>
          )}

          {activeTab === 'workspace' && (
            <div className="space-y-8">
              {/* Summary Metrics Row */}
              <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-slate-200 dark:border-slate-800 py-5">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Meeting Terjadwal / Aktif</p>
                  <p className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {upcomingMeetings.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Riwayat Selesai</p>
                  <p className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-1">
                    {endedMeetings.length}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Region Server Aktif</p>
                  <p className="font-display text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    Singapore (sin1)
                  </p>
                </div>
              </section>

              {/* Upcoming Meetings List */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                    {t('upcomingMeetings', lang)}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setScheduleOpen(true)}
                    className="sm:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400"
                  >
                    <CalendarPlus className="w-4 h-4" />
                    <span>Jadwalkan</span>
                  </button>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[1, 2].map((n) => (
                      <div
                        key={n}
                        className="h-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900/50 animate-pulse"
                      />
                    ))}
                  </div>
                ) : upcomingMeetings.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-center space-y-3">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Belum ada meeting terjadwal yang cocok dengan pencarian Anda.
                    </p>
                    <button
                      type="button"
                      onClick={() => setScheduleOpen(true)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
                    >
                      Jadwalkan Meeting Pertama
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
                    {upcomingMeetings.map((mtg) => (
                      <div
                        key={mtg.id}
                        className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white truncate">
                            {mtg.title}
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                            <span className="font-mono text-slate-700 dark:text-slate-300">{mtg.code}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {mtg.scheduledAt
                                ? new Date(mtg.scheduledAt).toLocaleString('id-ID', {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  })
                                : 'Instan'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>Host: {mtg.hostName}</span>
                            {mtg.waitingRoomEnabled && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Ruang Tunggu Aktif</span>
                              </>
                            )}
                            {mtg.hasPassword && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Berbasis Kata Sandi</span>
                              </>
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyInvite(mtg.code)}
                            aria-label={`Salin tautan ${mtg.title}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                          >
                            {copiedCode === mtg.code ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                <span>Tersalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Salin Tautan</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onJoinMeetingCode(mtg.code)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors whitespace-nowrap"
                          >
                            Masuk Ruang
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'history' && (
            <section className="space-y-4">
              <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {t('meetingHistory', lang)}
              </h2>
              {endedMeetings.length === 0 ? (
                <div className="p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-center text-sm text-slate-500 dark:text-slate-400">
                  Belum ada riwayat meeting yang selesai.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="py-3 px-5 font-medium">Topik Meeting</th>
                        <th className="py-3 px-4 font-medium">Kode</th>
                        <th className="py-3 px-4 font-medium text-right">Puncak Peserta</th>
                        <th className="py-3 px-4 font-medium text-right">Durasi</th>
                        <th className="py-3 px-5 font-medium text-right">Selesai Pada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {endedMeetings.map((mtg) => (
                        <tr key={mtg.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="py-3.5 px-5 font-medium text-slate-900 dark:text-white">{mtg.title}</td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                            {mtg.code}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                            {mtg.participantPeak}
                          </td>
                          <td className="py-3.5 px-4 text-right tabular-nums font-mono text-xs text-slate-700 dark:text-slate-300">
                            {formatDuration(mtg.durationSec)}
                          </td>
                          <td className="py-3.5 px-5 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">
                            {mtg.endedAt
                              ? new Date(mtg.endedAt).toLocaleDateString('id-ID', { dateStyle: 'medium' })
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'setup' && (
            <section className="space-y-6">
              <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-4">
                <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                  Panduan LiveKit SFU Singapore & Optimasi Biaya Server
                </h2>
                <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <li>
                    Daftar di <span className="font-mono text-blue-500">cloud.livekit.io</span> lalu buat proyek baru dan pilih region terdekat <span className="font-semibold">Singapore (ap-southeast-1 / sin1)</span>.
                  </li>
                  <li>
                    Salin <span className="font-mono">LIVEKIT_URL</span>, <span className="font-mono">LIVEKIT_API_KEY</span>, dan <span className="font-mono">LIVEKIT_API_SECRET</span> ke berkas <span className="font-mono">.env</span>.
                  </li>
                  <li>
                    Token LiveKit ditandatangani oleh endpoint <span className="font-mono">POST /api/livekit/token</span> berdurasi pendek (2 jam) dengan otorisasi peran Host/Peserta.
                  </li>
                  <li>
                    Jika variabel LiveKit belum diisi saat uji coba lokal, Ketemu otomatis menggunakan mesin WebSocket & WebRTC signaling internal agar seluruh alur ruangan tetap berjalan penuh.
                  </li>
                </ol>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Fitur Siap Pakai Saat Ini
                  </h3>
                  <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <li>· SFU LiveKit Config (Simulcast, Dynacast, Adaptive Stream, Opus DTX/RED)</li>
                    <li>· Halaman Pra-Gabung: kamera, meter mikrofon real-time, tes speaker, latar virtual</li>
                    <li>· Ruang Meeting: Grid/Speaker view, Pin peserta, Share Screen + Audio, PiP & Fullscreen</li>
                    <li>· Kontrol Host: Mute peserta, Matikan kamera, Kick, Kunci ruangan, Ruang tunggu, Co-Host & Transfer Host</li>
                    <li>· Obrolan real-time + lampiran file, Reaksi emoji, Angkat tangan, Teks langsung, Rekam WebM</li>
                  </ul>
                </div>

                <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] space-y-3">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-white">
                    Pengembangan Lanjutan & Hemat Biaya
                  </h3>
                  <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
                    <li>· LiveKit Egress untuk rekaman server-side langsung ke S3 / GCS</li>
                    <li>· Migrasi SQLite ke PostgreSQL terkelola saat multi-instance</li>
                    <li>· Aktifkan <span className="font-mono">dynacast</span> & batas resolusi default 720p untuk memangkas bandwidth SFU hingga 55%</li>
                    <li>· Gunakan <span className="font-mono">stopLocalTrackOnUnpublish: true</span> agar kamera tidak menyedot uplink saat dimatikan</li>
                  </ul>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Schedule Meeting Modal */}
      {scheduleOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="sched-modal-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 id="sched-modal-title" className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                {t('scheduleMeetingBtn', lang)}
              </h2>
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                aria-label="Tutup dialog jadwal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} noValidate className="space-y-4">
              <div>
                <label htmlFor="sched-title" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Judul Meeting
                </label>
                <input
                  id="sched-title"
                  type="text"
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  placeholder="Mis. Sinkronisasi Mingguan Tim"
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="sched-date" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Tanggal & Jam
                </label>
                <input
                  id="sched-date"
                  type="datetime-local"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="sched-pass" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Kata Sandi Ruangan (Opsional)
                </label>
                <input
                  id="sched-pass"
                  type="password"
                  value={schedPassword}
                  onChange={(e) => setSchedPassword(e.target.value)}
                  placeholder="Kosongkan jika tanpa kata sandi"
                  className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={schedWaitingRoom}
                  onChange={(e) => setSchedWaitingRoom(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                />
                <span>Aktifkan Ruang Tunggu (peserta perlu izin host)</span>
              </label>

              {schedError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {schedError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={schedSaving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
                >
                  {schedSaving ? 'Menyimpan...' : 'Simpan Jadwal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {authModalOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="auth-modal-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 id="auth-modal-title" className="font-display text-lg font-semibold text-slate-900 dark:text-white">
                Masuk ke Ketemu
              </h2>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                aria-label="Tutup dialog masuk"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
              {(['login', 'register', 'guest'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setAuthMode(m);
                    setAuthError(null);
                  }}
                  className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    authMode === m
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {m === 'login' ? 'Email' : m === 'register' ? 'Daftar' : 'Tamu'}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuthSubmit} noValidate className="space-y-3.5">
              {authMode !== 'login' && (
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Mis. Budi Santoso"
                    className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              )}

              {authMode !== 'guest' && (
                <>
                  <div>
                    <label htmlFor="auth-email" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Alamat Email
                    </label>
                    <input
                      id="auth-email"
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="nama@perusahaan.id"
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="auth-pass" className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Kata Sandi
                    </label>
                    <input
                      id="auth-pass"
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Minimal 6 karakter"
                      className="w-full px-3.5 py-2 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </>
              )}

              {authError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={authSubmitting}
                className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-60"
              >
                {authSubmitting
                  ? 'Memproses...'
                  : authMode === 'login'
                    ? 'Masuk dengan Email'
                    : authMode === 'register'
                      ? 'Buat Akun Baru'
                      : 'Lanjut sebagai Tamu'}
              </button>
            </form>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <UserIcon className="w-4 h-4" />
                <span>Lanjutkan dengan Akun Google</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
