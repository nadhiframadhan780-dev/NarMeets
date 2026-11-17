import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ChevronDown, Video } from 'lucide-react';
import type { Language, ThemeMode } from '../types/meeting';
import { t } from '../utils/i18n';
import { normalizeMeetingCode } from '../utils/meetingLogic';
import { ThemeLangControls } from './ThemeLangControls';

interface LandingPageProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  lang: Language;
  onToggleLang: () => void;
  onStartInstantMeeting: () => void;
  onJoinMeetingCode: (code: string) => void;
  onOpenDashboard: () => void;
}

const FAQ_ITEMS = [
  {
    id: 'faq-1',
    qId: 'Mengapa Ketemu menggunakan arsitektur SFU dibandingkan P2P biasa?',
    qEn: 'Why does Ketemu use SFU architecture instead of plain P2P?',
    aId: 'Pada P2P murni, setiap peserta harus mengunggah aliran video terpisah ke setiap peserta lain sehingga CPU dan bandwidth cepat habis saat peserta lebih dari 3 orang. Dengan Selective Forwarding Unit (SFU) di region Singapore, perangkat Anda cukup mengunggah satu aliran simulcast dan server meneruskannya secara adaptif.',
    aEn: 'In mesh P2P, every participant uploads separate streams to every peer, exhausting CPU and bandwidth beyond 3 users. With a Singapore SFU, your device publishes once with simulcast layers and the server routes streams adaptively.',
  },
  {
    id: 'faq-2',
    qId: 'Bagaimana Ketemu menjaga suara tetap jernih saat koneksi seluler melambat?',
    qEn: 'How does Ketemu keep audio clear when mobile networks slow down?',
    aId: 'Ketemu memprioritaskan paket audio menggunakan codec Opus dengan DTX (Discontinuous Transmission) dan RED (Redundant Encoding), serta menonaktifkan lapisan video resolusi tinggi secara otomatis lewat dynacast saat bandwidth turun.',
    aEn: 'Ketemu prioritizes audio packets via Opus DTX and RED redundancy, automatically stepping down higher video simulcast layers via dynacast when available bandwidth drops.',
  },
  {
    id: 'faq-3',
    qId: 'Apakah peserta bisa bergabung tanpa membuat akun?',
    qEn: 'Can participants join without creating an account?',
    aId: 'Ya. Host dapat membagikan kode atau tautan acak, dan tamu cukup memasukkan nama tampilan di halaman pra-gabung. Host juga dapat mengaktifkan Ruang Tunggu atau kata sandi ruangan untuk keamanan tambahan.',
    aEn: 'Yes. Hosts share a randomized code or link, and guests only enter a display name on the pre-join screen. Hosts can also enable a Waiting Room or room password.',
  },
  {
    id: 'faq-4',
    qId: 'Apakah saya perlu kunci API LiveKit untuk menjalankan aplikasi ini secara lokal?',
    qEn: 'Do I need LiveKit API keys to run this app locally?',
    aId: 'Tidak wajib saat pengembangan. Jika variabel LIVEKIT_URL dan LIVEKIT_API_KEY diisi di .env, Ketemu otomatis menggunakan LiveKit Cloud SFU. Jika belum diisi, server WebSocket & WebRTC bawaan Ketemu tetap aktif penuh untuk uji coba langsung.',
    aEn: 'Not required for local evaluation. When LIVEKIT_URL and LIVEKIT_API_KEY are set in .env, Ketemu connects to LiveKit Cloud SFU. Otherwise, the built-in WebSocket and WebRTC signaling engine handles rooms immediately.',
  },
];

export function LandingPage({
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
  onStartInstantMeeting,
  onJoinMeetingCode,
  onOpenDashboard,
}: LandingPageProps) {
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>('faq-1');
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const handleJoinSubmit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeMeetingCode(joinInput);
    if (!normalized) {
      setJoinError(t('invalidCodeError', lang));
      return;
    }
    setJoinError(null);
    onJoinMeetingCode(normalized);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 transition-colors">
      {/* Strict 3-Zone Top Navigation Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-[#090D16]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0"
          >
            {t('brand', lang)}
          </a>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav
            aria-label="Navigasi utama"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <a
              href="#fitur"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t('navFeatures', lang)}
            </a>
            <a
              href="#cara-kerja"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t('navHowItWorks', lang)}
            </a>
            <a
              href="#arsitektur"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t('navArchitecture', lang)}
            </a>
            <a
              href="#faq"
              className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              {t('navFaq', lang)}
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={onStartInstantMeeting}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 transition-all shadow-sm whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              {t('startMeeting', lang)}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 flex flex-col justify-between gap-8"
            >
              <div className="space-y-5">
                <p className="text-xs font-medium tracking-wide text-blue-600 dark:text-blue-400">
                  Singapore SFU · WebRTC Simulcast · Enkripsi Ruang
                </p>
                <h1 className="font-display text-[clamp(2.25rem,4vw,3.75rem)] font-bold leading-[1.08] tracking-tight text-slate-900 dark:text-white text-balance">
                  {t('heroTitle', lang)}
                </h1>
                <p className="text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-300 max-w-xl">
                  {t('heroSubtitle', lang)}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onStartInstantMeeting}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-sm transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <Video className="w-4 h-4" />
                    <span>{t('instantMeetingCta', lang)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onOpenDashboard}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <span>{t('openDashboard', lang)}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleJoinSubmit} noValidate className="max-w-lg">
                  <label htmlFor="landing-join-code" className="sr-only">
                    {t('joinCodePlaceholder', lang)}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id="landing-join-code"
                      type="text"
                      value={joinInput}
                      onChange={(e) => {
                        setJoinInput(e.target.value);
                        if (joinError) setJoinError(null);
                      }}
                      placeholder={t('joinCodePlaceholder', lang)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/90 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 border border-slate-800 dark:border-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      {t('joinBtn', lang)}
                    </button>
                  </div>
                  {joinError && (
                    <p role="alert" className="mt-2 text-xs text-rose-600 dark:text-rose-400">
                      {joinError}
                    </p>
                  )}
                </form>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800/80">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Contoh ruang siap uji: <span className="font-mono text-slate-700 dark:text-slate-200">ktm-4821-x9q</span>
                  </p>
                  <ThemeLangControls
                    theme={theme}
                    onToggleTheme={onToggleTheme}
                    lang={lang}
                    onToggleLang={onToggleLang}
                  />
                </div>
              </div>
            </motion.div>

            {/* Right 16:9 Architectural Studio Visual */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6"
            >
              <div className="relative h-full min-h-[280px] lg:min-h-[420px] rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900">
                {!heroImgFailed ? (
                  <img
                    src="/src/assets/images/hero_ketemu_workspace_1794925231504.jpg"
                    alt="Ruang kerja kolaborasi video Ketemu di Jakarta pada senja hari"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-slate-200">
                    <Video className="w-10 h-10 text-blue-400 mb-3" />
                    <p className="text-sm font-medium">Ruang Kolaborasi Ketemu</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent pointer-events-none" />
                <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                  <p className="text-xs text-slate-300 mb-1">
                    Rute Media · Asia Tenggara (sin1) · Prioritas Audio Opus
                  </p>
                  <p className="font-display text-lg font-semibold leading-snug">
                    Komunikasi tim lintas kota tanpa suara terputus, bahkan saat sinyal 4G tidak stabil.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 4-column Architectural Proof Strip */}
          <div
            id="arsitektur"
            className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-b border-slate-200 dark:border-slate-800 py-6"
          >
            <div>
              <p className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                &lt; 45 ms
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Target RTT Jakarta ke node SFU Singapore
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                3 Lapisan
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Simulcast video 180p / 360p / 720p otomatis
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                Opus + RED
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Prioritas paket audio di atas bitrate video
              </p>
            </div>
            <div>
              <p className="font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                60 fps
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Grid responsif terisolasi dari re-render chat
              </p>
            </div>
          </div>
        </section>

        {/* Asymmetric Capabilities Bento Section */}
        <section id="fitur" className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-200/80 dark:border-slate-800/80">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              Dirancang khusus untuk rapat yang responsif dan aman
            </h2>
            <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400">
              Setiap lapisan media dan UI dioptimalkan agar perangkat tetap ringan dan peserta tidak perlu memuat ulang halaman.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="md:col-span-2 p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-3">01. Arsitektur Anti-Delay</p>
              <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Simulcast, Dynacast, dan Adaptive Stream
              </h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
                Kamera mengirimkan tiga lapisan resolusi secara paralel. Ketika jaringan salah satu peserta melemah atau ubin video mengecil di grid, SFU hanya meneruskan aliran paling efisien sambil mempertahankan echo cancellation, noise suppression, dan auto gain control perangkat keras.
              </p>
            </article>

            <article className="p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-3">02. Kontrol Host</p>
              <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Ruang Tunggu & Moderasi
              </h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Setujui peserta dari ruang tunggu, kunci ruangan dengan 1 klik, bisukan peserta lain, tunjuk co-host, atau pindahkan hak host secara real-time.
              </p>
            </article>

            <article className="p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-3">03. Kolaborasi Lengkap</p>
              <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Berbagi Layar, Rekam & Teks Langsung
              </h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Bagikan jendela atau tab beserta audio sistem, kirim berkas kecil di obrolan, rekam rapat langsung ke berkas lokal, atau aktifkan takarir Web Speech API.
              </p>
            </article>

            <article className="md:col-span-2 p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
              <p className="text-xs font-mono text-blue-600 dark:text-blue-400 mb-3">04. Keamanan & Validasi</p>
              <h3 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
                Kode Acak 10 Karakter, Token Singkat & Rate Limiting
              </h3>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
                Setiap tautan memakai generator kriptografis tanpa karakter ambigu, dilindungi kata sandi opsional berbasis scrypt, token LiveKit berdurasi pendek, dan pembatasan laju permintaan di seluruh endpoint API.
              </p>
            </article>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="cara-kerja" className="max-w-7xl mx-auto px-6 py-16 border-t border-slate-200/80 dark:border-slate-800/80">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Mulai rapat dalam tiga langkah cepat
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="pt-4 border-t border-slate-300 dark:border-slate-700">
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400 mb-2">Langkah 01</p>
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Buat atau Jadwalkan Ruang
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Klik Buat Meeting Instan atau atur jadwal di Dashboard lengkap dengan kata sandi opsional dan ruang tunggu.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-300 dark:border-slate-700">
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400 mb-2">Langkah 02</p>
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Uji Perangkat di Pra-Gabung
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Periksa pratinjau kamera, meteran mikrofon real-time, uji nada speaker, dan pilih latar virtual sebelum masuk.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-300 dark:border-slate-700">
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400 mb-2">Langkah 03</p>
              <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Rapat Stabil dengan Auto-Reconnect
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Jika jaringan terputus sementara, Ketemu menyambung ulang secara otomatis tanpa menyegarkan halaman atau memutus obrolan.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="max-w-4xl mx-auto px-6 py-16 border-t border-slate-200/80 dark:border-slate-800/80">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-8">
            Pertanyaan yang Sering Diajukan
          </h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
            {FAQ_ITEMS.map((item) => {
              const isOpen = openFaq === item.id;
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : item.id)}
                    className="w-full py-5 flex items-center justify-between gap-4 text-left focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <span className="font-display text-base font-semibold text-slate-900 dark:text-white">
                      {lang === 'id' ? item.qId : item.qEn}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="pb-5 pr-8 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {lang === 'id' ? item.aId : item.aEn}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span className="font-display font-bold text-sm text-slate-900 dark:text-white">Ketemu</span>
            <span>·</span>
            <span>Infrastruktur WebRTC SFU Region Singapore (sin1)</span>
          </div>
          <div className="flex items-center gap-6">
            <button type="button" onClick={onOpenDashboard} className="hover:text-slate-900 dark:hover:text-white">
              Dashboard & Setup API
            </button>
            <button type="button" onClick={onStartInstantMeeting} className="hover:text-slate-900 dark:hover:text-white">
              Mulai Meeting Instan
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
