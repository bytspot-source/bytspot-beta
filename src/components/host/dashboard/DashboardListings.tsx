import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Clock, CreditCard, DollarSign, Edit, Plus, RefreshCw, Save, ShieldCheck, Sparkles, X } from 'lucide-react';
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

export function DashboardListings({ access }: DashboardListingsProps) {
  const [services, setServices] = useState<VendorService[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<VendorService | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const activeServices = useMemo(() => services.filter((service) => service.status === 'active'), [services]);
  const totalGrossCents = useMemo(() => services.reduce((sum, service) => sum + service.priceCents, 0), [services]);
  const payoutEstimateCents = useMemo(
    () => services.reduce((sum, service) => sum + (service.cashFlow?.providerPayoutEstimateCents ?? service.priceCents), 0),
    [services],
  );

  const loadServices = async () => {
    const token = localStorage.getItem('bytspot_auth_token');
    if (!token || token === 'beta_guest') {
      setServices([]);
      setMessage('Sign in with a vendor account to manage marketplace services.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await trpc.vendors.listServices.query({ status: 'all', limit: 50 });
      setServices(result?.services ?? []);
      if (!result?.services?.length) {
        setMessage('No vendor services are live yet. Create services in the provider portal, then return here to manage pricing and booking details.');
      }
    } catch (err: any) {
      setServices([]);
      setMessage(err?.message ?? 'Unable to load vendor services.');
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

  const saveService = async () => {
    if (!editingService || !editForm || saving) return;
    const price = Number(editForm.priceDollars);
    const duration = editForm.durationMins.trim() ? Number(editForm.durationMins) : null;
    if (!Number.isFinite(price) || price < 0.5) return setMessage('Service price must be at least $0.50.');
    if (duration !== null && (!Number.isFinite(duration) || duration < 5)) return setMessage('Duration must be blank or at least 5 minutes.');

    setSaving(true);
    setMessage(null);
    try {
      const result = await trpc.vendors.updateService.mutate({
        serviceId: editingService.id,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        priceCents: Math.round(price * 100),
        durationMins: duration === null ? null : Math.round(duration),
      });
      const updated = result.service as VendorService;
      setServices((prev) => prev.map((service) => (service.id === updated.id ? updated : service)));
      setEditingService(null);
      setEditForm(null);
      setMessage('Service updated. Discover cards will use the latest metadata from vendors.search.');
    } catch (err: any) {
      setMessage(err?.message ?? 'Unable to update vendor service.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="provider-services-panel">
      <motion.section className="relative overflow-hidden rounded-[32px] border border-white/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.24),transparent_34%),linear-gradient(135deg,rgba(18,18,22,0.98),rgba(4,6,12,0.98))] p-5 shadow-2xl lg:p-7" initial={{ opacity: 0, y: -18 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1.5 text-[12px] text-cyan-100" style={{ fontWeight: 850 }}><Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} /> Marketplace service desk · {access.role}</div>
            <h1 className="text-[34px] leading-tight text-white lg:text-[44px]" style={{ fontWeight: 850 }}>Manage vendor services</h1>
            <p className="mt-3 max-w-2xl text-[15px] leading-6 text-white/78">These live service records power the Discover service rail and Stripe-backed booking sheet. Keep titles, pricing, and duration precise before customers book.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void loadServices()} disabled={loading} className="inline-flex items-center gap-2 rounded-[18px] border border-white/12 bg-white/[0.08] px-4 py-3 text-[13px] text-white disabled:opacity-60" style={{ fontWeight: 850 }}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
            <button type="button" className="inline-flex items-center gap-2 rounded-[18px] bg-white px-4 py-3 text-[13px] text-black opacity-75" style={{ fontWeight: 900 }} title="Creation remains in provider onboarding for now"><Plus className="h-4 w-4" /> Add Service</button>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: 'Active services', value: activeServices.length, icon: ShieldCheck, tone: 'from-cyan-400/22 to-blue-500/10' },
          { label: 'Published price total', value: formatCents(totalGrossCents), icon: DollarSign, tone: 'from-emerald-400/22 to-cyan-400/10' },
          { label: 'Payout estimate', value: formatCents(payoutEstimateCents), icon: CreditCard, tone: 'from-violet-400/22 to-fuchsia-500/10' },
        ].map((card, index) => {
          const Icon = card.icon;
          return <motion.div key={card.label} className={`rounded-[24px] border border-white/12 bg-gradient-to-br ${card.tone} p-5 shadow-xl backdrop-blur-xl`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: index * 0.06 }}><Icon className="mb-5 h-5 w-5 text-white" strokeWidth={2.5} /><p className="text-[13px] text-white/80" style={{ fontWeight: 800 }}>{card.label}</p><p className="mt-1 text-[30px] leading-none text-white" style={{ fontWeight: 850 }}>{card.value}</p></motion.div>;
        })}
      </div>

      {message && <div className="rounded-[20px] border border-amber-300/24 bg-amber-300/10 p-4 text-[13px] leading-5 text-amber-50/90"><AlertCircle className="mr-2 inline h-4 w-4" /> {message}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {loading ? <div className="rounded-[28px] border border-white/12 bg-[#111114]/90 p-6 text-white/70">Loading vendor services…</div> : services.map((service, index) => (
          <motion.article key={service.id} data-testid={`provider-service-card-${service.id}`} className="overflow-hidden rounded-[28px] border border-cyan-300/24 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_32%),linear-gradient(135deg,rgba(17,17,20,0.96),rgba(7,8,13,0.98))] shadow-xl shadow-cyan-950/20" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.18 + index * 0.07 }}>
            <div className="p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-cyan-200" style={{ fontWeight: 900 }}>Bookable service</p>
                  <h2 className="text-[24px] leading-tight text-white" style={{ fontWeight: 850 }}>{service.title}</h2>
                  <p className="mt-2 min-h-[44px] text-[14px] leading-6 text-white/68">{service.description || 'Add a crisp description so customers understand the service before checkout.'}</p>
                </div>
                <span className={`rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] ${service.status === 'active' ? 'bg-emerald-400/16 text-emerald-100 ring-1 ring-emerald-200/20' : 'bg-white/8 text-white/60 ring-1 ring-white/10'}`} style={{ fontWeight: 900 }}>{service.status}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.05] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-white/42" style={{ fontWeight: 850 }}>Price</p><p className="mt-2 text-[16px] text-white" style={{ fontWeight: 850 }}>{formatCents(service.priceCents, service.currency)}</p></div>
                <div className="rounded-[18px] border border-white/10 bg-white/[0.05] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-white/42" style={{ fontWeight: 850 }}>Duration</p><p className="mt-2 text-[16px] text-white" style={{ fontWeight: 850 }}>{service.durationMins ? `${service.durationMins} min` : 'Flexible'}</p></div>
                <div className="rounded-[18px] border border-white/10 bg-white/[0.05] p-3"><p className="text-[11px] uppercase tracking-[0.14em] text-white/42" style={{ fontWeight: 850 }}>Payout</p><p className="mt-2 text-[16px] text-emerald-100" style={{ fontWeight: 850 }}>{formatCents(service.cashFlow?.providerPayoutEstimateCents ?? service.priceCents, service.currency)}</p></div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-white/62"><span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-black/20 px-2.5 py-1"><Clock className="h-3 w-3" /> Updated {service.updatedAt ? new Date(service.updatedAt).toLocaleDateString() : 'recently'}</span><span className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-black/20 px-2.5 py-1"><ShieldCheck className="h-3 w-3 text-cyan-200" /> {service.patch?.label || service.patch?.uid || 'Patch optional'}</span></div>
            </div>
            <div className="border-t border-white/10 bg-black/24 p-4"><button type="button" data-testid={`provider-service-edit-${service.id}`} onClick={() => openEdit(service)} className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-cyan-300 to-violet-400 px-4 py-3 text-[13px] text-black shadow-lg shadow-cyan-950/20" style={{ fontWeight: 900 }}><Edit className="h-4 w-4" /> Edit Service</button></div>
          </motion.article>
        ))}
      </div>

      <AnimatePresence>
        {editingService && editForm && (
          <motion.div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 px-4 pb-4 backdrop-blur-sm sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid="provider-service-edit-modal">
            <motion.div className="w-full max-w-lg rounded-[30px] border border-white/15 bg-[#111114] p-5 shadow-2xl" initial={{ y: 36, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 36, scale: 0.96 }} transition={springConfig}>
              <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-[12px] uppercase tracking-[0.2em] text-cyan-200" style={{ fontWeight: 900 }}>Edit service</p><h3 className="mt-1 text-[24px] text-white" style={{ fontWeight: 850 }}>{editingService.title}</h3></div><button type="button" onClick={() => setEditingService(null)} className="rounded-full border border-white/12 bg-white/8 p-2 text-white/70"><X className="h-5 w-5" /></button></div>
              <div className="space-y-3">
                <label className="block text-[12px] text-white/70" style={{ fontWeight: 800 }}>Title<input data-testid="service-title-input" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className="mt-1 w-full rounded-[16px] border border-white/12 bg-black/30 px-3 py-3 text-[14px] text-white outline-none focus:border-cyan-300/60" /></label>
                <label className="block text-[12px] text-white/70" style={{ fontWeight: 800 }}>Description<textarea data-testid="service-description-input" value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} className="mt-1 w-full resize-none rounded-[16px] border border-white/12 bg-black/30 px-3 py-3 text-[14px] text-white outline-none focus:border-cyan-300/60" /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-[12px] text-white/70" style={{ fontWeight: 800 }}>Price<input data-testid="service-price-input" type="number" min="0.5" step="0.01" value={editForm.priceDollars} onChange={(e) => setEditForm({ ...editForm, priceDollars: e.target.value })} className="mt-1 w-full rounded-[16px] border border-white/12 bg-black/30 px-3 py-3 text-[14px] text-white outline-none focus:border-cyan-300/60" /></label>
                  <label className="block text-[12px] text-white/70" style={{ fontWeight: 800 }}>Duration minutes<input data-testid="service-duration-input" type="number" min="5" step="5" value={editForm.durationMins} onChange={(e) => setEditForm({ ...editForm, durationMins: e.target.value })} className="mt-1 w-full rounded-[16px] border border-white/12 bg-black/30 px-3 py-3 text-[14px] text-white outline-none focus:border-cyan-300/60" /></label>
                </div>
              </div>
              <button type="button" data-testid="save-service-button" onClick={saveService} disabled={saving} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-white px-4 py-3 text-[14px] text-black disabled:opacity-60" style={{ fontWeight: 900 }}>{saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Service</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}