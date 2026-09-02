import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Edit3,
  Eye,
  Leaf,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { trpc } from '../../../utils/trpc';
import { type ProviderDashboardAccess } from './providerDashboardAccess';

interface DashboardListingsProps {
  isDarkMode: boolean;
  access: ProviderDashboardAccess;
}

type ServiceTier = 'black' | 'platinum' | 'green';

type TierDefinition = {
  id: ServiceTier;
  label: string;
  shortLabel: string;
  tagline: string;
  suggestedStartingPriceCents: number;
  categories: string[];
  Icon: typeof Sparkles;
  accent: { light: string; dark: string };
  badge: { light: string; dark: string };
};

const TIER_DEFINITIONS: Record<ServiceTier, TierDefinition> = {
  black: {
    id: 'black',
    label: 'Bytspot Black',
    shortLabel: 'Black',
    tagline: 'Ultra-luxury — verified concierge tier.',
    suggestedStartingPriceCents: 45000,
    categories: ['Aviation', 'Marine', 'Dining', 'Chauffeur', 'Wellness', 'Concierge', 'Events'],
    Icon: Sparkles,
    accent: {
      light: 'border-amber-300 bg-amber-50 text-amber-900',
      dark: 'border-amber-300/60 bg-amber-300/15 text-amber-100',
    },
    badge: {
      light: 'bg-gradient-to-r from-amber-100 to-amber-50 text-amber-900 ring-1 ring-amber-300',
      dark: 'bg-gradient-to-r from-amber-400/30 to-amber-300/10 text-amber-100 ring-1 ring-amber-300/60',
    },
  },
  platinum: {
    id: 'platinum',
    label: 'Bytspot Platinum',
    shortLabel: 'Platinum',
    tagline: 'Premium service — vetted city operators.',
    suggestedStartingPriceCents: 5000,
    categories: ['Catering', 'Wellness', 'Transportation', 'Hospitality', 'Events', 'Parking', 'General'],
    Icon: BadgeCheck,
    accent: {
      light: 'border-cyan-300 bg-cyan-50 text-cyan-900',
      dark: 'border-cyan-300/60 bg-cyan-400/15 text-cyan-100',
    },
    badge: {
      light: 'bg-gradient-to-r from-cyan-100 to-sky-50 text-cyan-900 ring-1 ring-cyan-300',
      dark: 'bg-gradient-to-r from-cyan-400/30 to-sky-300/10 text-cyan-100 ring-1 ring-cyan-300/60',
    },
  },
  green: {
    id: 'green',
    label: 'Bytspot Green',
    shortLabel: 'Green',
    tagline: 'Cottage industry — neighborhood makers & local services.',
    suggestedStartingPriceCents: 500,
    categories: ['Baked Goods', 'Handmade Crafts', 'Local Services', 'Farm Stand', 'Tutoring', 'Wellness', 'General'],
    Icon: Leaf,
    accent: {
      light: 'border-emerald-300 bg-emerald-50 text-emerald-900',
      dark: 'border-emerald-300/60 bg-emerald-400/15 text-emerald-100',
    },
    badge: {
      light: 'bg-gradient-to-r from-emerald-100 to-emerald-50 text-emerald-900 ring-1 ring-emerald-300',
      dark: 'bg-gradient-to-r from-emerald-400/30 to-emerald-300/10 text-emerald-100 ring-1 ring-emerald-300/60',
    },
  },
};

const TIER_ORDER: ServiceTier[] = ['black', 'platinum', 'green'];

function isServiceTier(value: unknown): value is ServiceTier {
  return value === 'black' || value === 'platinum' || value === 'green';
}

function inferTier(service: { tier?: string | null; priceCents: number; category?: string | null }): ServiceTier {
  if (isServiceTier(service.tier)) return service.tier;
  if (service.priceCents >= TIER_DEFINITIONS.black.suggestedStartingPriceCents) return 'black';
  if (service.priceCents >= TIER_DEFINITIONS.platinum.suggestedStartingPriceCents) return 'platinum';
  return 'green';
}

type VendorService = {
  id: string;
  title: string;
  description: string | null;
  category?: string | null;
  tier?: ServiceTier | string | null;
  tagline?: string | null;
  etaLabel?: string | null;
  includedHighlights?: string[] | null;
  priceCents: number;
  currency: string;
  durationMins: number | null;
  maxGuests?: number | null;
  patchRequired?: boolean;
  status: 'active' | 'draft' | 'archived' | string;
  updatedAt?: string;
  patch?: { id: string; label?: string | null; uid?: string | null } | null;
  cashFlow?: { platformFeeCents?: number; providerPayoutEstimateCents?: number; commissionBps?: number };
};

type EditForm = {
  tier: ServiceTier;
  title: string;
  description: string;
  tagline: string;
  etaLabel: string;
  includedHighlights: string[];
  highlightDraft: string;
  category: string;
  priceDollars: string;
  durationMins: string;
  maxGuests: string;
  status: 'active' | 'draft' | 'archived';
  patchRequired: boolean;
};

const EMPTY_SERVICE_FORM: EditForm = {
  tier: 'platinum',
  title: '',
  description: '',
  tagline: '',
  etaLabel: '',
  includedHighlights: [],
  highlightDraft: '',
  category: 'Catering',
  priceDollars: '15.00',
  durationMins: '60',
  maxGuests: '1',
  status: 'draft',
  patchRequired: false,
};

const HIGHLIGHTS_MAX = 6;
const HIGHLIGHT_MAX_CHARS = 80;
const TAGLINE_MAX_CHARS = 80;
const ETA_LABEL_MAX_CHARS = 32;

function tierShowsEtaField(tier: ServiceTier): boolean {
  return tier === 'black' || tier === 'platinum';
}

const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

function formatCents(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function serviceToForm(service: VendorService): EditForm {
  const tier = inferTier(service);
  const categories = TIER_DEFINITIONS[tier].categories;
  const incomingCategory = service.category ?? '';
  const category = categories.find((c) => c.toLowerCase() === incomingCategory.toLowerCase()) ?? categories[0];
  const highlights = Array.isArray(service.includedHighlights)
    ? service.includedHighlights.filter((h): h is string => typeof h === 'string' && h.trim().length > 0).slice(0, HIGHLIGHTS_MAX)
    : [];
  return {
    tier,
    title: service.title,
    description: service.description ?? '',
    tagline: (service.tagline ?? '').slice(0, TAGLINE_MAX_CHARS),
    etaLabel: tierShowsEtaField(tier) ? (service.etaLabel ?? '').slice(0, ETA_LABEL_MAX_CHARS) : '',
    includedHighlights: highlights,
    highlightDraft: '',
    category,
    priceDollars: (service.priceCents / 100).toFixed(2),
    durationMins: service.durationMins ? String(service.durationMins) : '',
    maxGuests: service.maxGuests ? String(service.maxGuests) : '',
    status: service.status === 'archived' || service.status === 'active' ? service.status : 'draft',
    patchRequired: Boolean(service.patchRequired),
  };
}

function applyTierToForm(form: EditForm, tier: ServiceTier): EditForm {
  const categories = TIER_DEFINITIONS[tier].categories;
  const nextCategory = categories.includes(form.category) ? form.category : categories[0];
  const nextEtaLabel = tierShowsEtaField(tier) ? form.etaLabel : '';
  return { ...form, tier, category: nextCategory, etaLabel: nextEtaLabel };
}

function addHighlight(form: EditForm): EditForm {
  const trimmed = form.highlightDraft.trim().slice(0, HIGHLIGHT_MAX_CHARS);
  if (!trimmed) return { ...form, highlightDraft: '' };
  if (form.includedHighlights.length >= HIGHLIGHTS_MAX) return form;
  if (form.includedHighlights.some((h) => h.toLowerCase() === trimmed.toLowerCase())) return { ...form, highlightDraft: '' };
  return { ...form, includedHighlights: [...form.includedHighlights, trimmed], highlightDraft: '' };
}

function removeHighlight(form: EditForm, index: number): EditForm {
  return { ...form, includedHighlights: form.includedHighlights.filter((_, i) => i !== index) };
}

function hasVendorAuthToken(): boolean {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem('bytspot_auth_token');
  return Boolean(token && token !== 'guest_session' && token !== 'beta_guest');
}

type SetupCheck = { label: string; done: boolean; helper: string; requiredForActive?: boolean };

function getServiceSetupChecks(form: EditForm, patchLabel?: string | null): SetupCheck[] {
  const price = Number(form.priceDollars);
  const duration = form.durationMins.trim() ? Number(form.durationMins) : null;
  const guests = form.maxGuests.trim() ? Number(form.maxGuests) : null;
  const tierDef = TIER_DEFINITIONS[form.tier];
  return [
    { label: 'Service card copy', done: form.title.trim().length >= 2 && form.description.trim().length >= 8, helper: 'Add a clear name and customer-facing description.', requiredForActive: true },
    { label: 'Tier + category', done: Boolean(form.tier) && tierDef.categories.includes(form.category), helper: 'Choose where this service appears in booking.', requiredForActive: true },
    { label: 'Dispatch label', done: !tierShowsEtaField(form.tier) || form.etaLabel.trim().length > 0, helper: 'Show the ETA/dispatch cue customers will see before checkout.', requiredForActive: tierShowsEtaField(form.tier) },
    { label: 'Price + duration', done: Number.isFinite(price) && price > 0 && duration !== null && duration >= 15, helper: 'Publish needs a price and service time.', requiredForActive: true },
    { label: 'Guest capacity', done: guests !== null && Number.isFinite(guests) && guests >= 1, helper: 'Set capacity so staff know the fulfillment limit.', requiredForActive: true },
    { label: 'Feature chips', done: form.includedHighlights.length > 0 || form.tagline.trim().length > 0, helper: 'Optional chips/tagline help customers decide faster.' },
    { label: 'Patch requirement', done: !form.patchRequired || Boolean(patchLabel), helper: form.patchRequired ? 'Link a physical patch before publishing live.' : 'Patch verification is optional for this service.', requiredForActive: form.patchRequired },
  ];
}

function getServicePublishReadiness(form: EditForm, patchLabel?: string | null) {
  const checks = getServiceSetupChecks(form, patchLabel);
  const missingRequired = checks.filter((item) => item.requiredForActive && !item.done);
  return { checks, missingRequired, canPublish: missingRequired.length === 0 };
}

function serviceFormProgress(form: EditForm, patchLabel?: string | null) {
  const items = getServiceSetupChecks(form, patchLabel);
  const complete = items.filter((item) => item.done).length;
  return { items, complete, total: items.length, percent: Math.round((complete / items.length) * 100) };
}

function formatFormPrice(form: EditForm) {
  const value = Number(form.priceDollars);
  return Number.isFinite(value) && value > 0 ? formatCents(Math.round(value * 100)) : 'Set price';
}

function reviewRowsForForm(form: EditForm, patchLabel?: string | null) {
  const tier = TIER_DEFINITIONS[form.tier];
  return [
    { label: 'Customer card', value: form.title.trim() || 'Name needed' },
    { label: 'Tier + category', value: `${tier.shortLabel} · ${form.category}` },
    { label: 'Price + time', value: `${formatFormPrice(form)} · ${form.durationMins || 'Flexible'} min` },
    { label: 'Capacity', value: form.maxGuests ? `${form.maxGuests} guest${form.maxGuests === '1' ? '' : 's'}` : 'Flexible guests' },
    { label: 'Dispatch cue', value: tierShowsEtaField(form.tier) ? form.etaLabel.trim() || 'Add ETA label' : 'Not shown for Green' },
    { label: 'Checkout bullets', value: form.includedHighlights.length ? `${form.includedHighlights.length} configured` : 'Optional, but recommended' },
    { label: 'Patch flow', value: form.patchRequired ? patchLabel || 'Patch required after save' : 'Patch optional' },
    { label: 'Outcome', value: form.status === 'active' ? 'Customers can book after save' : 'Saved as draft until published' },
  ];
}

function customerPreviewRowsForForm(form: EditForm) {
  return [
    { label: 'Service card title', value: form.title.trim() || 'Untitled service' },
    { label: 'Card tagline', value: form.tagline.trim() || 'No tagline yet — add one to clarify the value.' },
    { label: 'Dispatch label', value: tierShowsEtaField(form.tier) ? form.etaLabel.trim() || 'Add ETA/dispatch label' : 'Hidden for Green services' },
    { label: 'Checkout chips', value: form.includedHighlights.length ? form.includedHighlights.join(' · ') : 'No chips yet — checkout will rely on description only.' },
  ];
}

export function DashboardListings({ isDarkMode, access }: DashboardListingsProps) {
  const [services, setServices] = useState<VendorService[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<VendorService | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [creatingService, setCreatingService] = useState(false);
  const [createForm, setCreateForm] = useState<EditForm>(EMPTY_SERVICE_FORM);
  const [saving, setSaving] = useState(false);
  const [hasVendorSession, setHasVendorSession] = useState(hasVendorAuthToken);
  const [serviceReviewSideBySide, setServiceReviewSideBySide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 820px)').matches : false,
  );

  const activeServices = useMemo(() => services.filter((service) => service.status === 'active'), [services]);
  const draftServices = useMemo(() => services.filter((service) => service.status === 'draft'), [services]);
  const patchRequiredServices = useMemo(() => services.filter((service) => service.patchRequired && !service.patch), [services]);
  const totalGrossCents = useMemo(() => services.reduce((sum, service) => sum + service.priceCents, 0), [services]);
  const payoutEstimateCents = useMemo(
    () => services.reduce((sum, service) => sum + (service.cashFlow?.providerPayoutEstimateCents ?? service.priceCents), 0),
    [services],
  );
  const providerSignInRequired = !hasVendorSession || message?.startsWith('Provider sign-in required');
  const canCreateServices = (access.role === 'owner' || access.role === 'manager') && !providerSignInRequired;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 820px)');
    const sync = () => setServiceReviewSideBySide(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const canEditServices = (access.role === 'owner' || access.role === 'manager') && !providerSignInRequired;

  const tone = {
    page: isDarkMode ? 'text-white' : 'text-slate-950',
    hero: isDarkMode
      ? 'border-slate-500 bg-slate-800'
      : 'border-slate-200/80 bg-white',
    heroAccent: isDarkMode
      ? 'bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_60%)]'
      : 'bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.08),transparent_60%)]',
    eyebrow: isDarkMode
      ? 'border-cyan-300 bg-cyan-900 text-cyan-50'
      : 'border-cyan-200 bg-cyan-50 text-cyan-800',
    strong: isDarkMode ? 'text-white' : 'text-slate-950',
    body: isDarkMode ? 'text-slate-200' : 'text-slate-700',
    muted: isDarkMode ? 'text-slate-300' : 'text-slate-600',
    subtle: isDarkMode ? 'text-slate-400' : 'text-slate-500',
    summary: isDarkMode
      ? 'border-slate-500 bg-slate-700'
      : 'border-slate-200/80 bg-white shadow-sm shadow-slate-200/60',
    summaryIcon: isDarkMode
      ? 'border-slate-500 bg-slate-600 text-cyan-100'
      : 'border-slate-200 bg-slate-50 text-cyan-700',
    card: isDarkMode
      ? 'border-slate-500 bg-slate-800 shadow-2xl shadow-black/45'
      : 'border-slate-200 bg-white shadow-xl shadow-slate-200/60',
    cardAvatar: isDarkMode
      ? 'bg-gradient-to-br from-cyan-700 via-sky-700 to-violet-700 text-white ring-1 ring-cyan-300'
      : 'bg-gradient-to-br from-cyan-100 via-sky-100 to-violet-100 text-cyan-700 ring-1 ring-slate-200',
    metric: isDarkMode
      ? 'border-slate-500 bg-slate-700'
      : 'border-slate-200 bg-slate-50',
    chip: isDarkMode
      ? 'border-slate-500 bg-slate-700 text-slate-50'
      : 'border-slate-200 bg-white text-slate-700',
    footer: isDarkMode
      ? 'border-slate-500 bg-slate-700'
      : 'border-slate-200 bg-slate-50/80',
    modalBackdrop: isDarkMode ? 'bg-slate-800' : 'bg-slate-800/65',
    modal: isDarkMode
      ? 'border-slate-500 bg-slate-800 text-white shadow-2xl shadow-black/80'
      : 'border-slate-200 bg-white shadow-2xl shadow-slate-300/60',
    input: isDarkMode
      ? 'border-slate-500 bg-slate-700 text-white placeholder:text-slate-300'
      : 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-400',
    secondaryBtn: isDarkMode
      ? 'border-slate-500 bg-slate-700 text-white hover:bg-slate-600'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50',
    statusActive: isDarkMode
      ? 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/30'
      : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    statusInactive: isDarkMode
      ? 'bg-slate-700 text-slate-100 ring-1 ring-slate-500'
      : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  };

  const loadServices = async () => {
    const hasSession = hasVendorAuthToken();
    setHasVendorSession(hasSession);
    if (!hasSession) {
      setServices([]);
      setMessage('Provider sign-in required: sign in with the Provider business account that owns this workspace to load and publish marketplace services.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await trpc.vendors.listServices.query({ status: 'all', limit: 50 });
      setServices(result?.services ?? []);
      if (!result?.services?.length) {
        setMessage('No Provider services are live yet. Create services in the Provider portal, then return here to manage pricing and booking details.');
      }
    } catch (err: unknown) {
      setServices([]);
      setMessage(err instanceof Error ? err.message : 'Unable to load Provider services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadServices(); }, []);

  const openEdit = (service: VendorService) => {
    setEditingService(service);
    setEditForm(serviceToForm(service));
    setMessage(null);
  };

  const openCreate = () => {
    if (providerSignInRequired) {
      setMessage('Provider sign-in required: sign in with the Provider business account that owns this workspace before creating a bookable service.');
      return;
    }
    if (access.role === 'staff') {
      setMessage('Manager or Owner access required: Staff can view bookings and check in guests, but cannot create services.');
      return;
    }
    setCreateForm(EMPTY_SERVICE_FORM);
    setCreatingService(true);
    setMessage(null);
  };

  const validateForm = (form: EditForm) => {
    const price = Number(form.priceDollars);
    const duration = form.durationMins.trim() ? Number(form.durationMins) : null;
    const maxGuests = form.maxGuests.trim() ? Number(form.maxGuests) : null;
    const tierDef = TIER_DEFINITIONS[form.tier];
    const tagline = form.tagline.trim();
    const etaLabel = tierShowsEtaField(form.tier) ? form.etaLabel.trim() : '';
    const highlights = form.includedHighlights
      .map((h) => h.trim())
      .filter((h) => h.length > 0)
      .slice(0, HIGHLIGHTS_MAX);
    if (form.title.trim().length < 2) return { error: 'Service title must be at least 2 characters.' };
    if (!tierDef.categories.includes(form.category)) return { error: `Choose a category that belongs to ${tierDef.label}.` };
    if (tagline.length > TAGLINE_MAX_CHARS) return { error: `Tagline must be ${TAGLINE_MAX_CHARS} characters or fewer.` };
    if (etaLabel.length > ETA_LABEL_MAX_CHARS) return { error: `ETA label must be ${ETA_LABEL_MAX_CHARS} characters or fewer.` };
    if (highlights.some((h) => h.length > HIGHLIGHT_MAX_CHARS)) return { error: `Each highlight must be ${HIGHLIGHT_MAX_CHARS} characters or fewer.` };
    if (!Number.isFinite(price) || price <= 0) return { error: 'Service price must be greater than $0.' };
    if (duration !== null && (!Number.isFinite(duration) || duration < 15)) return { error: 'Duration must be blank or at least 15 minutes.' };
    if (maxGuests !== null && (!Number.isFinite(maxGuests) || maxGuests < 1)) return { error: 'Max guests must be blank or at least 1.' };
    return {
      priceCents: Math.round(price * 100),
      durationMins: duration === null ? null : Math.round(duration),
      maxGuests: maxGuests === null ? null : Math.round(maxGuests),
      tagline: tagline || null,
      etaLabel: etaLabel || null,
      includedHighlights: highlights,
    };
  };

  const ensureCanPublish = (form: EditForm, patchLabel?: string | null) => {
    const readiness = getServicePublishReadiness(form, patchLabel);
    if (readiness.canPublish) return null;
    return `Finish before publishing live: ${readiness.missingRequired.map((item) => item.label).join(', ')}.`;
  };

  const createService = async (statusOverride?: 'active' | 'draft') => {
    if (saving) return;
    if (providerSignInRequired) {
      setMessage('Provider sign-in required: sign in with the Provider business account that owns this workspace before creating a bookable service.');
      return;
    }
    if (access.role === 'staff') {
      setMessage('Manager or Owner access required: Staff can view bookings and check in guests, but cannot create services.');
      return;
    }
    const validated = validateForm(createForm);
    if ('error' in validated) return setMessage(validated.error);
    if ((statusOverride ?? createForm.status) === 'active') {
      const publishError = ensureCanPublish(createForm);
      if (publishError) return setMessage(publishError);
    }

    setSaving(true);
    setMessage(null);
    try {
      const result = await trpc.vendors.createService.mutate({
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        category: createForm.category.trim(),
        tier: createForm.tier,
        tagline: validated.tagline,
        etaLabel: validated.etaLabel,
        includedHighlights: validated.includedHighlights,
        priceCents: validated.priceCents,
        durationMins: validated.durationMins,
        maxGuests: validated.maxGuests,
        patchRequired: createForm.patchRequired,
        status: statusOverride ?? (createForm.status === 'archived' ? 'draft' : createForm.status),
      });
      const created = result.service as VendorService;
      setServices((prev) => [created, ...prev.filter((service) => service.id !== created.id)]);
      setCreatingService(false);
      const createdStatus = statusOverride ?? createForm.status;
      setMessage(createdStatus === 'active' ? 'Service published live. It is now available to Discover and booking checkout.' : 'Service saved as a draft. Publish it when pricing, duration, photos, and patch requirements are ready.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Unable to create Provider service.');
    } finally {
      setSaving(false);
    }
  };

  const saveService = async (statusOverride?: 'active' | 'draft') => {
    if (!editingService || !editForm || saving) return;
    if (!canEditServices) {
      setMessage('This role is view-only for Provider services. Ask an Owner or Manager to make catalog changes.');
      return;
    }
    const validated = validateForm(editForm);
    if ('error' in validated) return setMessage(validated.error);
    const nextStatus = statusOverride ?? editForm.status;
    if (nextStatus === 'active') {
      const publishError = ensureCanPublish(editForm, editingService.patch?.label || editingService.patch?.uid || null);
      if (publishError) return setMessage(publishError);
    }

    setSaving(true);
    setMessage(null);
    try {
      const result = await trpc.vendors.updateService.mutate({
        serviceId: editingService.id,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        category: editForm.category.trim(),
        tier: editForm.tier,
        tagline: validated.tagline,
        etaLabel: validated.etaLabel,
        includedHighlights: validated.includedHighlights,
        priceCents: validated.priceCents,
        durationMins: validated.durationMins,
        maxGuests: validated.maxGuests,
        patchRequired: editForm.patchRequired,
        status: nextStatus,
      });
      const updated = result.service as VendorService;
      setServices((prev) => prev.map((service) => (service.id === updated.id ? updated : service)));
      setEditingService(null);
      setEditForm(null);
      setMessage('Service updated. Discover cards will use the latest Provider service metadata.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Unable to update Provider service.');
    } finally {
      setSaving(false);
    }
  };

  const archiveService = async () => {
    if (!editingService || saving) return;
    if (access.role !== 'owner') {
      setMessage('Owner access required: only Owners can archive Provider services.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const result = await trpc.vendors.updateService.mutate({ serviceId: editingService.id, status: 'archived' });
      const updated = result.service as VendorService;
      setServices((prev) => prev.map((service) => (service.id === updated.id ? updated : service)));
      setEditingService(null);
      setEditForm(null);
      setMessage('Service archived. It is hidden from booking while historical records remain available.');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Unable to archive Provider service.');
    } finally {
      setSaving(false);
    }
  };

  const summaryCards = access.canSeeFinancials
    ? [
        { label: 'Station Mode', value: String(activeServices.length), helper: `${services.length} total services`, Icon: BadgeCheck },
        { label: 'Published price total', value: formatCents(totalGrossCents), helper: 'Sum of listed service rates', Icon: DollarSign },
        { label: 'Payout estimate', value: formatCents(payoutEstimateCents), helper: 'After platform commission', Icon: CreditCard },
      ]
    : [
        { label: 'Station Mode', value: String(activeServices.length), helper: `${services.length} total services`, Icon: BadgeCheck },
        { label: 'Draft services', value: String(draftServices.length), helper: 'Needs owner/manager review', Icon: Edit3 },
        { label: 'Patch required', value: String(patchRequiredServices.length), helper: 'Physical verification outstanding', Icon: ShieldCheck },
      ];

  const scrollToReview = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  const renderServiceSetupForm = ({
    form,
    setForm,
    mode,
    patchLabel,
    allowArchived = false,
  }: {
    form: EditForm;
    setForm: (next: EditForm) => void;
    mode: 'create' | 'edit';
    patchLabel?: string | null;
    allowArchived?: boolean;
  }) => {
    const reviewId = `service-${mode}-review`;
    const progress = serviceFormProgress(form, patchLabel);
    const readiness = getServicePublishReadiness(form, patchLabel);
    const tierDef = TIER_DEFINITIONS[form.tier];
    const fieldId = (name: string) => mode === 'create' ? `service-create-${name}` : `service-${name}`;
    const highlightPrefix = mode === 'create' ? 'service-create' : 'service-edit';
    const sectionClass = `rounded-2xl border p-4 ${tone.metric}`;
    const sectionTitle = (step: string, title: string, helper: string) => (
      <div className="mb-4 flex items-start gap-3">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] ${isDarkMode ? 'bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-300/50' : 'bg-cyan-50 text-cyan-800 ring-1 ring-cyan-200'}`} style={{ fontWeight: 900 }}>{step}</span>
        <div className="min-w-0">
          <h4 className={`text-[15px] leading-5 ${tone.strong}`} style={{ fontWeight: 850 }}>{title}</h4>
          <p className={`mt-0.5 text-[12px] leading-5 ${tone.subtle}`}>{helper}</p>
        </div>
      </div>
    );

    return (
      <div
        className="flex gap-3"
        style={{ flexDirection: serviceReviewSideBySide ? 'row' : 'column', alignItems: serviceReviewSideBySide ? 'flex-start' : 'stretch' }}
      >
        <div className="min-w-0 flex-1 space-y-4">
          <div className={sectionClass} data-testid={`service-${mode}-progress`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={`text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 800 }}>Setup progress</p>
                <p className={`mt-1 text-[13px] ${tone.body}`}>Complete the cards from top to bottom, then review before saving.</p>
              </div>
              <button type="button" onClick={() => scrollToReview(reviewId)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] transition ${tone.secondaryBtn}`} style={{ fontWeight: 800 }}>
                <Eye className="h-4 w-4" strokeWidth={2.25} /> Review
              </button>
            </div>
            <div className={`mt-4 h-2 overflow-hidden rounded-full ${isDarkMode ? 'bg-slate-900/60' : 'bg-slate-200'}`}>
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500" style={{ width: `${progress.percent}%` }} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {progress.items.map((item) => (
                <div key={item.label} className={`min-h-[58px] rounded-xl border px-2.5 py-2 text-[11px] ${item.done ? (isDarkMode ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-800') : tone.chip}`}>
                  <span className="flex items-center gap-1.5" style={{ fontWeight: 800 }}>
                    <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${item.done ? '' : 'opacity-40'}`} strokeWidth={2.4} />
                    <span className="min-w-0 truncate">{item.label}</span>
                    {item.requiredForActive && <span className="ml-auto text-[9px] uppercase tracking-[0.12em] opacity-70">Live</span>}
                  </span>
                  <span className="mt-1 block leading-4 opacity-80">{item.done ? 'Ready' : item.helper}</span>
                </div>
              ))}
            </div>
            {!readiness.canPublish && (
              <div className={`mt-3 rounded-xl border px-3 py-2 text-[12px] leading-5 ${isDarkMode ? 'border-amber-300/40 bg-amber-400/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`} data-testid={`service-${mode}-publish-missing`}>
                <span style={{ fontWeight: 850 }}>Missing before Publish Live:</span> {readiness.missingRequired.map((item) => item.label).join(', ')}.
              </div>
            )}
          </div>

          <section className={sectionClass}>
            {sectionTitle('1', 'Service Card', 'This is the customer-facing card headline and explanation.')}
            <div data-testid={`service-${mode}-tier-picker`}>
              <p className={`text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Service tier</p>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {TIER_ORDER.map((tierId) => {
                  const def = TIER_DEFINITIONS[tierId];
                  const TierIcon = def.Icon;
                  const selected = form.tier === tierId;
                  return (
                    <button
                      key={tierId}
                      type="button"
                      data-testid={`service-${mode}-tier-${tierId}`}
                      aria-pressed={selected}
                      onClick={() => setForm(applyTierToForm(form, tierId))}
                      className={`flex min-h-[76px] items-start gap-2 rounded-xl border p-3 text-left transition ${selected ? (isDarkMode ? def.accent.dark : def.accent.light) + ' ring-2 ring-cyan-300/60' : tone.secondaryBtn}`}
                      style={{ fontWeight: 750 }}
                    >
                      <TierIcon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                      <span className="min-w-0"><span className="block text-[12px] uppercase tracking-[0.12em]">{def.shortLabel}</span><span className={`mt-1 block text-[11px] leading-4 ${selected ? '' : tone.subtle}`}>From ${(def.suggestedStartingPriceCents / 100).toLocaleString('en-US')}</span></span>
                    </button>
                  );
                })}
              </div>
              <p className={`mt-2 text-[12px] leading-5 ${tone.subtle}`}>{tierDef.tagline}</p>
            </div>
            <div className="mt-4 grid gap-3">
              <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Service name<input data-testid={fieldId('title-input')} placeholder="Private Chef Dinner" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
              <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Description<textarea data-testid={fieldId('description-input')} placeholder="What will the guest receive? Keep it plain and specific." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={`mt-1.5 w-full resize-none rounded-xl border px-3.5 py-2.5 text-[14px] normal-case leading-6 tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
            </div>
          </section>

          <section className={sectionClass}>
            {sectionTitle('2', 'End-customer cues', 'Write the tagline and feature chips exactly as customers will scan them in booking.')}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}><span className="flex items-center justify-between">Tagline<span className={`text-[10px] normal-case tracking-normal ${tone.subtle}`}>{form.tagline.length}/{TAGLINE_MAX_CHARS}</span></span><input data-testid={fieldId('tagline-input')} placeholder="Fast, verified, and ready for guests" value={form.tagline} maxLength={TAGLINE_MAX_CHARS} onChange={(e) => setForm({ ...form, tagline: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
              {tierShowsEtaField(form.tier) && <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}><span className="flex items-center justify-between">ETA label<span className={`text-[10px] normal-case tracking-normal ${tone.subtle}`}>{form.etaLabel.length}/{ETA_LABEL_MAX_CHARS}</span></span><input data-testid={fieldId('eta-label-input')} placeholder={form.tier === 'black' ? 'Wheels-up in 90 min' : 'ETA 7 min'} value={form.etaLabel} maxLength={ETA_LABEL_MAX_CHARS} onChange={(e) => setForm({ ...form, etaLabel: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>}
            </div>
            <div className="mt-4" data-testid={`${highlightPrefix}-highlights`}>
              <p className={`flex items-center justify-between text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Feature chips / checkout bullets<span className={`text-[10px] normal-case tracking-normal ${tone.subtle}`}>{form.includedHighlights.length}/{HIGHLIGHTS_MAX}</span></p>
              {form.includedHighlights.length > 0 && <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-xl border border-dashed border-inherit p-2">{form.includedHighlights.map((highlight, idx) => <span key={`${idx}-${highlight}`} data-testid={`${highlightPrefix}-highlight-chip-${idx}`} className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] normal-case tracking-normal ${tone.chip}`} style={{ fontWeight: 650 }}><span className="min-w-0 truncate">{highlight}</span><button type="button" data-testid={`${highlightPrefix}-highlight-remove-${idx}`} onClick={() => setForm(removeHighlight(form, idx))} className="rounded-full p-0.5 transition hover:bg-black/10" aria-label={`Remove ${highlight}`}><X className="h-3 w-3" strokeWidth={2.5} /></button></span>)}</div>}
              {form.includedHighlights.length < HIGHLIGHTS_MAX && <div className="mt-2 flex flex-col gap-2 sm:flex-row"><input data-testid={`${highlightPrefix}-highlight-input`} placeholder="Catering included" value={form.highlightDraft} maxLength={HIGHLIGHT_MAX_CHARS} onChange={(e) => setForm({ ...form, highlightDraft: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); setForm(addHighlight(form)); } }} className={`min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /><button type="button" data-testid={`${highlightPrefix}-highlight-add`} onClick={() => setForm(addHighlight(form))} disabled={!form.highlightDraft.trim()} className={`inline-flex justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-50 ${tone.secondaryBtn}`} style={{ fontWeight: 750 }}><Plus className="h-4 w-4" strokeWidth={2.5} />Add bullet</button></div>}
              <p className={`mt-2 text-[12px] leading-5 ${tone.subtle}`}>These appear as compact chips/bullets in checkout. Use plain outcomes like “Catering included,” “Up to 4 guests,” or “Patch verified.”</p>
            </div>
          </section>

          <section className={sectionClass}>
            {sectionTitle('3', 'Booking Rules', 'Set the operational rules that decide whether this can go live.')}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Service category<span className={`mt-1 block text-[11px] normal-case tracking-normal ${tone.subtle}`}>Controls where customers discover this service.</span><select data-testid={fieldId('category-input')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`}>{TIER_DEFINITIONS[form.tier].categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Lifecycle state<span className={`mt-1 block text-[11px] normal-case tracking-normal ${tone.subtle}`}>Draft is private. Active appears in booking.</span><select data-testid={fieldId('status-select')} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as EditForm['status'] })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`}><option value="draft">Draft</option><option value="active">Active</option>{allowArchived && <option value="archived">Archived</option>}</select></label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Customer price<input data-testid={fieldId('price-input')} type="number" min="0.01" step="0.01" value={form.priceDollars} onChange={(e) => setForm({ ...form, priceDollars: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
              <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Service duration<input data-testid={fieldId('duration-input')} type="number" min="15" step="5" value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
              <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 700 }}>Guest capacity<input data-testid={fieldId('max-guests-input')} type="number" min="1" step="1" value={form.maxGuests} onChange={(e) => setForm({ ...form, maxGuests: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className={`flex items-start gap-3 rounded-xl border p-3 text-[12px] leading-5 ${tone.metric}`} style={{ fontWeight: 700 }}><input data-testid={fieldId('patch-required-checkbox')} type="checkbox" checked={form.patchRequired} onChange={(e) => setForm({ ...form, patchRequired: e.target.checked })} className="mt-1" /><span><span className={tone.strong}>Patch verification required</span><br /><span className={tone.subtle}>{patchLabel ? `Connected patch: ${patchLabel}` : 'Optional. If required, link a physical patch before publishing live.'}</span></span></label>
              <div className={`rounded-xl border border-dashed p-3 text-[12px] leading-5 ${tone.metric}`}><span className={tone.strong}>Photos</span><br /><span className={tone.subtle}>Photo upload comes later. This setup keeps the service card bookable first.</span></div>
            </div>
            {form.patchRequired && !patchLabel && <p className={`mt-3 rounded-xl border px-3 py-2 text-[12px] leading-5 ${isDarkMode ? 'border-amber-300/40 bg-amber-400/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>Patch required: save as draft first, link the patch, then publish live.</p>}
          </section>
        </div>

        <aside
          id={reviewId}
          data-testid={reviewId}
          className={`max-h-[min(72dvh,680px)] w-full shrink-0 overflow-y-auto rounded-2xl border p-4 ${tone.metric}`}
          style={{ width: serviceReviewSideBySide ? 320 : '100%', position: serviceReviewSideBySide ? 'sticky' : 'static', top: 0 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div><p className={`text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 800 }}>Review before saving</p><h4 className={`mt-1 text-[18px] leading-6 ${tone.strong}`} style={{ fontWeight: 850 }}>{form.title.trim() || 'Untitled service'}</h4></div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] ${isDarkMode ? tierDef.badge.dark : tierDef.badge.light}`} style={{ fontWeight: 850 }}>{tierDef.shortLabel}</span>
          </div>
          <p className={`mt-3 text-[12px] leading-5 ${tone.subtle}`}>Audit what customers and staff will see without leaving this viewport.</p>
          <div className="mt-4 space-y-2">
            {reviewRowsForForm(form, patchLabel).map((row) => <div key={row.label} className={`rounded-xl border px-3 py-2.5 ${isDarkMode ? 'border-slate-500/70 bg-slate-900/20' : 'border-slate-200 bg-white/70'}`}><p className={`text-[10px] uppercase tracking-[0.12em] ${tone.muted}`} style={{ fontWeight: 750 }}>{row.label}</p><p className={`mt-1 break-words text-[13px] leading-5 ${tone.strong}`} style={{ fontWeight: 700 }}>{row.value}</p></div>)}
          </div>
          <div className="mt-4 rounded-xl border border-dashed border-inherit p-3" data-testid={`service-${mode}-customer-preview`}>
            <p className={`text-[10px] uppercase tracking-[0.12em] ${tone.muted}`} style={{ fontWeight: 800 }}>End-customer preview</p>
            <div className="mt-2 space-y-2">
              {customerPreviewRowsForForm(form).map((row) => <div key={row.label}><p className={`text-[10px] uppercase tracking-[0.12em] ${tone.muted}`} style={{ fontWeight: 700 }}>{row.label}</p><p className={`mt-0.5 break-words text-[12px] leading-5 ${tone.strong}`}>{row.value}</p></div>)}
            </div>
            {form.includedHighlights.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{form.includedHighlights.map((highlight) => <span key={highlight} className={`max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] ${tone.chip}`}>{highlight}</span>)}</div>}
          </div>
          <div className={`mt-4 rounded-xl border p-3 text-[12px] leading-5 ${readiness.canPublish ? (isDarkMode ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-100' : 'border-emerald-200 bg-emerald-50 text-emerald-900') : (isDarkMode ? 'border-amber-300/40 bg-amber-400/10 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900')}`} data-testid={`service-${mode}-lifecycle-readiness`}>
            <p style={{ fontWeight: 850 }}>{readiness.canPublish ? 'Ready to publish live' : 'Draft only until these are fixed'}</p>
            {!readiness.canPublish && <ul className="mt-2 list-disc space-y-1 pl-4">{readiness.missingRequired.map((item) => <li key={item.label}>{item.label}: {item.helper}</li>)}</ul>}
          </div>
        </aside>
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${tone.page}`} data-testid="provider-services-panel">
      <motion.section
        className={`relative overflow-hidden rounded-3xl border p-6 lg:p-8 ${tone.hero}`}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className={`pointer-events-none absolute inset-0 ${tone.heroAccent}`} aria-hidden />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            <div
              className={`mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${tone.eyebrow}`}
              style={{ fontWeight: 700 }}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              Service management · {access.role}
            </div>
            <h1
              className={`text-[30px] leading-[1.1] tracking-tight lg:text-[40px] ${tone.strong}`}
              style={{ fontWeight: 800, letterSpacing: '-0.02em' }}
            >
              My Services
            </h1>
            <p className={`mt-3 text-[15px] leading-6 ${tone.body}`}>
              {activeServices.length} Station Mode • {draftServices.length} Draft. Manage the services that power customer booking, patch verification, and staff handoffs.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end">
            <button
              type="button"
              onClick={() => void loadServices()}
              disabled={loading}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition disabled:opacity-60 ${tone.secondaryBtn}`}
              style={{ fontWeight: 600 }}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2.25} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              disabled={!canCreateServices}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ fontWeight: 700 }}
              title={access.role === 'staff' ? 'Managers and Owners can create services' : providerSignInRequired ? 'Sign in with the Provider business account that owns this workspace' : 'Create a new service'}
              data-testid="provider-service-add"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Create New Service
            </button>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {summaryCards.map(({ label, value, helper, Icon }, index) => (
          <motion.div
            key={label}
            className={`rounded-2xl border p-5 ${tone.summary}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...springConfig, delay: index * 0.05 }}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-[12px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>{label}</p>
                <p className={`mt-2 text-[28px] leading-none tracking-tight ${tone.strong}`} style={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {value}
                </p>
                <p className={`mt-2 text-[12px] ${tone.subtle}`}>{helper}</p>
              </div>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${tone.summaryIcon}`}>
                <Icon className="h-5 w-5" strokeWidth={2.25} />
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {message && (
        <div
          className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-[13px] font-extrabold leading-5 shadow-lg ${
            isDarkMode
              ? 'border-amber-300 bg-amber-50 text-amber-950 shadow-amber-950/15'
              : 'border-amber-200 bg-amber-50 text-amber-900 shadow-amber-100/70'
          }`}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" strokeWidth={2.25} />
          <span>{message}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {loading ? (
          <div className={`rounded-2xl border p-6 text-[14px] ${tone.card} ${tone.body}`}>
            <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Loading Provider services…</span>
          </div>
        ) : services.length === 0 ? (
          <div className={`rounded-2xl border p-6 text-[14px] leading-6 xl:col-span-2 ${tone.card} ${tone.body}`}>
            <p className={tone.strong} style={{ fontWeight: 800 }}>No services configured yet.</p>
            <p className="mt-1">Create one clear service card first. You can keep it as a draft while you review pricing, category, and patch requirements.</p>
          </div>
        ) : (
          services.map((service, index) => {
            const isActive = service.status === 'active';
            const updatedLabel = service.updatedAt
              ? new Date(service.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : 'recently';
            const payoutCents = service.cashFlow?.providerPayoutEstimateCents ?? service.priceCents;
            const commissionPct = service.cashFlow?.commissionBps != null
              ? (service.cashFlow.commissionBps / 100).toFixed(1) + '%'
              : null;
            const category = service.category || 'General';
            const maxGuests = service.maxGuests ? `${service.maxGuests} guest${service.maxGuests === 1 ? '' : 's'}` : 'Flexible';
            const tier = inferTier(service);
            const tierDef = TIER_DEFINITIONS[tier];
            const TierIcon = tierDef.Icon;
            return (
              <motion.article
                key={service.id}
                data-testid={`provider-service-card-${service.id}`}
                data-service-tier={tier}
                className={`group flex flex-col overflow-hidden rounded-2xl border transition ${tone.card}`}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springConfig, delay: 0.12 + index * 0.06 }}
              >
                <div className="flex flex-1 flex-col gap-5 p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.cardAvatar}`}>
                        <Tag className="h-5 w-5" strokeWidth={2.25} />
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`}
                          style={{ fontWeight: 700 }}
                        >
                          Bookable service
                        </p>
                        <h2
                          className={`mt-1 truncate text-[20px] leading-tight ${tone.strong}`}
                          style={{ fontWeight: 700, letterSpacing: '-0.01em' }}
                          title={service.title}
                        >
                          {service.title}
                        </h2>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-row flex-wrap items-start gap-1.5 sm:flex-col sm:items-end">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${isDarkMode ? tierDef.badge.dark : tierDef.badge.light}`}
                        style={{ fontWeight: 800, letterSpacing: '0.16em' }}
                        title={tierDef.tagline}
                      >
                        <TierIcon className="h-3 w-3" strokeWidth={2.5} />
                        {tierDef.shortLabel}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${
                          isActive ? tone.statusActive : tone.statusInactive
                        }`}
                        style={{ fontWeight: 700 }}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                        {service.status}
                      </span>
                    </div>
                  </div>

                  <p className={`text-[14px] leading-6 ${tone.body}`}>
                    {service.description || 'Add a clear description so customers understand the service before checkout.'}
                  </p>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    <div className={`rounded-xl border p-3 ${tone.metric}`}>
                      <p className={`text-[10px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>Price</p>
                      <p className={`mt-1.5 text-[17px] tracking-tight ${tone.strong}`} style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
                        {formatCents(service.priceCents, service.currency)}
                      </p>
                    </div>
                    <div className={`rounded-xl border p-3 ${tone.metric}`}>
                      <p className={`text-[10px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>Duration</p>
                      <p className={`mt-1.5 text-[17px] tracking-tight ${tone.strong}`} style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>
                        {service.durationMins ? `${service.durationMins} min` : 'Flexible'}
                      </p>
                    </div>
                    <div className={`rounded-xl border p-3 ${tone.metric}`}>
                      <p className={`text-[10px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>{access.canSeeFinancials ? 'Payout' : 'Guests'}</p>
                      <p
                        className={`mt-1.5 text-[17px] tracking-tight ${access.canSeeFinancials ? (isDarkMode ? 'text-emerald-300' : 'text-emerald-700') : tone.strong}`}
                        style={{ fontWeight: 700, letterSpacing: '-0.01em' }}
                      >
                        {access.canSeeFinancials ? formatCents(payoutCents, service.currency) : maxGuests}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-stretch gap-2 text-[12px] sm:items-center">
                    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.chip}`}>
                      <Tag className={`h-3 w-3 ${isDarkMode ? 'text-violet-300' : 'text-violet-700'}`} strokeWidth={2.25} />
                      <span className="min-w-0 truncate">{category}</span>
                    </span>
                    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.chip}`}>
                      <CalendarClock className="h-3 w-3" strokeWidth={2.25} />
                      <span className="min-w-0 truncate">Updated {updatedLabel}</span>
                    </span>
                    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.chip}`}>
                      <ShieldCheck className={`h-3 w-3 ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`} strokeWidth={2.25} />
                      <span className="min-w-0 truncate">{service.patch?.label || service.patch?.uid || (service.patchRequired ? 'Patch required' : 'Patch optional')}</span>
                    </span>
                    {commissionPct && access.canSeeFinancials && (
                      <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.chip}`}>
                        <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
                        <span className="min-w-0 truncate">Commission {commissionPct}</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className={`border-t p-4 ${tone.footer}`}>
                  <button
                    type="button"
                    data-testid={`provider-service-edit-${service.id}`}
                    onClick={() => openEdit(service)}
                    disabled={!canEditServices}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ fontWeight: 700 }}
                  >
                    <Edit3 className="h-4 w-4" strokeWidth={2.5} />
                    {canEditServices ? 'Edit Service' : 'View-only for Staff'}
                  </button>
                </div>
              </motion.article>
            );
          })
        )}
      </div>

      <AnimatePresence>
        {creatingService && (
          <motion.div
              className={`fixed inset-0 z-[9999] isolate flex items-stretch justify-center px-3 py-3 sm:items-center sm:px-4 sm:py-6 ${tone.modalBackdrop}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="provider-service-create-modal"
          >
            <motion.div className={`relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border ${tone.modal}`} initial={{ y: 32, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 32, scale: 0.97 }} transition={springConfig}>
              <div className="flex items-start justify-between gap-3 border-b border-inherit p-6 pb-5">
                <div>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`} style={{ fontWeight: 700 }}>Create New Service</p>
                  <h3 className={`mt-1.5 text-[22px] tracking-tight ${tone.strong}`} style={{ fontWeight: 700 }}>Set up a bookable service</h3>
                  <p className={`mt-1 text-[12px] ${tone.subtle}`}>Follow the three cards, review the summary, then save or publish.</p>
                </div>
                <button type="button" onClick={() => setCreatingService(false)} className={`rounded-full border p-2 transition ${tone.secondaryBtn}`} aria-label="Close create dialog"><X className="h-4 w-4" strokeWidth={2.25} /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {renderServiceSetupForm({ form: createForm, setForm: setCreateForm, mode: 'create' })}
              </div>
              <div
                className={`flex gap-2 border-t px-4 py-3 ${tone.footer}`}
                style={{
                  flexDirection: serviceReviewSideBySide ? 'row' : 'column-reverse',
                  alignItems: serviceReviewSideBySide ? 'center' : 'stretch',
                  justifyContent: serviceReviewSideBySide ? 'flex-end' : 'stretch',
                  paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
                }}
              >
                <button type="button" onClick={() => setCreatingService(false)} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition ${tone.secondaryBtn}`} style={{ fontWeight: 600 }}>Cancel</button>
                <button type="button" data-testid="save-draft-service-button" onClick={() => createService('draft')} disabled={saving} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-60 ${tone.secondaryBtn}`} style={{ fontWeight: 700 }}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Save className="h-4 w-4" strokeWidth={2.5} />} Save as Draft</button>
                <button type="button" data-testid="create-service-button" onClick={() => createService('active')} disabled={saving || !getServicePublishReadiness(createForm).canPublish} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60" style={{ fontWeight: 700 }} title={getServicePublishReadiness(createForm).canPublish ? 'Publish this service live' : 'Complete missing live requirements first'}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Save className="h-4 w-4" strokeWidth={2.5} />} Publish Live</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {editingService && editForm && (
          <motion.div
          className={`fixed inset-0 z-[9999] isolate flex items-stretch justify-center px-3 py-3 sm:items-center sm:px-4 sm:py-6 ${tone.modalBackdrop}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="provider-service-edit-modal"
          >
            <motion.div
              className={`relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border ${tone.modal}`}
              initial={{ y: 32, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 32, scale: 0.97 }}
              transition={springConfig}
            >
              <div className="flex items-start justify-between gap-3 border-b border-inherit p-6 pb-5">
                <div className="min-w-0">
                  <p
                    className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`}
                    style={{ fontWeight: 700 }}
                  >
                    Edit service
                  </p>
                  <h3
                    className={`mt-1.5 truncate text-[22px] tracking-tight ${tone.strong}`}
                    style={{ fontWeight: 700, letterSpacing: '-0.01em' }}
                  >
                    {editingService.title}
                  </h3>
                  <p className={`mt-1 text-[12px] ${tone.subtle}`}>
                    Review the customer card, chips, and booking rules before saving.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className={`rounded-full border p-2 transition ${tone.secondaryBtn}`}
                  aria-label="Close edit dialog"
                >
                  <X className="h-4 w-4" strokeWidth={2.25} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {renderServiceSetupForm({
                  form: editForm,
                  setForm: setEditForm,
                  mode: 'edit',
                  allowArchived: true,
                  patchLabel: editingService.patch?.label || editingService.patch?.uid || null,
                })}
              </div>

              <div
                className={`flex gap-2 border-t px-4 py-3 ${tone.footer}`}
                style={{
                  flexDirection: serviceReviewSideBySide ? 'row' : 'column-reverse',
                  alignItems: serviceReviewSideBySide ? 'center' : 'stretch',
                  justifyContent: serviceReviewSideBySide ? 'space-between' : 'stretch',
                  paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)',
                }}
              >
                <button type="button" onClick={archiveService} disabled={saving || access.role !== 'owner'} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-50 ${tone.secondaryBtn}`} style={{ fontWeight: 700 }}>Archive</button>
                <div
                  className="flex gap-2"
                  style={{
                    flexDirection: serviceReviewSideBySide ? 'row' : 'column-reverse',
                    alignItems: serviceReviewSideBySide ? 'center' : 'stretch',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setEditingService(null)}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition ${tone.secondaryBtn}`}
                    style={{ fontWeight: 600 }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    data-testid="save-service-draft-button"
                    onClick={() => saveService('draft')}
                    disabled={saving}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition disabled:cursor-not-allowed disabled:opacity-60 ${tone.secondaryBtn}`}
                    style={{ fontWeight: 700 }}
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
                    Save as Draft
                  </button>
                  <button
                    type="button"
                    data-testid="save-service-button"
                    onClick={() => saveService('active')}
                    disabled={saving || !getServicePublishReadiness(editForm, editingService.patch?.label || editingService.patch?.uid || null).canPublish}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ fontWeight: 700 }}
                    title={getServicePublishReadiness(editForm, editingService.patch?.label || editingService.patch?.uid || null).canPublish ? 'Publish this service live' : 'Complete missing live requirements first'}
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
                    Publish Live
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}