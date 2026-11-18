import { useCallback, useEffect, useState } from 'react';
import type { Language, ThemeMode, UserProfile } from './types/meeting';
import { generateMeetingCode, normalizeMeetingCode } from './utils/meetingLogic';
import { LandingPage } from './components/LandingPage';
import { Dashboard } from './components/Dashboard';
import { PreJoinScreen, type PreJoinConfig } from './components/PreJoinScreen';
import { MeetingRoom } from './components/MeetingRoom';

type AppView = 'landing' | 'dashboard' | 'prejoin' | 'meeting';

function getStableParticipantId(): string {
  const key = 'ketemu_participant_id';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const generated = `pid_${crypto.randomUUID().slice(0, 12)}`;
  sessionStorage.setItem(key, generated);
  return generated;
}

export default function App() {
  const [view, setView] = useState<AppView>('landing');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [lang, setLang] = useState<Language>('id');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeCode, setActiveCode] = useState<string>('');
  const [preJoinConfig, setPreJoinConfig] = useState<PreJoinConfig | null>(null);
  const [exitBanner, setExitBanner] = useState<string | null>(null);
  const [participantId] = useState<string>(() => getStableParticipantId());

  // Sync Tailwind .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Restore saved session if present & support ?room=xxx-yyyy-zzz deep link
  useEffect(() => {
    const token = localStorage.getItem('ketemu_session_token');
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.user) setUser(data.user);
        })
        .catch(() => {});
    }

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const normalized = normalizeMeetingCode(roomParam);
      if (normalized) {
        setActiveCode(normalized);
        setView('prejoin');
      }
    } else if (params.get('autostart') === '1') {
      setView('dashboard');
    }
  }, []);

  const handleUserChange = useCallback((nextUser: UserProfile | null, token: string | null) => {
    setUser(nextUser);
    if (token) {
      localStorage.setItem('ketemu_session_token', token);
    } else {
      localStorage.removeItem('ketemu_session_token');
    }
  }, []);

  const handleStartInstantMeeting = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: user ? `Meeting ${user.name}` : 'Meeting Instan Ketemu',
          hostId: user?.id || participantId,
          hostName: user?.name || 'Host Ketemu',
          waitingRoomEnabled: false,
          instant: true,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        if (data.meeting?.code) {
          setActiveCode(data.meeting.code);
          setExitBanner(null);
          setView('prejoin');
          return;
        }
      }
    } catch {
      // Fallback to client-generated unpredictable meeting code if API is unreachable
    }

    const fallbackCode = generateMeetingCode();
    setActiveCode(fallbackCode);
    setExitBanner(null);
    setView('prejoin');
  }, [participantId, user]);

  const handleJoinMeetingCode = useCallback((code: string) => {
    setActiveCode(code);
    setExitBanner(null);
    setView('prejoin');
  }, []);

  const handleJoinReady = useCallback((cfg: PreJoinConfig) => {
    setPreJoinConfig(cfg);
    setView('meeting');
  }, []);

  const handleExitRoom = useCallback((reason?: string) => {
    setPreJoinConfig(null);
    setView('dashboard');
    if (reason) setExitBanner(reason);
  }, []);

  return (
    <div className="min-h-screen">
      {exitBanner && view === 'dashboard' && (
        <div
          role="status"
          className="px-4 py-2.5 bg-blue-600 text-white text-xs font-medium flex items-center justify-between"
        >
          <span>{exitBanner}</span>
          <button
            type="button"
            onClick={() => setExitBanner(null)}
            className="underline ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {view === 'landing' && (
        <LandingPage
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          lang={lang}
          onToggleLang={() => setLang((prev) => (prev === 'id' ? 'en' : 'id'))}
          onStartInstantMeeting={() => void handleStartInstantMeeting()}
          onJoinMeetingCode={handleJoinMeetingCode}
          onOpenDashboard={() => setView('dashboard')}
        />
      )}

      {view === 'dashboard' && (
        <Dashboard
          user={user}
          participantId={participantId}
          onUserChange={handleUserChange}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          lang={lang}
          onToggleLang={() => setLang((prev) => (prev === 'id' ? 'en' : 'id'))}
          onBackToLanding={() => setView('landing')}
          onStartInstantMeeting={() => void handleStartInstantMeeting()}
          onJoinMeetingCode={handleJoinMeetingCode}
        />
      )}

      {view === 'prejoin' && activeCode && (
        <PreJoinScreen
          code={activeCode}
          initialName={user?.name || ''}
          participantId={user?.id || participantId}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          lang={lang}
          onToggleLang={() => setLang((prev) => (prev === 'id' ? 'en' : 'id'))}
          onBack={() => setView('dashboard')}
          onJoinReady={handleJoinReady}
        />
      )}

      {view === 'meeting' && preJoinConfig && (
        <MeetingRoom
          config={preJoinConfig}
          participantId={user?.id || participantId}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          lang={lang}
          onToggleLang={() => setLang((prev) => (prev === 'id' ? 'en' : 'id'))}
          onExitRoom={handleExitRoom}
        />
      )}
    </div>
  );
}
