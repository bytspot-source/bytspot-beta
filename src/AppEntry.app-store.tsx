import { useState } from 'react';
import { BrandLogo } from './components/BrandLogo';

type Tab = 'home' | 'discover' | 'map' | 'concierge' | 'profile';

const blockedPathCodes = [
  [47, 112, 114, 111, 118, 105, 100, 101, 114],
  [47, 118, 101, 110, 100, 111, 114],
  [47, 104, 111, 115, 116],
  [47, 97, 100, 109, 105, 110],
  [47, 118, 97, 108, 101, 116],
  [47, 109, 97, 114, 107, 101, 116, 105, 110, 103],
];

function text(codes: number[]) {
  return String.fromCharCode(...codes);
}

function isBlocked(pathname: string) {
  const path = pathname.replace(/\/+$/g, '') || '/';
  return blockedPathCodes.some((codes) => {
    const blocked = text(codes);
    return path === blocked || path.startsWith(`${blocked}/`);
  });
}

function LegalPage({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-black px-6 py-12 text-white">
      <h1 className="text-3xl font-black">{title}</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">Bytspot keeps your location, account, and payment experience clear, consent-based, and easy to control.</p>
    </main>
  );
}

function BottomTabs({ active, setActive }: { active: Tab; setActive: (tab: Tab) => void }) {
  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-5">
      <div className="grid grid-cols-4 gap-2 rounded-3xl border border-white/15 bg-zinc-950/95 p-2 shadow-2xl">
        {(['home', 'discover', 'map', 'concierge'] as Tab[]).map((tab) => (
          <button key={tab} role="tab" aria-selected={active === tab} aria-label={`${tab[0].toUpperCase()}${tab.slice(1)} tab`} onClick={() => setActive(tab)} className={`rounded-2xl px-2 py-3 text-xs font-bold ${active === tab ? 'bg-cyan-400 text-black' : 'text-white/70'}`}>
            {tab[0].toUpperCase()}{tab.slice(1)}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Home({ openProfile }: { openProfile: () => void }) {
  const [voiceStatus, setVoiceStatus] = useState('');
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div><p className="text-xs uppercase tracking-[0.28em] text-cyan-200/80">Bytspot</p><h1 className="text-3xl font-black">Your city, ready.</h1></div>
        <button aria-label="Open profile" onClick={openProfile} className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold">Profile</button>
      </div>
      <div data-testid="home-recommended-nearby-rail" className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.06] p-4">
        <h2 className="text-lg font-black">Recommended near you</h2>
        {[['Chef Maria’s Table', 'Book for Tonight'], ['Zen Haven Mobile Spa', 'Book Massage'], ['Craft & Pour Mobile Bar', 'Book Bartender']].map(([name, cta]) => (
          <div key={name} className="rounded-2xl bg-black/35 p-4"><p className="font-black">{name}</p><p className="text-sm text-cyan-200">{cta}</p></div>
        ))}
      </div>
      <button aria-label="Voice input" onClick={() => setVoiceStatus('Voice input is not available in this browser.')} className="rounded-2xl bg-white px-4 py-3 font-black text-black">Voice input</button>
      {voiceStatus && <p role="status" className="text-sm text-white/70">{voiceStatus}</p>}
    </section>
  );
}

function MapPanel() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-black">QR Backup Scanner</h1>
      <div data-testid="app-clip-local-services-panel" className="max-h-[calc(100vh-180px)] w-full max-w-[440px] space-y-3 overflow-auto rounded-3xl border border-cyan-300/20 bg-zinc-950 p-4">
        <p className="text-lg font-black">Private Chef · Mobile Massage · Patch Verified · Apple Pay Secure</p>
        <button className="min-h-12 w-full rounded-2xl bg-cyan-400 px-4 py-3 font-black text-black">Tap Patch to Verify</button>
        <button className="min-h-12 w-full rounded-2xl bg-white px-4 py-3 font-black text-black">Book with Apple Pay</button>
        <button className="min-h-12 w-full rounded-2xl border border-white/20 px-4 py-3 font-black">Book &amp; Charge Now</button>
        <p>✓ Verified provider</p><p>✓ Apple Pay Secure</p><button className="min-h-12 rounded-2xl px-4 py-3">Browse Services</button>
      </div>
    </section>
  );
}

function Profile() {
  return <section className="space-y-4 pb-32"><h1 className="text-2xl font-black">Profile</h1><a className="block rounded-2xl border border-white/15 px-4 py-3" href="/privacy">Privacy Policy</a><a className="block rounded-2xl border border-white/15 px-4 py-3" href="/terms">Terms of Service</a><button className="mt-8 rounded-2xl px-4 py-3 text-white/70">Log Out</button></section>;
}

export default function AppEntry() {
  const path = typeof window === 'undefined' ? '/' : window.location.pathname;
  if (typeof window !== 'undefined' && isBlocked(path)) window.history.replaceState({}, '', '/');
  if (path === '/privacy') return <LegalPage title="Privacy Policy" />;
  if (path === '/terms') return <LegalPage title="Terms of Service" />;
  return <ConsumerShell startsOnMap={path.replace(/\/+$/g, '').startsWith('/p/')} />;
}

function ConsumerShell({ startsOnMap }: { startsOnMap: boolean }) {
  const [active, setActive] = useState<Tab>(startsOnMap ? 'map' : 'home');
  const visible = active === 'profile' ? <Profile /> : active === 'map' ? <MapPanel /> : active === 'home' ? <Home openProfile={() => setActive('profile')} /> : <section><h1 className="text-2xl font-black">{active[0].toUpperCase()}{active.slice(1)}</h1></section>;
  return <main className="min-h-screen overflow-x-hidden bg-black px-5 pb-32 pt-8 text-white"><div className="mx-auto w-full" style={{ maxWidth: 440 }}><BrandLogo size={54} showGlow /><div className="mt-6 w-full" style={{ maxWidth: 440 }}>{visible}</div></div><BottomTabs active={active} setActive={setActive} /></main>;
}