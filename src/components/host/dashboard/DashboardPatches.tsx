import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Copy, ExternalLink, Link, Package, Plus, Radio, Shield, Smartphone } from 'lucide-react';
import { ProviderPremiumGate } from '../../provider/ProviderPremiumGate';
import { type ProviderDashboardAccess } from './providerDashboardAccess';
import { type DashboardPatchSummary, useProviderDashboardData } from '../../../utils/providerDashboardData';
import { trpc } from '../../../utils/trpc';
import { BYTSPOT_PATCH_TIER_META, BYTSPOT_PATCH_TIERS, inferBytspotPatchTier, withBytspotPatchTier, type BytspotPatchTier } from '../../../utils/patchTiers';

const UNASSIGNED_SERVICE_VALUE = '__unassigned__';

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'provider';
}

function patchBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.origin.startsWith('http')) {
    return `${window.location.origin}/p/`;
  }
  return 'https://bytspot.app/p/';
}

function buildPatchUrl(patchId: string, venueName: string, serviceId?: string | null, tier: BytspotPatchTier = 'platinum'): string {
  const encoded = encodeURIComponent(venueName.trim() || 'Bytspot Provider');
  const base = `${patchBaseUrl()}${encodeURIComponent(patchId)}?patch=${encodeURIComponent(patchId)}&venue=${encoded}&tier=${encodeURIComponent(tier)}`;
  return serviceId ? `${base}&service=${encodeURIComponent(serviceId)}` : base;
}

export function DashboardPatches({ isDarkMode, access }: { isDarkMode: boolean; access: ProviderDashboardAccess }) {
  const data = useProviderDashboardData();
  const [venueName, setVenueName] = useState('');
  const [label, setLabel] = useState('Main Entrance');
  const [serviceSelection, setServiceSelection] = useState<string>(UNASSIGNED_SERVICE_VALUE);
  const [patchTier, setPatchTier] = useState<BytspotPatchTier>('platinum');
  const [patches, setPatches] = useState<DashboardPatchSummary[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const nextPatchId = useMemo(() => `new-${slugify(venueName || label || 'provider')}`, [venueName, label]);
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
  const panelClass = isDarkMode
    ? 'border-slate-500 bg-slate-800 text-white shadow-black/45'
    : 'border-slate-200 bg-white text-slate-950 shadow-slate-200/70';
  const inputClass = isDarkMode
    ? 'border-slate-500 bg-slate-700 text-white placeholder:text-slate-200 disabled:bg-slate-600 disabled:text-slate-100'
    : 'border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 disabled:text-slate-600';
  const labelClass = isDarkMode ? 'text-slate-100' : 'text-slate-800';
  const mutedLabelClass = isDarkMode ? 'text-slate-300' : 'text-slate-500';
  const helperPanelClass = isDarkMode
    ? 'border-slate-500 bg-slate-700 text-white'
    : 'border-cyan-200 bg-cyan-50 text-slate-950';
  const helperTextClass = isDarkMode ? 'text-slate-100' : 'text-slate-950';
  const previewUrlClass = isDarkMode
    ? 'border-cyan-300 bg-slate-700 text-cyan-50'
    : 'border-cyan-300 bg-white text-cyan-950';
  const emptyStateClass = isDarkMode
    ? 'border-cyan-300 bg-slate-700 text-slate-50'
    : 'border-cyan-300 bg-white text-slate-900';
  const createErrorClass = isDarkMode
    ? 'border-amber-300 bg-amber-900 text-amber-50'
    : 'border-amber-300 bg-amber-50 text-amber-950';
  const helperIconClass = isDarkMode ? 'text-cyan-300' : 'text-cyan-800';
  const helperSuccessIconClass = isDarkMode ? 'text-emerald-300' : 'text-emerald-700';
  const helperPurpleIconClass = isDarkMode ? 'text-purple-300' : 'text-purple-700';

  const assignableServices = useMemo(
    () => data.services.filter((service) => service.status === 'active' || service.status === 'draft'),
    [data.services],
  );
  const selectedService = serviceSelection === UNASSIGNED_SERVICE_VALUE
    ? null
    : assignableServices.find((service) => service.id === serviceSelection) ?? null;
  const selectedPatchTier = selectedService ? inferBytspotPatchTier(selectedService) : patchTier;
  const patchTierMeta = BYTSPOT_PATCH_TIER_META[selectedPatchTier];
  const tierForPatch = (patch: DashboardPatchSummary): BytspotPatchTier => {
    const linkedService = patch.serviceId ? assignableServices.find((service) => service.id === patch.serviceId) : null;
    return inferBytspotPatchTier(patch.tier ? { tier: patch.tier } : linkedService, selectedPatchTier);
  };
  const patchUrl = (patch: DashboardPatchSummary): string => {
    const tier = tierForPatch(patch);
    const base = patch.url || buildPatchUrl(patch.id, patch.venueName, patch.serviceId, tier);
    return withBytspotPatchTier(base, tier, patch.serviceId);
  };

  useEffect(() => {
    setPatches(data.patches);
  }, [data.patches]);

  useEffect(() => {
    if (!venueName && data.vendor?.displayName) setVenueName(data.vendor.displayName);
  }, [data.vendor?.displayName, venueName]);

  const establishPatch = async () => {
    if (creating) return;
    if (!data.authenticated) {
      setCreateError('Provider sign-in required: sign in with the Provider business account that owns this workspace to create live Provider patches.');
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const result = await trpc.vendors.createPatch.mutate({
        label: label.trim() || 'Main Entrance',
        serviceId: selectedService?.id ?? null,
      });
      const serverPatch = result?.patch as DashboardPatchSummary | undefined;
      const fallbackId = `local-${Date.now().toString(36)}-${slugify(label || venueName || 'provider')}`;
      const patch: DashboardPatchSummary = serverPatch?.id
        ? serverPatch
        : {
            id: fallbackId,
            label: label.trim() || 'Main Entrance',
            venueName: venueName.trim() || data.vendor?.displayName || 'Bytspot Provider',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            url: buildPatchUrl(fallbackId, venueName || data.vendor?.displayName || 'Bytspot Provider', selectedService?.id, selectedPatchTier),
            status: 'local-preview',
            readCounter: 0,
            serviceId: selectedService?.id ?? null,
            serviceTitle: selectedService?.title ?? null,
            tier: selectedPatchTier,
          };
      patch.tier = patch.tier ?? selectedPatchTier;
      const patchedUrl = patchUrl(patch);
      patch.url = patchedUrl;
      setPatches((current) => [patch, ...current.filter((item) => item.id !== patch.id)].slice(0, 12));
      setVenueName(patch.venueName || venueName);
      setLabel('Main Entrance');
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Unable to create Provider patch. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const copyPatch = async (patch: DashboardPatchSummary) => {
    const url = patchUrl(patch);
    await navigator.clipboard?.writeText(url).catch(() => undefined);
    setCopiedId(patch.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
              <p className={`mb-2 inline-flex rounded-full px-3 py-1 text-[12px] font-black tracking-[0.24em] ${isDarkMode ? 'bg-cyan-200 text-cyan-950' : 'bg-cyan-50 text-cyan-700'}`}>TAP & SCAN</p>
            <h1 className={`mb-2 text-[34px] font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Provider Patches</h1>
            <p className={`max-w-2xl text-[16px] font-semibold leading-6 ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>
              Establish reusable Bytspot patch links for entrances, lots, events, and access checkpoints. These URLs work with App Clip and universal links.
            </p>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-black shadow-lg ${isDarkMode ? 'border-cyan-200 bg-cyan-100 text-cyan-950 shadow-cyan-950/20' : 'border-cyan-200 bg-cyan-50 text-cyan-800 shadow-cyan-200/60'}`}>
            <Radio className="h-3.5 w-3.5" strokeWidth={2.5} />
            {patches.length} active patch{patches.length === 1 ? '' : 'es'}
          </div>
        </div>
      </motion.div>

      {!access.isCottage && (
      <ProviderPremiumGate
        isDarkMode={isDarkMode}
        title="Premium Patch Toolkit"
        description="Keep basic patch creation free. Unlock AI placement, boosted venue context, and QR/NFC rollout planning with Provider Premium."
        features={[
          'AI-recommended patch placement by entrance, crowd flow, and demand windows',
          'Bulk QR/NFC kit planning for events, lots, and venue checkpoints',
          'Boosted verified patch visibility for customers using Tap & Scan',
        ]}
      />
      )}

      <motion.div className={`relative grid gap-4 overflow-hidden rounded-[28px] border ${panelClass} p-5 shadow-2xl lg:grid-cols-[1fr_0.9fr] lg:p-6`} style={{ backgroundColor: isDarkMode ? '#1e293b' : '#ffffff' }} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }} data-testid="provider-patches-form">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" />
        <div className="space-y-4">
          <div>
            <label className={`mb-2 block text-[13px] font-extrabold ${labelClass}`}>Business / Venue Name <span className={mutedLabelClass}>(from profile)</span></label>
            <input value={venueName} onChange={(event) => setVenueName(event.target.value)} disabled={Boolean(data.vendor?.displayName)} placeholder="Example: Midtown Lounge" className={`w-full rounded-[16px] border px-4 py-3 font-bold outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 disabled:opacity-100 ${inputClass}`} />
          </div>
          <div>
            <label className={`mb-2 block text-[13px] font-extrabold ${labelClass}`}>Patch Location / Label</label>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Main Entrance" className={`w-full rounded-[16px] border px-4 py-3 font-bold outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 ${inputClass}`} />
          </div>
          <div>
            <label className={`mb-2 block text-[13px] font-extrabold ${labelClass}`}>Linked Service <span className={mutedLabelClass}>(optional)</span></label>
            <select
              value={serviceSelection}
              onChange={(event) => setServiceSelection(event.target.value)}
              disabled={!data.authenticated || data.loading || assignableServices.length === 0}
              className={`w-full rounded-[16px] border px-4 py-3 font-bold outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 disabled:opacity-100 ${inputClass}`}
              data-testid="provider-patches-service-select"
            >
              <option value={UNASSIGNED_SERVICE_VALUE}>Unassigned (general venue patch)</option>
              {assignableServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.title} · {BYTSPOT_PATCH_TIER_META[inferBytspotPatchTier(service)].shortLabel}{service.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))}
            </select>
            <p className={`mt-2 rounded-xl border px-3 py-2 text-[12px] font-extrabold leading-5 ${isDarkMode ? 'border-amber-300 bg-amber-900 text-amber-50' : 'border-amber-200 bg-amber-50 text-amber-900'}`} data-testid="provider-patches-service-hint">
              {!data.authenticated
                ? 'Provider sign-in required: sign in with the Provider business account that owns this workspace to link patches to services.'
                : data.loading
                  ? 'Loading your services\u2026'
                  : assignableServices.length === 0
                    ? 'Publish a service to link patches directly to bookable inventory.'
                    : 'Linking a patch to a service deep-links scans into that listing\u2019s booking flow.'}
            </p>
          </div>
          <div>
            <label className={`mb-2 block text-[13px] font-extrabold ${labelClass}`}>Patch Scanner Tier</label>
            <select
              value={selectedPatchTier}
              onChange={(event) => setPatchTier(event.target.value as BytspotPatchTier)}
              disabled={Boolean(selectedService)}
              className={`w-full rounded-[16px] border px-4 py-3 font-bold outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 disabled:opacity-100 ${inputClass}`}
              data-testid="provider-patches-tier-select"
            >
              {BYTSPOT_PATCH_TIERS.map((tier) => (
                <option key={tier} value={tier}>{BYTSPOT_PATCH_TIER_META[tier].label}</option>
              ))}
            </select>
            <p className={`mt-2 rounded-xl border px-3 py-2 text-[12px] font-extrabold leading-5 ${isDarkMode ? 'border-cyan-300 bg-slate-700 text-cyan-50' : 'border-cyan-200 bg-cyan-50 text-cyan-900'}`} data-testid="provider-patches-tier-hint">
              {selectedService
                ? `${patchTierMeta.label} scanner is inherited from the linked service.`
                : 'Choose Black, Platinum, or Green for an unassigned venue patch scanner.'}
            </p>
          </div>
          {createError && (
            <p className={`rounded-2xl border px-3 py-2 text-[12px] font-extrabold leading-5 ${createErrorClass}`} data-testid="provider-patches-create-error">{createError}</p>
          )}
          <button type="button" onClick={establishPatch} disabled={creating} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500 px-4 py-3.5 text-[15px] font-black text-white shadow-xl shadow-fuchsia-950/25 ring-1 ring-white/20 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60" data-testid="provider-patches-establish">
            <Plus className="h-4 w-4" strokeWidth={2.5} /> {creating ? 'Creating Patch…' : 'Establish Patch'}
          </button>
        </div>

        <div className={`rounded-[22px] border p-4 ${helperPanelClass}`}>
          <div className="mb-3 flex items-center gap-2"><Radio className="h-5 w-5 text-cyan-500" /><p className={`text-[16px] font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>How this gets used</p></div>
          <div className={`space-y-3 text-[13px] font-extrabold leading-5 ${helperTextClass}`}>
            <p><CheckCircle2 className={`mr-2 inline h-4 w-4 ${helperSuccessIconClass}`} />Verify a patch by creating it here, then opening the Test link and confirming the venue name loads.</p>
            <p><Shield className={`mr-2 inline h-4 w-4 ${helperSuccessIconClass}`} />Create one patch per entrance, booth, lot, or event checkpoint.</p>
            <p><Smartphone className={`mr-2 inline h-4 w-4 ${helperPurpleIconClass}`} />Print the link as a QR code or encode it to an NFC sticker.</p>
            <p><Link className={`mr-2 inline h-4 w-4 ${helperIconClass}`} />Customers tap/scan and open Bytspot App Clip or the full app.</p>
          </div>
          <p className={`mt-4 break-all rounded-2xl border p-3 font-mono text-[12px] font-black leading-5 ${previewUrlClass}`} data-testid="provider-patches-preview-url">{buildPatchUrl(nextPatchId, venueName || 'Bytspot Provider', selectedService?.id, selectedPatchTier)}</p>
        </div>
      </motion.div>

      <div className="space-y-3" data-testid="provider-patches-list">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className={`text-[18px] font-black ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>Established patches</h2>
            <p className={`text-[12px] font-extrabold leading-5 ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>{data.loading ? 'Loading live patch records…' : 'Copy, test, and deploy live backend patch links from one place.'}</p>
          </div>
        </div>
        {patches.length === 0 ? (
          <div className={`rounded-[24px] border-2 border-dashed p-6 text-center text-[14px] font-black ${emptyStateClass}`} data-testid="provider-patches-empty">No patches established yet. Create your first patch above.</div>
        ) : patches.map((patch, index) => (
          <motion.div key={patch.id} className={`relative overflow-hidden rounded-[24px] border p-4 shadow-2xl ${isDarkMode ? 'border-slate-500 bg-slate-800 text-white shadow-black/45' : 'border-slate-200 bg-white text-slate-950 shadow-slate-200/70'}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: index * 0.04 }} data-testid="provider-patches-card">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-300/0 via-cyan-200/50 to-fuchsia-300/0" />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={`text-[16px] font-extrabold ${isDarkMode ? 'text-white' : 'text-slate-950'}`}>{patch.label}</p>
                <p className={`text-[13px] font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>{patch.venueName}</p>
                <div className={`mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${isDarkMode ? 'border-cyan-200 bg-cyan-100 text-cyan-950' : 'border-cyan-200 bg-cyan-50 text-cyan-800'}`} data-testid="provider-patches-card-service">
                  <Package className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                  <span className="truncate">{patch.serviceTitle ? patch.serviceTitle : 'Unassigned'}</span>
                </div>
                <div className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${isDarkMode ? 'border-amber-300/60 bg-amber-300/15 text-amber-100' : 'border-amber-300 bg-amber-50 text-amber-900'}`} data-testid="provider-patches-card-tier">
                  {BYTSPOT_PATCH_TIER_META[tierForPatch(patch)].shortLabel} scanner
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-black tracking-[0.12em] text-emerald-800">READY</span>
            </div>
            <p className={`mb-3 break-all rounded-2xl border p-3 font-mono text-[12px] font-bold leading-5 ${isDarkMode ? 'border-slate-500 bg-slate-700 text-cyan-50' : 'border-cyan-200 bg-cyan-50 text-cyan-900'}`} data-testid="provider-patches-url">{patchUrl(patch)}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => copyPatch(patch)} aria-label={`Copy ${patch.label} patch link`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-slate-500 bg-slate-700 px-3 py-2.5 text-[13px] font-black text-white shadow-lg shadow-black/25 transition hover:bg-slate-600" data-testid="provider-patches-copy">
                {copiedId === patch.id ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />} {copiedId === patch.id ? 'Copied' : 'Copy'}
              </button>
              <a href={patchUrl(patch)} target="_blank" rel="noreferrer" aria-label={`Test ${patch.label} patch link`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-[13px] font-black text-cyan-950 shadow-lg shadow-cyan-950/10 transition hover:bg-cyan-100" data-testid="provider-patches-test">
                <ExternalLink className="h-4 w-4" /> Test
              </a>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}