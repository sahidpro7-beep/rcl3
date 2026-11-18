import {
  Calendar,
  ExternalLink,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  Share2,
  Trophy,
} from 'lucide-react';
import { TRANSLATIONS } from '../lib/i18n';
import {
  buildWhatsAppUrl,
  formatIstDateTime,
  sanitizeHttpUrl,
} from '../lib/validation';
import { VideoGallerySection } from './VideoGallerySection';
import type {
  Language,
  NoticeFixture,
  PastChampion,
  PublicSettings,
  SponsorItem,
  VideoGalleryItem,
} from '../types/rcl';

interface PublicSectionsProps {
  lang: Language;
  settings: PublicSettings;
  pastChampions: PastChampion[];
  notices: NoticeFixture[];
  videos: VideoGalleryItem[];
  sponsors: SponsorItem[];
}

export function PublicDirectoryAndSections({
  lang,
  settings,
  pastChampions,
  notices,
  videos,
  sponsors,
}: PublicSectionsProps) {
  const t = TRANSLATIONS[lang];

  const rulesList = (lang === 'bn' ? settings.rules_bn : settings.rules_en)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const whatsappChannelUrl = sanitizeHttpUrl(settings.whatsapp_channel_url);
  const facebookUrl = sanitizeHttpUrl(settings.facebook_url);
  const instagramUrl = sanitizeHttpUrl(settings.instagram_url);

  const contactWhatsappUrl = buildWhatsAppUrl(
    settings.whatsapp_number,
    `Hello ${settings.contact_name}, I have a query regarding RCL 2027 (Season 3).`,
  );

  return (
    <>
      {/* Past Champions (clearly separated, distinct boxed Roll of Honour section) */}
      <section id="champions" className="scroll-mt-20 border-t-4 border-[#D49B00] bg-[#EFEAF8] py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="rounded-2xl border-2 border-[#3B1278]/20 bg-white p-6 shadow-md sm:p-8">
            <div className="mb-6 flex flex-col gap-1 border-b border-[#3B1278]/12 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#9A6B00]">{t.champions.subheading}</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold text-[#180D2B] sm:text-3xl">
                  {t.champions.heading}
                </h2>
              </div>
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#3B1278] sm:mt-0">
                <Trophy className="h-4 w-4 text-[#D49B00]" aria-hidden="true" />
                <span>RCL 2025 – 2026</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {pastChampions.slice(0, 2).map((champ) => (
                <article
                  key={champ.id}
                  className="flex items-center gap-4 rounded-xl border-2 border-[#3B1278]/15 bg-[#FBF9FE] p-5 shadow-xs"
                >
                  <div className="flex h-22 w-22 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#3B1278]/20 bg-white p-2 shadow-xs">
                    {champ.logo_url ? (
                      <img
                        src={champ.logo_url}
                        alt={`${champ.champion_year} ${t.champions.championLabel}: ${lang === 'bn' ? champ.team_name_bn : champ.team_name_en}`}
                        className="h-full w-full rounded-lg object-contain"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-center text-[10px] font-semibold text-[#6B5A8E]">
                        <Trophy className="mb-1 h-5 w-5 text-[#D49B00]" aria-hidden="true" />
                        <span>{t.champions.logoPending}</span>
                      </div>
                    )}
                  </div>

                  <div className="min-w-0">
                    <span className="inline-block rounded-md bg-[#240B4C] px-2.5 py-1 font-mono-tabular text-xs font-bold uppercase tracking-wider text-[#FACC15]">
                      {champ.champion_year} {t.champions.championLabel}
                    </span>
                    <h3 className="mt-2 font-display text-xl font-extrabold leading-snug text-[#180D2B]">
                      {lang === 'bn' ? champ.team_name_bn : champ.team_name_en}
                    </h3>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Announcements & Fixtures */}
      <section id="fixtures" className="scroll-mt-20 border-t border-[#3B1278]/10 bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B00]">{t.fixtures.subheading}</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-[#180D2B] sm:text-4xl">{t.fixtures.heading}</h2>
          </div>

          {notices.length === 0 ? (
            <div className="rounded-2xl border border-[#3B1278]/12 bg-[#F9F8FC] p-10 text-center">
              <Calendar className="mx-auto h-8 w-8 text-[#6B5A8E]" aria-hidden="true" />
              <h3 className="mt-3 font-display text-lg font-bold text-[#180D2B]">{t.fixtures.emptyTitle}</h3>
              <p className="mx-auto mt-1.5 max-w-xl text-sm text-[#4D3B6E]">{t.fixtures.emptyBody}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {notices.map((item) => (
                <article key={item.id} className="rounded-xl border border-[#3B1278]/15 bg-[#F9F8FC] p-6">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#6B5A8E]">
                    <span className="text-[#3B1278]">
                      {item.kind === 'fixture' ? t.fixtures.fixtureLabel : t.fixtures.noticeLabel}
                    </span>
                    {item.event_date && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{formatIstDateTime(item.event_date, lang)}</span>
                      </>
                    )}
                    {item.venue && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {item.venue}
                        </span>
                      </>
                    )}
                  </div>
                  <h3 className="mt-2 font-display text-xl font-bold text-[#180D2B]">
                    {lang === 'bn' ? item.title_bn : item.title_en}
                  </h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-[#3D2E5C]">
                    {lang === 'bn' ? item.body_bn : item.body_en}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Vertical Video Gallery */}
      <VideoGallerySection lang={lang} videos={videos} />

      {/* Sponsors */}
      <section id="sponsors" className="scroll-mt-20 border-t border-[#3B1278]/10 bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B00]">{t.sponsors.subheading}</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-[#180D2B] sm:text-4xl">{t.sponsors.heading}</h2>
          </div>

          {sponsors.length === 0 ? (
            <div className="rounded-2xl border border-[#3B1278]/12 bg-[#F9F8FC] p-10 text-center">
              <h3 className="font-display text-lg font-bold text-[#180D2B]">{t.sponsors.emptyTitle}</h3>
              <p className="mx-auto mt-1.5 max-w-xl text-sm text-[#4D3B6E]">{t.sponsors.emptyBody}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {sponsors.map((sp) => {
                const safeSite = sanitizeHttpUrl(sp.website_url);
                return (
                  <div key={sp.id} className="flex flex-col justify-between rounded-xl border border-[#3B1278]/15 bg-[#F9F8FC] p-5">
                    <div>
                      {sp.logo_url && (
                        <img
                          src={sp.logo_url}
                          alt={sp.name}
                          className="mb-4 h-16 w-auto object-contain"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      <p className="text-xs font-semibold text-[#9A6B00]">{lang === 'bn' ? sp.tier_bn : sp.tier_en}</p>
                      <h3 className="mt-1 font-display text-lg font-bold text-[#180D2B]">{sp.name}</h3>
                    </div>
                    {safeSite && (
                      <a
                        href={safeSite}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B1278] hover:underline"
                      >
                        <span>{t.contact.openChannel}</span>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Tournament Rules */}
      <section id="rules" className="scroll-mt-20 border-t border-[#3B1278]/10 bg-[#F9F8FC] py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B00]">{t.rules.subheading}</p>
            <h2 className="mt-1 font-display text-2xl font-bold text-[#180D2B] sm:text-4xl">{t.rules.heading}</h2>
          </div>

          <ol className="space-y-3">
            {rulesList.map((rule, idx) => (
              <li
                key={idx}
                className="flex items-start gap-4 rounded-xl border border-[#3B1278]/12 bg-white p-4 sm:p-5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#240B4C] font-mono-tabular text-xs font-bold text-[#FACC15]">
                  {String(idx + 1).padStart(2, '0')}
                </span>
                <p className="text-sm leading-relaxed text-[#2D1E47] sm:text-base">{rule.replace(/^[0-9০-৯]+[.)]\s*/, '')}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Contact & Prominent Social Channels */}
      <section id="contact" className="scroll-mt-20 border-t border-[#3B1278]/10 bg-white py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
            <div className="rounded-2xl border border-[#3B1278]/15 bg-[#240B4C] p-6 text-white sm:p-8 lg:col-span-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#FACC15]">{t.contact.subheading}</p>
              <h2 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">{t.contact.heading}</h2>

              <div className="mt-6 space-y-1">
                <p className="text-xs text-white/70">{t.contact.organizerLabel}</p>
                <p className="font-display text-2xl font-bold text-white">{settings.contact_name}</p>
                <p className="font-mono-tabular text-lg font-semibold text-[#FACC15]">{settings.contact_phone}</p>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href={`tel:${settings.contact_phone.replace(/\s+/g, '')}`}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#FACC15] px-5 py-2.5 text-sm font-bold text-[#180D2B] hover:bg-[#EAB308]"
                >
                  <Phone className="h-4 w-4" />
                  <span>{t.contact.callNow}</span>
                </a>

                <a
                  href={contactWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>{t.contact.whatsappMessage}</span>
                </a>
              </div>
            </div>

            <div className="rounded-2xl border border-[#3B1278]/15 bg-[#F9F8FC] p-6 sm:p-8 lg:col-span-7">
              <h3 className="font-display text-xl font-bold text-[#180D2B]">{t.contact.socialHeading}</h3>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* WhatsApp Channel */}
                {whatsappChannelUrl ? (
                  <a
                    href={whatsappChannelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[112px] flex-col justify-between rounded-xl border border-emerald-700/25 bg-emerald-700 p-5 text-white transition-transform hover:-translate-y-0.5"
                  >
                    <MessageCircle className="h-6 w-6" aria-hidden="true" />
                    <div>
                      <p className="font-display text-lg font-bold">{t.contact.whatsappChannel}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-100">
                        <span>{t.contact.openChannel}</span>
                        <ExternalLink className="h-3 w-3" />
                      </p>
                    </div>
                  </a>
                ) : (
                  <div className="flex min-h-[112px] flex-col justify-between rounded-xl border border-[#3B1278]/15 bg-white p-5">
                    <MessageCircle className="h-6 w-6 text-emerald-700" aria-hidden="true" />
                    <div>
                      <p className="font-display text-lg font-bold text-[#180D2B]">{t.contact.whatsappChannel}</p>
                      <p className="mt-0.5 text-xs font-medium text-[#6B5A8E]">{t.contact.comingSoon}</p>
                    </div>
                  </div>
                )}

                {/* Facebook Page */}
                {facebookUrl ? (
                  <a
                    href={facebookUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[112px] flex-col justify-between rounded-xl border border-[#1877F2]/25 bg-[#1877F2] p-5 text-white transition-transform hover:-translate-y-0.5"
                  >
                    <Share2 className="h-6 w-6" aria-hidden="true" />
                    <div>
                      <p className="font-display text-lg font-bold">{t.contact.facebookPage}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-100">
                        <span>{t.contact.openChannel}</span>
                        <ExternalLink className="h-3 w-3" />
                      </p>
                    </div>
                  </a>
                ) : (
                  <div className="flex min-h-[112px] flex-col justify-between rounded-xl border border-[#3B1278]/15 bg-white p-5">
                    <Share2 className="h-6 w-6 text-[#1877F2]" aria-hidden="true" />
                    <div>
                      <p className="font-display text-lg font-bold text-[#180D2B]">{t.contact.facebookPage}</p>
                      <p className="mt-0.5 text-xs font-medium text-[#6B5A8E]">{t.contact.comingSoon}</p>
                    </div>
                  </div>
                )}

                {/* Instagram */}
                {instagramUrl ? (
                  <a
                    href={instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[112px] flex-col justify-between rounded-xl border border-[#3B1278]/25 bg-[#3B1278] p-5 text-white transition-transform hover:-translate-y-0.5"
                  >
                    <Instagram className="h-6 w-6" aria-hidden="true" />
                    <div>
                      <p className="font-display text-lg font-bold">{t.contact.instagram}</p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-purple-100">
                        <span>{t.contact.openChannel}</span>
                        <ExternalLink className="h-3 w-3" />
                      </p>
                    </div>
                  </a>
                ) : (
                  <div className="flex min-h-[112px] flex-col justify-between rounded-xl border border-[#3B1278]/15 bg-white p-5">
                    <Instagram className="h-6 w-6 text-[#3B1278]" aria-hidden="true" />
                    <div>
                      <p className="font-display text-lg font-bold text-[#180D2B]">{t.contact.instagram}</p>
                      <p className="mt-0.5 text-xs font-medium text-[#6B5A8E]">{t.contact.comingSoon}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
