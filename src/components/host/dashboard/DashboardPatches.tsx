import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Copy, ExternalLink, Link, Plus, Radio, Shield, Smartphone } from 'lucide-react';
import { ProviderPremiumGate } from '../../provider/ProviderPremiumGate';

interface ProviderPatchRecord {
  id: string;
  label: string;
  venueName: string;
  createdAt: string;
  url: string;
}

const PATCH_STORE_KEY = 'bytspot_provider_patches';
const PATCH_BASE_URL = 'https://bytspot.app/p/';

function readPatches(): ProviderPatchRecord[] {
  try {
    const raw = localStorage.getItem(PATCH_STORE_KEY);
    return raw ? JSON.parse(raw) as ProviderPatchRecord[] : [];
  } catch {
    return [];
  }
}

function writePatches(patches: ProviderPatchRecord[]): void {
  localStorage.setItem(PATCH_STORE_KEY, JSON.stringify(patches.slice(0, 12)));
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'provider';
}

function buildPatchUrl(patchId: string, venueName: string): string {
  const encoded = encodeURIComponent(venueName.trim() || 'Bytspot Provider');
  return `${PATCH_BASE_URL}${encodeURIComponent(patchId)}?patch=${encodeURIComponent(patchId)}&venue=${encoded}`;
}

export function DashboardPatches({ isDarkMode }: { isDarkMode: boolean }) {
  const [venueName, setVenueName] = useState(localStorage.getItem('bytspot_provider_business_name') || '');
  const [label, setLabel] = useState('Main Entrance');
  const [patches, setPatches] = useState<ProviderPatchRecord[]>(() => readPatches());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const nextPatchId = useMemo(() => `patch-${slugify(venueName || label)}-${Date.now().toString(36).slice(-5)}`, [venueName, label]);
  const springConfig = { type: 'spring' as const, stiffness: 320, damping: 30, mass: 0.8 };
  const panelClass = isDarkMode ? 'bg-[#1C1C1E]/85' : 'bg-slate-950/85';

  const establishPatch = () => {
    const id = nextPatchId;
    const patch: ProviderPatchRecord = {
      id,
      label: label.trim() || 'Main Entrance',
      venueName: venueName.trim() || 'Bytspot Provider',
      createdAt: new Date().toISOString(),
      url: buildPatchUrl(id, venueName),
    };
    const updated = [patch, ...patches.filter((item) => item.id !== id)].slice(0, 12);
    setPatches(updated);
    writePatches(updated);
    localStorage.setItem('bytspot_provider_business_name', patch.venueName);
  };

  const copyPatch = async (patch: ProviderPatchRecord) => {
    await navigator.clipboard?.writeText(patch.url).catch(() => undefined);
    setCopiedId(patch.id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} transition={springConfig}>
        <p className="mb-2 text-[12px] font-bold tracking-[0.24em] text-cyan-200">TAP & SCAN</p>
        <h1 className="mb-2 text-[34px] font-black text-white">Provider Patches</h1>
        <p className="max-w-2xl text-[16px] leading-6 text-white/65">
          Establish reusable Bytspot patch links for entrances, lots, events, and access checkpoints. These URLs work with App Clip and universal links.
        </p>
      </motion.div>

      <ProviderPremiumGate
        title="Premium Patch Toolkit"
        description="Keep basic patch creation free. Unlock AI placement, boosted venue context, and QR/NFC rollout planning with Vendor Premium."
        features={[
          'AI-recommended patch placement by entrance, crowd flow, and demand windows',
          'Bulk QR/NFC kit planning for events, lots, and venue checkpoints',
          'Boosted verified patch visibility for customers using Tap & Scan',
        ]}
      />

      <motion.div className={`grid gap-4 rounded-[24px] border-2 border-white/20 ${panelClass} p-5 shadow-xl lg:grid-cols-[1fr_0.9fr]`} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: 0.05 }}>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-[13px] font-bold text-white/70">Business / Venue Name</label>
            <input value={venueName} onChange={(event) => setVenueName(event.target.value)} placeholder="Example: Midtown Lounge" className="w-full rounded-[16px] border border-white/20 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300/60" />
          </div>
          <div>
            <label className="mb-2 block text-[13px] font-bold text-white/70">Patch Location / Label</label>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Main Entrance" className="w-full rounded-[16px] border border-white/20 bg-black/35 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-cyan-300/60" />
          </div>
          <button onClick={establishPatch} className="flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 px-4 py-3.5 text-[15px] font-black text-white">
            <Plus className="h-4 w-4" strokeWidth={2.5} /> Establish Patch
          </button>
        </div>

        <div className="rounded-[20px] border border-cyan-300/20 bg-cyan-500/10 p-4">
          <div className="mb-3 flex items-center gap-2"><Radio className="h-5 w-5 text-cyan-200" /><p className="text-[16px] font-extrabold text-white">How this gets used</p></div>
          <div className="space-y-3 text-[13px] leading-5 text-white/68">
            <p><Shield className="mr-2 inline h-4 w-4 text-emerald-300" />Create one patch per entrance, booth, lot, or event checkpoint.</p>
            <p><Smartphone className="mr-2 inline h-4 w-4 text-purple-300" />Print the link as a QR code or encode it to an NFC sticker.</p>
            <p><Link className="mr-2 inline h-4 w-4 text-cyan-300" />Customers tap/scan and open Bytspot App Clip or the full app.</p>
          </div>
          <p className="mt-4 rounded-2xl bg-black/25 p-3 font-mono text-[11px] leading-5 text-white/55">{buildPatchUrl(nextPatchId, venueName || 'Bytspot Provider')}</p>
        </div>
      </motion.div>

      <div className="space-y-3">
        {patches.length === 0 ? (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.06] p-6 text-center text-white/55">No patches established yet. Create your first patch above.</div>
        ) : patches.map((patch, index) => (
          <motion.div key={patch.id} className="rounded-[20px] border border-white/15 bg-white/[0.07] p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...springConfig, delay: index * 0.04 }}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div><p className="text-[16px] font-bold text-white">{patch.label}</p><p className="text-[13px] text-white/55">{patch.venueName}</p></div>
              <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold text-emerald-200">READY</span>
            </div>
            <p className="mb-3 break-all rounded-2xl bg-black/25 p-3 font-mono text-[11px] leading-5 text-white/60">{patch.url}</p>
            <div className="flex gap-2">
              <button onClick={() => copyPatch(patch)} className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-white/15 bg-white/10 px-3 py-2.5 text-[13px] font-bold text-white">
                {copiedId === patch.id ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />} {copiedId === patch.id ? 'Copied' : 'Copy'}
              </button>
              <a href={patch.url} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-cyan-300/25 bg-cyan-500/15 px-3 py-2.5 text-[13px] font-bold text-cyan-100">
                <ExternalLink className="h-4 w-4" /> Test
              </a>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}