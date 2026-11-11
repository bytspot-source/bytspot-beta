import './index.css';
import { canonicalLegalPath, nativeHandoffContext } from './utils/nativeHandoffGuard';

const APP_STORE_CONSUMER_ONLY_COMPILE_TIME = import.meta.env.VITE_APP_STORE_CONSUMER_ONLY === 'true';

const APP_STORE_URL = 'https://apps.apple.com/app/id6761876421';

/** Self-contained so the page renders correctly without the app stylesheet. */
const HANDOFF_CSS = `
body{margin:0;background:#050816;color:#F5F7FB;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif}
.bh{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:radial-gradient(circle at 20% 10%,rgba(0,191,255,.18),transparent 45%),radial-gradient(circle at 85% 90%,rgba(168,85,247,.18),transparent 45%),#050816}
.bh-card{width:100%;max-width:420px;padding:32px 28px;border-radius:28px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);box-sizing:border-box}
.bh-brand{display:inline-flex;align-items:center;gap:10px;color:#F5F7FB;text-decoration:none;font-weight:700;font-size:18px}
.bh-brand img{border-radius:10px}
.bh h1{margin:24px 0 0;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.01em}
.bh-sub{margin:12px 0 0;font-size:16px;line-height:1.5;color:#C9D1E3}
.bh-btn{display:flex;align-items:center;justify-content:center;height:52px;margin-top:14px;border-radius:16px;font-size:16px;font-weight:700;text-decoration:none}
.bh-primary{margin-top:28px}
.bh-primary{background:#00BFFF;color:#04111F}
.bh-secondary{border:1px solid rgba(255,255,255,.22);color:#F5F7FB}
.bh-note{margin:16px 0 0;font-size:13px;line-height:1.5;color:#9AA5BD}
.bh-links{display:flex;gap:18px;margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.1)}
.bh-links a{color:#9AA5BD;font-size:13px;text-decoration:none}
`;

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);
}

function unregisterLegacyServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;
  const drop = () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => {
        void reg.unregister();
      });
    }).catch(() => {});
  };
  if (document.readyState === 'complete') drop();
  else window.addEventListener('load', drop, { once: true });
}

function isLegalWebPath(): boolean {
  return canonicalLegalPath(window.location.pathname) !== null;
}

function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * A bytspot:// link does nothing when the app is not installed, or off iPhone.
 * Off iPhone the button is hidden; on iPhone, if the app has not opened after
 * a moment, the visitor is sent to the App Store instead.
 */
function wireOpenInBytspot(root: HTMLElement, appSchemeURL: string) {
  const open = root.querySelector<HTMLAnchorElement>('.bh-secondary');
  const note = root.querySelector<HTMLParagraphElement>('.bh-note');
  if (!open) return;
  if (!isAppleMobile()) {
    open.remove();
    if (note) note.textContent = 'Bytspot is available on iPhone.';
    return;
  }
  open.addEventListener('click', (event) => {
    event.preventDefault();
    const fallback = window.setTimeout(() => {
      if (!document.hidden) window.location.href = APP_STORE_URL;
    }, 1600);
    const cancel = () => { if (document.hidden) window.clearTimeout(fallback); };
    document.addEventListener('visibilitychange', cancel, { once: true });
    window.addEventListener('pagehide', () => window.clearTimeout(fallback), { once: true });
    window.location.href = appSchemeURL;
  });
}

function renderNativeHandoffOnly() {
  if (isLegalWebPath()) return false;

  const context = nativeHandoffContext(window.location.href) ?? {
    kind: 'app' as const,
    title: 'Plan the night with Bytspot',
    subtitle: 'Find places nearby, make plans with friends, and join parties. Free on iPhone.',
    appArgument: window.location.href,
    appSchemeURL: 'bytspot://home',
  };

  const banner = document.querySelector<HTMLMetaElement>('meta[name="apple-itunes-app"]');
  banner?.setAttribute(
    'content',
    `app-id=6761876421, app-clip-bundle-id=com.bytspot.app.Clip, app-clip-display=card, app-argument=${context.appArgument}`,
  );

  const root = document.getElementById('root');
  if (!root) return true;
  const title = escapeHtml(context.title);
  const subtitle = escapeHtml(context.subtitle);
  const appSchemeURL = escapeHtml(context.appSchemeURL);
  root.innerHTML = `
    <style>${HANDOFF_CSS}</style>
    <main class="bh" data-native-handoff="${escapeHtml(context.kind)}">
      <section class="bh-card">
        <a class="bh-brand" href="/"><img src="/icon-192.png" alt="" width="40" height="40"><span>Bytspot</span></a>
        <h1>${title}</h1>
        <p class="bh-sub">${subtitle}</p>
        <a class="bh-btn bh-primary" href="${APP_STORE_URL}">Download on the App Store</a>
        <a class="bh-btn bh-secondary" href="${appSchemeURL}">Open in Bytspot</a>
        <p class="bh-note">Already have Bytspot? Tap Open in Bytspot.</p>
        <nav class="bh-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/support">Support</a></nav>
      </section>
    </main>`;
  wireOpenInBytspot(root, context.appSchemeURL);
  return true;
}

/** Legal pages render on their own; the retired web app never boots for them. */
async function bootLegalPages() {
  const legalPath = canonicalLegalPath(window.location.pathname);
  const [{ createRoot }, { createElement }, page] = await Promise.all([
    import('react-dom/client'),
    import('react'),
    legalPath === '/terms'
      ? import('./components/TermsOfService').then((m) => ({ component: m.TermsOfService, title: 'Terms of Service' }))
      : legalPath === '/disclaimer'
        ? import('./components/Disclaimer').then((m) => ({ component: m.Disclaimer, title: 'Disclaimer' }))
        : legalPath === '/support'
          ? import('./components/Support').then((m) => ({ component: m.Support, title: 'Support' }))
          : import('./components/PrivacyPolicy').then((m) => ({ component: m.PrivacyPolicy, title: 'Privacy Policy' })),
  ]);
  document.title = `${page.title} · Bytspot`;
  createRoot(document.getElementById('root')!).render(createElement(page.component));
}

/** Bytspot Admin is a web back office, so it boots instead of the native handoff. */
function isAdminPath(): boolean {
  return window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
}

async function bootAdmin() {
  const [{ createRoot }, { createElement }, { default: AdminApp }] = await Promise.all([
    import('react-dom/client'),
    import('react'),
    import('./admin/AdminApp.tsx'),
  ]);
  document.title = 'Bytspot Admin';
  document.querySelector('meta[name="apple-itunes-app"]')?.remove();
  createRoot(document.getElementById('root')!).render(createElement(AdminApp));
}

unregisterLegacyServiceWorkers();
if (!APP_STORE_CONSUMER_ONLY_COMPILE_TIME && isAdminPath()) {
  void bootAdmin();
} else if (!renderNativeHandoffOnly()) {
  void bootLegalPages();
}
