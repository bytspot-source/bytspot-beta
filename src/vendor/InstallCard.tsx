import { IOS_INSTALL_STEPS, installHeadline } from './installPrompt';
import { useInstallState } from './useInstallState';

export function InstallCard() {
  const { state, install } = useInstallState();

  if (state === 'installed' || state === 'unavailable') return null;

  return (
    <section className="vendor-card vendor-install" aria-labelledby="install-heading">
      <h2 id="install-heading">{installHeadline(state)}</h2>
      <p className="vendor-muted">
        Keep Bytspot Vendor on your home screen. It opens in its own window and keeps working when the signal drops.
      </p>

      {state === 'promptable' ? (
        <button type="button" className="vendor-button" onClick={() => void install()}>
          Install
        </button>
      ) : (
        <ol className="vendor-steps">
          {IOS_INSTALL_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </section>
  );
}
