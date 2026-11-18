import { useState } from 'react';
import { Globe, Menu, X } from 'lucide-react';
import type { Language } from '../types/rcl';
import { TRANSLATIONS } from '../lib/i18n';
import { DEFAULT_OFFICIAL_LOGO } from '../lib/validation';

export type AppRoute = '/' | '/register' | '/track' | '/players' | '/admin';

interface NavbarProps {
  lang: Language;
  currentRoute: AppRoute;
  onToggleLang: () => void;
  logoUrl: string | null;
  onNavigate: (route: AppRoute, hashSection?: string) => void;
}

export function Navbar({ lang, currentRoute, onToggleLang, logoUrl, onNavigate }: NavbarProps) {
  const t = TRANSLATIONS[lang];
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLink = (route: AppRoute, hash?: string) => {
    setMobileOpen(false);
    onNavigate(route, hash);
  };

  return (
    <header className="no-print sticky top-0 z-40 border-b border-[#3B1278]/15 bg-white shadow-xs">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:gap-8">
        {/* Zone 1: Official RCL Logo + Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLink('/')}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3B1278]"
        >
          <img
            src={logoUrl || DEFAULT_OFFICIAL_LOGO}
            alt="RCL 2027 Official Logo"
            className="h-9 w-auto object-contain"
            referrerPolicy="no-referrer"
          />
          <span className="font-display text-lg font-extrabold tracking-tight text-[#240B4C]">
            {t.brandShort}
          </span>
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#3D2E5C]">
          <button
            type="button"
            onClick={() => handleLink('/track')}
            className={`whitespace-nowrap shrink-0 py-1 hover:text-[#240B4C] hover:underline underline-offset-4 decoration-[#D49B00] decoration-2 transition-colors cursor-pointer ${
              currentRoute === '/track' ? 'font-bold text-[#240B4C] underline' : ''
            }`}
          >
            {t.nav.status}
          </button>
          <button
            type="button"
            onClick={() => handleLink('/players')}
            className={`whitespace-nowrap shrink-0 py-1 hover:text-[#240B4C] hover:underline underline-offset-4 decoration-[#D49B00] decoration-2 transition-colors cursor-pointer ${
              currentRoute === '/players' ? 'font-bold text-[#240B4C] underline' : ''
            }`}
          >
            {t.nav.players}
          </button>
          <button
            type="button"
            onClick={() => handleLink('/', '#champions')}
            className="whitespace-nowrap shrink-0 py-1 hover:text-[#240B4C] hover:underline underline-offset-4 decoration-[#D49B00] decoration-2 transition-colors cursor-pointer"
          >
            {t.nav.champions}
          </button>
          <button
            type="button"
            onClick={() => handleLink('/', '#contact')}
            className="whitespace-nowrap shrink-0 py-1 hover:text-[#240B4C] hover:underline underline-offset-4 decoration-[#D49B00] decoration-2 transition-colors cursor-pointer"
          >
            {t.nav.contact}
          </button>
          <button
            type="button"
            onClick={() => handleLink('/admin')}
            className="whitespace-nowrap shrink-0 py-1 text-[#6B5A8E] hover:text-[#240B4C] transition-colors cursor-pointer"
          >
            {t.nav.admin}
          </button>
        </nav>

        {/* Zone 3: Language Switch & Primary Register Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleLang}
            aria-label={lang === 'en' ? 'Switch to Bangla' : 'Switch to English'}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#3B1278]/20 bg-[#F9F8FC] px-3 py-1.5 text-xs font-semibold text-[#240B4C] hover:bg-[#EFEAF8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="h-3.5 w-3.5 text-[#3B1278]" aria-hidden="true" />
            <span>{lang === 'en' ? 'বাংলা' : 'English'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleLink('/register')}
            className={`hidden sm:inline-flex min-h-[40px] items-center justify-center rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              currentRoute === '/register'
                ? 'bg-[#D49B00] text-[#180D2B]'
                : 'bg-[#3B1278] text-white hover:bg-[#240B4C]'
            }`}
          >
            {t.nav.registerCta}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? t.nav.closeMenu : t.nav.menu}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#3B1278]/20 text-[#240B4C] lg:hidden cursor-pointer"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="border-t border-[#3B1278]/10 bg-white px-4 py-4 lg:hidden">
          <nav aria-label="Mobile navigation" className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleLink('/')}
              className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-medium text-[#240B4C] hover:bg-[#F4EFFB] cursor-pointer"
            >
              {t.nav.home}
            </button>
            <button
              type="button"
              onClick={() => handleLink('/register')}
              className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-semibold text-[#3B1278] hover:bg-[#F4EFFB] cursor-pointer"
            >
              {t.nav.register}
            </button>
            <button
              type="button"
              onClick={() => handleLink('/track')}
              className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-semibold text-[#3B1278] hover:bg-[#F4EFFB] cursor-pointer"
            >
              {t.nav.status}
            </button>
            <button
              type="button"
              onClick={() => handleLink('/players')}
              className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-semibold text-[#3B1278] hover:bg-[#F4EFFB] cursor-pointer"
            >
              {t.nav.players}
            </button>
            {[
              { hash: '#champions', label: t.nav.champions },
              { hash: '#fixtures', label: t.nav.fixtures },
              { hash: '#gallery', label: t.nav.gallery },
              { hash: '#sponsors', label: t.nav.sponsors },
              { hash: '#rules', label: t.nav.rules },
              { hash: '#contact', label: t.nav.contact },
            ].map((item) => (
              <button
                key={item.hash}
                type="button"
                onClick={() => handleLink('/', item.hash)}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-medium text-[#240B4C] hover:bg-[#F4EFFB] cursor-pointer"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleLink('/admin')}
              className="flex min-h-[44px] items-center rounded-lg px-3 text-left text-sm font-semibold text-[#3B1278] hover:bg-[#F4EFFB] cursor-pointer"
            >
              {t.nav.admin}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
