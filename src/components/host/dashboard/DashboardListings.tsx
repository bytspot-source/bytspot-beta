import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Clock,
  CreditCard,
  DollarSign,
  Edit3,
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

type VendorService = {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  durationMins: number | null;
  status: 'active' | 'draft' | 'archived' | string;
  updatedAt?: string;
  patch?: { id: string; label?: string | null; uid?: string | null } | null;
  cashFlow?: { platformFeeCents?: number; providerPayoutEstimateCents?: number; commissionBps?: number };
};

type EditForm = { title: string; description: string; priceDollars: string; durationMins: string };

const EMPTY_SERVICE_FORM: EditForm = { title: '', description: '', priceDollars: '10.00', durationMins: '60' };

const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };

function formatCents(cents: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function serviceToForm(service: VendorService): EditForm {
  return {
    title: service.title,
    description: service.description ?? '',
    priceDollars: (service.priceCents / 100).toFixed(2),
    durationMins: service.durationMins ? String(service.durationMins) : '',
  };
}

function hasVendorAuthToken(): boolean {
  if (typeof window === 'undefined') return false;
  const token = localStorage.getItem('bytspot_auth_token');
  return Boolean(token && token !== 'beta_guest');
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

  const activeServices = useMemo(() => services.filter((service) => service.status === 'active'), [services]);
  const totalGrossCents = useMemo(() => services.reduce((sum, service) => sum + service.priceCents, 0), [services]);
  const payoutEstimateCents = useMemo(
    () => services.reduce((sum, service) => sum + (service.cashFlow?.providerPayoutEstimateCents ?? service.priceCents), 0),
    [services],
  );
  const providerSignInRequired = !hasVendorSession || message?.startsWith('Provider sign-in required');

  const tone = {
    page: isDarkMode ? 'text-white' : 'text-slate-950',
    hero: isDarkMode
      ? 'border-white/10 bg-[linear-gradient(135deg,rgba(20,21,28,0.96),rgba(10,11,18,0.98))]'
      : 'border-slate-200/80 bg-white',
    heroAccent: isDarkMode
      ? 'bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.18),transparent_60%)]'
      : 'bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,0.08),transparent_60%)]',
    eyebrow: isDarkMode
      ? 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100'
      : 'border-cyan-200 bg-cyan-50 text-cyan-800',
    strong: isDarkMode ? 'text-white' : 'text-slate-950',
    body: isDarkMode ? 'text-slate-200' : 'text-slate-700',
    muted: isDarkMode ? 'text-slate-300' : 'text-slate-600',
    subtle: isDarkMode ? 'text-slate-400' : 'text-slate-500',
    summary: isDarkMode
      ? 'border-white/10 bg-white/[0.04]'
      : 'border-slate-200/80 bg-white shadow-sm shadow-slate-200/60',
    summaryIcon: isDarkMode
      ? 'border-white/10 bg-white/[0.06] text-cyan-200'
      : 'border-slate-200 bg-slate-50 text-cyan-700',
    card: isDarkMode
      ? 'border-white/10 bg-[#111114] shadow-2xl shadow-black/40'
      : 'border-slate-200 bg-white shadow-xl shadow-slate-200/60',
    cardAvatar: isDarkMode
      ? 'bg-gradient-to-br from-cyan-400/30 via-sky-400/20 to-violet-500/30 text-white ring-1 ring-white/10'
      : 'bg-gradient-to-br from-cyan-100 via-sky-100 to-violet-100 text-cyan-700 ring-1 ring-slate-200',
    metric: isDarkMode
      ? 'border-white/10 bg-white/[0.04]'
      : 'border-slate-200 bg-slate-50',
    chip: isDarkMode
      ? 'border-white/10 bg-white/[0.05] text-slate-200'
      : 'border-slate-200 bg-white text-slate-700',
    footer: isDarkMode
      ? 'border-slate-700 bg-slate-900'
      : 'border-slate-200 bg-slate-50/80',
    modalBackdrop: isDarkMode ? 'bg-slate-950/95' : 'bg-slate-950/65',
    modal: isDarkMode
      ? 'border-slate-600 bg-slate-950 text-white shadow-2xl shadow-black/80'
      : 'border-slate-200 bg-white shadow-2xl shadow-slate-300/60',
    input: isDarkMode
      ? 'border-slate-600 bg-slate-900 text-white placeholder:text-slate-500'
      : 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-400',
    secondaryBtn: isDarkMode
      ? 'border-slate-600 bg-slate-900 text-white hover:bg-slate-800'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50',
    statusActive: isDarkMode
      ? 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/30'
      : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    statusInactive: isDarkMode
      ? 'bg-white/[0.06] text-slate-300 ring-1 ring-white/10'
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
    } catch (err: any) {
      setServices([]);
      setMessage(err?.message ?? 'Unable to load Provider services.');
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
    setCreateForm(EMPTY_SERVICE_FORM);
    setCreatingService(true);
    setMessage(null);
  };

  const validateForm = (form: EditForm) => {
    const price = Number(form.priceDollars);
    const duration = form.durationMins.trim() ? Number(form.durationMins) : null;
    if (form.title.trim().length < 2) return { error: 'Service title must be at least 2 characters.' };
    if (!Number.isFinite(price) || price < 0.5) return { error: 'Service price must be at least $0.50.' };
    if (duration !== null && (!Number.isFinite(duration) || duration < 5)) return { error: 'Duration must be blank or at least 5 minutes.' };
    return { priceCents: Math.round(price * 100), durationMins: duration === null ? null : Math.round(duration) };
  };

  const createService = async () => {
    if (saving) return;
    if (providerSignInRequired) {
      setMessage('Provider sign-in required: sign in with the Provider business account that owns this workspace before creating a bookable service.');
      return;
    }
    const validated = validateForm(createForm);
    if ('error' in validated) return setMessage(validated.error);

    setSaving(true);
    setMessage(null);
    try {
      const result = await trpc.vendors.createService.mutate({
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
        priceCents: validated.priceCents,
        durationMins: validated.durationMins,
        status: 'active',
      });
      const created = result.service as VendorService;
      setServices((prev) => [created, ...prev.filter((service) => service.id !== created.id)]);
      setCreatingService(false);
      setMessage('Service created and published. It is now available to Discover and booking checkout.');
    } catch (err: any) {
      setMessage(err?.message ?? 'Unable to create Provider service.');
    } finally {
      setSaving(false);
    }
  };

  const saveService = async () => {
    if (!editingService || !editForm || saving) return;
    const validated = validateForm(editForm);
    if ('error' in validated) return setMessage(validated.error);

    setSaving(true);
    setMessage(null);
    try {
      const result = await trpc.vendors.updateService.mutate({
        serviceId: editingService.id,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        priceCents: validated.priceCents,
        durationMins: validated.durationMins,
      });
      const updated = result.service as VendorService;
      setServices((prev) => prev.map((service) => (service.id === updated.id ? updated : service)));
      setEditingService(null);
      setEditForm(null);
      setMessage('Service updated. Discover cards will use the latest Provider service metadata.');
    } catch (err: any) {
      setMessage(err?.message ?? 'Unable to update Provider service.');
    } finally {
      setSaving(false);
    }
  };

  const summaryCards = [
    { label: 'Active services', value: String(activeServices.length), helper: `${services.length} total in catalog`, Icon: BadgeCheck },
    { label: 'Published price total', value: formatCents(totalGrossCents), helper: 'Sum of listed service rates', Icon: DollarSign },
    { label: 'Payout estimate', value: formatCents(payoutEstimateCents), helper: 'After platform commission', Icon: CreditCard },
  ];

  return (
    <div className={`space-y-6 ${tone.page}`} data-testid="provider-services-panel">
      <motion.section
        className={`relative overflow-hidden rounded-3xl border p-6 lg:p-8 ${tone.hero}`}
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
      >
        <div className={`pointer-events-none absolute inset-0 ${tone.heroAccent}`} aria-hidden />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <div
              className={`mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${tone.eyebrow}`}
              style={{ fontWeight: 700 }}
            >
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
              Marketplace service desk · {access.role}
            </div>
            <h1
              className={`text-[30px] leading-[1.1] tracking-tight lg:text-[40px] ${tone.strong}`}
              style={{ fontWeight: 800, letterSpacing: '-0.02em' }}
            >
              Manage Provider services
            </h1>
            <p className={`mt-3 text-[15px] leading-6 ${tone.body}`}>
              Live service records that power the Discover rail and the Stripe‑backed booking sheet. Keep titles, pricing, and duration precise before customers book.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void loadServices()}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition disabled:opacity-60 ${tone.secondaryBtn}`}
              style={{ fontWeight: 600 }}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2.25} />
              Refresh
            </button>
            <button
              type="button"
              onClick={openCreate}
              disabled={access.role === 'staff' || providerSignInRequired}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ fontWeight: 700 }}
              title={access.role === 'staff' ? 'Owners and managers can create services' : providerSignInRequired ? 'Sign in with the Provider business account that owns this workspace' : 'Create a live bookable service'}
              data-testid="provider-service-add"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Add Service
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {loading ? (
          <div className={`rounded-2xl border p-6 text-[14px] ${tone.card} ${tone.body}`}>
            <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Loading Provider services…</span>
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
            return (
              <motion.article
                key={service.id}
                data-testid={`provider-service-card-${service.id}`}
                className={`group flex flex-col overflow-hidden rounded-2xl border transition ${tone.card}`}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springConfig, delay: 0.12 + index * 0.06 }}
              >
                <div className="flex flex-1 flex-col gap-5 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
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
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${
                        isActive ? tone.statusActive : tone.statusInactive
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                      {service.status}
                    </span>
                  </div>

                  <p className={`text-[14px] leading-6 ${tone.body}`}>
                    {service.description || 'Add a clear description so customers understand the service before checkout.'}
                  </p>

                  <div className="grid grid-cols-3 gap-2.5">
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
                      <p className={`text-[10px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>Payout</p>
                      <p
                        className={`mt-1.5 text-[17px] tracking-tight ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}
                        style={{ fontWeight: 700, letterSpacing: '-0.01em' }}
                      >
                        {formatCents(payoutCents, service.currency)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.chip}`}>
                      <CalendarClock className="h-3 w-3" strokeWidth={2.25} />
                      Updated {updatedLabel}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.chip}`}>
                      <ShieldCheck className={`h-3 w-3 ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`} strokeWidth={2.25} />
                      {service.patch?.label || service.patch?.uid || 'Patch optional'}
                    </span>
                    {commissionPct && (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone.chip}`}>
                        <ArrowUpRight className="h-3 w-3" strokeWidth={2.25} />
                        Commission {commissionPct}
                      </span>
                    )}
                  </div>
                </div>

                <div className={`border-t p-4 ${tone.footer}`}>
                  <button
                    type="button"
                    data-testid={`provider-service-edit-${service.id}`}
                    onClick={() => openEdit(service)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-violet-400"
                    style={{ fontWeight: 700 }}
                  >
                    <Edit3 className="h-4 w-4" strokeWidth={2.5} />
                    Edit Service
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
            className={`fixed inset-0 z-[9999] isolate flex items-end justify-center px-4 pb-4 backdrop-blur-sm sm:items-center ${tone.modalBackdrop}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="provider-service-create-modal"
          >
            <motion.div className={`relative w-full max-w-lg overflow-hidden rounded-2xl border ${tone.modal}`} initial={{ y: 32, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 32, scale: 0.97 }} transition={springConfig}>
              <div className="flex items-start justify-between gap-3 border-b border-inherit p-6 pb-5">
                <div>
                  <p className={`text-[10px] uppercase tracking-[0.2em] ${isDarkMode ? 'text-cyan-300' : 'text-cyan-700'}`} style={{ fontWeight: 700 }}>Create service</p>
                  <h3 className={`mt-1.5 text-[22px] tracking-tight ${tone.strong}`} style={{ fontWeight: 700 }}>Publish a bookable listing</h3>
                  <p className={`mt-1 text-[12px] ${tone.subtle}`}>Creates a live Provider service for marketplace booking.</p>
                </div>
                <button type="button" onClick={() => setCreatingService(false)} className={`rounded-full border p-2 transition ${tone.secondaryBtn}`} aria-label="Close create dialog"><X className="h-4 w-4" strokeWidth={2.25} /></button>
              </div>
              <div className="space-y-4 p-6 pt-5">
                <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>Title<input data-testid="service-create-title-input" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
                <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>Description<textarea data-testid="service-create-description-input" value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} rows={3} className={`mt-1.5 w-full resize-none rounded-xl border px-3.5 py-2.5 text-[14px] normal-case leading-6 tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>Price (USD)<input data-testid="service-create-price-input" type="number" min="0.5" step="0.01" value={createForm.priceDollars} onChange={(e) => setCreateForm({ ...createForm, priceDollars: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
                  <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>Duration (min)<input data-testid="service-create-duration-input" type="number" min="5" step="5" value={createForm.durationMins} onChange={(e) => setCreateForm({ ...createForm, durationMins: e.target.value })} className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`} /></label>
                </div>
              </div>
              <div className={`flex items-center justify-end gap-2 border-t p-4 ${tone.footer}`}>
                <button type="button" onClick={() => setCreatingService(false)} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition ${tone.secondaryBtn}`} style={{ fontWeight: 600 }}>Cancel</button>
                <button type="button" data-testid="create-service-button" onClick={createService} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60" style={{ fontWeight: 700 }}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Save className="h-4 w-4" strokeWidth={2.5} />} Create Service</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {editingService && editForm && (
          <motion.div
            className={`fixed inset-0 z-[9999] isolate flex items-end justify-center px-4 pb-4 backdrop-blur-sm sm:items-center ${tone.modalBackdrop}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="provider-service-edit-modal"
          >
            <motion.div
              className={`relative w-full max-w-lg overflow-hidden rounded-2xl border ${tone.modal}`}
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
                    Updates flow into Discover and the booking sheet immediately.
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

              <div className="space-y-4 p-6 pt-5">
                <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>
                  Title
                  <input
                    data-testid="service-title-input"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`}
                  />
                </label>
                <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>
                  Description
                  <textarea
                    data-testid="service-description-input"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    className={`mt-1.5 w-full resize-none rounded-xl border px-3.5 py-2.5 text-[14px] normal-case leading-6 tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>
                    Price (USD)
                    <input
                      data-testid="service-price-input"
                      type="number"
                      min="0.5"
                      step="0.01"
                      value={editForm.priceDollars}
                      onChange={(e) => setEditForm({ ...editForm, priceDollars: e.target.value })}
                      className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`}
                    />
                  </label>
                  <label className={`block text-[11px] uppercase tracking-[0.14em] ${tone.muted}`} style={{ fontWeight: 600 }}>
                    Duration (min)
                    <input
                      data-testid="service-duration-input"
                      type="number"
                      min="5"
                      step="5"
                      value={editForm.durationMins}
                      onChange={(e) => setEditForm({ ...editForm, durationMins: e.target.value })}
                      className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[14px] normal-case tracking-normal outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 ${tone.input}`}
                    />
                  </label>
                </div>
              </div>

              <div className={`flex items-center justify-end gap-2 border-t p-4 ${tone.footer}`}>
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] transition ${tone.secondaryBtn}`}
                  style={{ fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="save-service-button"
                  onClick={saveService}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-4 py-2.5 text-[13px] text-white shadow-lg shadow-cyan-500/20 transition hover:from-cyan-300 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ fontWeight: 700 }}
                >
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Save className="h-4 w-4" strokeWidth={2.5} />}
                  Save Service
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}