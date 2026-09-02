import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import './vendor.css';
import { VendorApp } from './VendorApp';

// No native handoff guard and no kill-switch here. The consumer shell on
// bytspot.app is native-only on purpose; the vendor console is a separate
// origin and a separate app, so it boots straight into React.
createRoot(document.getElementById('vendor-root')!).render(
  <StrictMode>
    <VendorApp />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
