import { useMemo } from 'react';
import { ExternalLink, Film } from 'lucide-react';
import { TRANSLATIONS } from '../lib/i18n';
import { parseVideoEmbed } from '../lib/validation';
import type { Language, VideoGalleryItem } from '../types/rcl';

interface VideoGallerySectionProps {
  lang: Language;
  videos: VideoGalleryItem[];
}

export function VideoGallerySection({ lang, videos }: VideoGallerySectionProps) {
  const t = TRANSLATIONS[lang].gallery;

  const orderedVideos = useMemo(() => {
    return [...videos]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((v) => ({
        item: v,
        parsed: parseVideoEmbed(v.source_url),
      }))
      .filter((entry): entry is { item: VideoGalleryItem; parsed: NonNullable<ReturnType<typeof parseVideoEmbed>> } =>
        Boolean(entry.parsed),
      );
  }, [videos]);

  return (
    <section id="gallery" className="scroll-mt-20 border-t border-[#3B1278]/10 bg-[#F9F8FC] py-14 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B00]">{t.subheading}</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-[#180D2B] sm:text-4xl">{t.heading}</h2>
        </div>

        {orderedVideos.length === 0 ? (
          <div className="rounded-2xl border border-[#3B1278]/15 bg-white p-10 text-center shadow-sm">
            <Film className="mx-auto h-8 w-8 text-[#6B5A8E]" aria-hidden="true" />
            <h3 className="mt-3 font-display text-lg font-bold text-[#180D2B]">{t.emptyTitle}</h3>
            <p className="mx-auto mt-1.5 max-w-xl text-sm text-[#4D3B6E]">{t.emptyBody}</p>
          </div>
        ) : (
          <div className="flex flex-col space-y-8">
            {orderedVideos.map(({ item, parsed }) => {
              const caption = lang === 'bn' ? item.caption_bn : item.caption_en;
              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-[#3B1278]/15 bg-white p-4 shadow-sm sm:p-6"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#9A6B00]">
                        {parsed.provider === 'facebook' ? 'Facebook' : 'YouTube'}
                      </p>
                      <h3 className="mt-0.5 font-display text-lg font-bold text-[#180D2B] sm:text-xl">
                        {caption}
                      </h3>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl bg-[#180D2B] p-2 sm:p-3">
                    <div
                      className={
                        parsed.isPortrait
                          ? 'mx-auto w-full max-w-[360px] aspect-[9/16] max-h-[580px] overflow-hidden rounded-lg bg-black'
                          : 'w-full aspect-video overflow-hidden rounded-lg bg-black'
                      }
                    >
                      <iframe
                        src={parsed.embedUrl}
                        title={caption}
                        loading="lazy"
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        className="h-full w-full border-0"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 border-t border-[#3B1278]/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-medium text-[#5E4B7E]">{t.fallbackHint}</p>
                    <a
                      href={parsed.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg border border-[#3B1278]/25 bg-[#F9F8FC] px-4 py-2 text-xs font-bold text-[#240B4C] transition-colors hover:bg-[#EFEAF8]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {parsed.provider === 'youtube' ? t.watchOnYoutube : t.watchOnFacebook}
                      </span>
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
