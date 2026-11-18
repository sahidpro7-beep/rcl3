import { useState, type FormEvent } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, ImagePlus, Search } from 'lucide-react';
import { callEdgeFunction, isSupabaseConfigured } from '../lib/supabase';
import { getApplicationStatusTextClass, getPaymentStatusTextClass, TRANSLATIONS } from '../lib/i18n';
import {
  ALLOWED_BASE_PRICES,
  ALLOWED_ROLES,
  isValidIndianMobile,
  isValidPlayerId,
  normalizePlayerIdInput,
  validateImageFileClient,
} from '../lib/validation';
import type {
  ApplicationSummary,
  BasePrice,
  Language,
  PaymentMethod,
  PlayerRole,
  PublicSettings,
} from '../types/rcl';

interface StatusCheckSectionProps {
  lang: Language;
  settings: PublicSettings;
  onBackHome: () => void;
}

interface LookupResponse {
  application: ApplicationSummary;
  is_registration_open: boolean;
  can_resubmit: boolean;
}

export function StatusCheckSection({ lang, settings, onBackHome }: StatusCheckSectionProps) {
  const t = TRANSLATIONS[lang];
  const st = t.statusCheck;
  const reg = t.registration;

  const [lookupId, setLookupId] = useState('');
  const [lookupMobile, setLookupMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResponse | null>(null);

  // Correction fields for rejected applications
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<PlayerRole>('Batsman');
  const [editAddress, setEditAddress] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editBasePrice, setEditBasePrice] = useState<BasePrice>(20);
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('UPI');
  const [editTransactionId, setEditTransactionId] = useState('');
  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [newScreenshotFile, setNewScreenshotFile] = useState<File | null>(null);

  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const [resubmitSuccess, setResubmitSuccess] = useState(false);

  const hydrateCorrectionForm = (app: ApplicationSummary) => {
    setEditName(app.player_name);
    setEditRole((app.player_role as PlayerRole) ?? 'Batsman');
    setEditAddress(app.address ?? '');
    setEditMobile(app.mobile_number ?? lookupMobile);
    setEditBasePrice((app.base_price as BasePrice) ?? 20);
    setEditPaymentMethod((app.payment_method as PaymentMethod) ?? 'UPI');
    setEditTransactionId(app.transaction_id ?? '');
    setNewPhotoFile(null);
    setNewScreenshotFile(null);
    setResubmitError(null);
    setResubmitSuccess(false);
  };

  const handleLookup = async (e: FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setResult(null);
    setResubmitSuccess(false);

    if (!isSupabaseConfigured) {
      setLookupError(reg.setupRequiredNotice);
      return;
    }

    const normalizedId = normalizePlayerIdInput(lookupId);
    const cleanedMobile = lookupMobile.trim();

    if (!isValidPlayerId(normalizedId) || !isValidIndianMobile(cleanedMobile)) {
      setLookupError(
        lang === 'bn'
          ? 'সঠিক প্লেয়ার আইডি (যেমন RCL27-0001) এবং ১০-অঙ্কের মোবাইল নম্বর দিন।'
          : 'Please enter a valid Player ID (e.g. RCL27-0001) and 10-digit mobile number.',
      );
      return;
    }

    setLoading(true);
    try {
      const data = await callEdgeFunction<LookupResponse>('check-status', {
        method: 'POST',
        body: { player_id: normalizedId, mobile_number: cleanedMobile },
      });
      setResult(data);
      hydrateCorrectionForm(data.application);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const uploadOptionalFile = async (file: File, purpose: 'player_photo' | 'payment_screenshot') => {
    const fd = new FormData();
    fd.append('purpose', purpose);
    fd.append('file', file);
    const res = await callEdgeFunction<{ upload_token: string }>('upload-media', {
      method: 'POST',
      formData: fd,
    });
    return res.upload_token;
  };

  const handleResubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!result) return;
    setResubmitError(null);
    setResubmitSuccess(false);

    if (editName.trim().length < 2) {
      setResubmitError(reg.errors.nameRequired);
      return;
    }
    if (editAddress.trim().length < 3) {
      setResubmitError(reg.errors.addressRequired);
      return;
    }
    if (!isValidIndianMobile(editMobile)) {
      setResubmitError(reg.errors.mobileInvalid);
      return;
    }

    setResubmitting(true);
    try {
      let photoToken: string | null = null;
      if (newPhotoFile) {
        photoToken = await uploadOptionalFile(newPhotoFile, 'player_photo');
      }
      let ssToken: string | null = null;
      if (editPaymentMethod === 'UPI' && newScreenshotFile) {
        ssToken = await uploadOptionalFile(newScreenshotFile, 'payment_screenshot');
      }

      const res = await callEdgeFunction<{ application: ApplicationSummary }>('resubmit-application', {
        method: 'POST',
        body: {
          player_id: result.application.player_id,
          current_mobile_number: result.application.mobile_number ?? lookupMobile.trim(),
          player_name: editName.trim(),
          player_role: editRole,
          address: editAddress.trim(),
          mobile_number: editMobile.trim(),
          base_price: editBasePrice,
          payment_method: editPaymentMethod,
          transaction_id: editPaymentMethod === 'UPI' ? editTransactionId.trim() || null : null,
          photo_upload_token: photoToken,
          screenshot_upload_token: ssToken,
        },
      });

      setLookupMobile(editMobile.trim());
      setResult({
        application: res.application,
        is_registration_open: result.is_registration_open,
        can_resubmit: false,
      });
      setResubmitSuccess(true);
    } catch (err) {
      setResubmitError(err instanceof Error ? err.message : 'Resubmission failed.');
    } finally {
      setResubmitting(false);
    }
  };

  return (
    <section className="py-10 sm:py-14">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
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

        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B00]">{st.subheading}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#180D2B] sm:text-4xl">{st.heading}</h1>
          <p className="mt-2 text-sm text-[#4D3B6E]">{st.description}</p>
        </div>

        <form onSubmit={handleLookup} className="grid grid-cols-1 gap-4 rounded-2xl border border-[#3B1278]/15 bg-white p-5 sm:grid-cols-3 sm:items-end sm:p-6">
          <div>
            <label htmlFor="status-player-id" className="block text-sm font-semibold text-[#180D2B]">
              {st.playerIdLabel}
            </label>
            <input
              id="status-player-id"
              type="text"
              value={lookupId}
              onChange={(e) => setLookupId(normalizePlayerIdInput(e.target.value))}
              placeholder={st.playerIdPlaceholder}
              className="mt-1.5 w-full rounded-lg border border-[#3B1278]/20 bg-[#F9F8FC] px-3.5 py-2.5 font-mono-tabular text-sm text-[#180D2B] focus:border-[#3B1278] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="status-mobile" className="block text-sm font-semibold text-[#180D2B]">
              {st.mobileLabel}
            </label>
            <input
              id="status-mobile"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={lookupMobile}
              onChange={(e) => setLookupMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder={st.mobilePlaceholder}
              className="mt-1.5 w-full rounded-lg border border-[#3B1278]/20 bg-[#F9F8FC] px-3.5 py-2.5 font-mono-tabular text-sm text-[#180D2B] focus:border-[#3B1278] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#3B1278] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#240B4C] disabled:opacity-60 cursor-pointer"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>{loading ? st.lookingUp : st.lookupBtn}</span>
          </button>
        </form>

        {lookupError && (
          <div role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <span>{lookupError}</span>
          </div>
        )}

        {resubmitSuccess && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <span>{st.resubmitSuccess}</span>
          </div>
        )}

        {result && (
          <div className="mt-6 space-y-6 rounded-2xl border border-[#3B1278]/20 bg-white p-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.playerId}</p>
                <p className="mt-0.5 font-mono-tabular text-lg font-bold text-[#3B1278]">{result.application.player_id}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.playerName}</p>
                <p className="mt-0.5 text-base font-semibold text-[#180D2B]">{result.application.player_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.basePrice} / {reg.summaryLabels.paymentMethod}</p>
                <p className="mt-0.5 tabular-nums text-base font-semibold text-[#180D2B]">
                  ₹{result.application.base_price} · {result.application.payment_method}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 border-t border-[#3B1278]/10 pt-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.appStatus}</p>
                <p className={`mt-1 text-base font-bold ${getApplicationStatusTextClass(result.application.application_status)}`}>
                  {st.statuses[result.application.application_status]}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.payStatus}</p>
                <p className={`mt-1 text-base font-bold ${getPaymentStatusTextClass(result.application.payment_status)}`}>
                  {st.paymentStatuses[result.application.payment_status]}
                </p>
              </div>
            </div>

            {result.application.application_status === 'rejected' && (
              <div className="space-y-4 border-t border-[#3B1278]/10 pt-4">
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                    {st.rejectionReasonTitle}
                  </p>
                  <p className="mt-1 text-sm font-medium text-red-950">
                    {result.application.rejection_reason}
                  </p>
                </div>

                {!result.can_resubmit ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    {st.closedPermissionRequired}
                  </div>
                ) : (
                  <form onSubmit={handleResubmit} className="space-y-4 rounded-xl border border-[#3B1278]/15 bg-[#F9F8FC] p-5">
                    <h3 className="font-display text-lg font-bold text-[#180D2B]">{st.correctHeading}</h3>
                    <p className="text-xs text-[#4D3B6E]">{st.correctNote}</p>

                    {!result.is_registration_open && result.application.allow_closed_correction && (
                      <p className="rounded-lg bg-emerald-50 p-3 text-xs font-medium text-emerald-900">
                        {st.closedPermissionGranted}
                      </p>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="edit-name" className="block text-xs font-semibold text-[#180D2B]">
                          {reg.fields.playerName}
                        </label>
                        <input
                          id="edit-name"
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#3B1278]/20 bg-white px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <label htmlFor="edit-mobile" className="block text-xs font-semibold text-[#180D2B]">
                          {reg.fields.mobile}
                        </label>
                        <input
                          id="edit-mobile"
                          type="tel"
                          maxLength={10}
                          value={editMobile}
                          onChange={(e) => setEditMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className="mt-1 w-full rounded-lg border border-[#3B1278]/20 bg-white px-3 py-2 font-mono-tabular text-sm"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor="edit-address" className="block text-xs font-semibold text-[#180D2B]">
                          {reg.fields.address}
                        </label>
                        <input
                          id="edit-address"
                          type="text"
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#3B1278]/20 bg-white px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <span className="block text-xs font-semibold text-[#180D2B]">{reg.fields.playerRole}</span>
                        <div className="mt-1 grid grid-cols-3 gap-1.5">
                          {ALLOWED_ROLES.map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => setEditRole(r)}
                              className={`min-h-[40px] rounded-lg border px-2 text-xs font-semibold cursor-pointer ${
                                editRole === r ? 'border-[#3B1278] bg-[#3B1278] text-white' : 'border-[#3B1278]/20 bg-white'
                              }`}
                            >
                              {reg.roles[r]}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="block text-xs font-semibold text-[#180D2B]">{reg.fields.basePrice}</span>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          {ALLOWED_BASE_PRICES.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setEditBasePrice(p)}
                              className={`min-h-[40px] rounded-lg border font-bold tabular-nums cursor-pointer ${
                                editBasePrice === p
                                  ? 'border-[#D49B00] bg-[#240B4C] text-[#FACC15]'
                                  : 'border-[#3B1278]/20 bg-white'
                              }`}
                            >
                              ₹{p}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <span className="block text-xs font-semibold text-[#180D2B]">{reg.fields.paymentMethod}</span>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          {(['UPI', 'Cash'] as const).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setEditPaymentMethod(m)}
                              className={`min-h-[40px] rounded-lg border text-xs font-semibold cursor-pointer ${
                                editPaymentMethod === m ? 'border-[#3B1278] bg-[#3B1278] text-white' : 'border-[#3B1278]/20 bg-white'
                              }`}
                            >
                              {reg.paymentMethods[m]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {editPaymentMethod === 'UPI' && (
                        <div>
                          <label htmlFor="edit-utr" className="block text-xs font-semibold text-[#180D2B]">
                            {reg.fields.transactionId}
                          </label>
                          <input
                            id="edit-utr"
                            type="text"
                            value={editTransactionId}
                            onChange={(e) => setEditTransactionId(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[#3B1278]/20 bg-white px-3 py-2 font-mono-tabular text-sm"
                          />
                        </div>
                      )}

                      <div>
                        <label htmlFor="edit-photo" className="block text-xs font-semibold text-[#180D2B]">
                          {reg.fields.photo}
                        </label>
                        <label
                          htmlFor="edit-photo"
                          className="mt-1 inline-flex min-h-[40px] w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#3B1278]/30 bg-white px-3 py-2 text-xs font-medium"
                        >
                          <ImagePlus className="h-4 w-4 text-[#3B1278]" />
                          <span className="truncate">{newPhotoFile ? newPhotoFile.name : 'Keep existing or upload new photo'}</span>
                          <input
                            id="edit-photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            onChange={async (e) => {
                              const f = e.target.files?.[0] ?? null;
                              if (!f) return setNewPhotoFile(null);
                              const chk = await validateImageFileClient(f);
                              if (!chk.valid) {
                                setResubmitError(chk.reason === 'size' ? reg.errors.fileTooLarge : reg.errors.invalidFileType);
                                return;
                              }
                              setNewPhotoFile(f);
                            }}
                          />
                        </label>
                      </div>

                      {editPaymentMethod === 'UPI' && (
                        <div>
                          <label htmlFor="edit-ss" className="block text-xs font-semibold text-[#180D2B]">
                            {reg.fields.paymentScreenshot}
                          </label>
                          <label
                            htmlFor="edit-ss"
                            className="mt-1 inline-flex min-h-[40px] w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#3B1278]/30 bg-white px-3 py-2 text-xs font-medium"
                          >
                            <ImagePlus className="h-4 w-4 text-[#3B1278]" />
                            <span className="truncate">
                              {newScreenshotFile ? newScreenshotFile.name : `UPI: ${settings.upi_id} — replace screenshot`}
                            </span>
                            <input
                              id="edit-ss"
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="sr-only"
                              onChange={async (e) => {
                                const f = e.target.files?.[0] ?? null;
                                if (!f) return setNewScreenshotFile(null);
                                const chk = await validateImageFileClient(f);
                                if (!chk.valid) {
                                  setResubmitError(chk.reason === 'size' ? reg.errors.fileTooLarge : reg.errors.invalidFileType);
                                  return;
                                }
                                setNewScreenshotFile(f);
                              }}
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {resubmitError && (
                      <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-medium text-red-900">
                        {resubmitError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={resubmitting}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#3B1278] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#240B4C] disabled:opacity-60 cursor-pointer"
                    >
                      {resubmitting ? st.resubmitting : st.saveResubmitBtn}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
