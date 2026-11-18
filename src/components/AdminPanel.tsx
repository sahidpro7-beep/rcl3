import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Eye,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { callEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabase';
import { TRANSLATIONS } from '../lib/i18n';
import {
  ALLOWED_BASE_PRICES,
  ALLOWED_ROLES,
  buildApplicationsCsv,
  formatIstDateTime,
  parseVideoEmbed,
  validateImageFileClient,
} from '../lib/validation';
import type {
  AdminApplication,
  ApplicationStatus,
  BasePrice,
  DashboardCounts,
  Language,
  NoticeFixture,
  PastChampion,
  PaymentMethod,
  PaymentStatus,
  PlayerRole,
  PublicSettings,
  RegistrationMode,
  SponsorItem,
  VideoGalleryItem,
} from '../types/rcl';

interface AdminPanelProps {
  lang: Language;
  onToggleLang: () => void;
  onBackToPublic: () => void;
  onDataUpdated: () => void;
}

type AdminTab = 'overview' | 'applications' | 'teams' | 'content' | 'settings' | 'audit';

interface DashboardPayload {
  counts: DashboardCounts;
  applications: AdminApplication[];
  settings: PublicSettings;
  pastChampions: PastChampion[];
  notices: NoticeFixture[];
  videos: VideoGalleryItem[];
  sponsors: SponsorItem[];
  appHistory: Array<{ id: string; application_id: string; action: string; actor_type: string; note: string | null; created_at: string }>;
  settingsAudit: Array<{ id: string; entity_type: string; entity_id: string; summary: string; created_at: string }>;
}

interface DetailPayload {
  application: AdminApplication;
  photo_signed_url: string | null;
  screenshot_signed_url: string | null;
  history: Array<{ id: string; action: string; actor_type: string; note: string | null; created_at: string }>;
  payments: Array<{ id: string; revision_number: number; payment_method: string; amount: number; upi_id_used: string | null; transaction_id: string | null; status: string; created_at: string }>;
}

export function AdminPanel({ lang, onToggleLang, onBackToPublic, onDataUpdated }: AdminPanelProps) {
  const t = TRANSLATIONS[lang];

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loadingDash, setLoadingDash] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Filters for Applications
  const [q, setQ] = useState('');
  const [fRole, setFRole] = useState<'all' | PlayerRole>('all');
  const [fPrice, setFPrice] = useState<'all' | BasePrice>('all');
  const [fAppStatus, setFAppStatus] = useState<'all' | ApplicationStatus>('all');
  const [fPayMethod, setFPayMethod] = useState<'all' | PaymentMethod>('all');
  const [fPayStatus, setFPayStatus] = useState<'all' | PaymentStatus>('all');

  // Application Detail Modal
  const [selectedDetail, setSelectedDetail] = useState<DetailPayload | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [paymentNoteInput, setPaymentNoteInput] = useState('');

  // Inline Edit Player fields
  const [editPlayerName, setEditPlayerName] = useState('');
  const [editPlayerRole, setEditPlayerRole] = useState<PlayerRole>('Batsman');
  const [editAddress, setEditAddress] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editBasePrice, setEditBasePrice] = useState<BasePrice>(20);
  const [editPayMethod, setEditPayMethod] = useState<PaymentMethod>('UPI');
  const [editUtr, setEditUtr] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAuditNote, setEditAuditNote] = useState('');

  // Content forms
  const [noticeKind, setNoticeKind] = useState<'notice' | 'fixture'>('notice');
  const [noticeTitleEn, setNoticeTitleEn] = useState('');
  const [noticeTitleBn, setNoticeTitleBn] = useState('');
  const [noticeBodyEn, setNoticeBodyEn] = useState('');
  const [noticeBodyBn, setNoticeBodyBn] = useState('');
  const [noticeDate, setNoticeDate] = useState('');
  const [noticeVenue, setNoticeVenue] = useState('');

  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [videoSourceUrl, setVideoSourceUrl] = useState('');
  const [videoCaptionEn, setVideoCaptionEn] = useState('');
  const [videoCaptionBn, setVideoCaptionBn] = useState('');
  const [videoSortOrder, setVideoSortOrder] = useState<number>(1);

  const [sponsorName, setSponsorName] = useState('');
  const [sponsorTierEn, setSponsorTierEn] = useState('Official Sponsor');
  const [sponsorTierBn, setSponsorTierBn] = useState('অফিশিয়াল স্পনসর');
  const [sponsorUrl, setSponsorUrl] = useState('');
  const [sponsorFile, setSponsorFile] = useState<File | null>(null);

  // Settings local editable state
  const [settingsForm, setSettingsForm] = useState<{
    registration_mode: RegistrationMode;
    registration_open_at: string;
    registration_close_at: string;
    contact_name: string;
    contact_phone: string;
    whatsapp_number: string;
    upi_receiver_name: string;
    upi_id: string;
    cash_instructions_en: string;
    cash_instructions_bn: string;
    whatsapp_channel_url: string;
    facebook_url: string;
    instagram_url: string;
    about_en: string;
    about_bn: string;
    rules_en: string;
    rules_bn: string;
  } | null>(null);

  // Past Champions local editable state
  const [championsDraft, setChampionsDraft] = useState<PastChampion[]>([]);

  const loadDashboard = useCallback(
    async (token: string) => {
      setLoadingDash(true);
      setFeedback(null);
      try {
        const data = await callEdgeFunction<DashboardPayload>('admin-api', {
          method: 'POST',
          accessToken: token,
          body: { action: 'get_dashboard' },
        });
        setDashboard(data);
        setChampionsDraft(data.pastChampions ?? []);
        if (data.settings) {
          const toLocalInput = (iso: string | null) => {
            if (!iso) return '';
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '';
            // Format YYYY-MM-DDTHH:mm in Asia/Kolkata (+05:30)
            const istMs = d.getTime() + 5.5 * 3600_000;
            return new Date(istMs).toISOString().slice(0, 16);
          };
          setSettingsForm({
            registration_mode: data.settings.registration_mode,
            registration_open_at: toLocalInput(data.settings.registration_open_at),
            registration_close_at: toLocalInput(data.settings.registration_close_at),
            contact_name: data.settings.contact_name,
            contact_phone: data.settings.contact_phone,
            whatsapp_number: data.settings.whatsapp_number,
            upi_receiver_name: data.settings.upi_receiver_name,
            upi_id: data.settings.upi_id,
            cash_instructions_en: data.settings.cash_instructions_en,
            cash_instructions_bn: data.settings.cash_instructions_bn,
            whatsapp_channel_url: data.settings.whatsapp_channel_url ?? '',
            facebook_url: data.settings.facebook_url ?? '',
            instagram_url: data.settings.instagram_url ?? '',
            about_en: data.settings.about_en,
            about_bn: data.settings.about_bn,
            rules_en: data.settings.rules_en,
            rules_bn: data.settings.rules_bn,
          });
        }
      } catch (err) {
        setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to load dashboard.' });
      } finally {
        setLoadingDash(false);
      }
    },
    [],
  );

  useEffect(() => {
    const check = async () => {
      if (!supabase) {
        setCheckingSession(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? null;
      if (!token) {
        setCheckingSession(false);
        return;
      }
      try {
        const res = await callEdgeFunction<{ ok: boolean; email: string }>('admin-api', {
          method: 'POST',
          accessToken: token,
          body: { action: 'verify_admin' },
        });
        setSessionToken(token);
        setAdminEmail(res.email);
        await loadDashboard(token);
      } catch {
        await supabase.auth.signOut();
        setAuthError(t.admin.unauthorized);
      } finally {
        setCheckingSession(false);
      }
    };
    void check();
  }, [loadDashboard, t.admin.unauthorized]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError(null);
    setSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailInput.trim(),
        password: passwordInput,
      });
      if (error || !data.session) {
        setAuthError(error?.message ?? 'Invalid login credentials.');
        return;
      }
      const token = data.session.access_token;
      const verified = await callEdgeFunction<{ ok: boolean; email: string }>('admin-api', {
        method: 'POST',
        accessToken: token,
        body: { action: 'verify_admin' },
      });
      setSessionToken(token);
      setAdminEmail(verified.email);
      setPasswordInput('');
      await loadDashboard(token);
    } catch (err) {
      await supabase.auth.signOut();
      setAuthError(err instanceof Error ? err.message : t.admin.unauthorized);
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setAdminEmail(null);
    setDashboard(null);
    setSelectedDetail(null);
  };

  const uploadAdminAsset = async (file: File, folder: string): Promise<string> => {
    if (!sessionToken) throw new Error('Not signed in.');
    const check = await validateImageFileClient(file);
    if (!check.valid) throw new Error('Only JPG, PNG, or WebP images up to 5 MB are allowed.');
    const fd = new FormData();
    fd.append('folder', folder);
    fd.append('file', file);
    const res = await callEdgeFunction<{ path: string }>('admin-api', {
      method: 'POST',
      accessToken: sessionToken,
      formData: fd,
    });
    return res.path;
  };

  const filteredApplications = useMemo(() => {
    const list = dashboard?.applications ?? [];
    const search = q.trim().toLowerCase();
    return list.filter((a) => {
      if (fRole !== 'all' && a.player_role !== fRole) return false;
      if (fPrice !== 'all' && a.base_price !== fPrice) return false;
      if (fAppStatus !== 'all' && a.application_status !== fAppStatus) return false;
      if (fPayMethod !== 'all' && a.payment_method !== fPayMethod) return false;
      if (fPayStatus !== 'all' && a.payment_status !== fPayStatus) return false;
      if (
        search &&
        !a.player_id.toLowerCase().includes(search) &&
        !a.player_name.toLowerCase().includes(search) &&
        !a.mobile_number.includes(search)
      ) {
        return false;
      }
      return true;
    });
  }, [dashboard?.applications, q, fRole, fPrice, fAppStatus, fPayMethod, fPayStatus]);

  const openApplicationDetail = async (id: string) => {
    if (!sessionToken) return;
    setLoadingDetail(true);
    try {
      const detail = await callEdgeFunction<DetailPayload>('admin-api', {
        method: 'POST',
        accessToken: sessionToken,
        body: { action: 'get_application_detail', application_id: id },
      });
      setSelectedDetail(detail);
      const a = detail.application;
      setEditPlayerName(a.player_name);
      setEditPlayerRole(a.player_role);
      setEditAddress(a.address);
      setEditMobile(a.mobile_number);
      setEditBasePrice(a.base_price);
      setEditPayMethod(a.payment_method);
      setEditUtr(a.transaction_id ?? '');
      setEditNotes(a.internal_notes ?? '');
      setEditAuditNote('');
      setRejectReasonInput(a.rejection_reason ?? '');
      setPaymentNoteInput('');
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Unable to load application.' });
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleVerifyPayment = async (status: PaymentStatus) => {
    if (!sessionToken || !selectedDetail) return;
    try {
      await callEdgeFunction('admin-api', {
        method: 'POST',
        accessToken: sessionToken,
        body: {
          action: 'verify_payment',
          application_id: selectedDetail.application.id,
          payment_status: status,
          note: paymentNoteInput,
        },
      });
      setFeedback({ type: 'ok', text: `Payment updated to ${status}.` });
      await Promise.all([loadDashboard(sessionToken), openApplicationDetail(selectedDetail.application.id)]);
      onDataUpdated();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Payment update failed.' });
    }
  };

  const handleReviewApplication = async (status: ApplicationStatus) => {
    if (!sessionToken || !selectedDetail) return;
    try {
      await callEdgeFunction('admin-api', {
        method: 'POST',
        accessToken: sessionToken,
        body: {
          action: 'review_application',
          application_id: selectedDetail.application.id,
          application_status: status,
          rejection_reason: status === 'rejected' ? rejectReasonInput : null,
        },
      });
      setFeedback({ type: 'ok', text: `Application updated to ${status}.` });
      await Promise.all([loadDashboard(sessionToken), openApplicationDetail(selectedDetail.application.id)]);
      onDataUpdated();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Application review failed.' });
    }
  };

  const handleEditApplication = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !selectedDetail) return;
    try {
      await callEdgeFunction('admin-api', {
        method: 'POST',
        accessToken: sessionToken,
        body: {
          action: 'edit_application',
          application_id: selectedDetail.application.id,
          player_name: editPlayerName,
          player_role: editPlayerRole,
          address: editAddress,
          mobile_number: editMobile,
          base_price: editBasePrice,
          payment_method: editPayMethod,
          transaction_id: editUtr,
          internal_notes: editNotes,
          audit_note: editAuditNote || 'Admin edited player record.',
        },
      });
      setFeedback({ type: 'ok', text: 'Player details updated and audited.' });
      await Promise.all([loadDashboard(sessionToken), openApplicationDetail(selectedDetail.application.id)]);
      onDataUpdated();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Edit failed.' });
    }
  };

  const handleToggleClosedCorrection = async (allow: boolean) => {
    if (!sessionToken || !selectedDetail) return;
    try {
      await callEdgeFunction('admin-api', {
        method: 'POST',
        accessToken: sessionToken,
        body: {
          action: 'toggle_closed_correction',
          application_id: selectedDetail.application.id,
          allow_closed_correction: allow,
        },
      });
      setFeedback({
        type: 'ok',
        text: allow ? 'Closed-window correction permission granted.' : 'Closed-window correction permission revoked.',
      });
      await Promise.all([loadDashboard(sessionToken), openApplicationDetail(selectedDetail.application.id)]);
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Permission update failed.' });
    }
  };

  const handleExportCsv = () => {
    const csv = buildApplicationsCsv(filteredApplications);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rcl-2027-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveChampion = async (champ: PastChampion, logoFile?: File | null) => {
    if (!sessionToken) return;
    try {
      let logoPath = champ.logo_path;
      if (logoFile) {
        logoPath = await uploadAdminAsset(logoFile, `champions/slot-${champ.slot_order}`);
      }
      await callEdgeFunction('admin-api', {
        method: 'POST',
        accessToken: sessionToken,
        body: {
          action: 'update_past_champion',
          slot_order: champ.slot_order,
          champion_year: champ.champion_year,
          team_name_en: champ.team_name_en,
          team_name_bn: champ.team_name_bn,
          logo_path: logoPath,
        },
      });
      setFeedback({ type: 'ok', text: `Past Champion #${champ.slot_order} saved.` });
      await loadDashboard(sessionToken);
      onDataUpdated();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to update champion.' });
    }
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!sessionToken || !settingsForm) return;
    try {
      const toIstIso = (localVal: string) => (localVal ? `${localVal}:00+05:30` : null);
      await callEdgeFunction('admin-api', {
        method: 'POST',
        accessToken: sessionToken,
        body: {
          action: 'update_settings',
          ...settingsForm,
          registration_open_at: toIstIso(settingsForm.registration_open_at),
          registration_close_at: toIstIso(settingsForm.registration_close_at),
        },
      });
      setFeedback({ type: 'ok', text: 'Settings & registration window updated.' });
      await loadDashboard(sessionToken);
      onDataUpdated();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save settings.' });
    }
  };

  const handleReplaceSiteAsset = async (field: 'logo_path' | 'hero_image_path', file: File | null) => {
    if (!file || !sessionToken) return;
    try {
      const path = await uploadAdminAsset(file, field === 'logo_path' ? 'site-logo' : 'site-hero');
      await callEdgeFunction('admin-api', {
        method: 'POST',
        accessToken: sessionToken,
        body: { action: 'update_settings', [field]: path },
      });
      setFeedback({ type: 'ok', text: field === 'logo_path' ? 'Website logo updated.' : 'Hero asset updated.' });
      await loadDashboard(sessionToken);
      onDataUpdated();
    } catch (err) {
      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Asset upload failed.' });
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-[#F9F8FC] px-4 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-300 bg-white p-8">
          <ShieldAlert className="h-8 w-8 text-amber-600" />
          <h1 className="mt-3 font-display text-2xl font-bold text-[#180D2B]">{t.setupBanner.title}</h1>
          <p className="mt-2 text-sm text-[#4D3B6E]">{t.setupBanner.body}</p>
          <button
            type="button"
            onClick={onBackToPublic}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#3B1278] px-4 py-2 text-sm font-semibold text-white cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{t.admin.backToSite}</span>
          </button>
        </div>
      </div>
    );
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9F8FC] text-sm font-semibold text-[#3B1278]">
        Verifying organizer session...
      </div>
    );
  }

  if (!sessionToken) {
    return (
      <div className="min-h-screen bg-[#240B4C] px-4 py-14 text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-white/15 bg-white p-6 text-[#180D2B] sm:p-8">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onBackToPublic}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B1278] hover:underline cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t.admin.backToSite}</span>
            </button>
            <button
              type="button"
              onClick={onToggleLang}
              className="rounded-md border border-[#3B1278]/20 px-2.5 py-1 text-xs font-semibold text-[#240B4C] cursor-pointer"
            >
              {lang === 'en' ? 'বাংলা' : 'EN'}
            </button>
          </div>

          <h1 className="mt-6 font-display text-2xl font-bold text-[#180D2B]">{t.admin.loginTitle}</h1>
          <p className="mt-1 text-xs text-[#5E4B7E]">{t.admin.loginSubtitle}</p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-semibold text-[#180D2B]">
                {t.admin.emailLabel}
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="admin-password" className="block text-xs font-semibold text-[#180D2B]">
                {t.admin.passwordLabel}
              </label>
              <input
                id="admin-password"
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3.5 py-2.5 text-sm"
              />
            </div>

            {authError && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-900">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={signingIn}
              className="min-h-[44px] w-full rounded-lg bg-[#3B1278] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#240B4C] disabled:opacity-60 cursor-pointer"
            >
              {signingIn ? t.admin.signingIn : t.admin.signInBtn}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F8FC] text-[#180D2B]">
      {/* Top Bar */}
      <header className="border-b border-[#3B1278]/15 bg-[#240B4C] px-4 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToPublic}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/20 px-3 text-xs font-semibold hover:bg-white/10 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{t.admin.backToSite}</span>
            </button>
            <span className="font-display text-lg font-bold text-[#FACC15]">RCL 2027 Admin</span>
            <span className="hidden text-xs text-white/75 sm:inline">· {adminEmail}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => sessionToken && void loadDashboard(sessionToken)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/20 px-3 text-xs font-semibold hover:bg-white/10 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingDash ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={onToggleLang}
              className="min-h-[36px] rounded-lg border border-white/20 px-3 text-xs font-semibold hover:bg-white/10 cursor-pointer"
            >
              {lang === 'en' ? 'বাংলা' : 'EN'}
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-white/15 px-3 text-xs font-semibold hover:bg-white/25 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t.admin.signOutBtn}</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* Tab Bar */}
        <div className="mb-6 flex flex-wrap gap-1.5 rounded-xl border border-[#3B1278]/15 bg-white p-1.5">
          {(['overview', 'applications', 'teams', 'content', 'settings', 'audit'] as AdminTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`min-h-[40px] rounded-lg px-4 text-xs font-semibold whitespace-nowrap cursor-pointer sm:text-sm ${
                activeTab === tab ? 'bg-[#3B1278] text-white' : 'text-[#3D2E5C] hover:bg-[#EFEAF8]'
              }`}
            >
              {t.admin.tabs[tab]}
            </button>
          ))}
        </div>

        {feedback && (
          <div
            role="status"
            className={`mb-6 flex items-center justify-between gap-3 rounded-xl border p-4 text-sm font-medium ${
              feedback.type === 'ok'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            <span className="flex items-center gap-2">
              {feedback.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {feedback.text}
            </span>
            <button type="button" onClick={() => setFeedback(null)} className="text-xs underline cursor-pointer">
              Dismiss
            </button>
          </div>
        )}

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && dashboard && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: 'Total Applications', val: dashboard.counts.total },
                { label: 'Pending Review', val: dashboard.counts.pending },
                { label: 'Approved Players', val: dashboard.counts.approved },
                { label: 'Rejected', val: dashboard.counts.rejected },
                { label: 'Payment Pending', val: dashboard.counts.paymentPending },
                { label: 'Verified Payments', val: dashboard.counts.paymentVerified },
                { label: 'UPI Applications', val: dashboard.counts.upiTotal },
                { label: 'Cash Applications', val: dashboard.counts.cashTotal },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-[#3B1278]/15 bg-white p-5">
                  <p className="text-xs font-medium text-[#6B5A8E]">{stat.label}</p>
                  <p className="mt-1 font-mono-tabular text-3xl font-bold text-[#180D2B]">{stat.val}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#3B1278]/15 bg-white p-5">
              <h2 className="font-display text-lg font-bold">Registration Window Status</h2>
              <p className="mt-1 text-sm text-[#4D3B6E]">
                Effective State:{' '}
                <strong className={dashboard.settings.is_registration_open ? 'text-emerald-700' : 'text-red-700'}>
                  {dashboard.settings.is_registration_open ? 'OPEN' : 'CLOSED'}
                </strong>{' '}
                · Mode: <span className="font-mono-tabular">{dashboard.settings.registration_mode}</span> · Opens:{' '}
                {formatIstDateTime(dashboard.settings.registration_open_at, lang)} · Closes:{' '}
                {formatIstDateTime(dashboard.settings.registration_close_at, lang)}
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: APPLICATIONS */}
        {activeTab === 'applications' && dashboard && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#3B1278]/15 bg-white p-4">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ID, Name, Mobile..."
                  className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs"
                />
                <select value={fRole} onChange={(e) => setFRole(e.target.value as 'all' | PlayerRole)} className="rounded-lg border border-[#3B1278]/20 px-2.5 py-2 text-xs">
                  <option value="all">All Roles</option>
                  {ALLOWED_ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <select value={fPrice} onChange={(e) => setFPrice(e.target.value === 'all' ? 'all' : (Number(e.target.value) as BasePrice))} className="rounded-lg border border-[#3B1278]/20 px-2.5 py-2 text-xs">
                  <option value="all">All Base Prices</option>
                  <option value="20">₹20</option>
                  <option value="30">₹30</option>
                </select>
                <select value={fAppStatus} onChange={(e) => setFAppStatus(e.target.value as 'all' | ApplicationStatus)} className="rounded-lg border border-[#3B1278]/20 px-2.5 py-2 text-xs">
                  <option value="all">All App Statuses</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <select value={fPayMethod} onChange={(e) => setFPayMethod(e.target.value as 'all' | PaymentMethod)} className="rounded-lg border border-[#3B1278]/20 px-2.5 py-2 text-xs">
                  <option value="all">UPI & Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Cash">Cash</option>
                </select>
                <select value={fPayStatus} onChange={(e) => setFPayStatus(e.target.value as 'all' | PaymentStatus)} className="rounded-lg border border-[#3B1278]/20 px-2.5 py-2 text-xs">
                  <option value="all">All Pay Statuses</option>
                  <option value="pending_verification">Pending Verification</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-[#240B4C] px-4 py-2 text-xs font-semibold text-[#FACC15] hover:bg-[#3B1278] cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Export CSV ({filteredApplications.length})</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#3B1278]/15 bg-white">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-[#3B1278]/10 bg-[#F9F8FC] text-xs font-semibold text-[#4D3B6E]">
                  <tr>
                    <th className="px-4 py-3">Player ID</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Role / Price</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">App Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3B1278]/10">
                  {filteredApplications.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-[#6B5A8E]">
                        No applications match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filteredApplications.map((app) => (
                      <tr key={app.id} className="hover:bg-[#F9F8FC]">
                        <td className="px-4 py-3 font-mono-tabular font-bold text-[#3B1278]">{app.player_id}</td>
                        <td className="px-4 py-3 font-semibold">{app.player_name}</td>
                        <td className="px-4 py-3 font-mono-tabular">{app.mobile_number}</td>
                        <td className="px-4 py-3 tabular-nums">{app.player_role} · ₹{app.base_price}</td>
                        <td className="px-4 py-3">
                          {app.payment_method} · <span className="font-semibold">{app.payment_status}</span>
                        </td>
                        <td className="px-4 py-3 font-semibold">{app.application_status}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => void openApplicationDetail(app.id)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-[#3B1278]/20 px-3 py-1 text-xs font-semibold text-[#240B4C] hover:bg-[#EFEAF8] cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: PAST CHAMPIONS */}
        {activeTab === 'teams' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {championsDraft.map((champ, idx) => (
              <div key={champ.id} className="space-y-3 rounded-xl border border-[#3B1278]/15 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-base font-bold text-[#3B1278]">
                    Past Champion #{champ.slot_order} ({champ.champion_year})
                  </h3>
                  {champ.logo_url && (
                    <img src={champ.logo_url} alt={champ.team_name_en} className="h-12 w-12 rounded object-contain border" />
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#5E4B7E]">Champion Year</label>
                    <input
                      type="number"
                      min={2000}
                      max={2100}
                      value={champ.champion_year}
                      onChange={(e) => {
                        const next = [...championsDraft];
                        next[idx] = { ...champ, champion_year: Number(e.target.value) };
                        setChampionsDraft(next);
                      }}
                      className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 font-mono-tabular text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#5E4B7E]">Team Name (English)</label>
                    <input
                      type="text"
                      value={champ.team_name_en}
                      onChange={(e) => {
                        const next = [...championsDraft];
                        next[idx] = { ...champ, team_name_en: e.target.value };
                        setChampionsDraft(next);
                      }}
                      className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#5E4B7E]">Team Name (Bangla)</label>
                    <input
                      type="text"
                      value={champ.team_name_bn}
                      onChange={(e) => {
                        const next = [...championsDraft];
                        next[idx] = { ...champ, team_name_bn: e.target.value };
                        setChampionsDraft(next);
                      }}
                      className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[#3B1278]/30 px-3 py-1.5 text-xs font-medium">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Champion Logo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleSaveChampion(champ, f);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleSaveChampion(champ)}
                    className="rounded-lg bg-[#3B1278] px-4 py-2 text-xs font-semibold text-white hover:bg-[#240B4C] cursor-pointer"
                  >
                    Save Champion
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 4: CONTENT & MEDIA */}
        {activeTab === 'content' && dashboard && sessionToken && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Notices & Fixtures */}
            <div className="space-y-4 rounded-xl border border-[#3B1278]/15 bg-white p-5">
              <h3 className="font-display text-lg font-bold">Add Notice or Match Fixture</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select value={noticeKind} onChange={(e) => setNoticeKind(e.target.value as 'notice' | 'fixture')} className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs">
                  <option value="notice">Announcement / Notice</option>
                  <option value="fixture">Match Fixture</option>
                </select>
                <input type="text" value={noticeVenue} onChange={(e) => setNoticeVenue(e.target.value)} placeholder="Venue (optional)" className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                <input type="text" value={noticeTitleEn} onChange={(e) => setNoticeTitleEn(e.target.value)} placeholder="Title (English)" className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                <input type="text" value={noticeTitleBn} onChange={(e) => setNoticeTitleBn(e.target.value)} placeholder="Title (Bangla)" className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                <textarea value={noticeBodyEn} onChange={(e) => setNoticeBodyEn(e.target.value)} placeholder="Content (English)" rows={2} className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs sm:col-span-2" />
                <textarea value={noticeBodyBn} onChange={(e) => setNoticeBodyBn(e.target.value)} placeholder="Content (Bangla)" rows={2} className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs sm:col-span-2" />
                <input type="datetime-local" value={noticeDate} onChange={(e) => setNoticeDate(e.target.value)} className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs sm:col-span-2" />
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await callEdgeFunction('admin-api', {
                      method: 'POST',
                      accessToken: sessionToken,
                      body: {
                        action: 'upsert_notice_fixture',
                        kind: noticeKind,
                        title_en: noticeTitleEn,
                        title_bn: noticeTitleBn,
                        body_en: noticeBodyEn,
                        body_bn: noticeBodyBn,
                        event_date: noticeDate ? `${noticeDate}:00+05:30` : null,
                        venue: noticeVenue,
                      },
                    });
                    setNoticeTitleEn(''); setNoticeTitleBn(''); setNoticeBodyEn(''); setNoticeBodyBn(''); setNoticeDate(''); setNoticeVenue('');
                    await loadDashboard(sessionToken);
                    onDataUpdated();
                    setFeedback({ type: 'ok', text: 'Published notice/fixture.' });
                  } catch (err) {
                    setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed.' });
                  }
                }}
                className="rounded-lg bg-[#3B1278] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
              >
                Publish Item
              </button>

              <div className="space-y-2 border-t pt-3">
                {dashboard.notices.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#F9F8FC] p-2.5 text-xs">
                    <span><strong>[{n.kind}]</strong> {n.title_en}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await callEdgeFunction('admin-api', { method: 'POST', accessToken: sessionToken, body: { action: 'delete_notice_fixture', id: n.id } });
                        await loadDashboard(sessionToken);
                        onDataUpdated();
                      }}
                      className="text-red-700 hover:underline cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Video Gallery & Sponsors */}
            <div className="space-y-6">
              <div className="space-y-3 rounded-xl border border-[#3B1278]/15 bg-white p-5">
                <h3 className="font-display text-lg font-bold">
                  {editingVideoId ? 'Edit Video Highlight' : 'Add YouTube or Facebook Video'}
                </h3>
                <p className="text-xs text-[#5E4B7E]">
                  Paste a valid YouTube or Facebook watch/share/reel URL (raw iframe HTML is blocked).
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="url"
                    value={videoSourceUrl}
                    onChange={(e) => setVideoSourceUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... or https://www.facebook.com/reel/..."
                    className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs sm:col-span-2"
                  />
                  <input
                    type="text"
                    value={videoCaptionEn}
                    onChange={(e) => setVideoCaptionEn(e.target.value)}
                    placeholder="Caption (English)"
                    className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs"
                  />
                  <input
                    type="text"
                    value={videoCaptionBn}
                    onChange={(e) => setVideoCaptionBn(e.target.value)}
                    placeholder="Caption (Bangla)"
                    className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs"
                  />
                  <div>
                    <label className="block text-[11px] font-semibold text-[#5E4B7E]">Display Order (1 = First)</label>
                    <input
                      type="number"
                      min={1}
                      value={videoSortOrder}
                      onChange={(e) => setVideoSortOrder(Number(e.target.value))}
                      placeholder="Order (1, 2, 3)"
                      className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 font-mono-tabular text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const parsed = parseVideoEmbed(videoSourceUrl);
                      if (!parsed) {
                        setFeedback({ type: 'err', text: 'Enter a valid YouTube or Facebook video URL (raw iframe HTML is not allowed).' });
                        return;
                      }
                      try {
                        await callEdgeFunction('admin-api', {
                          method: 'POST',
                          accessToken: sessionToken,
                          body: {
                            action: 'upsert_video',
                            id: editingVideoId,
                            source_url: parsed.externalUrl,
                            caption_en: videoCaptionEn || 'RCL Match Highlight',
                            caption_bn: videoCaptionBn || videoCaptionEn || 'আরসিএল ম্যাচ হাইলাইটস',
                            sort_order: videoSortOrder,
                            is_published: true,
                          },
                        });
                        setEditingVideoId(null);
                        setVideoSourceUrl('');
                        setVideoCaptionEn('');
                        setVideoCaptionBn('');
                        setVideoSortOrder((dashboard.videos?.length ?? 0) + 1);
                        await loadDashboard(sessionToken);
                        onDataUpdated();
                        setFeedback({ type: 'ok', text: 'Video saved to gallery.' });
                      } catch (err) {
                        setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed to save video.' });
                      }
                    }}
                    className="rounded-lg bg-[#3B1278] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                  >
                    {editingVideoId ? 'Update Video' : 'Add Video'}
                  </button>
                  {editingVideoId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingVideoId(null);
                        setVideoSourceUrl('');
                        setVideoCaptionEn('');
                        setVideoCaptionBn('');
                      }}
                      className="rounded-lg border px-3 py-2 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <div className="space-y-2 border-t pt-3">
                  {[...(dashboard.videos ?? [])]
                    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                    .map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg bg-[#F9F8FC] p-2.5 text-xs">
                      <div className="min-w-0">
                        <span className="font-mono-tabular font-bold text-[#3B1278]">#{v.sort_order}</span>{' '}
                        <span className="font-semibold uppercase">[{v.provider}]</span>{' '}
                        <span>{v.caption_en}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingVideoId(v.id);
                            setVideoSourceUrl(v.source_url);
                            setVideoCaptionEn(v.caption_en);
                            setVideoCaptionBn(v.caption_bn);
                            setVideoSortOrder(v.sort_order);
                          }}
                          className="text-[#3B1278] hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await callEdgeFunction('admin-api', { method: 'POST', accessToken: sessionToken, body: { action: 'delete_video', id: v.id } });
                            await loadDashboard(sessionToken);
                            onDataUpdated();
                          }}
                          className="text-red-700 cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-[#3B1278]/15 bg-white p-5">
                <h3 className="font-display text-lg font-bold">Add Sponsor</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input type="text" value={sponsorName} onChange={(e) => setSponsorName(e.target.value)} placeholder="Sponsor Name" className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                  <input type="url" value={sponsorUrl} onChange={(e) => setSponsorUrl(e.target.value)} placeholder="Website URL (https://...)" className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                  <input type="text" value={sponsorTierEn} onChange={(e) => setSponsorTierEn(e.target.value)} placeholder="Tier (EN)" className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                  <input type="text" value={sponsorTierBn} onChange={(e) => setSponsorTierBn(e.target.value)} placeholder="Tier (BN)" className="rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setSponsorFile(e.target.files?.[0] ?? null)} className="text-xs" />
                <button
                  type="button"
                  onClick={async () => {
                    if (!sponsorName) return;
                    try {
                      const logoPath = sponsorFile ? await uploadAdminAsset(sponsorFile, 'sponsors') : null;
                      await callEdgeFunction('admin-api', {
                        method: 'POST',
                        accessToken: sessionToken,
                        body: { action: 'add_sponsor', name: sponsorName, tier_en: sponsorTierEn, tier_bn: sponsorTierBn, website_url: sponsorUrl, logo_path: logoPath },
                      });
                      setSponsorName(''); setSponsorUrl(''); setSponsorFile(null);
                      await loadDashboard(sessionToken);
                      onDataUpdated();
                      setFeedback({ type: 'ok', text: 'Sponsor added.' });
                    } catch (err) {
                      setFeedback({ type: 'err', text: err instanceof Error ? err.message : 'Failed.' });
                    }
                  }}
                  className="rounded-lg bg-[#3B1278] px-4 py-2 text-xs font-semibold text-white cursor-pointer"
                >
                  Add Sponsor
                </button>
                <div className="space-y-1.5 border-t pt-2">
                  {dashboard.sponsors.map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <span>{s.name} ({s.tier_en})</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await callEdgeFunction('admin-api', { method: 'POST', accessToken: sessionToken, body: { action: 'delete_sponsor', id: s.id } });
                          await loadDashboard(sessionToken);
                          onDataUpdated();
                        }}
                        className="text-red-700 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SETTINGS & REGISTRATION WINDOW */}
        {activeTab === 'settings' && settingsForm && (
          <form onSubmit={handleSaveSettings} className="space-y-6 rounded-xl border border-[#3B1278]/15 bg-white p-6">
            <div>
              <h3 className="font-display text-lg font-bold">Registration Window (Asia/Kolkata)</h3>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold">Override Mode</label>
                  <select
                    value={settingsForm.registration_mode}
                    onChange={(e) => setSettingsForm({ ...settingsForm, registration_mode: e.target.value as RegistrationMode })}
                    className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs"
                  >
                    <option value="auto">Auto (Follow Dates)</option>
                    <option value="force_open">Force Open</option>
                    <option value="force_closed">Force Closed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold">Opening Date & Time (IST)</label>
                  <input
                    type="datetime-local"
                    value={settingsForm.registration_open_at}
                    onChange={(e) => setSettingsForm({ ...settingsForm, registration_open_at: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Closing Date & Time (IST, optional)</label>
                  <input
                    type="datetime-local"
                    value={settingsForm.registration_close_at}
                    onChange={(e) => setSettingsForm({ ...settingsForm, registration_close_at: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-5">
              <h3 className="font-display text-lg font-bold">Payment & Contact Details</h3>
              <p className="text-xs text-[#6B5A8E]">Changing UPI/Cash settings applies to new registrations only; historical records are preserved.</p>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold">Receiver Name</label>
                  <input type="text" value={settingsForm.upi_receiver_name} onChange={(e) => setSettingsForm({ ...settingsForm, upi_receiver_name: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">UPI ID</label>
                  <input type="text" value={settingsForm.upi_id} onChange={(e) => setSettingsForm({ ...settingsForm, upi_id: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 font-mono-tabular text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Contact Name</label>
                  <input type="text" value={settingsForm.contact_name} onChange={(e) => setSettingsForm({ ...settingsForm, contact_name: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Contact Phone</label>
                  <input type="text" value={settingsForm.contact_phone} onChange={(e) => setSettingsForm({ ...settingsForm, contact_phone: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 font-mono-tabular text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">WhatsApp Digits (91...)</label>
                  <input type="text" value={settingsForm.whatsapp_number} onChange={(e) => setSettingsForm({ ...settingsForm, whatsapp_number: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 font-mono-tabular text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Cash Instructions (EN)</label>
                  <input type="text" value={settingsForm.cash_instructions_en} onChange={(e) => setSettingsForm({ ...settingsForm, cash_instructions_en: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold">Cash Instructions (BN)</label>
                  <input type="text" value={settingsForm.cash_instructions_bn} onChange={(e) => setSettingsForm({ ...settingsForm, cash_instructions_bn: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
              </div>
            </div>

            <div className="border-t pt-5">
              <h3 className="font-display text-lg font-bold">Social Links (Leave blank for “Coming soon”)</h3>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold">WhatsApp Channel URL</label>
                  <input type="url" value={settingsForm.whatsapp_channel_url} onChange={(e) => setSettingsForm({ ...settingsForm, whatsapp_channel_url: e.target.value })} placeholder="https://whatsapp.com/channel/..." className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Facebook Page URL</label>
                  <input type="url" value={settingsForm.facebook_url} onChange={(e) => setSettingsForm({ ...settingsForm, facebook_url: e.target.value })} placeholder="https://facebook.com/..." className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Instagram URL</label>
                  <input type="url" value={settingsForm.instagram_url} onChange={(e) => setSettingsForm({ ...settingsForm, instagram_url: e.target.value })} placeholder="https://instagram.com/..." className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
              </div>
            </div>

            <div className="border-t pt-5">
              <h3 className="font-display text-lg font-bold">Bilingual About & Rules</h3>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold">About RCL (English)</label>
                  <textarea rows={4} value={settingsForm.about_en} onChange={(e) => setSettingsForm({ ...settingsForm, about_en: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">About RCL (Bangla)</label>
                  <textarea rows={4} value={settingsForm.about_bn} onChange={(e) => setSettingsForm({ ...settingsForm, about_bn: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Rules (English, one rule per line)</label>
                  <textarea rows={5} value={settingsForm.rules_en} onChange={(e) => setSettingsForm({ ...settingsForm, rules_en: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-semibold">Rules (Bangla, one rule per line)</label>
                  <textarea rows={5} value={settingsForm.rules_bn} onChange={(e) => setSettingsForm({ ...settingsForm, rules_bn: e.target.value })} className="mt-1 w-full rounded-lg border border-[#3B1278]/20 px-3 py-2 text-xs" />
                </div>
              </div>
            </div>

            <div className="border-t pt-5">
              <h3 className="font-display text-lg font-bold">Replace Logo & Hero Banner</h3>
              <div className="mt-3 flex flex-wrap gap-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#3B1278]/35 px-4 py-2 text-xs font-semibold">
                  <Upload className="h-4 w-4" />
                  <span>Upload New Website Logo</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void handleReplaceSiteAsset('logo_path', e.target.files?.[0] ?? null)} />
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#3B1278]/35 px-4 py-2 text-xs font-semibold">
                  <Upload className="h-4 w-4" />
                  <span>Upload New Hero Image</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void handleReplaceSiteAsset('hero_image_path', e.target.files?.[0] ?? null)} />
                </label>
              </div>
            </div>

            <button type="submit" className="min-h-[44px] rounded-lg bg-[#3B1278] px-6 py-2.5 text-sm font-bold text-white hover:bg-[#240B4C] cursor-pointer">
              Save All Settings
            </button>
          </form>
        )}

        {/* TAB 6: AUDIT HISTORY */}
        {activeTab === 'audit' && dashboard && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-[#3B1278]/15 bg-white p-5">
              <h3 className="font-display text-lg font-bold">Application & Payment Audit Trail</h3>
              <div className="mt-4 space-y-2.5">
                {dashboard.appHistory.map((h) => (
                  <div key={h.id} className="rounded-lg bg-[#F9F8FC] p-3 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span>{h.action} ({h.actor_type})</span>
                      <span className="tabular-nums text-[#6B5A8E]">{formatIstDateTime(h.created_at, lang)}</span>
                    </div>
                    {h.note && <p className="mt-1 text-[#4D3B6E]">{h.note}</p>}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#3B1278]/15 bg-white p-5">
              <h3 className="font-display text-lg font-bold">Settings & Teams Change Log</h3>
              <div className="mt-4 space-y-2.5">
                {dashboard.settingsAudit.map((s) => (
                  <div key={s.id} className="rounded-lg bg-[#F9F8FC] p-3 text-xs">
                    <div className="flex justify-between font-semibold">
                      <span>{s.entity_type} #{s.entity_id}</span>
                      <span className="tabular-nums text-[#6B5A8E]">{formatIstDateTime(s.created_at, lang)}</span>
                    </div>
                    <p className="mt-1 text-[#4D3B6E]">{s.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Application Inspection Modal */}
      {(selectedDetail || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6">
            {loadingDetail && !selectedDetail ? (
              <p className="text-sm font-semibold">Loading private application...</p>
            ) : selectedDetail ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4 border-b pb-4">
                  <div>
                    <p className="font-mono-tabular text-sm font-bold text-[#3B1278]">{selectedDetail.application.player_id}</p>
                    <h2 className="font-display text-2xl font-bold">{selectedDetail.application.player_name}</h2>
                    <p className="text-xs text-[#6B5A8E]">
                      Submitted {formatIstDateTime(selectedDetail.application.created_at, lang)} · Revision #{selectedDetail.application.revision_count}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDetail(null)}
                    className="rounded-lg border px-3 py-1.5 text-xs font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                {/* Private Uploads */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border p-3">
                    <p className="mb-2 text-xs font-semibold text-[#6B5A8E]">Player Photo (Private)</p>
                    {selectedDetail.photo_signed_url ? (
                      <img src={selectedDetail.photo_signed_url} alt="Player" className="max-h-60 w-full rounded-lg object-contain bg-[#F9F8FC]" />
                    ) : (
                      <p className="text-xs text-[#6B5A8E]">No photo preview available.</p>
                    )}
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="mb-2 text-xs font-semibold text-[#6B5A8E]">Payment Screenshot (Private)</p>
                    {selectedDetail.screenshot_signed_url ? (
                      <img src={selectedDetail.screenshot_signed_url} alt="Payment screenshot" className="max-h-60 w-full rounded-lg object-contain bg-[#F9F8FC]" />
                    ) : (
                      <p className="text-xs text-[#6B5A8E]">No screenshot ({selectedDetail.application.payment_method}).</p>
                    )}
                  </div>
                </div>

                {/* Payment Verification & Application Review */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-xl border p-4">
                    <h3 className="font-display text-base font-bold">
                      1. Payment Verification ({selectedDetail.application.payment_status})
                    </h3>
                    <p className="text-xs text-[#4D3B6E]">
                      Method: {selectedDetail.application.payment_method} · Amount: ₹{selectedDetail.application.payment_amount}
                      {selectedDetail.application.transaction_id ? ` · UTR: ${selectedDetail.application.transaction_id}` : ''}
                    </p>
                    <input
                      type="text"
                      value={paymentNoteInput}
                      onChange={(e) => setPaymentNoteInput(e.target.value)}
                      placeholder="Verification note (optional)"
                      className="w-full rounded-lg border px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void handleVerifyPayment('verified')} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white cursor-pointer">
                        Verify Payment
                      </button>
                      <button type="button" onClick={() => void handleVerifyPayment('rejected')} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white cursor-pointer">
                        Reject Payment
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border p-4">
                    <h3 className="font-display text-base font-bold">
                      2. Application Review ({selectedDetail.application.application_status})
                    </h3>
                    <textarea
                      rows={2}
                      value={rejectReasonInput}
                      onChange={(e) => setRejectReasonInput(e.target.value)}
                      placeholder="Rejection reason (required if rejecting)"
                      className="w-full rounded-lg border px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={selectedDetail.application.payment_status !== 'verified'}
                        onClick={() => void handleReviewApplication('approved')}
                        className="rounded-lg bg-[#3B1278] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 cursor-pointer"
                      >
                        Approve Player
                      </button>
                      <button type="button" onClick={() => void handleReviewApplication('rejected')} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white cursor-pointer">
                        Reject Application
                      </button>
                    </div>
                    {selectedDetail.application.payment_status !== 'verified' && (
                      <p className="text-[11px] text-amber-800">Payment must be verified before approving.</p>
                    )}

                    <div className="border-t pt-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleClosedCorrection(!selectedDetail.application.allow_closed_correction)}
                        className="rounded-lg border border-[#3B1278]/30 px-3 py-1.5 text-xs font-semibold text-[#240B4C] cursor-pointer"
                      >
                        {selectedDetail.application.allow_closed_correction
                          ? 'Revoke Closed-Window Correction Permission'
                          : 'Grant Closed-Window Correction Permission'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Edit Player Details (with audit note) */}
                <form onSubmit={handleEditApplication} className="space-y-3 rounded-xl border p-4">
                  <h3 className="font-display text-base font-bold">Edit Player Details (Audited)</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <input type="text" value={editPlayerName} onChange={(e) => setEditPlayerName(e.target.value)} placeholder="Name" className="rounded-lg border px-3 py-2 text-xs" />
                    <select value={editPlayerRole} onChange={(e) => setEditPlayerRole(e.target.value as PlayerRole)} className="rounded-lg border px-3 py-2 text-xs">
                      {ALLOWED_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input type="text" value={editMobile} onChange={(e) => setEditMobile(e.target.value)} placeholder="Mobile" className="rounded-lg border px-3 py-2 font-mono-tabular text-xs" />
                    <input type="text" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Address" className="rounded-lg border px-3 py-2 text-xs sm:col-span-2" />
                    <select value={editBasePrice} onChange={(e) => setEditBasePrice(Number(e.target.value) as BasePrice)} className="rounded-lg border px-3 py-2 text-xs">
                      <option value={20}>₹20</option>
                      <option value={30}>₹30</option>
                    </select>
                    <select value={editPayMethod} onChange={(e) => setEditPayMethod(e.target.value as PaymentMethod)} className="rounded-lg border px-3 py-2 text-xs">
                      <option value="UPI">UPI</option>
                      <option value="Cash">Cash</option>
                    </select>
                    <input type="text" value={editUtr} onChange={(e) => setEditUtr(e.target.value)} placeholder="UTR / Txn ID" className="rounded-lg border px-3 py-2 text-xs" />
                    <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Internal Notes" className="rounded-lg border px-3 py-2 text-xs" />
                    <input type="text" value={editAuditNote} onChange={(e) => setEditAuditNote(e.target.value)} placeholder="Reason for admin edit" className="rounded-lg border px-3 py-2 text-xs sm:col-span-3" />
                  </div>
                  <button type="submit" className="rounded-lg bg-[#240B4C] px-4 py-2 text-xs font-semibold text-white cursor-pointer">
                    Save Audited Changes
                  </button>
                </form>

                {/* Application History */}
                <div className="rounded-xl border p-4">
                  <h3 className="font-display text-sm font-bold">Application Review & Correction History</h3>
                  <div className="mt-2 space-y-2">
                    {selectedDetail.history.map((h) => (
                      <div key={h.id} className="rounded bg-[#F9F8FC] p-2.5 text-xs">
                        <strong>{h.action}</strong> ({h.actor_type}) · {formatIstDateTime(h.created_at, lang)}
                        {h.note ? ` — ${h.note}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
