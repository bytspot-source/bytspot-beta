import { QRCodeSVG } from 'qrcode.react';

const APP_URL = 'https://bytspot.com';

const BRAND = {
  cyan: '#00BFFF', purple: '#A855F7', magenta: '#FF00FF', fuchsia: '#D946EF',
  bg: '#000000', textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.7)', textMuted: 'rgba(255,255,255,0.4)',
  gradient: 'linear-gradient(90deg, #00BFFF 0%, #A855F7 50%, #FF00FF 100%)',
  gradientAngled: 'linear-gradient(135deg, #00BFFF, #A855F7, #FF00FF)',
};

function PrintLogo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="60" r="48" stroke="url(#pl-outer)" strokeWidth="3" fill="none" />
      <circle cx="60" cy="60" r="38" stroke="url(#pl-mid)" strokeWidth="2" fill="none" opacity="0.4" />
      <path d="M60 32 L74 41 L74 59 L60 68 L46 59 L46 41 Z" fill="url(#pl-hex)" opacity="0.95" />
      <path d="M60 32 L74 41 L74 59 L60 68 L46 59 L46 41 Z" stroke="url(#pl-hexb)" strokeWidth="1.5" fill="none" opacity="0.8" />
      <circle cx="60" cy="50" r="8" fill="url(#pl-dot)" />
      <circle cx="60" cy="50" r="12" fill="url(#pl-glow)" opacity="0.3" />
      <defs>
        <linearGradient id="pl-outer" x1="12" y1="12" x2="108" y2="108"><stop offset="0%" stopColor="#00BFFF" /><stop offset="50%" stopColor="#A855F7" /><stop offset="100%" stopColor="#00BFFF" /></linearGradient>
        <linearGradient id="pl-mid" x1="22" y1="22" x2="98" y2="98"><stop offset="0%" stopColor="#A855F7" /><stop offset="100%" stopColor="#D946EF" /></linearGradient>
        <linearGradient id="pl-hex" x1="46" y1="32" x2="74" y2="68"><stop offset="0%" stopColor="#A855F7" /><stop offset="50%" stopColor="#D946EF" /><stop offset="100%" stopColor="#FF00FF" /></linearGradient>
        <linearGradient id="pl-hexb" x1="46" y1="32" x2="74" y2="68"><stop offset="0%" stopColor="#00BFFF" /><stop offset="50%" stopColor="#FF00FF" /><stop offset="100%" stopColor="#00BFFF" /></linearGradient>
        <radialGradient id="pl-dot"><stop offset="0%" stopColor="#00BFFF" /><stop offset="100%" stopColor="#0099CC" /></radialGradient>
        <radialGradient id="pl-glow"><stop offset="0%" stopColor="#00BFFF" /><stop offset="100%" stopColor="transparent" /></radialGradient>
      </defs>
    </svg>
  );
}

function Wordmark({ fontSize = 42 }: { fontSize?: number }) {
  return (
    <span style={{ fontSize, fontWeight: 800, letterSpacing: '-0.03em', background: BRAND.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>BYTSPOT</span>
  );
}

function FeaturePill({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <span style={{ fontSize: 26 }}>{emoji}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: BRAND.textPrimary }}>{label}</span>
    </div>
  );
}

/* ═══ ASSET 1 — Promotional Flyer (8.5 × 11 in) ═══ */
export function PromotionalFlyer() {
  return (
    <div id="flyer" className="flyer-page" style={{ width: '8.5in', height: '11in', background: 'linear-gradient(160deg, #0d0221 0%, #000000 40%, #020a18 100%)', fontFamily: "-apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif", color: BRAND.textPrimary, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 44px 40px', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', top: -80, left: -60, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -60, right: -40, width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,191,255,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', flex: 1 }}>
        <PrintLogo size={72} />
        <div style={{ marginTop: 8 }}><Wordmark fontSize={48} /></div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 700, color: BRAND.textSecondary, textTransform: 'uppercase' as const, letterSpacing: '0.12em', marginTop: 10, marginBottom: 28 }}>📍 Atlanta Beta · Now Live</div>
        <h1 style={{ fontSize: 38, fontWeight: 800, textAlign: 'center', lineHeight: 1.15, marginBottom: 12, letterSpacing: '-0.02em' }}>Know{' '}<span style={{ background: BRAND.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Before</span>{' '}You Go.</h1>
        <p style={{ fontSize: 17, color: BRAND.textSecondary, textAlign: 'center', maxWidth: 420, lineHeight: 1.5, marginBottom: 32 }}>Live crowd levels, real-time parking, and ride comparison — all in one app for Atlanta's best venues.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', maxWidth: 460, marginBottom: 24 }}>
          <FeaturePill emoji="📊" label="Live Crowd Levels" />
          <FeaturePill emoji="🅿️" label="Real-Time Parking" />
          <FeaturePill emoji="🚗" label="Uber vs Lyft Compare" />
          <FeaturePill emoji="🗺️" label="Venue Discovery" />
        </div>
        {/* How It Works */}
        <div style={{ width: '100%', maxWidth: 460, marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 14, background: BRAND.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>How It Works</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {[
              { num: 1, emoji: '📱', label: 'Open Bytspot' },
              { num: 2, emoji: '📍', label: 'Pick a Venue' },
              { num: 3, emoji: '📊', label: 'See Live Data' },
              { num: 4, emoji: '✅', label: 'Go with Confidence' },
            ].map((step) => (
              <div key={step.num} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '10px 4px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: BRAND.cyan, marginBottom: 2 }}>Step {step.num}</div>
                <div style={{ fontSize: 22 }}>{step.emoji}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: BRAND.textPrimary, textAlign: 'center', lineHeight: 1.3 }}>{step.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, padding: '24px 28px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: 460 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Try Bytspot Now</div>
            <div style={{ fontSize: 13, color: BRAND.textMuted, marginBottom: 10 }}>Scan the QR code or visit:</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.cyan, wordBreak: 'break-all' }}>{APP_URL}</div>
          </div>
          <div style={{ background: '#fff', padding: 8, borderRadius: 12, flexShrink: 0 }}>
            <QRCodeSVG value={APP_URL} size={96} level="H" bgColor="#FFFFFF" fgColor="#000000" />
          </div>
        </div>
        <div style={{ marginTop: 20, fontSize: 11, color: BRAND.textMuted, textAlign: 'center' }}>© {new Date().getFullYear()} Bytspot · Atlanta, GA · Beta Access</div>
      </div>
    </div>
  );
}

/* ═══ ASSET 2 — QR Code Sticker (3 × 3 in) ═══ */
export function QRCodeSticker() {
  return (
    <div id="sticker" className="sticker-page" style={{ width: '3in', height: '3in', background: BRAND.bg, fontFamily: "-apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif", color: BRAND.textPrimary, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.2in', boxSizing: 'border-box', border: '2px solid rgba(255,255,255,0.15)', borderRadius: 16 }}>
      <div style={{ position: 'absolute', top: -30, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,191,255,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PrintLogo size={22} />
          <Wordmark fontSize={16} />
        </div>
        <div style={{ background: '#fff', padding: 10, borderRadius: 12 }}>
          <QRCodeSVG value={APP_URL} size={140} level="H" bgColor="#FFFFFF" fgColor="#000000" />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'center', background: BRAND.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>See live crowd levels around Midtown before you go</div>
        <div style={{ fontSize: 8, color: BRAND.textMuted, textAlign: 'center' }}>{APP_URL.replace('https://', '')}</div>
      </div>
    </div>
  );
}

/* ═══ ASSET 3 — App Store Promotional Banner (1040 × 400) ═══ */
export function AppStoreBanner() {
  return (
    <div
      id="banner"
      style={{
        width: 1040,
        height: 400,
        background: 'linear-gradient(135deg, #0d0221 0%, #000000 35%, #020a18 70%, #0d0221 100%)',
        fontFamily: "-apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
        color: BRAND.textPrimary,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        padding: '0 72px',
        boxSizing: 'border-box' as const,
        borderRadius: 24,
      }}
    >
      {/* Background glow orbs */}
      <div style={{ position: 'absolute', top: -100, left: -60, width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -80, right: -40, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,191,255,0.14) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 60, right: 200, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(217,70,239,0.1) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Left: App icon + info */}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 44, flex: 1 }}>
        {/* App icon (rounded square like App Store) */}
        <div style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: 'linear-gradient(145deg, #1a1a2e 0%, #0f0f1a 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(168,85,247,0.1)',
        }}>
          <PrintLogo size={110} />
        </div>

        {/* Text content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Wordmark fontSize={52} />
          <div style={{ fontSize: 20, fontWeight: 500, color: BRAND.textSecondary, letterSpacing: '0.01em' }}>
            AI-Powered Urban Mobility
          </div>
          <div style={{ display: 'flex', gap: 20, marginTop: 8 }}>
            {[
              { emoji: '📊', label: 'Live Crowds' },
              { emoji: '🅿️', label: 'Parking' },
              { emoji: '🚗', label: 'Rides' },
              { emoji: '🤖', label: 'AI Concierge' },
            ].map((f) => (
              <div key={f.label} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: 13,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.8)',
              }}>
                <span>{f.emoji}</span>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <span style={{ fontSize: 13, color: BRAND.textMuted }}>Free · Designed for iPhone</span>
            <span style={{ fontSize: 13, color: BRAND.textMuted }}>📍 Atlanta</span>
          </div>
        </div>
      </div>

      {/* Subtle bottom gradient line */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: BRAND.gradient,
        opacity: 0.6,
      }} />
    </div>
  );
}

/* ═══ ASSET 4 — Social Media Banner (1200 × 630) ═══ */
export function SocialBanner() {
  return (
    <div
      id="social-banner"
      style={{
        width: 1200,
        height: 630,
        background: 'linear-gradient(160deg, #0d0221 0%, #000000 40%, #020a18 100%)',
        fontFamily: "-apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
        color: BRAND.textPrimary,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        boxSizing: 'border-box' as const,
      }}
    >
      {/* Background orbs */}
      <div style={{ position: 'absolute', top: -120, left: -80, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -100, right: -60, width: 360, height: 360, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,191,255,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <PrintLogo size={88} />
        <Wordmark fontSize={64} />
        <div style={{ fontSize: 24, fontWeight: 500, color: BRAND.textSecondary, textAlign: 'center', maxWidth: 600, lineHeight: 1.4 }}>
          Know <span style={{ background: BRAND.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', fontWeight: 700 }}>Before</span> You Go.
        </div>
        <div style={{ fontSize: 16, color: BRAND.textMuted, marginTop: 4 }}>
          Live crowd levels · Real-time parking · AI-powered recommendations
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          {['📊 Live Crowds', '🅿️ Parking', '🚗 Ride Compare', '🤖 AI Concierge'].map((f) => (
            <div key={f} style={{
              padding: '8px 18px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 14,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
            }}>{f}</div>
          ))}
        </div>
      </div>

      {/* Bottom gradient accent */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: BRAND.gradient, opacity: 0.7 }} />
    </div>
  );
}

/* ═══ HELPERS — Print & Download ═══ */
function printAsset(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><style>
    @page { margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
    @media print {
      body { background: #fff; }
      .flyer-page { width: 8.5in !important; height: 11in !important; }
      .sticker-page { width: 3in !important; height: 3in !important; border: none !important; }
    }
  </style></head><body>${el.outerHTML}</body></html>`);
  win.document.close();
  setTimeout(() => { win.print(); }, 400);
}

function downloadSVG(elementId: string, filename: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml">${el.outerHTML}</div>
    </foreignObject>
  </svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadPNG(elementId: string, filename: string, scale = 2) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = rect.width * scale; canvas.height = rect.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}">
    <foreignObject width="100%" height="100%">
      <div xmlns="http://www.w3.org/1999/xhtml">${el.outerHTML}</div>
    </foreignObject>
  </svg>`;
  const img = new Image();
  img.onload = () => {
    ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const btnStyle = { padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', background: BRAND.gradientAngled, color: '#000', fontWeight: 700, fontSize: 14 } as const;
const btnOutline = { ...btnStyle, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' } as const;

export default function PrintableMarketingAssets() {
  return (
    <div style={{ minHeight: '100vh', background: '#111', padding: 40, fontFamily: "-apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif", color: '#fff' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>Bytspot Marketing Assets</h1>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 40 }}>Click "Print" on each asset to open a print-ready version in a new window.</p>

      <section style={{ marginBottom: 60, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Promotional Flyer (8.5 × 11 in)</h2>
          <button onClick={() => printAsset('flyer')} style={btnStyle}>🖨️ Print</button>
          <button onClick={() => downloadSVG('flyer', 'bytspot-flyer.svg')} style={btnOutline}>⬇️ SVG</button>
          <button onClick={() => downloadPNG('flyer', 'bytspot-flyer.png', 3)} style={btnOutline}>⬇️ PNG</button>
        </div>
        <div style={{ transform: 'scale(0.65)', transformOrigin: 'top center' }}><PromotionalFlyer /></div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>QR Code Sticker (3 × 3 in)</h2>
          <button onClick={() => printAsset('sticker')} style={btnStyle}>🖨️ Print</button>
          <button onClick={() => downloadSVG('sticker', 'bytspot-sticker.svg')} style={btnOutline}>⬇️ SVG</button>
          <button onClick={() => downloadPNG('sticker', 'bytspot-sticker.png', 3)} style={btnOutline}>⬇️ PNG</button>
        </div>
        <QRCodeSticker />
      </section>

      <section style={{ marginBottom: 60, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>App Store Banner (1040 × 400)</h2>
          <button onClick={() => printAsset('banner')} style={btnStyle}>🖨️ Print</button>
          <button onClick={() => downloadSVG('banner', 'bytspot-banner.svg')} style={btnOutline}>⬇️ SVG</button>
          <button onClick={() => downloadPNG('banner', 'bytspot-banner.png', 3)} style={btnOutline}>⬇️ PNG</button>
        </div>
        <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center' }}><AppStoreBanner /></div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Social Media Banner (1200 × 630)</h2>
          <button onClick={() => printAsset('social-banner')} style={btnStyle}>🖨️ Print</button>
          <button onClick={() => downloadSVG('social-banner', 'bytspot-social.svg')} style={btnOutline}>⬇️ SVG</button>
          <button onClick={() => downloadPNG('social-banner', 'bytspot-social.png', 3)} style={btnOutline}>⬇️ PNG</button>
        </div>
        <div style={{ transform: 'scale(0.6)', transformOrigin: 'top center' }}><SocialBanner /></div>
      </section>
    </div>
  );
}