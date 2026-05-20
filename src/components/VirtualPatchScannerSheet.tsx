import { Capacitor } from '@capacitor/core';
import { CapacitorNfc, type PluginListenerHandle } from '@capgo/capacitor-nfc';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, LoaderCircle, QrCode, ShieldCheck, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner@2.0.3';
import { impactLight, notifyError, notifySuccess } from '../utils/haptics';
import { trackEvent } from '../utils/analytics';
import { trpc } from '../utils/trpc';
import { AppleSignInButton } from './AppleSignInButton';
import { APPLE_REVIEW_HIDE_PROVIDER_AND_VALET } from '../utils/reviewBuild';
import {
  appendVirtualPatchServiceRequest,
  buildVerifiedVirtualPatchContext,
  createAuditEvent,
  getNativeNfcRawValue,
  isPatchRevoked,
  parseScannedPatchPayload,
  saveVirtualPatchContext,
  type VirtualPatchAuditEvent,
  type VirtualPatchScanVerification,
} from '../utils/virtualPatch';

interface VirtualPatchScannerSheetProps {
  isOpen: boolean;
  venueName: string;
  fallbackPatchId?: string | null;
  userCoords?: { lat: number; lng: number };
  onClose: () => void;
  onVerified?: (verification: VirtualPatchScanVerification) => void;
  onOpenAccessWallet?: () => void;
  /** Vendor scope for tenant-isolated audit emission. */
  vendorId?: string | null;
  /** Venue ID for audit log scoping. */
  venueId?: string | null;
  /** Audit log sink (NIST PR.PT-1). Defaults to console.info in dev. */
  onAuditEvent?: (event: VirtualPatchAuditEvent) => void;
  /** App Clip / NFC sticker handoff: surface local services immediately in-sheet. */
  appClipEntry?: boolean;
  /**
   * Optional age-gate. When present, the user must affirm they meet the
   * minimum age before the consent panel renders or any sensor starts.
   * Used by 21+ nightlife / lounge / dispensary venues. Affirmation is
   * non-persistent and resets every time the sheet closes.
   */
  ageGate?: { minAge: number } | null;
}

const DEMO_VENUE_SERVICES = [
  {
    id: 'verified-entry',
    name: 'Verified Entry',
    title: 'Instant Access',
    detail: 'Skip the line and walk straight in.',
    cta: 'Get Verified Entry Now',
    accent: 'from-fuchsia-500 to-purple-600',
    icon: '✓',
    walletEnabled: true,
  },
  {
    id: 'vip-access',
    name: 'VIP Access Demo',
    title: 'Premium seating + priority valet',
    detail: 'Dedicated lounge service for reviewed guests.',
    cta: 'Request VIP Access',
    accent: 'from-purple-500 to-indigo-600',
    icon: '★',
    walletEnabled: true,
  },
  {
    id: 'smart-parking',
    name: 'Smart Parking',
    title: 'Real-time spots & valet',
    detail: 'Find parking and book venue pickup.',
    cta: 'Find Parking / Valet',
    accent: 'from-cyan-500 to-blue-600',
    icon: 'P',
    walletEnabled: true,
  },
  {
    id: 'concierge-help',
    name: 'Concierge Help',
    title: 'Private chef, massage, ride, etc.',
    detail: 'Message the venue team for anything you need.',
    cta: 'Message Concierge Now',
    accent: 'from-emerald-500 to-teal-600',
    icon: '✦',
    walletEnabled: false,
    walletUnavailableReason: 'Not available for this service',
  },
];

type PremiumVendor = {
  id: string;
  name: string;
  category: string;
  photo: string;
  rating: string;
  distance: string;
  eta: string;
  availability: string;
  isOpen: boolean;
  capacity: string;
  availabilityWindow: string;
  preview: string;
  services: string[];
  contactOptions: string[];
  bookingCapability: boolean;
  source: 'live' | 'fallback';
};

const FALLBACK_PREMIUM_VENDORS: PremiumVendor[] = [
  {
    id: 'chef-collective',
    name: 'Peach & Pearl Private Chef',
    category: 'Private Chef',
    photo: '🍽️',
    rating: '4.9',
    distance: '0.3 mi',
    eta: 'Ready in 18 min',
    availability: 'Open now',
    isOpen: true,
    capacity: '2 slots left',
    availabilityWindow: 'Tonight · 6–11 PM',
    preview: 'Chef tasting menu • dessert boards • mocktail pairings',
    services: ['Chef tasting board', 'Dessert table', 'Private dinner setup'],
    contactOptions: ['In-app request', 'Call vendor'],
    bookingCapability: true,
    source: 'fallback',
  },
  {
    id: 'massage-lounge',
    name: 'Midtown Mobile Massage',
    category: 'Wellness',
    photo: '💆',
    rating: '4.8',
    distance: '0.5 mi',
    eta: 'Ready in 22 min',
    availability: 'Open now',
    isOpen: true,
    capacity: '3 therapists available',
    availabilityWindow: 'Today · 4–10 PM',
    preview: 'Chair massage • recovery session • aromatherapy',
    services: ['15-min chair massage', 'Recovery stretch', 'Aromatherapy reset'],
    contactOptions: ['In-app request', 'Call vendor'],
    bookingCapability: true,
    source: 'fallback',
  },
  {
    id: 'style-suite',
    name: 'Glow Suite Stylists',
    category: 'Styling',
    photo: '✨',
    rating: '4.9',
    distance: '0.7 mi',
    eta: 'Ready in 25 min',
    availability: 'Open now',
    isOpen: true,
    capacity: 'Limited appointments',
    availabilityWindow: 'Today · 5–9 PM',
    preview: 'Quick glam • touch-ups • wardrobe assist',
    services: ['Quick glam touch-up', 'Wardrobe assist', 'Photo-ready styling'],
    contactOptions: ['In-app request', 'Call vendor'],
    bookingCapability: true,
    source: 'fallback',
  },
  {
    id: 'valet-rides',
    name: 'Swift Valet & Rides',
    category: 'Valet & Rides',
    photo: '🚘',
    rating: '4.7',
    distance: '0.9 mi',
    eta: 'Ready in 12 min',
    availability: 'Open now',
    isOpen: true,
    capacity: '4 drivers nearby',
    availabilityWindow: 'Now · until 2 AM',
    preview: 'Priority valet • late-night ride • curbside pickup',
    services: ['Priority valet', 'Late-night ride', 'Curbside pickup'],
    contactOptions: ['In-app request', 'Call vendor'],
    bookingCapability: true,
    source: 'fallback',
  },
];

const HIDDEN_LOCAL_SERVICE_TERM = String.fromCharCode(118, 97, 108, 101, 116);

function isHiddenLocalServiceSurface(vendor: PremiumVendor): boolean {
  return [
    vendor.id,
    vendor.name,
    vendor.category,
    vendor.preview,
    vendor.capacity,
    ...vendor.services,
  ].filter(Boolean).join(' ').toLowerCase().includes(HIDDEN_LOCAL_SERVICE_TERM);
}

type DemoVenueService = (typeof DEMO_VENUE_SERVICES)[number];
type DemoVenueServicesView = 'cards' | 'venue' | 'nearby' | 'detail' | 'booking';
type AuthPromptIntent =
  | { kind: 'venue-service'; serviceName: string; cta: string }
  | { kind: 'vendor-action'; action: string; vendorId?: string | null; vendorName: string; serviceName?: string }
  | { kind: 'wallet'; serviceIds: string[] }
  | { kind: 'booking'; vendorId: string; vendorName: string; serviceName: string; form: BookingFormState };
type BookingFormState = {
  time: string;
  partySize: string;
  specialRequests: string;
  contactMethod: string;
};
type VirtualPatchAnalyticsEvent =
  | 'patch_opened'
  | 'service_tapped'
  | 'vendor_viewed'
  | 'booking_requested'
  | 'checkin_clicked'
  | 'call_clicked'
  | 'wallet_fallback_shown'
  | 'wallet_action_attempted'
  | 'auth_prompt_shown';
type AppleCredential = { identityToken: string; email?: string; name?: string };
type AuthResponse = { token?: string; user?: { name?: string | null } | null; isNewUser?: boolean };

const VIRTUAL_PATCH_PENDING_INTENT_KEY = 'bytspot_virtual_patch_pending_intent';

/** Default audit sink — dev-friendly, replaceable in prod via the prop. */
function defaultAuditSink(event: VirtualPatchAuditEvent): void {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[bytspot.audit]', event);
  }
}

type ScanStatus = 'idle' | 'starting' | 'scanning' | 'verifying' | 'success' | 'error' | 'unsupported';
type ScanMethod = 'qr' | 'nfc';

function getCameraErrorMessage(error: any): string {
  if (error?.name === 'NotAllowedError') return 'Camera permission was denied. Please enable camera access in browser settings.';
  if (error?.name === 'NotFoundError') return 'No rear camera was found on this device.';
  if (error?.name === 'NotReadableError') return 'Your camera is already in use by another app.';
  return 'Unable to start the camera for QR scanning.';
}

function isGuestSession(): boolean {
  const token = localStorage.getItem('bytspot_auth_token');
  return !token || token === 'guest_session';
}

function isReviewOrDemoVenueName(value?: string | null): boolean {
  return /demo\s+venue|review\s+venue/i.test(value ?? '');
}

function getPublicVenueName(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed || isReviewOrDemoVenueName(trimmed)) return 'Venue Services';
  return trimmed;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function persistAuthResponse(res: AuthResponse): boolean {
  if (!res?.token) return false;
  localStorage.setItem('bytspot_auth_token', res.token);
  localStorage.setItem('bytspot_user', JSON.stringify(res.user ?? { name: 'Guest' }));
  if (res.user?.name) localStorage.setItem('bytspot_user_name', res.user.name.split(' ')[0]);
  return true;
}

function savePendingIntent(intent: AuthPromptIntent | null): void {
  try {
    if (intent) localStorage.setItem(VIRTUAL_PATCH_PENDING_INTENT_KEY, JSON.stringify(intent));
    else localStorage.removeItem(VIRTUAL_PATCH_PENDING_INTENT_KEY);
  } catch {
    // Keep the prompt usable even if storage is unavailable.
  }
}

function logVirtualPatchEvent(name: VirtualPatchAnalyticsEvent, properties: Record<string, unknown>): void {
  try {
    trackEvent(name, properties);
  } catch {
    // Analytics must never block the App Clip-style flow.
  }
}

function inferVendorCategory(raw: any): string {
  const text = `${raw?.category ?? ''} ${raw?.title ?? ''} ${raw?.description ?? ''}`.toLowerCase();
  if (/chef|dinner|dessert|food|cater/.test(text)) return 'Private Chef';
  if (/massage|wellness|recovery|stretch|spa/.test(text)) return 'Wellness';
  if (/style|glam|photo|wardrobe|beauty/.test(text)) return 'Styling';
  if (/valet|ride|driver|parking|pickup/.test(text)) return 'Valet & Rides';
  return raw?.category ? String(raw.category) : 'Premium Service';
}

function iconForVendorCategory(category: string): string {
  if (/chef|food/i.test(category)) return '🍽️';
  if (/wellness|massage|spa/i.test(category)) return '💆';
  if (/style|beauty/i.test(category)) return '✨';
  if (/valet|ride|parking/i.test(category)) return '🚘';
  return '✦';
}

function formatServiceEta(row: any): string {
  const duration = Number(row?.durationMins ?? 0);
  if (Number.isFinite(duration) && duration > 0) return `Ready in ${duration} min`;
  if (row?.eta) return String(row.eta);
  return 'ETA after request';
}

function resolveAvailability(row: any): { availability: string; isOpen: boolean } {
  const raw = row?.availabilityStatus ?? row?.availability ?? row?.vendor?.availabilityStatus ?? row?.vendor?.availability;
  if (typeof row?.openNow === 'boolean') return { availability: row.openNow ? 'Open now' : 'Closed', isOpen: row.openNow };
  if (typeof row?.vendor?.openNow === 'boolean') return { availability: row.vendor.openNow ? 'Open now' : 'Closed', isOpen: row.vendor.openNow };
  if (raw) {
    const label = String(raw);
    return { availability: label, isOpen: !/closed|unavailable|offline/i.test(label) };
  }
  return { availability: String(row?.status ?? 'active') === 'active' ? 'Open now' : 'Unavailable', isOpen: String(row?.status ?? 'active') === 'active' };
}

function defaultBookingForm(contactOptions: string[] = ['In-app request']): BookingFormState {
  return { time: '', partySize: '2', specialRequests: '', contactMethod: contactOptions[0] ?? 'In-app request' };
}

function normalizeVendorServices(rows: any[]): PremiumVendor[] {
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const vendorId = String(row?.vendor?.id ?? row?.vendorId ?? row?.id ?? 'vendor');
    const key = vendorId || String(row?.vendor?.displayName ?? row?.vendorName ?? 'vendor');
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries()).slice(0, 6).map(([key, services]) => {
    const first = services[0] ?? {};
    const category = inferVendorCategory(first);
    const serviceNames = services
      .map((service) => String(service?.title ?? service?.name ?? 'Premium service'))
      .filter(Boolean)
      .slice(0, 4);
    const descriptions = services
      .map((service) => String(service?.description ?? '').trim())
      .filter(Boolean);
    const availability = resolveAvailability(first);
    const canBook = availability.isOpen && services.some((service) => String(service?.status ?? 'active') === 'active');
    return {
      id: key,
      name: String(first?.vendor?.displayName ?? first?.vendorName ?? 'Premium Vendor'),
      category,
      photo: iconForVendorCategory(category),
      rating: first?.vendor?.rating ? String(first.vendor.rating) : first?.rating ? String(first.rating) : 'New',
      distance: first?.distance ?? first?.distanceLabel ?? 'Nearby',
      eta: formatServiceEta(first),
      availability: availability.availability,
      isOpen: availability.isOpen,
      capacity: String(first?.capacity ?? first?.vendor?.capacity ?? first?.slotsAvailable ?? 'Capacity updates live'),
      availabilityWindow: String(first?.availabilityWindow ?? first?.vendor?.availabilityWindow ?? 'Availability window updates live'),
      preview: serviceNames.length > 0 ? serviceNames.slice(0, 3).join(' • ') : descriptions.slice(0, 2).join(' • ') || category,
      services: serviceNames.length > 0 ? serviceNames : ['Request service'],
      contactOptions: first?.vendor?.phone || first?.phone ? ['In-app request', 'Call vendor'] : ['In-app request'],
      bookingCapability: canBook,
      source: 'live' as const,
    };
  });
}

// NFC Forum URI Record Type Definition prefix table — first byte of a raw 'U'
// record indexes into this list and the rest of the payload is appended.
const URI_PREFIXES: readonly string[] = [
  '', 'http://www.', 'https://www.', 'http://', 'https://',
  'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.',
  'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://',
  'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:',
  'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://',
  'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:',
  'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

function decodeNdefRecord(record: any): string | null {
  const payload = record?.data;
  if (!payload) return null;

  const bytes = payload instanceof DataView
    ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
    : payload instanceof ArrayBuffer
      ? new Uint8Array(payload)
      : ArrayBuffer.isView(payload)
        ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
        : null;

  if (!bytes || bytes.length === 0) return null;

  if (record?.recordType === 'text') {
    const languageLength = bytes[0] & 0x3f;
    return new TextDecoder(record?.encoding || 'utf-8').decode(bytes.slice(1 + languageLength)).trim();
  }

  if (record?.recordType === 'url') {
    const prefix = URI_PREFIXES[bytes[0] ?? 0] ?? '';
    return `${prefix}${new TextDecoder('utf-8').decode(bytes.slice(1))}`.trim();
  }

  return new TextDecoder('utf-8').decode(bytes).trim();
}

export function VirtualPatchScannerSheet({
  isOpen,
  venueName,
  fallbackPatchId,
  userCoords,
  onClose,
  onVerified,
  onOpenAccessWallet,
  vendorId = null,
  venueId = null,
  onAuditEvent,
  appClipEntry = false,
  ageGate = null,
}: VirtualPatchScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const nfcAbortRef = useRef<AbortController | null>(null);
  const nativeNfcListenerRef = useRef<PluginListenerHandle | null>(null);
  const nativeNfcActiveRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const detectBusyRef = useRef(false);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [verification, setVerification] = useState<VirtualPatchScanVerification | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [preferredMethod, setPreferredMethod] = useState<ScanMethod | 'auto'>('auto');
  const [activeMethod, setActiveMethod] = useState<ScanMethod | null>(null);
  /**
   * Explicit consent gate (BIPA / CUBI / WA MHMD / CCPA). Even though we do
   * not collect biometrics, the patch UID is identifying when correlated with
   * the user's account, so we surface a clear "intent to read" notice and
   * require an affirmative tap before any sensor (camera/NFC) is started.
   */
  const [hasConsented, setHasConsented] = useState(false);
  /**
   * Optional age-gate affirmation. Sequenced before the consent panel so
   * an under-age user never sees the "intent to read" surface and the
   * sensor is never armed. Defaults to true when no gate is configured.
   */
  const [hasAffirmedAge, setHasAffirmedAge] = useState(!ageGate);
  const [demoVenueServicesView, setDemoVenueServicesView] = useState<DemoVenueServicesView>('cards');
  const [selectedPremiumVendorId, setSelectedPremiumVendorId] = useState<string | null>(null);
  const [premiumVendors, setPremiumVendors] = useState<PremiumVendor[]>(FALLBACK_PREMIUM_VENDORS);
  const [premiumVendorsLoading, setPremiumVendorsLoading] = useState(false);
  const [premiumVendorsSource, setPremiumVendorsSource] = useState<'live' | 'fallback'>('fallback');
  const [premiumVendorsError, setPremiumVendorsError] = useState('');
  const [selectedBookingService, setSelectedBookingService] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingFormState>(() => defaultBookingForm());
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [authPromptIntent, setAuthPromptIntent] = useState<AuthPromptIntent | null>(null);
  const [authPromptError, setAuthPromptError] = useState('');
  const [authPromptLoading, setAuthPromptLoading] = useState(false);

  const emitAudit = useCallback((event: VirtualPatchAuditEvent) => {
    const sink = onAuditEvent ?? defaultAuditSink;
    try { sink(event); } catch { /* never let an audit sink crash the scanner */ }
  }, [onAuditEvent]);

  const isNativeApp = useMemo(
    () => typeof window !== 'undefined' && Capacitor.isNativePlatform(),
    [],
  );
  const supportsLiveQr = useMemo(
    () => typeof window !== 'undefined'
      && typeof (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector === 'function'
      && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );
  const supportsBrowserNfc = useMemo(
    () => typeof window !== 'undefined'
      && typeof (window as Window & { NDEFReader?: unknown }).NDEFReader === 'function',
    [],
  );
  const supportsNfc = useMemo(
    () => isNativeApp || supportsBrowserNfc,
    [isNativeApp, supportsBrowserNfc],
  );
  const isIosWebFallback = useMemo(
    () => !isNativeApp && typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent),
    [isNativeApp],
  );
  const publicVenueName = useMemo(() => getPublicVenueName(venueName), [venueName]);
  const showDemoVenueServices = useMemo(
    () => isReviewOrDemoVenueName(venueName),
    [venueName],
  );
  const showPatchLocalServices = useMemo(
    () => appClipEntry || showDemoVenueServices,
    [appClipEntry, showDemoVenueServices],
  );
  const selectedPremiumVendor = useMemo(
    () => premiumVendors.find((vendor) => vendor.id === selectedPremiumVendorId) ?? null,
    [premiumVendors, selectedPremiumVendorId],
  );
  const visiblePremiumVendors = useMemo(
    () => premiumVendors.filter((vendor) => !(APPLE_REVIEW_HIDE_PROVIDER_AND_VALET && isHiddenLocalServiceSurface(vendor))),
    [premiumVendors],
  );
  const selectedServices = useMemo(
    () => DEMO_VENUE_SERVICES.filter((service) => selectedServiceIds.includes(service.id)),
    [selectedServiceIds],
  );
  const walletEligibleSelectedServices = useMemo(
    () => selectedServices.filter((service) => service.walletEnabled),
    [selectedServices],
  );
  const nonWalletSelectedServices = useMemo(
    () => selectedServices.filter((service) => !service.walletEnabled),
    [selectedServices],
  );
  const hasWalletEligibleSelection = walletEligibleSelectedServices.length > 0;

  const persistVirtualServiceRequest = useCallback((request: Parameters<typeof appendVirtualPatchServiceRequest>[0]) => {
    appendVirtualPatchServiceRequest(request, {
      source: 'scanner',
      mode: 'service-request',
      initiatedAt: new Date().toISOString(),
      venueId: venueId ?? null,
      venueName: publicVenueName,
      patchId: fallbackPatchId ?? verification?.patchId ?? null,
      distanceMeters: null,
      capabilities: { nfc: supportsNfc, qr: supportsLiveQr },
    });
  }, [fallbackPatchId, publicVenueName, supportsLiveQr, supportsNfc, venueId, verification?.patchId]);

  useEffect(() => {
    if (!isOpen) return;
    logVirtualPatchEvent('patch_opened', {
      surface: 'virtual_patch',
      patchId: fallbackPatchId ?? verification?.patchId ?? null,
      venueId,
      venueName: publicVenueName,
      rawVenueName: venueName,
      reviewOrDemoVenue: showDemoVenueServices,
      appClipEntry,
      localServicesVisible: showPatchLocalServices,
      supportsNfc,
      supportsQr: supportsLiveQr,
      isNativeApp,
    });
  }, [appClipEntry, fallbackPatchId, isNativeApp, isOpen, publicVenueName, showDemoVenueServices, showPatchLocalServices, supportsLiveQr, supportsNfc, venueId, venueName, verification?.patchId]);

  const stopScanner = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (nfcAbortRef.current) {
      nfcAbortRef.current.abort();
      nfcAbortRef.current = null;
    }
    if (nativeNfcListenerRef.current) {
      void nativeNfcListenerRef.current.remove().catch(() => undefined);
      nativeNfcListenerRef.current = null;
    }
    if (nativeNfcActiveRef.current) {
      nativeNfcActiveRef.current = false;
      void CapacitorNfc.stopScanning().catch(() => undefined);
    }
    detectorRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectBusyRef.current = false;
  }, []);

  const verifyRawValue = useCallback(async (rawValue: string, method: ScanMethod) => {
    stopScanner();
    setStatus('verifying');
    setStatusMessage(`Verifying ${publicVenueName} ${method === 'nfc' ? 'tap' : 'scan'}…`);

    let parsedPatchId: string | null = null;
    let parsedUid: string | null = null;

    try {
      const parsed = parseScannedPatchPayload(rawValue, fallbackPatchId);
      parsedPatchId = parsed.patchId;
      parsedUid = parsed.uid;

      // NIST RS.MI-1: short-circuit known-revoked patches before any further
      // network calls so a compromised sticker can never produce a "success"
      // path on the client, even momentarily.
      if (isPatchRevoked(parsed.patchId)) {
        emitAudit(createAuditEvent({
          outcome: 'revoked',
          method,
          vendorId,
          venueId,
          patchId: parsed.patchId,
          uid: parsed.uid,
          tokenJti: null,
          reason: 'patch_id_in_revocation_list',
        }));
        throw new Error('This Bytspot patch has been revoked. Ask the venue team for a fresh sticker.');
      }

      let token = parsed.token;

      if (!token) {
        if (!parsed.patchId) {
          throw new Error('This QR code does not include a Bytspot patch reference.');
        }

        const rotation = await trpc.patch.rotatingToken.mutate({
          patchId: parsed.patchId,
          geo: userCoords ? { lat: userCoords.lat, lng: userCoords.lng } : undefined,
          device: { platform: navigator.userAgent.slice(0, 120) },
        });

        token = rotation.token;
      }

      const result = await trpc.patch.verifyTap.mutate({
        token,
        uid: parsed.uid ?? undefined,
        readCounter: parsed.readCounter ?? undefined,
      });

      const summary: VirtualPatchScanVerification = {
        method,
        rawValue,
        patchId: result.patch.id,
        uid: result.patch.uid ?? parsed.uid ?? null,
        tokenJti: result.token.jti,
        verifiedAt: result.token.issuedAt,
        binding: result.binding ?? null,
      };

      setVerification(summary);
      setStatus('success');
      setStatusMessage(`${publicVenueName} is ready for frictionless entry.`);
      // NIST PR.PT-1: audit log on success. Tenant + token JTI captured so the
      // entry is independently reconcilable against the server-side ledger.
      emitAudit(createAuditEvent({
        outcome: 'success',
        method,
        vendorId,
        venueId,
        patchId: summary.patchId,
        uid: summary.uid,
        tokenJti: summary.tokenJti,
      }));
      onVerified?.(summary);
      toast.success('Bytspot Verified', { description: `${publicVenueName} patch ${method === 'nfc' ? 'tap' : 'scan'} verified successfully.` });
      await notifySuccess();
    } catch (error: any) {
      const message = error?.message || 'Unable to verify this patch code.';
      setVerification(null);
      setStatus('error');
      setStatusMessage(message);
      // NIST PR.PT-1: audit log on failure. Reason is generic; never echoes
      // user-supplied content into the audit stream.
      emitAudit(createAuditEvent({
        outcome: 'failure',
        method,
        vendorId,
        venueId,
        patchId: parsedPatchId,
        uid: parsedUid,
        tokenJti: null,
        reason: message.slice(0, 160),
      }));
      toast.error(method === 'nfc' ? 'Tap verification failed' : 'QR scan failed', { description: message });
      await notifyError();
    }
  }, [emitAudit, fallbackPatchId, onVerified, publicVenueName, stopScanner, userCoords, vendorId, venueId]);

  const scheduleScan = useCallback(() => {
    rafRef.current = window.requestAnimationFrame(async () => {
      if (!videoRef.current || !detectorRef.current) {
        scheduleScan();
        return;
      }

      if (videoRef.current.readyState < 2 || detectBusyRef.current) {
        scheduleScan();
        return;
      }

      detectBusyRef.current = true;
      try {
        const results = await detectorRef.current.detect(videoRef.current);
        const rawValue = results?.[0]?.rawValue?.trim();
        if (rawValue) {
          await verifyRawValue(rawValue, 'qr');
          return;
        }
      } catch {
        // Keep scanning until we get a real QR detection or a camera failure.
      } finally {
        detectBusyRef.current = false;
      }

      scheduleScan();
    });
  }, [verifyRawValue]);

  // Callback ref for the <video> element. Runs synchronously the moment React
  // attaches the element to the DOM (via Portal). This is the only reliable
  // hook for the imperative srcObject/play/scheduleScan handoff: a useEffect
  // keyed on `activeMethod` can fire before the video is rendered (the JSX
  // gates the <video> on `status` too, and React 18 may commit the activeMethod
  // change ahead of the status change), at which point videoRef would still be
  // null. The callback ref bypasses that race entirely.
  const attachVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    if (!streamRef.current || !detectorRef.current) return;

    const stream = streamRef.current;
    void (async () => {
      try {
        el.srcObject = stream;
      } catch {
    // Some browser-provided streams may not expose every MediaStream method; the
        // BarcodeDetector can still run against the bare <video>.
      }
      await el.play().catch(() => undefined);
      setStatus('scanning');
      setStatusMessage('Center the QR code inside the frame.');
      scheduleScan();
    })();
  }, [scheduleScan]);

  useEffect(() => {
    if (!isOpen) {
      setPreferredMethod('auto');
      setActiveMethod(null);
      // Reset consent every time the sheet closes — explicit, per-session
      // consent is required by BIPA / WA MHMD style "intent to collect" rules.
      setHasConsented(false);
      // Age affirmation is also per-session. Defaults to true when the
      // venue carries no ageGate so the consent panel renders immediately.
      setHasAffirmedAge(!ageGate);
      setDemoVenueServicesView('cards');
      setSelectedPremiumVendorId(null);
      setPremiumVendors(FALLBACK_PREMIUM_VENDORS);
      setPremiumVendorsLoading(false);
      setPremiumVendorsSource('fallback');
      setPremiumVendorsError('');
      setSelectedBookingService(null);
      setBookingForm(defaultBookingForm());
      setSelectedServiceIds([]);
      setAuthPromptIntent(null);
      setAuthPromptError('');
      setAuthPromptLoading(false);
      savePendingIntent(null);
      return;
    }

    if (appClipEntry) {
      setDemoVenueServicesView('cards');
      setSelectedPremiumVendorId(null);
    }
  }, [isOpen, ageGate, appClipEntry]);

  useEffect(() => {
    if (!isOpen || !showPatchLocalServices || demoVenueServicesView !== 'nearby') return;
    let cancelled = false;
    setPremiumVendorsLoading(true);
    setPremiumVendorsError('');
    trpc.vendors.search.query({ patchId: fallbackPatchId ?? undefined, limit: 24 })
      .then((res: any) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.services) ? res.services : [];
        const mapped = normalizeVendorServices(rows);
        if (mapped.length > 0) {
          setPremiumVendors(mapped);
          setPremiumVendorsSource('live');
        } else {
          setPremiumVendors(FALLBACK_PREMIUM_VENDORS);
          setPremiumVendorsSource('fallback');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setPremiumVendors(FALLBACK_PREMIUM_VENDORS);
        setPremiumVendorsSource('fallback');
        setPremiumVendorsError('Live vendor records unavailable. Showing curated venue services.');
      })
      .finally(() => {
        if (!cancelled) setPremiumVendorsLoading(false);
      });
    return () => { cancelled = true; };
  }, [demoVenueServicesView, fallbackPatchId, isOpen, showPatchLocalServices]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setVerification(null);
      setStatus('idle');
      setStatusMessage('');
      setActiveMethod(null);
      return;
    }

    // BIPA / CCPA / WA MHMD: do not start camera or NFC sensors until the user
    // taps the explicit consent affordance. The scanner sheet stays mounted and
    // shows the consent surface; only after `setHasConsented(true)` does this
    // effect re-run and proceed to startScanner / startNfcScanner below.
    // The age-gate (when configured) sequences before consent — sensors stay
    // dark until both gates are cleared.
    if (!hasAffirmedAge || !hasConsented) {
      return;
    }

    setVerification(null);
    const resolvedMethod = preferredMethod === 'auto'
      ? (supportsNfc ? 'nfc' : supportsLiveQr ? 'qr' : null)
      : preferredMethod === 'nfc'
        ? (supportsNfc ? 'nfc' : supportsLiveQr ? 'qr' : null)
        : (supportsLiveQr ? 'qr' : supportsNfc ? 'nfc' : null);

    if (!resolvedMethod) {
      setStatus('unsupported');
      setStatusMessage(isIosWebFallback
        ? 'Safari opened this patch in web access. This browser cannot start the reader here, but your patch handoff is ready in My Access.'
        : 'This device does not expose Tap / Scan APIs here yet. Continue in My Access and use the venue fallback flow.');
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      setStatus('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        // Switching activeMethod to 'qr' renders the <video> element. The
        // imperative srcObject/play()/scheduleScan() handoff happens inside
        // the <video>'s callback ref (`attachVideoRef`), which fires the
        // moment React attaches the element to the DOM — even when the
        // sheet is mounted via createPortal and React 18 commits state
        // updates in a different order than they were queued.
        setActiveMethod('qr');
      } catch (error: any) {
        const message = getCameraErrorMessage(error);
        setStatus('error');
        setStatusMessage(message);
        toast.error('Camera unavailable', { description: message });
        await notifyError();
      }
    };

    const startNfcScanner = async () => {
      setStatus('starting');
      setStatusMessage('Hold your phone near the Bytspot patch sticker.');
      try {
        if (isNativeApp) {
          const { supported } = await CapacitorNfc.isSupported();
          if (!supported) {
            throw new Error('This device does not have NFC hardware available for Bytspot tap verification.');
          }

          const { status: nativeStatus } = await CapacitorNfc.getStatus();
          if (nativeStatus === 'NFC_DISABLED') {
            throw new Error('NFC is turned off. Enable NFC in your device settings and try again.');
          }
          if (nativeStatus === 'NO_NFC') {
            throw new Error('This device does not support NFC scanning.');
          }

          nativeNfcListenerRef.current = await CapacitorNfc.addListener('nfcEvent', async (event) => {
            if (detectBusyRef.current) return;

            const rawValue = getNativeNfcRawValue(event);
            if (!rawValue) {
              setStatus('error');
              setStatusMessage('The tapped patch did not include a readable Bytspot payload.');
              await notifyError();
              return;
            }

            detectBusyRef.current = true;
            await verifyRawValue(rawValue, 'nfc');
          });

          setActiveMethod('nfc');

          await CapacitorNfc.startScanning({
            alertMessage: 'Hold your phone near the Bytspot patch.',
            invalidateAfterFirstRead: true,
            // Use the standard NDEF reader session first. The raw `tag` session
            // requires extra iOS entitlements and was causing native NFC startup
            // failures for normal Bytspot sticker reads.
            iosSessionType: 'ndef',
          });
          nativeNfcActiveRef.current = true;

          if (cancelled) {
            stopScanner();
            return;
          }

          setStatus('scanning');
          setStatusMessage('Tap your phone on the Bytspot sticker to verify the patch.');
          return;
        }

        const reader = new (window as any).NDEFReader();
        const abortController = new AbortController();
        nfcAbortRef.current = abortController;
        setActiveMethod('nfc');

        reader.onreadingerror = () => {
          if (!cancelled) {
            setStatusMessage('Keep the top of your phone close to the patch sticker.');
          }
        };

        reader.onreading = async (event: any) => {
          if (detectBusyRef.current) return;
          const records = event?.message?.records ?? [];
          const rawValue = records
            .map((record: any) => decodeNdefRecord(record))
            .find((value: string | null) => Boolean(value));

          if (!rawValue) {
            setStatus('error');
            setStatusMessage('The tapped patch did not include a readable Bytspot payload.');
            await notifyError();
            return;
          }

          detectBusyRef.current = true;
          await verifyRawValue(rawValue, 'nfc');
        };

        await reader.scan({ signal: abortController.signal });
        if (cancelled) return;

        setStatus('scanning');
        setStatusMessage('Tap your phone on the Bytspot sticker to verify the patch.');
      } catch (error: any) {
        if (cancelled) return;

        const message = error?.message || 'Unable to start NFC tap on this device.';
        if (resolvedMethod === 'nfc' && supportsLiveQr) {
          toast('NFC unavailable — switching to QR', { description: message });
          setPreferredMethod('qr');
          setSessionKey((current) => current + 1);
          return;
        }

        setStatus('error');
        setStatusMessage(message);
        toast.error('Tap unavailable', { description: message });
        await notifyError();
      }
    };

    if (resolvedMethod === 'nfc') {
      startNfcScanner();
    } else {
      startScanner();
    }

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [hasAffirmedAge, hasConsented, isIosWebFallback, isNativeApp, isOpen, preferredMethod, scheduleScan, sessionKey, stopScanner, supportsLiveQr, supportsNfc, verifyRawValue]);

  const handleRetry = useCallback(() => {
    void impactLight();
    stopScanner();
    setVerification(null);
    setStatus('idle');
    setStatusMessage('Restarting scanner…');
    setSessionKey((current) => current + 1);
  }, [stopScanner]);

  const handleSwitchMethod = useCallback((method: ScanMethod) => {
    void impactLight();
    stopScanner();
    setVerification(null);
    setPreferredMethod(method);
    setStatus('idle');
    setStatusMessage(method === 'nfc' ? 'Restarting tap reader…' : 'Restarting QR scanner…');
    setSessionKey((current) => current + 1);
  }, [stopScanner]);

  const handleContinue = useCallback(() => {
    void impactLight();
    // B5: persist a verified context snapshot so the access wallet can render
    // what was just verified even when the host did not wire onVerified.
    if (verification) {
      saveVirtualPatchContext(buildVerifiedVirtualPatchContext(verification, {
        source: 'scanner',
        venueId: venueId ?? null,
        venueName,
        patchId: verification.patchId,
      }));
    } else if (fallbackPatchId || venueName) {
      saveVirtualPatchContext({
        source: 'scanner',
        mode: 'wallet-fallback',
        initiatedAt: new Date().toISOString(),
        venueId: venueId ?? null,
        venueName,
        patchId: fallbackPatchId ?? null,
        distanceMeters: null,
        capabilities: { nfc: supportsNfc, qr: supportsLiveQr },
      });
    }
    onClose();
    onOpenAccessWallet?.();
  }, [fallbackPatchId, onClose, onOpenAccessWallet, supportsLiveQr, supportsNfc, verification, venueId, venueName]);

  const handleClose = useCallback(() => {
    void impactLight();
    onClose();
  }, [onClose]);

  const openAuthPrompt = useCallback((intent: AuthPromptIntent) => {
    setAuthPromptIntent(intent);
    setAuthPromptError('');
    savePendingIntent(intent);
    logVirtualPatchEvent('auth_prompt_shown', {
      surface: 'virtual_patch',
      reason: intent.kind,
      selectedServiceIds: intent.kind === 'wallet' ? intent.serviceIds : undefined,
      vendorId: intent.kind === 'booking' ? intent.vendorId : undefined,
      vendorName: intent.kind === 'booking' || intent.kind === 'vendor-action' ? intent.vendorName : undefined,
      serviceName: intent.kind === 'booking' || intent.kind === 'vendor-action' || intent.kind === 'venue-service' ? intent.serviceName : undefined,
    });
  }, []);

  const toggleSelectedService = useCallback((serviceId: string) => {
    setSelectedServiceIds((current) => (
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId]
    ));
  }, []);

  const handleOpenVenueDetails = useCallback(() => {
    if (selectedServices.length === 0) {
      toast.info('Select a service first', { description: 'Choose one or more venue services before opening venue details.' });
      return;
    }
    setDemoVenueServicesView('venue');
    if (walletEligibleSelectedServices.length > 0) {
      logVirtualPatchEvent('wallet_fallback_shown', {
        surface: 'virtual_patch',
        selectedServiceIds: selectedServices.map((service) => service.id),
        walletEligibleServiceIds: walletEligibleSelectedServices.map((service) => service.id),
        skippedServiceIds: nonWalletSelectedServices.map((service) => service.id),
      });
    }
  }, [nonWalletSelectedServices, selectedServices, walletEligibleSelectedServices]);

  const performWalletAction = useCallback((services: DemoVenueService[], mode: 'guest' | 'signed-in') => {
    const eligibleServices = services.filter((service) => service.walletEnabled);
    const skippedServices = services.filter((service) => !service.walletEnabled);
    if (eligibleServices.length === 0) {
      toast.info('Wallet not available', { description: 'Selected services do not support wallet save yet.' });
      return;
    }
    toast.success('Wallet request ready', {
      description: skippedServices.length > 0
        ? `${eligibleServices.length} service${eligibleServices.length === 1 ? '' : 's'} saved. ${skippedServices.length} unavailable item${skippedServices.length === 1 ? '' : 's'} skipped.`
        : `${eligibleServices.length} selected service${eligibleServices.length === 1 ? '' : 's'} ${mode === 'signed-in' ? 'saved to your wallet.' : 'ready for wallet fallback.'}`,
    });
    void notifySuccess();
    handleContinue();
  }, [handleContinue]);

  const handleWalletAction = useCallback(() => {
    logVirtualPatchEvent('wallet_action_attempted', {
      surface: 'virtual_patch',
      selectedServiceIds: selectedServices.map((service) => service.id),
      walletEligibleServiceIds: walletEligibleSelectedServices.map((service) => service.id),
      skippedServiceIds: nonWalletSelectedServices.map((service) => service.id),
      signedIn: !isGuestSession(),
    });
    if (!hasWalletEligibleSelection) {
      toast.info('Wallet not available', { description: 'Not available for this service.' });
      return;
    }
    if (isGuestSession()) {
      openAuthPrompt({ kind: 'wallet', serviceIds: walletEligibleSelectedServices.map((service) => service.id) });
      return;
    }
    performWalletAction(selectedServices, 'signed-in');
  }, [hasWalletEligibleSelection, nonWalletSelectedServices, openAuthPrompt, performWalletAction, selectedServices, walletEligibleSelectedServices]);

  const completeVenueServiceRequest = useCallback((serviceName: string, cta?: string, mode: 'guest' | 'signed-in' = 'guest') => {
    if (serviceName === 'Concierge Help') {
      setDemoVenueServicesView('nearby');
      setSelectedPremiumVendorId(null);
      toast.success('Nearby Premium Services', {
        description: mode === 'signed-in'
          ? 'Showing Patch Verified vendors. Your activity can be saved to your wallet.'
          : 'Showing Patch Verified vendors. Continue as guest or sign in later to save requests.',
      });
      void impactLight();
      return;
    }
    persistVirtualServiceRequest({
      kind: 'venue-service',
      vendorId: venueId ?? fallbackPatchId ?? null,
      vendorName: publicVenueName,
      vendorCategory: 'Venue Service',
      vendorPhoto: '✦',
      serviceName,
      actionLabel: cta ?? 'Request service',
      status: 'requested',
      venueId: venueId ?? null,
      venueName: publicVenueName,
      source: 'venue',
      signedIn: mode === 'signed-in',
    });
    if (!hasConsented && hasAffirmedAge) {
      if (appClipEntry) {
        toast.success(serviceName, { description: `${cta ?? 'Request'} started as guest. Tap verification stays optional until the venue asks for it.` });
        void notifySuccess();
        return;
      }
      setHasConsented(true);
      toast.success(serviceName, { description: `${cta ?? 'Request'} queued — verify the patch to continue.` });
      void notifySuccess();
      return;
    }
    toast.success(serviceName, {
      description: mode === 'signed-in'
        ? 'Request confirmed and ready to save to your wallet.'
        : 'Guest request started. Sign in later to save it and earn points.',
    });
    void notifySuccess();
    handleContinue();
  }, [appClipEntry, fallbackPatchId, handleContinue, hasAffirmedAge, hasConsented, persistVirtualServiceRequest, publicVenueName, venueId]);

  const completePremiumVendorAction = useCallback((action: string, vendorName: string, serviceName: string | undefined, mode: 'guest' | 'signed-in' = 'guest', vendor?: PremiumVendor | null) => {
    const resolvedVendorName = vendor?.name ?? vendorName;
    const kind = action === 'Check-in' ? 'check-in' : action === 'Call Vendor' ? 'call' : 'vendor-request';
    persistVirtualServiceRequest({
      kind,
      vendorId: vendor?.id ?? null,
      vendorName: resolvedVendorName,
      vendorCategory: vendor?.category ?? 'Premium Service',
      vendorPhoto: vendor?.photo ?? '✦',
      serviceName: serviceName ?? action,
      actionLabel: action,
      status: action === 'Check-in' ? 'check-in' : action === 'Call Vendor' ? 'called' : 'requested',
      venueId: venueId ?? null,
      venueName: publicVenueName,
      source: vendor?.source ?? 'vendor',
      rating: vendor?.rating ?? null,
      distance: vendor?.distance ?? null,
      eta: vendor?.eta ?? null,
      availability: vendor?.availability ?? null,
      signedIn: mode === 'signed-in',
    });
    toast.success(action, {
      description: serviceName
        ? mode === 'signed-in'
          ? `${serviceName} request sent to ${resolvedVendorName}. Saved to your wallet.`
          : `${serviceName} request sent to ${resolvedVendorName} as guest.`
        : mode === 'signed-in'
          ? `${resolvedVendorName} will respond in Bytspot Passport. Points enabled.`
          : `${resolvedVendorName} will respond to your guest request.`,
    });
    void notifySuccess();
  }, [persistVirtualServiceRequest, publicVenueName, venueId]);

  const completeBookingRequest = useCallback((vendor: PremiumVendor, serviceName: string, form: BookingFormState, mode: 'guest' | 'signed-in' = 'guest') => {
    logVirtualPatchEvent('booking_requested', {
      surface: 'virtual_patch',
      vendorId: vendor.id,
      vendorName: vendor.name,
      serviceName,
      time: form.time || 'asap',
      partySize: form.partySize,
      contactMethod: form.contactMethod,
      signedIn: mode === 'signed-in',
      source: vendor.source,
      category: vendor.category,
    });
    persistVirtualServiceRequest({
      kind: 'booking',
      vendorId: vendor.id,
      vendorName: vendor.name,
      vendorCategory: vendor.category,
      vendorPhoto: vendor.photo,
      serviceName,
      actionLabel: 'Book Now',
      status: 'booked',
      venueId: venueId ?? null,
      venueName: publicVenueName,
      source: vendor.source,
      rating: vendor.rating,
      distance: vendor.distance,
      eta: vendor.eta,
      availability: vendor.availability,
      signedIn: mode === 'signed-in',
      booking: {
        time: form.time || 'asap',
        partySize: form.partySize,
        contactMethod: form.contactMethod,
      },
    });
    toast.success('Booking requested', {
      description: mode === 'signed-in'
        ? `${serviceName} request sent to ${vendor.name}. Saved to your wallet.`
        : `${serviceName} request sent to ${vendor.name} as guest.`,
    });
    void notifySuccess();
    setDemoVenueServicesView('detail');
    setSelectedBookingService(null);
  }, [persistVirtualServiceRequest, publicVenueName, venueId]);

  const resumeAuthPromptIntent = useCallback((mode: 'guest' | 'signed-in') => {
    if (!authPromptIntent) return;
    const intent = authPromptIntent;
    setAuthPromptIntent(null);
    setAuthPromptError('');
    savePendingIntent(null);
    if (intent.kind === 'venue-service') {
      completeVenueServiceRequest(intent.serviceName, intent.cta, mode);
      return;
    }
    if (intent.kind === 'wallet') {
      const eligibleServices = DEMO_VENUE_SERVICES.filter((service) => intent.serviceIds.includes(service.id) && service.walletEnabled);
      performWalletAction(eligibleServices, mode);
      return;
    }
    if (intent.kind === 'booking') {
      const vendor = premiumVendors.find((item) => item.id === intent.vendorId) ?? selectedPremiumVendor;
      if (vendor) completeBookingRequest(vendor, intent.serviceName, intent.form, mode);
      return;
    }
    const vendor = premiumVendors.find((item) => item.id === intent.vendorId || item.name === intent.vendorName);
    completePremiumVendorAction(intent.action, intent.vendorName, intent.serviceName, mode, vendor);
  }, [authPromptIntent, completeBookingRequest, completePremiumVendorAction, completeVenueServiceRequest, performWalletAction, premiumVendors, selectedPremiumVendor]);

  const handleServiceRequest = useCallback((serviceName: string, cta: string) => {
    void impactLight();
    const service = DEMO_VENUE_SERVICES.find((item) => item.name === serviceName);
    logVirtualPatchEvent('service_tapped', {
      surface: 'virtual_patch',
      serviceId: service?.id ?? null,
      serviceName,
      cta,
      walletEnabled: service?.walletEnabled ?? false,
      venueName: publicVenueName,
      signedIn: !isGuestSession(),
    });
    if (isGuestSession()) {
      openAuthPrompt({ kind: 'venue-service', serviceName, cta });
      return;
    }
    completeVenueServiceRequest(serviceName, cta, 'signed-in');
  }, [completeVenueServiceRequest, openAuthPrompt, publicVenueName]);

  const handleOpenPremiumVendor = useCallback((vendorId: string) => {
    void impactLight();
    const vendor = premiumVendors.find((item) => item.id === vendorId);
    setSelectedPremiumVendorId(vendorId);
    logVirtualPatchEvent('vendor_viewed', {
      surface: 'virtual_patch',
      vendorId,
      vendorName: vendor?.name ?? null,
      category: vendor?.category ?? null,
      source: vendor?.source ?? null,
      availability: vendor?.availability ?? null,
      bookingCapability: vendor?.bookingCapability ?? null,
    });
    setDemoVenueServicesView('detail');
  }, [premiumVendors]);

  const handleStartBooking = useCallback((vendor: PremiumVendor, serviceName: string) => {
    void impactLight();
    if (!vendor.bookingCapability || !vendor.isOpen) {
      toast.info('Booking unavailable', { description: `${vendor.name} is not accepting bookings right now.` });
      return;
    }
    setSelectedPremiumVendorId(vendor.id);
    setSelectedBookingService(serviceName);
    setBookingForm(defaultBookingForm(vendor.contactOptions));
    setDemoVenueServicesView('booking');
  }, []);

  const handleSubmitBooking = useCallback((mode?: 'guest') => {
    void impactLight();
    if (!selectedPremiumVendor || !selectedBookingService) return;
    const form = bookingForm;
    if (!form.partySize || Number(form.partySize) < 1) {
      toast.error('Add number of people', { description: 'Enter at least 1 guest for this booking.' });
      return;
    }
    if (mode === 'guest') {
      completeBookingRequest(selectedPremiumVendor, selectedBookingService, form, 'guest');
      return;
    }
    if (isGuestSession()) {
      openAuthPrompt({ kind: 'booking', vendorId: selectedPremiumVendor.id, vendorName: selectedPremiumVendor.name, serviceName: selectedBookingService, form });
      return;
    }
    completeBookingRequest(selectedPremiumVendor, selectedBookingService, form, 'signed-in');
  }, [bookingForm, completeBookingRequest, openAuthPrompt, selectedBookingService, selectedPremiumVendor]);

  const handlePremiumVendorAction = useCallback((action: string, vendorName: string, serviceName?: string) => {
    const vendor = premiumVendors.find((item) => item.name === vendorName);
    const eventName = action === 'Check-in'
      ? 'checkin_clicked'
      : action === 'Call Vendor'
        ? 'call_clicked'
        : null;
    if (eventName) {
      logVirtualPatchEvent(eventName, {
        surface: 'virtual_patch',
        vendorId: vendor?.id ?? null,
        vendorName,
        serviceName: serviceName ?? null,
        signedIn: !isGuestSession(),
        source: vendor?.source ?? null,
        category: vendor?.category ?? null,
      });
    }
    if (isGuestSession()) {
      openAuthPrompt({ kind: 'vendor-action', action, vendorId: vendor?.id ?? null, vendorName, serviceName });
      return;
    }
    completePremiumVendorAction(action, vendorName, serviceName, 'signed-in', vendor);
  }, [completePremiumVendorAction, openAuthPrompt, premiumVendors]);

  const handleAppleCredential = useCallback(async ({ identityToken, email, name }: AppleCredential) => {
    if (!authPromptIntent) return;
    setAuthPromptLoading(true);
    setAuthPromptError('');
    try {
      const res = await trpc.auth.appleSignIn.mutate({ identityToken, email, name, ref: 'virtual-patch' });
      if (!persistAuthResponse(res)) {
        setAuthPromptError('Sign in did not return a session. Please retry or continue as guest.');
        return;
      }
      toast.success(res.isNewUser ? 'Welcome to Bytspot!' : 'Welcome back!', { description: 'Resuming your venue request.' });
      resumeAuthPromptIntent('signed-in');
    } catch (error) {
      setAuthPromptError(getErrorMessage(error, 'Sign in with Apple failed. Please retry or continue as guest.'));
    } finally {
      setAuthPromptLoading(false);
    }
  }, [authPromptIntent, resumeAuthPromptIntent]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[1005] bg-black/70 backdrop-blur-[3px] flex items-end justify-center p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-sm max-h-[calc(100vh-24px)] overflow-y-auto rounded-[28px] border backdrop-blur-2xl shadow-2xl"
            style={{
              background: 'linear-gradient(145deg, rgba(13,16,23,0.94), rgba(15,23,42,0.86))',
              borderColor: 'rgba(103,232,249,0.25)',
              boxShadow: '0 0 42px rgba(34,211,238,0.18), 0 24px 70px rgba(0,0,0,0.58)',
            }}
            initial={{ y: 140, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 140, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-300/10 border border-cyan-300/30 text-cyan-100 text-[11px] mb-2 shadow-[0_0_18px_rgba(34,211,238,0.12)]" style={{ fontWeight: 850 }}>
                    {activeMethod === 'nfc' ? <Zap className="w-3.5 h-3.5" strokeWidth={2.4} /> : <QrCode className="w-3.5 h-3.5" strokeWidth={2.4} />}
                    {activeMethod === 'nfc' ? 'NFC Tap Reader' : 'QR Backup Scanner'}
                  </div>
                  <h3 className="text-[21px] text-white leading-tight" style={{ fontWeight: 850 }}>{showPatchLocalServices ? publicVenueName : activeMethod === 'nfc' ? 'Tap the Bytspot patch' : 'Scan the Bytspot patch'}</h3>
                  <p className="text-[13.5px] text-white/70 mt-1" style={{ fontWeight: 650 }}>{showPatchLocalServices ? 'Live local services available' : publicVenueName}</p>
                </div>
                <motion.button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 border border-white/20 backdrop-blur-md"
                  whileTap={{ scale: 0.92 }}
                >
                  <X className="w-4 h-4 text-white/80" />
                </motion.button>
              </div>

              {!hasAffirmedAge && ageGate && (
                <div className="rounded-[24px] border border-amber-300/30 bg-gradient-to-br from-amber-400/20 via-orange-500/10 to-rose-500/10 p-5 mb-4 backdrop-blur-xl">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-amber-300/20 border border-amber-300/30 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-5 h-5 text-amber-100" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] text-white" style={{ fontWeight: 850 }}>Verify your age</div>
                      <p className="text-[12.5px] text-white/70 mt-1" style={{ fontWeight: 600 }}>
                        {publicVenueName} requires guests to be {ageGate.minAge} or older. Bytspot does not store your date of birth — only your one-tap affirmation, scoped to this session.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <motion.button
                      onClick={() => {
                        emitAudit(createAuditEvent({
                          outcome: 'consent_denied',
                          method: supportsNfc ? 'nfc' : 'qr',
                          vendorId,
                          venueId,
                          reason: `age_gate_declined_min_${ageGate.minAge}`,
                        }));
                        onClose();
                      }}
                      className="flex-1 py-3 rounded-[16px] bg-white/10 border border-white/20 text-white/80 backdrop-blur-md"
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="text-[13.5px]" style={{ fontWeight: 700 }}>{'I\u2019m under ' + ageGate.minAge}</span>
                    </motion.button>
                    <motion.button
                      onClick={() => setHasAffirmedAge(true)}
                      className="flex-[1.4] py-3 rounded-[16px] bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white shadow-[0_12px_30px_rgba(251,146,60,0.22)]"
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="text-[13.5px]" style={{ fontWeight: 800 }}>{'I\u2019m ' + ageGate.minAge + ' or older'}</span>
                    </motion.button>
                  </div>
                </div>
              )}

              {showPatchLocalServices && hasAffirmedAge && !hasConsented && (
                <div className="mb-4 select-none rounded-[24px] border border-cyan-100/30 bg-[linear-gradient(145deg,rgba(8,47,73,0.92),rgba(17,24,39,0.99)_54%,rgba(88,28,135,0.78))] p-4 text-white shadow-[0_18px_44px_rgba(0,0,0,0.35),0_0_30px_rgba(168,85,247,0.22)] ring-1 ring-white/10">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/18 bg-white/10 shadow-[0_0_30px_rgba(217,70,239,0.24)]">
                      <ShieldCheck className="h-6 w-6 text-cyan-100" strokeWidth={2.6} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] uppercase tracking-[0.15em] text-cyan-100" style={{ fontWeight: 950 }}>{appClipEntry ? 'Instant access' : 'Patch reader'}</p>
                      <p className="mt-1 text-[13px] leading-5 text-slate-200" style={{ fontWeight: 760 }}>
                        {appClipEntry ? 'Services are ready now. Start the reader only when the venue asks for verified access.' : 'Start the reader once, then tap any service below to request instantly.'}
                      </p>
                    </div>
                  </div>
                  <motion.button
                    onClick={() => {
                      void impactLight();
                      if (appClipEntry) {
                        setDemoVenueServicesView('nearby');
                        setSelectedPremiumVendorId(null);
                        return;
                      }
                      setHasConsented(true);
                    }}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 px-4 py-4 text-white shadow-[0_18px_42px_rgba(168,85,247,0.35)]"
                    whileTap={{ scale: 0.97 }}
                  >
                    {appClipEntry ? <ShieldCheck className="h-4 w-4" strokeWidth={2.8} /> : <Zap className="h-4 w-4" strokeWidth={2.8} />}
                    <span className="text-[15px]" style={{ fontWeight: 900 }}>{appClipEntry ? 'Browse Services' : 'Start Reader'}</span>
                  </motion.button>
                  {appClipEntry && (
                    <button
                      type="button"
                      onClick={() => { void impactLight(); setHasConsented(true); }}
                      className="mt-3 w-full rounded-[16px] border border-white/15 bg-white/8 px-4 py-3 text-[12.5px] text-cyan-100"
                      style={{ fontWeight: 850 }}
                    >
                      Tap Patch to Verify
                    </button>
                  )}
                </div>
              )}

              {hasAffirmedAge && !hasConsented && !showPatchLocalServices && (
                <div className="rounded-[26px] border border-cyan-300/25 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-fuchsia-500/10 p-6 mb-5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-11 h-11 rounded-full bg-cyan-300/10 border border-cyan-300/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_22px_rgba(34,211,238,0.12)]">
                      <ShieldCheck className="w-5 h-5 text-cyan-100" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[16px] text-white tracking-[-0.01em]" style={{ fontWeight: 850 }}>Confirm intent to read</div>
                      <p className="text-[13px] mt-1.5" style={{ color: 'rgba(255,255,255,0.80)', fontWeight: 625, lineHeight: 1.55 }}>
                        Bytspot needs to use your device’s {supportsNfc ? 'NFC reader' : 'camera'} to verify the {publicVenueName} patch. The reader captures only the patch identifier and a one-time token — no biometrics, no continuous video, no audio.
                      </p>
                    </div>
                  </div>
                  <ul className="text-[12px] space-y-2 mb-5 pl-1" style={{ color: 'rgba(255,255,255,0.76)', fontWeight: 650, lineHeight: 1.5 }}>
                    <li>• Used only while this sheet is open. Closing the sheet stops the reader.</li>
                    <li>• Patch ID, scan timestamp, and outcome are written to the audit log for your records.</li>
                    <li>• You can revoke at any time — close this sheet, or open Settings → Privacy.</li>
                  </ul>
                  <div className="flex gap-3">
                    <motion.button
                      onClick={() => {
                        emitAudit(createAuditEvent({
                          outcome: 'consent_denied',
                          method: supportsNfc ? 'nfc' : 'qr',
                          vendorId,
                          venueId,
                          reason: 'user_declined_consent',
                        }));
                        onClose();
                      }}
                      className="px-4 py-3.5 rounded-[18px] bg-white/10 border border-white/20 text-white/80 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      style={{ flex: '0.85 1 0', minWidth: 0 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="whitespace-nowrap text-[13.5px]" style={{ color: 'rgba(255,255,255,0.86)', fontWeight: 720 }}>Not now</span>
                    </motion.button>
                    <motion.button
                      onClick={() => { void impactLight(); setHasConsented(true); }}
                      className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                      style={{ flex: '1.55 1 0', minWidth: 0 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 875 }}>Start reader</span>
                    </motion.button>
                  </div>
                </div>
              )}

              {hasConsented && (status === 'starting' || status === 'scanning' || status === 'verifying') && activeMethod === 'qr' && supportsLiveQr && (
                <div className="relative rounded-[24px] overflow-hidden border border-cyan-300/20 bg-black mb-4 aspect-[3/4]">
                  <video ref={attachVideoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-7 top-1/2 -translate-y-1/2 h-40 rounded-[26px] border-2 border-cyan-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-[88px] text-[12px] text-cyan-100/80 bg-black/40 px-3 py-1.5 rounded-full border border-cyan-300/20" style={{ fontWeight: 600 }}>
                      {status === 'verifying' ? 'Verifying patch…' : 'Align the QR code inside the frame'}
                    </div>
                  </div>
                </div>
              )}

              {hasConsented && (status === 'starting' || status === 'scanning' || status === 'verifying') && activeMethod === 'nfc' && (
                <div className="relative rounded-[24px] overflow-hidden border border-cyan-300/25 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-fuchsia-500/10 mb-4 aspect-[3/4] flex items-center justify-center backdrop-blur-xl">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),transparent_62%)]" />
                  <div className="relative flex flex-col items-center text-center px-6">
                    <div className="w-20 h-20 rounded-full border border-cyan-300/30 bg-black/25 flex items-center justify-center shadow-[0_0_38px_rgba(34,211,238,0.22)] mb-4 backdrop-blur-md">
                      <Zap className="w-9 h-9 text-cyan-100" strokeWidth={2.5} />
                    </div>
                    <p className="text-[20px] text-white" style={{ fontWeight: 850 }}>Tap ready</p>
                    <p className="text-[14px] mt-2 leading-5" style={{ color: 'rgba(255,255,255,0.78)', fontWeight: 600 }}>
                      Hold the top of your phone close to the Bytspot sticker and keep it steady for a second.
                    </p>
                  </div>
                </div>
              )}

              {(status === 'unsupported' || status === 'error' || status === 'success') && (
                <div className={`rounded-[22px] border p-4 mb-4 backdrop-blur-xl ${status === 'success' ? 'border-emerald-300/30 bg-emerald-400/10' : 'border-rose-300/30 bg-rose-400/10'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${status === 'success' ? 'bg-emerald-300/10 border-emerald-300/30' : 'bg-rose-300/10 border-rose-300/30'}`}>
                      {status === 'success' ? (
                        <ShieldCheck className="w-5 h-5 text-emerald-100" strokeWidth={2.5} />
                      ) : status === 'unsupported' ? (
                        <Camera className="w-5 h-5 text-rose-100" strokeWidth={2.4} />
                      ) : (
                        <QrCode className="w-5 h-5 text-rose-100" strokeWidth={2.4} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] text-white" style={{ fontWeight: 850 }}>
                        {status === 'success' ? 'Patch verified' : status === 'unsupported' ? 'Tap / Scan not supported here' : 'Tap / Scan needs attention'}
                      </div>
                      <p className="text-[13px] mt-1 leading-5" style={{ color: 'rgba(255,255,255,0.74)', fontWeight: 600 }}>{statusMessage}</p>
                      {verification && (
                        <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-emerald-50" style={{ fontWeight: 750 }}>
                          <div className="px-2.5 py-1 rounded-full bg-black/20 border border-emerald-300/25">Patch {verification.patchId.slice(-6)}</div>
                          <div className="px-2.5 py-1 rounded-full bg-black/20 border border-emerald-300/25">ICT {verification.tokenJti.slice(0, 8)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!showPatchLocalServices && (
                <div className="rounded-[20px] border border-cyan-300/20 bg-cyan-300/10 p-4 mb-4 text-[12.5px] leading-5 backdrop-blur-xl" style={{ color: 'rgba(255,255,255,0.74)', fontWeight: 600 }}>
                  <div>• Tap the Bytspot sticker first when NFC is available.</div>
                  <div className="mt-2">• Use QR only if NFC is unavailable.</div>
                  <div className="mt-2">• Bytspot verifies the patch with the live backend.</div>
                </div>
              )}

              {showPatchLocalServices && (
                <div data-testid={appClipEntry ? 'app-clip-local-services-panel' : 'virtual-patch-services-panel'} className="mb-4 select-none rounded-[26px] border border-cyan-100/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.99),rgba(30,41,59,0.98)_48%,rgba(88,28,135,0.82))] p-[18px] text-white shadow-[0_20px_55px_rgba(0,0,0,0.40),0_0_36px_rgba(168,85,247,0.22)] ring-1 ring-cyan-100/10">
                  {demoVenueServicesView === 'nearby' ? (
                    <>
                      {!appClipEntry && <button onClick={() => setDemoVenueServicesView('cards')} className="mb-3.5 text-[12px] text-cyan-100" style={{ fontWeight: 900 }}>← Back to venue services</button>}
                      <div className="text-center">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100" style={{ fontWeight: 950 }}>{appClipEntry ? 'App Clip Services' : 'Concierge Help'}</p>
                        <h4 className="mt-1 text-[22px] leading-7 text-white" style={{ fontWeight: 950 }}>{appClipEntry ? 'Available Local Services' : 'Nearby Premium Services'}</h4>
                        <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5 text-slate-200" style={{ fontWeight: 800 }}>
                          {appClipEntry
                            ? 'Ready near this patch. Continue as guest or sign in later to save requests.'
                            : premiumVendorsSource === 'live'
                            ? 'Live vendor records prioritized by availability, service fit, and proximity.'
                            : 'Curated services shown until live vendor records are available.'}
                        </p>
                        {premiumVendorsLoading && (
                          <p className="mt-2 text-[12px] text-cyan-100" style={{ fontWeight: 850 }}>Loading live vendor records…</p>
                        )}
                        {premiumVendorsError && (
                          <p className="mx-auto mt-2 max-w-[280px] rounded-[14px] border border-amber-200/25 bg-amber-300/10 px-3 py-2 text-[12px] text-amber-100" style={{ fontWeight: 760 }}>{premiumVendorsError}</p>
                        )}
                      </div>
                      <div
                        data-testid={appClipEntry ? 'app-clip-local-services-list' : 'virtual-patch-local-services-list'}
                        className="mt-[18px] grid grid-cols-1 gap-3 overflow-y-auto overscroll-contain pr-1 pb-1"
                        style={{ maxHeight: 'min(44vh, 420px)' }}
                      >
                        {visiblePremiumVendors.map((vendor) => (
                          <motion.button
                            key={vendor.id}
                            data-testid={appClipEntry ? 'app-clip-local-service-card' : undefined}
                            onClick={() => handleOpenPremiumVendor(vendor.id)}
                            aria-label={`Open ${vendor.name} details`}
                            className="w-full rounded-[18px] border border-white/16 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.84))] p-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_24px_rgba(0,0,0,0.24)]"
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex gap-3.5">
                              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[18px] bg-white/12 text-[24px] ring-1 ring-white/15">{vendor.photo}</div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[15px] leading-5 text-white" style={{ fontWeight: 950 }}>{vendor.name}</p>
                                  <span className="rounded-full bg-emerald-300/18 px-2 py-0.5 text-[10px] text-emerald-100" style={{ fontWeight: 900 }}>{vendor.source === 'live' ? 'Live Vendor' : 'Patch Verified'}</span>
                                </div>
                                <p className="mt-1 text-[12px] leading-5 text-cyan-100" style={{ fontWeight: 850 }}>{vendor.category} • {vendor.availability}</p>
                                <p className="text-[12px] leading-5 text-cyan-100" style={{ fontWeight: 850 }}>★ {vendor.rating} • {vendor.distance} • {vendor.eta}</p>
                                <p className="text-[11.5px] leading-5 text-slate-300" style={{ fontWeight: 720 }}>{vendor.capacity} • {vendor.availabilityWindow}</p>
                                <p className="mt-0.5 text-[12px] leading-5 text-slate-200" style={{ fontWeight: 700 }}>{vendor.preview}</p>
                                <div className="mt-2.5 rounded-[14px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 px-3 py-2 text-center text-[13px] text-white" style={{ fontWeight: 950 }}>View Services</div>
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    </>
                  ) : demoVenueServicesView === 'booking' && selectedPremiumVendor && selectedBookingService ? (
                    <>
                      <button onClick={() => setDemoVenueServicesView('detail')} className="mb-3.5 text-[12px] text-cyan-100" style={{ fontWeight: 900 }}>← Back to vendor</button>
                      <div className="text-center">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100" style={{ fontWeight: 950 }}>Booking Request</p>
                        <h4 className="mt-1 text-[22px] leading-7 text-white" style={{ fontWeight: 950 }}>Request Booking</h4>
                        <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5 text-slate-200" style={{ fontWeight: 760 }}>{selectedBookingService} with {selectedPremiumVendor.name}</p>
                      </div>
                      <div className="mt-[18px] space-y-3">
                        <label className="block rounded-[18px] border border-white/14 bg-white/8 p-3.5">
                          <span className="text-[12px] text-cyan-100" style={{ fontWeight: 900 }}>Time</span>
                          <input
                            type="datetime-local"
                            value={bookingForm.time}
                            onChange={(event) => setBookingForm((current) => ({ ...current, time: event.target.value }))}
                            className="mt-2 w-full rounded-[14px] border border-white/14 bg-slate-950/70 px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-200/50"
                          />
                        </label>
                        <label className="block rounded-[18px] border border-white/14 bg-white/8 p-3.5">
                          <span className="text-[12px] text-cyan-100" style={{ fontWeight: 900 }}>Number of people</span>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={bookingForm.partySize}
                            onChange={(event) => setBookingForm((current) => ({ ...current, partySize: event.target.value }))}
                            className="mt-2 w-full rounded-[14px] border border-white/14 bg-slate-950/70 px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-200/50"
                          />
                        </label>
                        <label className="block rounded-[18px] border border-white/14 bg-white/8 p-3.5">
                          <span className="text-[12px] text-cyan-100" style={{ fontWeight: 900 }}>Contact method</span>
                          <select
                            value={bookingForm.contactMethod}
                            onChange={(event) => setBookingForm((current) => ({ ...current, contactMethod: event.target.value }))}
                            className="mt-2 w-full rounded-[14px] border border-white/14 bg-slate-950/70 px-3 py-2 text-[13px] text-white outline-none focus:border-cyan-200/50"
                          >
                            {selectedPremiumVendor.contactOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        </label>
                        <label className="block rounded-[18px] border border-white/14 bg-white/8 p-3.5">
                          <span className="text-[12px] text-cyan-100" style={{ fontWeight: 900 }}>Special requests</span>
                          <textarea
                            value={bookingForm.specialRequests}
                            onChange={(event) => setBookingForm((current) => ({ ...current, specialRequests: event.target.value }))}
                            placeholder="Anything the vendor should know?"
                            rows={3}
                            className="mt-2 w-full resize-none rounded-[14px] border border-white/14 bg-slate-950/70 px-3 py-2 text-[13px] text-white outline-none placeholder:text-slate-500 focus:border-cyan-200/50"
                          />
                        </label>
                      </div>
                      <div className="mt-[18px] space-y-2.5">
                        <button onClick={() => handleSubmitBooking()} className="w-full rounded-[17px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 px-4 py-3 text-[14px] text-white shadow-[0_14px_30px_rgba(168,85,247,0.28)]" style={{ fontWeight: 950 }}>Request Booking</button>
                        {isGuestSession() && !authPromptIntent && (
                          <button onClick={() => handleSubmitBooking('guest')} className="w-full rounded-[17px] border border-cyan-200/30 bg-cyan-300/14 px-4 py-3 text-[13px] text-cyan-100" style={{ fontWeight: 900 }}>Continue as Guest</button>
                        )}
                        <p className="text-center text-[11px] leading-5 text-slate-300" style={{ fontWeight: 720 }}>Sign in to save to wallet and earn points.</p>
                      </div>
                    </>
                  ) : demoVenueServicesView === 'detail' && selectedPremiumVendor ? (
                    <>
                      <button onClick={() => setDemoVenueServicesView('nearby')} className="mb-3.5 text-[12px] text-cyan-100" style={{ fontWeight: 900 }}>← Nearby Premium Services</button>
                      <div className="text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-white/12 text-[28px] ring-1 ring-white/15">{selectedPremiumVendor.photo}</div>
                        <h4 className="mt-2 text-[22px] leading-7 text-white" style={{ fontWeight: 950 }}>{selectedPremiumVendor.name}</h4>
                        <p className="mt-1 text-[12px] leading-5 text-cyan-100" style={{ fontWeight: 850 }}>{selectedPremiumVendor.category} • {selectedPremiumVendor.availability} • {selectedPremiumVendor.distance}</p>
                        <p className="text-[12px] leading-5 text-cyan-100" style={{ fontWeight: 850 }}>★ {selectedPremiumVendor.rating} • {selectedPremiumVendor.source === 'live' ? 'Live Vendor' : 'Patch Verified'} • {selectedPremiumVendor.eta}</p>
                        <p className="text-[12px] leading-5 text-slate-300" style={{ fontWeight: 720 }}>{selectedPremiumVendor.capacity} • {selectedPremiumVendor.availabilityWindow}</p>
                        <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5 text-slate-200" style={{ fontWeight: 760 }}>{selectedPremiumVendor.preview}</p>
                        <p className="mx-auto mt-2 max-w-[280px] text-[12px] leading-5 text-slate-300" style={{ fontWeight: 720 }}>
                          Contact: {selectedPremiumVendor.contactOptions.join(' • ')} · Booking {selectedPremiumVendor.bookingCapability ? 'available' : 'not available'}
                        </p>
                      </div>
                      <div className="mt-[18px] space-y-3">
                        {selectedPremiumVendor.services.map((serviceName) => (
                          <div key={serviceName} className="rounded-[18px] border border-white/14 bg-white/8 p-3.5">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[14px] text-white" style={{ fontWeight: 900 }}>{serviceName}</p>
                              <button
                                onClick={() => handleStartBooking(selectedPremiumVendor, serviceName)}
                                disabled={!selectedPremiumVendor.bookingCapability || !selectedPremiumVendor.isOpen}
                                className="rounded-full bg-cyan-300 px-3 py-1.5 text-[12px] text-slate-950 disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-slate-300"
                                style={{ fontWeight: 950 }}
                              >
                                {selectedPremiumVendor.bookingCapability && selectedPremiumVendor.isOpen ? 'Book Now' : 'Unavailable'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-[18px] grid grid-cols-2 gap-3">
                        <button onClick={() => handlePremiumVendorAction('Check-in', selectedPremiumVendor.name)} className="rounded-[16px] border border-emerald-200/30 bg-emerald-300/18 px-3 py-3 text-[13px] text-emerald-100" style={{ fontWeight: 950 }}>Check-in</button>
                        <button onClick={() => handlePremiumVendorAction('Call Vendor', selectedPremiumVendor.name)} className="rounded-[16px] border border-cyan-200/30 bg-cyan-300/18 px-3 py-3 text-[13px] text-cyan-100" style={{ fontWeight: 950 }}>Call Vendor</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-center">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100" style={{ fontWeight: 950 }}>Venue Services</p>
                        <h4 className="mt-1 text-[22px] leading-7 text-white" style={{ fontWeight: 950 }}>{publicVenueName}</h4>
                        <p className="mt-1 text-[12px] leading-5 text-cyan-100" style={{ fontWeight: 850 }}>Live • Midtown Atlanta</p>
                        <p className="mx-auto mt-1 max-w-[260px] text-[13px] leading-5 text-slate-200" style={{ fontWeight: 800 }}>Tap any service below to request instantly.</p>
                      </div>
                      <div className="mt-[18px] grid grid-cols-1 gap-3">
                        {DEMO_VENUE_SERVICES.map((service) => (
                          <motion.button
                            key={service.name}
                            onClick={() => handleServiceRequest(service.name, service.cta)}
                            className="w-full rounded-[18px] border border-white/16 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.84))] p-3.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_24px_rgba(0,0,0,0.24)]"
                            whileTap={{ scale: 0.98 }}
                          >
                            <div className="flex items-start gap-3.5">
                              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br ${service.accent} text-white shadow-[0_12px_26px_rgba(168,85,247,0.24)]`} style={{ fontWeight: 950 }}>
                                {service.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[15px] leading-5 text-white" style={{ fontWeight: 950 }}>{service.name}</p>
                                <p className="mt-0.5 text-[13px] leading-5 text-cyan-100" style={{ fontWeight: 850 }}>{service.title}</p>
                                <p className="mt-0.5 text-[12px] leading-5 text-slate-200" style={{ fontWeight: 700 }}>{service.detail}</p>
                                <div className="mt-3 rounded-[14px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 px-3 py-2 text-center text-[13px] text-white shadow-[0_12px_26px_rgba(168,85,247,0.25)]" style={{ fontWeight: 950 }}>
                                  → {service.cta}
                                </div>
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </div>
                      <p className="mt-4 text-center text-[12px] leading-5 text-slate-200" style={{ fontWeight: 760 }}>Tap Concierge Help to choose from nearby premium vendors.</p>
                      <p className="text-center text-[11px] text-cyan-100" style={{ fontWeight: 850 }}>Powered by Bytspot Passport</p>
                    </>
                  )}
                </div>
              )}

              {authPromptIntent && (
                <motion.div
                  className="mb-4 rounded-[24px] border border-white/20 bg-[linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.96)_50%,rgba(8,47,73,0.88))] p-4 text-white shadow-[0_20px_55px_rgba(0,0,0,0.42),0_0_34px_rgba(34,211,238,0.18)] ring-1 ring-cyan-100/10"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <div className="text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100" style={{ fontWeight: 950 }}>Guest Preview</p>
                    <h4 className="mt-1 text-[21px] leading-7 text-white" style={{ fontWeight: 950 }}>Sign in to confirm request & earn points</h4>
                    <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-5 text-slate-200" style={{ fontWeight: 760 }}>
                      Sign in to save to your wallet and complete checkout faster.
                    </p>
                  </div>
                  <div className="mt-3 rounded-[16px] border border-cyan-100/18 bg-cyan-300/10 p-3 text-center">
                    <p className="text-[12px] text-cyan-100" style={{ fontWeight: 850 }}>You selected</p>
                    <p className="mt-0.5 text-[14px] text-white" style={{ fontWeight: 950 }}>
                      {authPromptIntent.kind === 'venue-service'
                        ? authPromptIntent.serviceName
                        : authPromptIntent.kind === 'wallet'
                          ? 'Wallet save'
                          : authPromptIntent.kind === 'booking'
                            ? `Request Booking · ${authPromptIntent.serviceName}`
                            : `${authPromptIntent.action}${authPromptIntent.serviceName ? ` · ${authPromptIntent.serviceName}` : ''}`}
                    </p>
                  </div>
                  {authPromptError && (
                    <p className="mt-3 rounded-[14px] border border-rose-300/30 bg-rose-500/12 px-3 py-2 text-[12px] text-rose-100" style={{ fontWeight: 760 }}>
                      {authPromptError}
                    </p>
                  )}
                  <div className="mt-4 space-y-2.5">
                    <AppleSignInButton
                      appearance="white"
                      label="sign-in"
                      disabled={authPromptLoading}
                      onCredential={handleAppleCredential}
                      onError={(message) => setAuthPromptError(message)}
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        onClick={() => resumeAuthPromptIntent('guest')}
                        disabled={authPromptLoading}
                        className="rounded-[16px] border border-cyan-200/30 bg-cyan-300/16 px-3 py-3 text-[13px] text-cyan-100 disabled:opacity-60"
                        style={{ fontWeight: 950 }}
                      >
                        Continue as Guest
                      </button>
                      <button
                        onClick={() => {
                          setAuthPromptIntent(null);
                          setAuthPromptError('');
                          savePendingIntent(null);
                        }}
                        disabled={authPromptLoading}
                        className="rounded-[16px] border border-white/18 bg-white/10 px-3 py-3 text-[13px] text-slate-200 disabled:opacity-60"
                        style={{ fontWeight: 850 }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {status !== 'success' && status !== 'verifying' && ((activeMethod === 'nfc' && supportsLiveQr) || (activeMethod === 'qr' && supportsNfc)) && (
                <div className="mb-4">
                  <motion.button
                    onClick={() => handleSwitchMethod(activeMethod === 'nfc' ? 'qr' : 'nfc')}
                    className="w-full py-3 rounded-[16px] bg-white/10 border border-white/20 text-white/80 backdrop-blur-md"
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.86)', fontWeight: 700 }}>
                      {activeMethod === 'nfc' ? 'Use QR instead' : 'Try tap instead'}
                    </span>
                  </motion.button>
                </div>
              )}

              <div className="flex gap-3">
                <motion.button
                  onClick={handleClose}
                  className="px-4 py-3.5 rounded-[18px] bg-white/10 border border-white/20 text-white/80 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  style={{ flex: '0.9 1 0', minWidth: 0 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="whitespace-nowrap text-[14px]" style={{ color: 'rgba(255,255,255,0.86)', fontWeight: 720 }}>{status === 'success' ? 'Done' : 'Close'}</span>
                </motion.button>

                {status === 'success' ? (
                  <motion.button
                    onClick={handleContinue}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 875 }}>{onOpenAccessWallet ? 'Continue in My Access' : 'Verified'}</span>
                  </motion.button>
                ) : status === 'unsupported' ? (
                  <motion.button
                    onClick={handleContinue}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 875 }}>{onOpenAccessWallet ? 'Continue in My Access' : 'Use Web Access'}</span>
                  </motion.button>
                ) : status === 'error' ? (
                  <motion.button
                    onClick={handleRetry}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 875 }}>Retry scan</span>
                  </motion.button>
                ) : !hasConsented && hasAffirmedAge && appClipEntry && showPatchLocalServices && demoVenueServicesView === 'cards' ? (
                  <motion.button
                    onClick={() => { void impactLight(); setDemoVenueServicesView('nearby'); setSelectedPremiumVendorId(null); }}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 900 }}>Browse Services</span>
                  </motion.button>
                ) : !hasConsented && hasAffirmedAge && showPatchLocalServices && demoVenueServicesView === 'cards' ? (
                  <motion.button
                    onClick={() => { void impactLight(); setHasConsented(true); }}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 900 }}>Start Reader</span>
                  </motion.button>
                ) : !hasConsented && hasAffirmedAge && appClipEntry && showPatchLocalServices ? (
                  <motion.button
                    onClick={() => { void impactLight(); setHasConsented(true); }}
                    className="px-4 py-3.5 rounded-[18px] bg-white/10 border border-white/20 text-cyan-100 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    style={{ flex: '1.25 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ fontSize: '14px', fontWeight: 875 }}>Tap Patch to Verify</span>
                  </motion.button>
                ) : (
                  <div className="px-4 py-3.5 rounded-[18px] bg-white/10 border border-white/20 flex items-center justify-center gap-2 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" style={{ flex: '1.1 1 0', minWidth: 0, color: 'rgba(255,255,255,0.78)' }}>
                    <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={2.4} />
                    <span className="whitespace-nowrap text-[14px]" style={{ color: 'rgba(255,255,255,0.82)', fontWeight: 720 }}>{status === 'verifying' ? 'Verifying…' : activeMethod === 'nfc' ? 'Listening for tap…' : 'Scanner live'}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}