import { Globe, Moon, Sun } from 'lucide-react';
import type { Language, ThemeMode } from '../types/meeting';

interface ThemeLangControlsProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  lang: Language;
  onToggleLang: () => void;
}

export function ThemeLangControls({
  theme,
  onToggleTheme,
  lang,
  onToggleLang,
}: ThemeLangControlsProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Ubah ke Mode Terang' : 'Ubah ke Mode Gelap'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        <span>{theme === 'dark' ? 'Terang' : 'Gelap'}</span>
      </button>
      <button
        type="button"
        onClick={onToggleLang}
        aria-label={lang === 'id' ? 'Switch language to English' : 'Ubah bahasa ke Indonesia'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{lang.toUpperCase()}</span>
      </button>
    </div>
  );
}
