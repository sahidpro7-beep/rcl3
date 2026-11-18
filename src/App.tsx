import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, Clock, Shield, Users } from 'lucide-react';
import { Navbar, type AppRoute } from './components/Navbar';
import { RegistrationSection } from './components/RegistrationSection';
import { StatusCheckSection } from './components/StatusCheckSection';
import { PlayerListPage } from './components/PlayerListPage';
import { PublicDirectoryAndSections } from './components/PublicDirectoryAndSections';
import { AdminPanel } from './components/AdminPanel';
import { getInitialPublicData } from './lib/defaultPublicData';
import { TRANSLATIONS, getSavedLanguage, saveLanguage } from './lib/i18n';
import { callEdgeFunction, isSupabaseConfigured } from './lib/supabase';
import {
  DEFAULT_HERO_IMAGE,
  DEFAULT_OFFICIAL_LOGO,
  formatIstDateTime,
  resolveAppRoute,
} from './lib/validation';
import type { Language, PublicBootstrapData } from './types/rcl';

export { resolveAppRoute };

export default function App() {
  const [lang, setLang] = useState<Language>(() => getSavedLanguage());
  const [route, setRoute] = useState<AppRoute>(() =>
    resolveAppRoute(window.location.pathname, window.location.hash),
  );
  const [publicData, setPublicData] = useState<PublicBootstrapData>(() => getInitialPublicData());
  const [loadingPublic, setLoadingPublic] = useState<boolean>(isSupabaseConfigured);
  const [loadError, setLoadError] = useState<string | null>(null);

  const t = TRANSLATIONS[lang];

  const handleToggleLang = () => {
    const next: Language = lang === 'en' ? 'bn' : 'en';
    setLang(next);
    saveLanguage(next);
    document.documentElement.lang = next === 'bn' ? 'bn' : 'en';
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
  }, [lang]);

  useEffect(() => {
    const onPop = () => {
      setRoute(resolveAppRoute(window.location.pathname, window.location.hash));
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const fetchPublicData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadingPublic(false);
      return;
    }
    setLoadingPublic(true);
    setLoadError(null);
    try {
      const data = await callEdgeFunction<PublicBootstrapData>('public-data', { method: 'GET' });
      setPublicData(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load tournament data.');
    } finally {
      setLoadingPublic(false);
    }
  }, []);

  useEffect(() => {
    void fetchPublicData();
  }, [fetchPublicData]);

  const navigate = useCallback((nextRoute: AppRoute, hashSection?: string) => {
    const targetUrl = hashSection && nextRoute === '/' ? `/${hashSection}` : nextRoute;
    window.history.pushState({}, '', targetUrl);
    setRoute(nextRoute);

    if (hashSection && nextRoute === '/') {
      window.requestAnimationFrame(() => {
        const el = document.querySelector(hashSection);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, []);

  if (route === '/admin') {
    return (
      <AdminPanel
        lang={lang}
        onToggleLang={handleToggleLang}
        onBackToPublic={() => navigate('/')}
        onDataUpdated={() => void fetchPublicData()}
      />
    );
  }

  const { settings, pastChampions, notices, videos, sponsors, approvedPlayers } = publicData;
  const heroBg = settings.hero_image_url || DEFAULT_HERO_IMAGE;
  const officialLogo = settings.logo_url || DEFAULT_OFFICIAL_LOGO;

  return (
    <div id="top" className="min-h-screen bg-[#F9F8FC] text-[#180D2B] flex flex-col">
      <Navbar
        lang={lang}
        currentRoute={route}
        onToggleLang={handleToggleLang}
        logoUrl={officialLogo}
        onNavigate={navigate}
      />

      {/* Honest Setup-Required Notice if Supabase Env Vars are missing */}
      {!isSupabaseConfigured && (
        <div className="no-print border-b border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
          <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-3 text-xs sm:text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <strong className="font-semibold">{t.setupBanner.title}:</strong>{' '}
              <span>{t.setupBanner.body}</span>
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="no-print border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-900 sm:text-sm">
          <div className="mx-auto max-w-7xl">{loadError}</div>
        </div>
      )}

      <main className="flex-1">
        {route === '/register' && (
          <RegistrationSection
            lang={lang}
            settings={settings}
            onBackHome={() => navigate('/')}
          />
        )}

        {route === '/track' && (
          <StatusCheckSection
            lang={lang}
            settings={settings}
            onBackHome={() => navigate('/')}
          />
        )}

        {route === '/players' && (
          <PlayerListPage
            lang={lang}
            approvedPlayers={approvedPlayers}
            loading={loadingPublic}
            onBackHome={() => navigate('/')}
          />
        )}

        {route === '/' && (
          <>
            {/* 1. Hero & Entry Points to /register, /track, and /players */}
            <section className="relative overflow-hidden bg-[#160A2B] text-white">
              {/* Decorative stadium background kept behind foreground content without blurring text */}
              <img
                src={heroBg}
                alt="RCL 2027 Cricket Stadium under floodlights"
                className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover opacity-30"
                referrerPolicy="no-referrer"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-r from-[#140926] via-[#1C0B38]/95 to-[#160A2B]/90"
              />

              <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
                <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-10">
                  <div className="lg:col-span-8">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#FACC15] sm:text-sm">
                      {t.hero.kicker}
                    </p>

                    <h1 className="mt-3 max-w-2xl font-display text-4xl font-extrabold tracking-tight text-white [text-wrap:balance] sm:text-5xl lg:text-6xl">
                      {lang === 'bn' ? t.hero.title : settings.tournament_name}
                    </h1>

                    {/* Prominent Organiser Credit directly beneath the main title */}
                    <p className="mt-2.5 text-base font-bold tracking-wide text-[#FACC15] sm:text-xl">
                      {t.hero.organizedBy}
                    </p>

                    <p className="mt-3 font-display text-lg font-bold tracking-wide text-white sm:text-2xl">
                      {lang === 'bn' ? settings.tagline_bn : settings.tagline_en}
                    </p>

                    {/* Authoritative Registration Window Strip */}
                    <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-white sm:text-sm">
                      <span className="inline-flex items-center gap-2 font-semibold text-white">
                        {settings.is_registration_open ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Clock className="h-4 w-4 text-[#FACC15]" aria-hidden="true" />
                        )}
                        <span>{settings.is_registration_open ? t.hero.windowOpen : t.hero.windowClosed}</span>
                      </span>
                      <span aria-hidden="true" className="text-[#C4B5E3]">·</span>
                      <span className="inline-flex items-center gap-1.5 text-[#F3EEFC]">
                        <Calendar className="h-3.5 w-3.5 text-[#FACC15]" aria-hidden="true" />
                        <span>
                          {t.hero.windowOpeningLabel}: {formatIstDateTime(settings.registration_open_at, lang)}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-[#C4B5E3]">·</span>
                      <span className="text-[#F3EEFC]">
                        {t.hero.windowClosingLabel}:{' '}
                        {settings.registration_close_at
                          ? formatIstDateTime(settings.registration_close_at, lang)
                          : t.hero.noClosingDate}
                      </span>
                    </div>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => navigate('/register')}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-xl bg-[#FACC15] px-7 py-3 text-base font-bold text-[#180D2B] transition-colors hover:bg-[#EAB308] cursor-pointer"
                      >
                        {t.hero.primaryCta}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/track')}
                        className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-white/40 bg-[#2C1057] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#3B1278] cursor-pointer"
                      >
                        {t.hero.secondaryCta}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/players')}
                        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-[#FACC15] bg-[#1B0A36] px-5 py-3 text-sm font-bold text-[#FACC15] transition-colors hover:bg-[#2C1057] cursor-pointer"
                      >
                        <Users className="h-4 w-4" aria-hidden="true" />
                        <span>{t.hero.playerListCta}</span>
                      </button>
                    </div>
                  </div>

                  {/* Main Official RCL Logo Card + Crisp High-Contrast Caption Plate Directly Below */}
                  <div className="flex flex-col items-center lg:col-span-4 lg:items-end">
                    <div className="w-full max-w-[290px] overflow-hidden rounded-2xl border-2 border-[#FACC15]/60 bg-white shadow-xl">
                      <div className="bg-white p-5 sm:p-6">
                        <img
                          src={officialLogo}
                          alt="RCL 2027 Official Crest"
                          className="mx-auto h-44 w-auto object-contain sm:h-52"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="border-t-2 border-[#FACC15]/40 bg-[#1B0A36] px-4 py-3 text-center">
                        <p className="font-display text-sm font-extrabold tracking-wide text-white">
                          {lang === 'bn' ? 'আরসিএল ২০২৭ · সিজন ৩' : 'RCL 2027 · SEASON 3'}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-[#FACC15]">
                          {t.hero.organizedBy}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Solid High-Contrast 4-column Tournament Summary Bar Directly Below Hero & Logo */}
                <div className="mt-10 grid grid-cols-2 gap-4 rounded-2xl border border-[#FACC15]/30 bg-[#120724] px-5 py-5 shadow-md sm:grid-cols-4 sm:gap-6 sm:px-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#D6C7F2]">{t.hero.statTeamsLabel}</p>
                    <p className="mt-1 font-display text-lg font-bold text-white">{t.hero.statTeams}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#D6C7F2]">{t.hero.statSeasonLabel}</p>
                    <p className="mt-1 font-display text-lg font-bold text-[#FACC15]">
                      {t.hero.statSeason} · {t.hero.statTrophy}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#D6C7F2]">{t.hero.statBasePriceLabel}</p>
                    <p className="mt-1 font-display text-lg font-bold text-white tabular-nums">{t.hero.statBasePrice}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#D6C7F2]">{t.hero.statRegLabel}</p>
                    <p className="mt-1 font-display text-lg font-bold text-[#FACC15]">
                      {settings.is_registration_open ? t.hero.statRegOpen : t.hero.statRegClosed}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Past Champions, Fixtures, Video Carousel, Sponsors, Rules, Contact */}
            {loadingPublic ? (
              <div className="py-12 text-center text-sm font-medium text-[#4D3B6E]">
                Loading tournament records...
              </div>
            ) : (
              <PublicDirectoryAndSections
                lang={lang}
                settings={settings}
                pastChampions={pastChampions}
                notices={notices}
                videos={videos}
                sponsors={sponsors}
              />
            )}
          </>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="no-print border-t border-[#3B1278]/15 bg-[#180D2B] px-4 py-8 text-white sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <img
              src={officialLogo}
              alt="RCL 2027 Logo"
              className="h-8 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="text-xs text-white/80">
              <p className="font-semibold text-white">{t.footer.rights}</p>
              <p className="mt-0.5 text-white/65">{t.hero.organizedBy}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 cursor-pointer"
          >
            <Shield className="h-3.5 w-3.5 text-[#FACC15]" aria-hidden="true" />
            <span>{t.footer.adminLink}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
