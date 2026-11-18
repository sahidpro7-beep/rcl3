import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  MessageCircle,
  Phone,
  Printer,
  ShieldCheck,
} from 'lucide-react';
import { callEdgeFunction, isSupabaseConfigured } from '../lib/supabase';
import { getApplicationStatusTextClass, getPaymentStatusTextClass, TRANSLATIONS } from '../lib/i18n';
import {
  ALLOWED_BASE_PRICES,
  ALLOWED_ROLES,
  buildUpiPaymentUri,
  buildWhatsAppUrl,
  isValidIndianMobile,
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

interface RegistrationSectionProps {
  lang: Language;
  settings: PublicSettings;
  onBackHome: () => void;
}

export function RegistrationSection({ lang, settings, onBackHome }: RegistrationSectionProps) {
  const t = TRANSLATIONS[lang];
  const reg = t.registration;

  const [playerName, setPlayerName] = useState('');
  const [playerRole, setPlayerRole] = useState<PlayerRole>('Batsman');
  const [address, setAddress] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [basePrice, setBasePrice] = useState<BasePrice>(20);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [transactionId, setTransactionId] = useState('');
  const [publicConsent, setPublicConsent] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploadToken, setPhotoUploadToken] = useState<string | null>(null);

  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotUploadToken, setScreenshotUploadToken] = useState<string | null>(null);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [submittingPhase, setSubmittingPhase] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [upiCopied, setUpiCopied] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const [submittedApp, setSubmittedApp] = useState<ApplicationSummary | null>(null);

  const handlePhotoChange = async (file: File | null) => {
    setErrorMsg(null);
    setPhotoUploadToken(null);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    const check = await validateImageFileClient(file);
    if (!check.valid) {
      setErrorMsg(check.reason === 'size' ? reg.errors.fileTooLarge : reg.errors.invalidFileType);
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleScreenshotChange = async (file: File | null) => {
    setErrorMsg(null);
    setScreenshotUploadToken(null);
    if (!file) {
      setScreenshotFile(null);
      setScreenshotPreview(null);
      return;
    }
    const check = await validateImageFileClient(file);
    if (!check.valid) {
      setErrorMsg(check.reason === 'size' ? reg.errors.fileTooLarge : reg.errors.invalidFileType);
      return;
    }
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const handleCopyUpi = async () => {
    try {
      await navigator.clipboard.writeText(settings.upi_id);
      setUpiCopied(true);
      window.setTimeout(() => setUpiCopied(false), 2000);
    } catch {
      // Clipboard blocked
    }
  };

  const uploadSingleMedia = async (file: File, purpose: 'player_photo' | 'payment_screenshot') => {
    const fd = new FormData();
    fd.append('purpose', purpose);
    fd.append('file', file);
    const res = await callEdgeFunction<{ upload_token: string }>('upload-media', {
      method: 'POST',
      formData: fd,
    });
    return res.upload_token;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!isSupabaseConfigured) {
      setErrorMsg(reg.errors.setupRequired);
      return;
    }

    if (!settings.is_registration_open) {
      setErrorMsg(reg.errors.windowClosed);
      return;
    }

    if (playerName.trim().length < 2) {
      setErrorMsg(reg.errors.nameRequired);
      return;
    }
    if (!ALLOWED_ROLES.includes(playerRole)) {
      setErrorMsg(reg.errors.roleRequired);
      return;
    }
    if (address.trim().length < 3) {
      setErrorMsg(reg.errors.addressRequired);
      return;
    }
    if (!isValidIndianMobile(mobileNumber)) {
      setErrorMsg(reg.errors.mobileInvalid);
      return;
    }
    if (!photoFile && !photoUploadToken) {
      setErrorMsg(reg.errors.photoRequired);
      return;
    }
    if (paymentMethod === 'UPI' && !screenshotFile && !screenshotUploadToken) {
      setErrorMsg(reg.errors.screenshotRequired);
      return;
    }
    if (!publicConsent) {
      setErrorMsg(reg.errors.consentRequired);
      return;
    }

    try {
      let nextPhotoToken = photoUploadToken;
      if (!nextPhotoToken && photoFile) {
        setSubmittingPhase(reg.uploadingPhoto);
        nextPhotoToken = await uploadSingleMedia(photoFile, 'player_photo');
        setPhotoUploadToken(nextPhotoToken);
      }

      let nextScreenshotToken = screenshotUploadToken;
      if (paymentMethod === 'UPI' && !nextScreenshotToken && screenshotFile) {
        setSubmittingPhase(reg.uploadingScreenshot);
        nextScreenshotToken = await uploadSingleMedia(screenshotFile, 'payment_screenshot');
        setScreenshotUploadToken(nextScreenshotToken);
      }

      setSubmittingPhase(reg.submitting);
      const res = await callEdgeFunction<{ application: ApplicationSummary }>('register-player', {
        method: 'POST',
        body: {
          idempotency_key: idempotencyKey,
          player_name: playerName.trim(),
          player_role: playerRole,
          address: address.trim(),
          mobile_number: mobileNumber.trim(),
          base_price: basePrice,
          payment_method: paymentMethod,
          transaction_id: paymentMethod === 'UPI' ? transactionId.trim() || null : null,
          photo_upload_token: nextPhotoToken,
          screenshot_upload_token: paymentMethod === 'UPI' ? nextScreenshotToken : null,
          public_consent_accepted: true,
        },
      });

      setSubmittedApp(res.application);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit registration.');
    } finally {
      setSubmittingPhase(null);
    }
  };

  const handleResetForNewPlayer = () => {
    setSubmittedApp(null);
    setPlayerName('');
    setPlayerRole('Batsman');
    setAddress('');
    setMobileNumber('');
    setBasePrice(20);
    setPaymentMethod('UPI');
    setTransactionId('');
    setPublicConsent(false);
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoUploadToken(null);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setScreenshotUploadToken(null);
    setIdempotencyKey(crypto.randomUUID());
    setErrorMsg(null);
  };

  const upiUri = buildUpiPaymentUri({
    upiId: settings.upi_id,
    receiverName: settings.upi_receiver_name,
    amount: basePrice,
    note: 'RCL 2027 Season 3 Registration',
  });

  const preSubmitWhatsappUrl = buildWhatsAppUrl(
    settings.whatsapp_number,
    `Hello ${settings.contact_name}, I am paying ₹${basePrice} via UPI (${settings.upi_id}) for RCL 2027 Player Registration (${playerName || 'Player'}). I am attaching my payment screenshot here.`,
  );

  const cashWhatsappUrl = buildWhatsAppUrl(
    settings.whatsapp_number,
    `Hello ${settings.contact_name}, I want to pay ₹${basePrice} in cash for RCL 2027 Season 3 player registration (${playerName || 'Player'}).`,
  );

  const buildSummaryText = (app: ApplicationSummary) =>
    [
      `RCL 2027 — Raghunathpur Cricket League (Season 3)`,
      `${reg.summaryLabels.playerId}: ${app.player_id}`,
      `${reg.summaryLabels.playerName}: ${app.player_name}`,
      `${reg.summaryLabels.basePrice}: ₹${app.base_price}`,
      `${reg.summaryLabels.paymentMethod}: ${app.payment_method}`,
      `${reg.summaryLabels.amount}: ₹${app.payment_amount}`,
      `${reg.summaryLabels.appStatus}: ${t.statusCheck.statuses[app.application_status]}`,
      `${reg.summaryLabels.payStatus}: ${t.statusCheck.paymentStatuses[app.payment_status]}`,
    ].join('\n');

  const handleCopySummary = async () => {
    if (!submittedApp) return;
    try {
      await navigator.clipboard.writeText(buildSummaryText(submittedApp));
      setSummaryCopied(true);
      window.setTimeout(() => setSummaryCopied(false), 2000);
    } catch {
      // Ignore
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
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B00]">{reg.subheading}</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-[#180D2B] sm:text-4xl">{reg.heading}</h1>
          <div className="mt-4 cricket-seam-rule w-28" />
        </div>

        {/* Fee Clarity & Multi-Mobile Policy */}
        <div className="mb-8 rounded-xl border border-[#D49B00]/35 bg-[#FFFDF5] p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9A6B00]" aria-hidden="true" />
            <div className="space-y-1.5 text-sm text-[#3D2E5C]">
              <p className="font-semibold text-[#180D2B]">{reg.feeClarityTitle}</p>
              <p>{reg.feeClarityBody}</p>
              <p className="text-xs text-[#5E4B7E]">{reg.multiMobileNote}</p>
            </div>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
              <div>
                <p className="font-semibold">{t.setupBanner.title}</p>
                <p className="mt-1">{reg.setupRequiredNotice}</p>
              </div>
            </div>
          </div>
        )}

        {!settings.is_registration_open && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-6 text-red-950">
            <h3 className="font-display text-lg font-bold">{reg.closedNoticeTitle}</h3>
            <p className="mt-1.5 text-sm">{reg.closedNoticeBody}</p>
          </div>
        )}

        {submittedApp ? (
          <div className="print-only-card rounded-2xl border border-[#3B1278]/20 bg-[#F9F8FC] p-6 sm:p-8">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-700" aria-hidden="true" />
              <div>
                <h3 className="font-display text-2xl font-bold text-[#180D2B]">{reg.successTitle}</h3>
                <p className="mt-1 text-sm text-[#4D3B6E]">{reg.successSubtitle}</p>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-[#3B1278]/12 bg-white p-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.playerId}</dt>
                <dd className="mt-0.5 font-mono-tabular text-xl font-bold text-[#3B1278]">{submittedApp.player_id}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.playerName}</dt>
                <dd className="mt-0.5 text-base font-semibold text-[#180D2B]">{submittedApp.player_name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.basePrice}</dt>
                <dd className="mt-0.5 tabular-nums text-base font-semibold text-[#180D2B]">₹{submittedApp.base_price}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.paymentMethod}</dt>
                <dd className="mt-0.5 text-base font-semibold text-[#180D2B]">{submittedApp.payment_method}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.amount}</dt>
                <dd className="mt-0.5 tabular-nums text-base font-semibold text-[#180D2B]">₹{submittedApp.payment_amount}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[#6B5A8E]">{reg.summaryLabels.appStatus}</dt>
                <dd className="mt-0.5 text-sm font-bold">
                  <span className={getApplicationStatusTextClass(submittedApp.application_status)}>
                    {t.statusCheck.statuses[submittedApp.application_status]}
                  </span>
                  <span className="text-[#6B5A8E]">{' · '}</span>
                  <span className={getPaymentStatusTextClass(submittedApp.payment_status)}>
                    {t.statusCheck.paymentStatuses[submittedApp.payment_status]}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="no-print mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleCopySummary}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#3B1278]/25 bg-white px-4 py-2 text-sm font-semibold text-[#240B4C] hover:bg-[#EFEAF8] cursor-pointer"
              >
                {summaryCopied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
                <span>{summaryCopied ? reg.summaryCopied : reg.copySummary}</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#3B1278]/25 bg-white px-4 py-2 text-sm font-semibold text-[#240B4C] hover:bg-[#EFEAF8] cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>{reg.printSummary}</span>
              </button>

              <a
                href={buildWhatsAppUrl(
                  settings.whatsapp_number,
                  `RCL 2027 Registration Submitted\nPlayer ID: ${submittedApp.player_id}\nPlayer Name: ${submittedApp.player_name}\nSelected Amount: ₹${submittedApp.payment_amount} (${submittedApp.payment_method})`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                <MessageCircle className="h-4 w-4" />
                <span>{reg.whatsappAfterSubmit}</span>
              </a>

              <button
                type="button"
                onClick={handleResetForNewPlayer}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-[#3B1278] px-4 py-2 text-sm font-semibold text-white hover:bg-[#240B4C] cursor-pointer"
              >
                {reg.registerAnother}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-[#3B1278]/15 bg-[#F9F8FC] p-5 sm:p-8" noValidate>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="reg-player-name" className="block text-sm font-semibold text-[#180D2B]">
                  {reg.fields.playerName} <span className="text-red-600">*</span>
                </label>
                <input
                  id="reg-player-name"
                  type="text"
                  required
                  maxLength={100}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder={reg.fields.playerNamePlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-[#3B1278]/20 bg-white px-3.5 py-2.5 text-sm text-[#180D2B] focus:border-[#3B1278] focus:outline-none focus:ring-2 focus:ring-[#3B1278]/20"
                />
              </div>

              <div>
                <span className="block text-sm font-semibold text-[#180D2B]">
                  {reg.fields.playerRole} <span className="text-red-600">*</span>
                </span>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {ALLOWED_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setPlayerRole(role)}
                      className={`min-h-[44px] rounded-lg border px-2 py-2 text-xs font-semibold transition-colors cursor-pointer sm:text-sm ${
                        playerRole === role
                          ? 'border-[#3B1278] bg-[#3B1278] text-white'
                          : 'border-[#3B1278]/20 bg-white text-[#240B4C] hover:bg-[#EFEAF8]'
                      }`}
                    >
                      {reg.roles[role]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="reg-mobile" className="block text-sm font-semibold text-[#180D2B]">
                  {reg.fields.mobile} <span className="text-red-600">*</span>
                </label>
                <input
                  id="reg-mobile"
                  type="tel"
                  inputMode="numeric"
                  required
                  maxLength={10}
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder={reg.fields.mobilePlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-[#3B1278]/20 bg-white px-3.5 py-2.5 font-mono-tabular text-sm text-[#180D2B] focus:border-[#3B1278] focus:outline-none focus:ring-2 focus:ring-[#3B1278]/20"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="reg-address" className="block text-sm font-semibold text-[#180D2B]">
                  {reg.fields.address} <span className="text-red-600">*</span>
                </label>
                <input
                  id="reg-address"
                  type="text"
                  required
                  maxLength={220}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={reg.fields.addressPlaceholder}
                  className="mt-1.5 w-full rounded-lg border border-[#3B1278]/20 bg-white px-3.5 py-2.5 text-sm text-[#180D2B] focus:border-[#3B1278] focus:outline-none focus:ring-2 focus:ring-[#3B1278]/20"
                />
              </div>

              {/* Player Photo Upload */}
              <div className="sm:col-span-2">
                <label htmlFor="reg-photo" className="block text-sm font-semibold text-[#180D2B]">
                  {reg.fields.photo} <span className="text-red-600">*</span>
                </label>
                <p className="mt-0.5 text-xs text-[#5E4B7E]">{reg.fields.photoHint}</p>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <label
                    htmlFor="reg-photo"
                    className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#3B1278]/35 bg-white px-4 py-2.5 text-sm font-medium text-[#240B4C] hover:bg-[#EFEAF8]"
                  >
                    <ImagePlus className="h-4 w-4 text-[#3B1278]" aria-hidden="true" />
                    <span>{photoFile ? photoFile.name : reg.fields.photo}</span>
                    <input
                      id="reg-photo"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={(e) => void handlePhotoChange(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {photoPreview && (
                    <img
                      src={photoPreview}
                      alt="Player preview"
                      className="h-16 w-16 rounded-lg border border-[#3B1278]/20 object-cover"
                    />
                  )}
                </div>
              </div>

              {/* Base Price Selection */}
              <div>
                <span className="block text-sm font-semibold text-[#180D2B]">
                  {reg.fields.basePrice} <span className="text-red-600">*</span>
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  {ALLOWED_BASE_PRICES.map((price) => (
                    <button
                      key={price}
                      type="button"
                      onClick={() => setBasePrice(price)}
                      className={`min-h-[48px] rounded-lg border px-4 py-2 text-base font-bold tabular-nums transition-colors cursor-pointer ${
                        basePrice === price
                          ? 'border-[#D49B00] bg-[#240B4C] text-[#FACC15]'
                          : 'border-[#3B1278]/20 bg-white text-[#240B4C] hover:bg-[#EFEAF8]'
                      }`}
                    >
                      ₹{price}
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <span className="block text-sm font-semibold text-[#180D2B]">
                  {reg.fields.paymentMethod} <span className="text-red-600">*</span>
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-3">
                  {(['UPI', 'Cash'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`min-h-[48px] rounded-lg border px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${
                        paymentMethod === method
                          ? 'border-[#3B1278] bg-[#3B1278] text-white'
                          : 'border-[#3B1278]/20 bg-white text-[#240B4C] hover:bg-[#EFEAF8]'
                      }`}
                    >
                      {reg.paymentMethods[method]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Dynamic Payment Panel: UPI vs Cash */}
            {paymentMethod === 'UPI' ? (
              <div className="space-y-4 rounded-xl border border-[#3B1278]/20 bg-white p-5">
                <h3 className="font-display text-lg font-bold text-[#180D2B]">{reg.upiPanel.title}</h3>

                <div className="grid grid-cols-1 gap-3 rounded-lg bg-[#F9F8FC] p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-[#6B5A8E]">{reg.upiPanel.receiverLabel}</p>
                    <p className="font-semibold text-[#180D2B]">{settings.upi_receiver_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6B5A8E]">{reg.upiPanel.upiIdLabel}</p>
                    <p className="font-mono-tabular font-bold text-[#3B1278]">{settings.upi_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6B5A8E]">{reg.upiPanel.amountLabel}</p>
                    <p className="font-mono-tabular text-lg font-bold text-[#180D2B]">₹{basePrice}</p>
                  </div>
                </div>

                <p className="text-xs text-[#5E4B7E]">{reg.upiPanel.noQrNote}</p>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#3B1278]/25 bg-white px-4 py-2 text-sm font-semibold text-[#240B4C] hover:bg-[#EFEAF8] cursor-pointer"
                  >
                    {upiCopied ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
                    <span>{upiCopied ? reg.upiPanel.copied : reg.upiPanel.copyUpi}</span>
                  </button>

                  <a
                    href={upiUri}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#D49B00] px-4 py-2 text-sm font-bold text-[#180D2B] hover:bg-[#B88600]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span>{reg.upiPanel.payViaUpiApp}</span>
                  </a>

                  <a
                    href={preSubmitWhatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>{reg.upiPanel.whatsappBtn}</span>
                  </a>
                </div>

                <p className="rounded-lg bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-950">
                  {reg.upiPanel.whatsappManualNote}
                </p>

                <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-screenshot" className="block text-sm font-semibold text-[#180D2B]">
                      {reg.fields.paymentScreenshot} <span className="text-red-600">*</span>
                    </label>
                    <div className="mt-1.5 flex items-center gap-3">
                      <label
                        htmlFor="reg-screenshot"
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#3B1278]/35 bg-[#F9F8FC] px-4 py-2 text-sm font-medium text-[#240B4C] hover:bg-[#EFEAF8]"
                      >
                        <ImagePlus className="h-4 w-4 text-[#3B1278]" />
                        <span className="truncate max-w-[200px]">
                          {screenshotFile ? screenshotFile.name : reg.fields.paymentScreenshot}
                        </span>
                        <input
                          id="reg-screenshot"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          onChange={(e) => void handleScreenshotChange(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      {screenshotPreview && (
                        <img
                          src={screenshotPreview}
                          alt="Payment screenshot preview"
                          className="h-14 w-14 rounded-lg border border-[#3B1278]/20 object-cover"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-utr" className="block text-sm font-semibold text-[#180D2B]">
                      {reg.fields.transactionId}
                    </label>
                    <input
                      id="reg-utr"
                      type="text"
                      maxLength={80}
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder={reg.fields.transactionIdPlaceholder}
                      className="mt-1.5 w-full rounded-lg border border-[#3B1278]/20 bg-white px-3.5 py-2.5 font-mono-tabular text-sm text-[#180D2B] focus:border-[#3B1278] focus:outline-none focus:ring-2 focus:ring-[#3B1278]/20"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 rounded-xl border border-[#3B1278]/20 bg-white p-5">
                <h3 className="font-display text-lg font-bold text-[#180D2B]">{reg.cashPanel.title}</h3>
                <p className="text-base font-semibold text-[#240B4C]">
                  {lang === 'bn' ? settings.cash_instructions_bn : settings.cash_instructions_en}
                </p>
                <p className="text-xs text-[#5E4B7E]">{reg.cashPanel.pendingNote}</p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={`tel:${settings.contact_phone.replace(/\s+/g, '')}`}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#3B1278] px-4 py-2 text-sm font-semibold text-white hover:bg-[#240B4C]"
                  >
                    <Phone className="h-4 w-4" />
                    <span>
                      {reg.cashPanel.callBtn} ({settings.contact_phone})
                    </span>
                  </a>
                  <a
                    href={cashWhatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                  >
                    <MessageCircle className="h-4 w-4" />
                    <span>{reg.cashPanel.whatsappBtn}</span>
                  </a>
                </div>
              </div>
            )}

            {/* Public Visibility Acknowledgement */}
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#3B1278]/15 bg-white p-4">
              <input
                type="checkbox"
                checked={publicConsent}
                onChange={(e) => setPublicConsent(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-[#3B1278]/40 text-[#3B1278] focus:ring-[#3B1278]"
              />
              <span className="text-xs leading-relaxed text-[#3D2E5C] sm:text-sm">
                {reg.fields.publicNoticeLabel}
              </span>
            </label>

            {errorMsg && (
              <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3.5 text-sm text-red-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={Boolean(submittingPhase)}
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#3B1278] px-6 py-3 text-base font-bold text-white transition-colors hover:bg-[#240B4C] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
            >
              {submittingPhase ?? reg.submitBtn}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
