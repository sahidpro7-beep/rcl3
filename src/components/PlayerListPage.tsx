import { useMemo, useState } from 'react';
import { ArrowLeft, Search, Users } from 'lucide-react';
import { TRANSLATIONS, translateRole } from '../lib/i18n';
import { ALLOWED_BASE_PRICES, ALLOWED_ROLES } from '../lib/validation';
import type { ApprovedPlayer, BasePrice, Language, PlayerRole } from '../types/rcl';

interface PlayerListPageProps {
  lang: Language;
  approvedPlayers: ApprovedPlayer[];
  loading: boolean;
  onBackHome: () => void;
}

export function PlayerListPage({ lang, approvedPlayers, loading, onBackHome }: PlayerListPageProps) {
  const t = TRANSLATIONS[lang];
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | PlayerRole>('all');
  const [priceFilter, setPriceFilter] = useState<'all' | BasePrice>('all');

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return approvedPlayers.filter((p) => {
      if (roleFilter !== 'all' && p.player_role !== roleFilter) return false;
      if (priceFilter !== 'all' && p.base_price !== priceFilter) return false;
      if (q && !p.player_name.toLowerCase().includes(q) && !p.player_id.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [approvedPlayers, searchQuery, roleFilter, priceFilter]);

  return (
    <section className="py-10 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mb-6">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#3B1278]/20 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#240B4C] hover:bg-[#EFEAF8] cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>{t.nav.backToHome}</span>
          </button>
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B00]">{t.directory.subheading}</p>
            <h1 className="mt-1 font-display text-2xl font-bold text-[#180D2B] sm:text-4xl">{t.directory.heading}</h1>
            <div className="mt-4 cricket-seam-rule w-28" />
          </div>
          <p className="font-mono-tabular text-sm font-semibold text-[#4D3B6E]">
            {approvedPlayers.length} {lang === 'bn' ? 'জন অনুমোদিত' : 'Approved'}
          </p>
        </div>

        <div className="mb-8 flex flex-col gap-3 rounded-xl border border-[#3B1278]/15 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-[#6B5A8E]" aria-hidden="true" />
            <input
              type="search"
              aria-label={t.directory.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.directory.searchPlaceholder}
              className="w-full rounded-lg border border-[#3B1278]/20 bg-[#F9F8FC] py-2.5 pr-3.5 pl-10 text-sm text-[#180D2B] focus:border-[#3B1278] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#3B1278]/15 bg-[#F9F8FC] p-1">
              <button
                type="button"
                onClick={() => setRoleFilter('all')}
                className={`min-h-[36px] rounded-md px-3 text-xs font-semibold cursor-pointer ${
                  roleFilter === 'all' ? 'bg-[#3B1278] text-white' : 'text-[#3D2E5C] hover:bg-[#EFEAF8]'
                }`}
              >
                {t.directory.allRoles}
              </button>
              {ALLOWED_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`min-h-[36px] rounded-md px-3 text-xs font-semibold cursor-pointer ${
                    roleFilter === r ? 'bg-[#3B1278] text-white' : 'text-[#3D2E5C] hover:bg-[#EFEAF8]'
                  }`}
                >
                  {t.registration.roles[r]}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-lg border border-[#3B1278]/15 bg-[#F9F8FC] p-1">
              <button
                type="button"
                onClick={() => setPriceFilter('all')}
                className={`min-h-[36px] rounded-md px-3 text-xs font-semibold cursor-pointer ${
                  priceFilter === 'all' ? 'bg-[#240B4C] text-[#FACC15]' : 'text-[#3D2E5C] hover:bg-[#EFEAF8]'
                }`}
              >
                {t.directory.allPrices}
              </button>
              {ALLOWED_BASE_PRICES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriceFilter(p)}
                  className={`min-h-[36px] rounded-md px-3 text-xs font-bold tabular-nums cursor-pointer ${
                    priceFilter === p ? 'bg-[#240B4C] text-[#FACC15]' : 'text-[#3D2E5C] hover:bg-[#EFEAF8]'
                  }`}
                >
                  ₹{p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-[#3B1278]/12 bg-white p-10 text-center text-sm font-medium text-[#4D3B6E]">
            Loading approved players...
          </div>
        ) : approvedPlayers.length === 0 ? (
          <div className="rounded-2xl border border-[#3B1278]/12 bg-white p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-[#6B5A8E]" aria-hidden="true" />
            <h2 className="mt-3 font-display text-lg font-bold text-[#180D2B]">{t.directory.emptyTitle}</h2>
            <p className="mx-auto mt-1.5 max-w-xl text-sm text-[#4D3B6E]">{t.directory.emptyBody}</p>
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="rounded-2xl border border-[#3B1278]/12 bg-white p-8 text-center text-sm text-[#4D3B6E]">
            {t.directory.noMatches}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {filteredPlayers.map((player) => (
              <article
                key={player.player_id}
                className="overflow-hidden rounded-xl border border-[#3B1278]/15 bg-white"
              >
                <div className="aspect-[4/3] w-full bg-[#240B4C]/8">
                  {player.photo_url ? (
                    <img
                      src={player.photo_url}
                      alt={player.player_name}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#240B4C] to-[#3B1278] text-white/80">
                      <Users className="h-10 w-10" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#6B5A8E]">
                    <span className="font-mono-tabular font-bold text-[#3B1278]">{player.player_id}</span>
                    <span className="font-mono-tabular font-bold text-[#9A6B00]">
                      {t.directory.basePriceLabel}: ₹{player.base_price}
                    </span>
                  </div>
                  <h2 className="mt-1.5 truncate font-display text-lg font-bold text-[#180D2B]">
                    {player.player_name}
                  </h2>
                  <p className="mt-0.5 text-sm font-medium text-[#4D3B6E]">
                    {translateRole(player.player_role, lang)}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
