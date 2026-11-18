export type Language = 'en' | 'bn';

export type PlayerRole = 'Batsman' | 'Bowler' | 'All-rounder';
export type BasePrice = 20 | 30;
export type PaymentMethod = 'UPI' | 'Cash';
export type ApplicationStatus = 'pending_review' | 'approved' | 'rejected';
export type PaymentStatus = 'pending_verification' | 'verified' | 'rejected';
export type RegistrationMode = 'auto' | 'force_open' | 'force_closed';

export interface PublicSettings {
  tournament_name: string;
  short_name: string;
  season: number;
  tagline_en: string;
  tagline_bn: string;
  contact_name: string;
  contact_phone: string;
  whatsapp_number: string;
  upi_id: string;
  upi_receiver_name: string;
  cash_instructions_en: string;
  cash_instructions_bn: string;
  registration_mode: RegistrationMode;
  registration_open_at: string;
  registration_close_at: string | null;
  is_registration_open: boolean;
  whatsapp_channel_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  about_en: string;
  about_bn: string;
  rules_en: string;
  rules_bn: string;
}

export interface PastChampion {
  id: string;
  slot_order: number;
  champion_year: number;
  team_name_en: string;
  team_name_bn: string;
  logo_path?: string | null;
  logo_url: string | null;
}

export interface VideoGalleryItem {
  id: string;
  provider: 'youtube' | 'facebook';
  source_url: string;
  caption_en: string;
  caption_bn: string;
  sort_order: number;
  is_published?: boolean;
  created_at: string;
}

export interface NoticeFixture {
  id: string;
  kind: 'notice' | 'fixture';
  title_en: string;
  title_bn: string;
  body_en: string;
  body_bn: string;
  event_date: string | null;
  venue: string | null;
  is_published?: boolean;
  created_at: string;
}

export interface SponsorItem {
  id: string;
  name: string;
  tier_en: string;
  tier_bn: string;
  website_url: string | null;
  logo_path?: string | null;
  logo_url: string | null;
}

export interface ApprovedPlayer {
  player_id: string;
  player_name: string;
  player_role: PlayerRole;
  base_price: BasePrice;
  photo_url: string | null;
}

export interface ApplicationSummary {
  player_id: string;
  player_name: string;
  player_role?: PlayerRole;
  address?: string;
  mobile_number?: string;
  base_price: BasePrice;
  payment_method: PaymentMethod;
  payment_amount: number;
  transaction_id?: string | null;
  historical_upi_id?: string | null;
  historical_receiver_name?: string;
  historical_cash_instructions?: string | null;
  application_status: ApplicationStatus;
  payment_status: PaymentStatus;
  rejection_reason?: string | null;
  allow_closed_correction?: boolean;
  revision_count?: number;
  created_at: string;
  updated_at?: string;
}

export interface AdminApplication extends ApplicationSummary {
  id: string;
  player_role: PlayerRole;
  address: string;
  mobile_number: string;
  photo_path: string;
  public_photo_path: string | null;
  payment_screenshot_path: string | null;
  internal_notes: string | null;
  allow_closed_correction: boolean;
  revision_count: number;
  updated_at: string;
}

export interface DashboardCounts {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  paymentPending: number;
  paymentVerified: number;
  upiTotal: number;
  cashTotal: number;
}

export interface PublicBootstrapData {
  settings: PublicSettings;
  pastChampions: PastChampion[];
  notices: NoticeFixture[];
  videos: VideoGalleryItem[];
  sponsors: SponsorItem[];
  approvedPlayers: ApprovedPlayer[];
}
