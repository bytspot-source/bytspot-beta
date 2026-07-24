import './index.css';
import { nativeHandoffContext } from './utils/nativeHandoffGuard';

function removeLegacyPwaHints() {
  document.querySelector('link[rel="manifest"]')?.remove();
  document.querySelector('meta[name="mobile-web-app-capable"]')?.remove();
  document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.remove();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char);
}

function renderNativeHandoffOnly() {
  const context = nativeHandoffContext(window.location.href);
  if (!context) return false;

  removeLegacyPwaHints();
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
    <main class="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <section class="w-full max-w-md rounded-[32px] border border-white/15 bg-white/10 p-7 shadow-2xl">
        <div class="mb-5 inline-flex rounded-full border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Native only</div>
        <h1 class="text-3xl font-black leading-tight">${title}</h1>
        <p class="mt-4 text-sm font-semibold leading-6 text-white/72">${subtitle}</p>
        <a class="mt-7 flex h-14 items-center justify-center rounded-2xl bg-cyan-300 text-sm font-black text-black" href="${appSchemeURL}">Open Bytspot</a>
        <p class="mt-4 text-xs font-semibold leading-5 text-white/50">If the App Clip card appears above, use it. This page intentionally does not load the legacy React PWA.</p>
      </section>
    </main>`;
  return true;
}

async function bootReactApp() {
  const [{ createRoot }, { createElement }, { default: App }] = await Promise.all([
    import('react-dom/client'),
    import('react'),
    import('./App.tsx'),
  ]);
  createRoot(document.getElementById('root')!).render(createElement(App));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failed — push won't work but app still functions.
      });
    });
  }
}

if (!renderNativeHandoffOnly()) {
  void bootReactApp();
}
