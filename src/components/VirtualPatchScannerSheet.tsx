import { Capacitor } from '@capacitor/core';
import { CapacitorNfc, type PluginListenerHandle } from '@capgo/capacitor-nfc';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, LoaderCircle, QrCode, ShieldCheck, X, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner@2.0.3';
import { notifyError, notifySuccess } from '../utils/haptics';
import { trpc } from '../utils/trpc';
import {
  buildVerifiedVirtualPatchContext,
  createAuditEvent,
  getNativeNfcRawValue,
  isPatchRevoked,
  parseScannedPatchPayload,
  saveVirtualPatchContext,
  type VirtualPatchAuditEvent,
  type VirtualPatchScanVerification,
} from '../utils/virtualPatch';

interface VirtualPatchScannerSheetProps {
  isOpen: boolean;
  venueName: string;
  fallbackPatchId?: string | null;
  userCoords?: { lat: number; lng: number };
  onClose: () => void;
  onVerified?: (verification: VirtualPatchScanVerification) => void;
  onOpenAccessWallet?: () => void;
  /** Vendor scope for tenant-isolated audit emission. */
  vendorId?: string | null;
  /** Venue ID for audit log scoping. */
  venueId?: string | null;
  /** Audit log sink (NIST PR.PT-1). Defaults to console.info in dev. */
  onAuditEvent?: (event: VirtualPatchAuditEvent) => void;
}

/** Default audit sink — dev-friendly, replaceable in prod via the prop. */
function defaultAuditSink(event: VirtualPatchAuditEvent): void {
  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    console.info('[bytspot.audit]', event);
  }
}

type ScanStatus = 'idle' | 'starting' | 'scanning' | 'verifying' | 'success' | 'error' | 'unsupported';
type ScanMethod = 'qr' | 'nfc';

function getCameraErrorMessage(error: any): string {
  if (error?.name === 'NotAllowedError') return 'Camera permission was denied. Please enable camera access in browser settings.';
  if (error?.name === 'NotFoundError') return 'No rear camera was found on this device.';
  if (error?.name === 'NotReadableError') return 'Your camera is already in use by another app.';
  return 'Unable to start the camera for QR scanning.';
}

// NFC Forum URI Record Type Definition prefix table — first byte of a raw 'U'
// record indexes into this list and the rest of the payload is appended.
const URI_PREFIXES: readonly string[] = [
  '', 'http://www.', 'https://www.', 'http://', 'https://',
  'tel:', 'mailto:', 'ftp://anonymous:anonymous@', 'ftp://ftp.',
  'ftps://', 'sftp://', 'smb://', 'nfs://', 'ftp://', 'dav://',
  'news:', 'telnet://', 'imap:', 'rtsp://', 'urn:', 'pop:',
  'sip:', 'sips:', 'tftp:', 'btspp://', 'btl2cap://', 'btgoep://',
  'tcpobex://', 'irdaobex://', 'file://', 'urn:epc:id:',
  'urn:epc:tag:', 'urn:epc:pat:', 'urn:epc:raw:', 'urn:epc:', 'urn:nfc:',
];

function decodeNdefRecord(record: any): string | null {
  const payload = record?.data;
  if (!payload) return null;

  const bytes = payload instanceof DataView
    ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
    : payload instanceof ArrayBuffer
      ? new Uint8Array(payload)
      : ArrayBuffer.isView(payload)
        ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
        : null;

  if (!bytes || bytes.length === 0) return null;

  if (record?.recordType === 'text') {
    const languageLength = bytes[0] & 0x3f;
    return new TextDecoder(record?.encoding || 'utf-8').decode(bytes.slice(1 + languageLength)).trim();
  }

  if (record?.recordType === 'url') {
    const prefix = URI_PREFIXES[bytes[0] ?? 0] ?? '';
    return `${prefix}${new TextDecoder('utf-8').decode(bytes.slice(1))}`.trim();
  }

  return new TextDecoder('utf-8').decode(bytes).trim();
}

export function VirtualPatchScannerSheet({
  isOpen,
  venueName,
  fallbackPatchId,
  userCoords,
  onClose,
  onVerified,
  onOpenAccessWallet,
  vendorId = null,
  venueId = null,
  onAuditEvent,
}: VirtualPatchScannerSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const nfcAbortRef = useRef<AbortController | null>(null);
  const nativeNfcListenerRef = useRef<PluginListenerHandle | null>(null);
  const nativeNfcActiveRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const detectBusyRef = useRef(false);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [verification, setVerification] = useState<VirtualPatchScanVerification | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [preferredMethod, setPreferredMethod] = useState<ScanMethod | 'auto'>('auto');
  const [activeMethod, setActiveMethod] = useState<ScanMethod | null>(null);
  /**
   * Explicit consent gate (BIPA / CUBI / WA MHMD / CCPA). Even though we do
   * not collect biometrics, the patch UID is identifying when correlated with
   * the user's account, so we surface a clear "intent to read" notice and
   * require an affirmative tap before any sensor (camera/NFC) is started.
   */
  const [hasConsented, setHasConsented] = useState(false);

  const emitAudit = useCallback((event: VirtualPatchAuditEvent) => {
    const sink = onAuditEvent ?? defaultAuditSink;
    try { sink(event); } catch { /* never let an audit sink crash the scanner */ }
  }, [onAuditEvent]);

  const isNativeApp = useMemo(
    () => typeof window !== 'undefined' && Capacitor.isNativePlatform(),
    [],
  );
  const supportsLiveQr = useMemo(
    () => typeof window !== 'undefined' && 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );
  const supportsBrowserNfc = useMemo(
    () => typeof window !== 'undefined' && 'NDEFReader' in window,
    [],
  );
  const supportsNfc = useMemo(
    () => isNativeApp || supportsBrowserNfc,
    [isNativeApp, supportsBrowserNfc],
  );

  const stopScanner = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (nfcAbortRef.current) {
      nfcAbortRef.current.abort();
      nfcAbortRef.current = null;
    }
    if (nativeNfcListenerRef.current) {
      void nativeNfcListenerRef.current.remove().catch(() => undefined);
      nativeNfcListenerRef.current = null;
    }
    if (nativeNfcActiveRef.current) {
      nativeNfcActiveRef.current = false;
      void CapacitorNfc.stopScanning().catch(() => undefined);
    }
    detectorRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    detectBusyRef.current = false;
  }, []);

  const verifyRawValue = useCallback(async (rawValue: string, method: ScanMethod) => {
    stopScanner();
    setStatus('verifying');
    setStatusMessage(`Verifying ${venueName} ${method === 'nfc' ? 'tap' : 'scan'}…`);

    let parsedPatchId: string | null = null;
    let parsedUid: string | null = null;

    try {
      const parsed = parseScannedPatchPayload(rawValue, fallbackPatchId);
      parsedPatchId = parsed.patchId;
      parsedUid = parsed.uid;

      // NIST RS.MI-1: short-circuit known-revoked patches before any further
      // network calls so a compromised sticker can never produce a "success"
      // path on the client, even momentarily.
      if (isPatchRevoked(parsed.patchId)) {
        emitAudit(createAuditEvent({
          outcome: 'revoked',
          method,
          vendorId,
          venueId,
          patchId: parsed.patchId,
          uid: parsed.uid,
          tokenJti: null,
          reason: 'patch_id_in_revocation_list',
        }));
        throw new Error('This Bytspot patch has been revoked. Ask staff for a fresh sticker.');
      }

      let token = parsed.token;

      if (!token) {
        if (!parsed.patchId) {
          throw new Error('This QR code does not include a Bytspot patch reference.');
        }

        const rotation = await trpc.patch.rotatingToken.mutate({
          patchId: parsed.patchId,
          geo: userCoords ? { lat: userCoords.lat, lng: userCoords.lng } : undefined,
          device: { platform: navigator.userAgent.slice(0, 120) },
        });

        token = rotation.token;
      }

      const result = await trpc.patch.verifyTap.mutate({
        token,
        uid: parsed.uid ?? undefined,
        readCounter: parsed.readCounter ?? undefined,
      });

      const summary: VirtualPatchScanVerification = {
        method,
        rawValue,
        patchId: result.patch.id,
        uid: result.patch.uid ?? parsed.uid ?? null,
        tokenJti: result.token.jti,
        verifiedAt: result.token.issuedAt,
        binding: result.binding ?? null,
      };

      setVerification(summary);
      setStatus('success');
      setStatusMessage(`${venueName} is ready for frictionless entry.`);
      // NIST PR.PT-1: audit log on success. Tenant + token JTI captured so the
      // entry is independently reconcilable against the server-side ledger.
      emitAudit(createAuditEvent({
        outcome: 'success',
        method,
        vendorId,
        venueId,
        patchId: summary.patchId,
        uid: summary.uid,
        tokenJti: summary.tokenJti,
      }));
      onVerified?.(summary);
      toast.success('Bytspot Verified', { description: `${venueName} patch ${method === 'nfc' ? 'tap' : 'scan'} verified successfully.` });
      await notifySuccess();
    } catch (error: any) {
      const message = error?.message || 'Unable to verify this patch code.';
      setVerification(null);
      setStatus('error');
      setStatusMessage(message);
      // NIST PR.PT-1: audit log on failure. Reason is generic; never echoes
      // user-supplied content into the audit stream.
      emitAudit(createAuditEvent({
        outcome: 'failure',
        method,
        vendorId,
        venueId,
        patchId: parsedPatchId,
        uid: parsedUid,
        tokenJti: null,
        reason: message.slice(0, 160),
      }));
      toast.error(method === 'nfc' ? 'Tap verification failed' : 'QR scan failed', { description: message });
      await notifyError();
    }
  }, [emitAudit, fallbackPatchId, onVerified, stopScanner, userCoords, vendorId, venueId, venueName]);

  const scheduleScan = useCallback(() => {
    rafRef.current = window.requestAnimationFrame(async () => {
      if (!videoRef.current || !detectorRef.current) {
        scheduleScan();
        return;
      }

      if (videoRef.current.readyState < 2 || detectBusyRef.current) {
        scheduleScan();
        return;
      }

      detectBusyRef.current = true;
      try {
        const results = await detectorRef.current.detect(videoRef.current);
        const rawValue = results?.[0]?.rawValue?.trim();
        if (rawValue) {
          await verifyRawValue(rawValue, 'qr');
          return;
        }
      } catch {
        // Keep scanning until we get a real QR detection or a camera failure.
      } finally {
        detectBusyRef.current = false;
      }

      scheduleScan();
    });
  }, [verifyRawValue]);

  // Callback ref for the <video> element. Runs synchronously the moment React
  // attaches the element to the DOM (via Portal). This is the only reliable
  // hook for the imperative srcObject/play/scheduleScan handoff: a useEffect
  // keyed on `activeMethod` can fire before the video is rendered (the JSX
  // gates the <video> on `status` too, and React 18 may commit the activeMethod
  // change ahead of the status change), at which point videoRef would still be
  // null. The callback ref bypasses that race entirely.
  const attachVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    if (!streamRef.current || !detectorRef.current) return;

    const stream = streamRef.current;
    void (async () => {
      try {
        el.srcObject = stream;
      } catch {
        // Some test/mock streams aren't real MediaStream instances; the
        // BarcodeDetector can still run against the bare <video>.
      }
      await el.play().catch(() => undefined);
      setStatus('scanning');
      setStatusMessage('Center the QR code inside the frame.');
      scheduleScan();
    })();
  }, [scheduleScan]);

  useEffect(() => {
    if (!isOpen) {
      setPreferredMethod('auto');
      setActiveMethod(null);
      // Reset consent every time the sheet closes — explicit, per-session
      // consent is required by BIPA / WA MHMD style "intent to collect" rules.
      setHasConsented(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      setVerification(null);
      setStatus('idle');
      setStatusMessage('');
      setActiveMethod(null);
      return;
    }

    // BIPA / CCPA / WA MHMD: do not start camera or NFC sensors until the user
    // taps the explicit consent affordance. The scanner sheet stays mounted and
    // shows the consent surface; only after `setHasConsented(true)` does this
    // effect re-run and proceed to startScanner / startNfcScanner below.
    if (!hasConsented) {
      return;
    }

    setVerification(null);
    const resolvedMethod = preferredMethod === 'auto'
      ? (supportsNfc ? 'nfc' : supportsLiveQr ? 'qr' : null)
      : preferredMethod === 'nfc'
        ? (supportsNfc ? 'nfc' : supportsLiveQr ? 'qr' : null)
        : (supportsLiveQr ? 'qr' : supportsNfc ? 'nfc' : null);

    if (!resolvedMethod) {
      setStatus('unsupported');
      setStatusMessage('This device does not expose Tap / Scan APIs here yet. Continue in My Access and use the venue fallback flow.');
      return;
    }

    let cancelled = false;

    const startScanner = async () => {
      setStatus('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        detectorRef.current = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
        // Switching activeMethod to 'qr' renders the <video> element. The
        // imperative srcObject/play()/scheduleScan() handoff happens inside
        // the <video>'s callback ref (`attachVideoRef`), which fires the
        // moment React attaches the element to the DOM — even when the
        // sheet is mounted via createPortal and React 18 commits state
        // updates in a different order than they were queued.
        setActiveMethod('qr');
      } catch (error: any) {
        const message = getCameraErrorMessage(error);
        setStatus('error');
        setStatusMessage(message);
        toast.error('Camera unavailable', { description: message });
        await notifyError();
      }
    };

    const startNfcScanner = async () => {
      setStatus('starting');
      setStatusMessage('Hold your phone near the Bytspot patch sticker.');
      try {
        if (isNativeApp) {
          const { supported } = await CapacitorNfc.isSupported();
          if (!supported) {
            throw new Error('This device does not have NFC hardware available for Bytspot tap verification.');
          }

          const { status: nativeStatus } = await CapacitorNfc.getStatus();
          if (nativeStatus === 'NFC_DISABLED') {
            throw new Error('NFC is turned off. Enable NFC in your device settings and try again.');
          }
          if (nativeStatus === 'NO_NFC') {
            throw new Error('This device does not support NFC scanning.');
          }

          nativeNfcListenerRef.current = await CapacitorNfc.addListener('nfcEvent', async (event) => {
            if (detectBusyRef.current) return;

            const rawValue = getNativeNfcRawValue(event);
            if (!rawValue) {
              setStatus('error');
              setStatusMessage('The tapped patch did not include a readable Bytspot payload.');
              await notifyError();
              return;
            }

            detectBusyRef.current = true;
            await verifyRawValue(rawValue, 'nfc');
          });

          setActiveMethod('nfc');

          await CapacitorNfc.startScanning({
            alertMessage: 'Hold your iPhone near the Bytspot patch.',
            invalidateAfterFirstRead: false,
            iosSessionType: 'tag',
          });
          nativeNfcActiveRef.current = true;

          if (cancelled) {
            stopScanner();
            return;
          }

          setStatus('scanning');
          setStatusMessage('Tap your phone on the Bytspot sticker to verify the patch.');
          return;
        }

        const reader = new (window as any).NDEFReader();
        const abortController = new AbortController();
        nfcAbortRef.current = abortController;
        setActiveMethod('nfc');

        reader.onreadingerror = () => {
          if (!cancelled) {
            setStatusMessage('Keep the top of your phone close to the patch sticker.');
          }
        };

        reader.onreading = async (event: any) => {
          if (detectBusyRef.current) return;
          const records = event?.message?.records ?? [];
          const rawValue = records
            .map((record: any) => decodeNdefRecord(record))
            .find((value: string | null) => Boolean(value));

          if (!rawValue) {
            setStatus('error');
            setStatusMessage('The tapped patch did not include a readable Bytspot payload.');
            await notifyError();
            return;
          }

          detectBusyRef.current = true;
          await verifyRawValue(rawValue, 'nfc');
        };

        await reader.scan({ signal: abortController.signal });
        if (cancelled) return;

        setStatus('scanning');
        setStatusMessage('Tap your phone on the Bytspot sticker to verify the patch.');
      } catch (error: any) {
        if (cancelled) return;

        const message = error?.message || 'Unable to start NFC tap on this device.';
        if (resolvedMethod === 'nfc' && supportsLiveQr) {
          toast('NFC unavailable — switching to QR', { description: message });
          setPreferredMethod('qr');
          setSessionKey((current) => current + 1);
          return;
        }

        setStatus('error');
        setStatusMessage(message);
        toast.error('Tap unavailable', { description: message });
        await notifyError();
      }
    };

    if (resolvedMethod === 'nfc') {
      startNfcScanner();
    } else {
      startScanner();
    }

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [hasConsented, isNativeApp, isOpen, preferredMethod, scheduleScan, sessionKey, stopScanner, supportsLiveQr, supportsNfc, verifyRawValue]);

  const handleRetry = useCallback(() => {
    stopScanner();
    setVerification(null);
    setStatus('idle');
    setStatusMessage('Restarting scanner…');
    setSessionKey((current) => current + 1);
  }, [stopScanner]);

  const handleSwitchMethod = useCallback((method: ScanMethod) => {
    stopScanner();
    setVerification(null);
    setPreferredMethod(method);
    setStatus('idle');
    setStatusMessage(method === 'nfc' ? 'Restarting tap reader…' : 'Restarting QR scanner…');
    setSessionKey((current) => current + 1);
  }, [stopScanner]);

  const handleContinue = useCallback(() => {
    // B5: persist a verified context snapshot so the access wallet can render
    // what was just verified even when the host did not wire onVerified.
    if (verification) {
      saveVirtualPatchContext(buildVerifiedVirtualPatchContext(verification, {
        source: 'scanner',
        venueId: venueId ?? null,
        venueName,
        patchId: verification.patchId,
      }));
    }
    onClose();
    onOpenAccessWallet?.();
  }, [onClose, onOpenAccessWallet, verification, venueId, venueName]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[1005] bg-black/70 backdrop-blur-[3px] flex items-end justify-center p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="w-full max-w-sm rounded-[28px] border border-cyan-300/30 bg-[#0D1017]/97 backdrop-blur-2xl shadow-2xl overflow-hidden"
            style={{ boxShadow: '0 0 42px rgba(34,211,238,0.18), 0 18px 54px rgba(0,0,0,0.56)' }}
            initial={{ y: 140, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 140, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-400/12 border border-cyan-300/25 text-cyan-200 text-[11px] mb-2" style={{ fontWeight: 800 }}>
                    {activeMethod === 'nfc' ? <Zap className="w-3.5 h-3.5" strokeWidth={2.4} /> : <QrCode className="w-3.5 h-3.5" strokeWidth={2.4} />}
                    {activeMethod === 'nfc' ? 'Tap Reader' : 'QR Scanner'}
                  </div>
                  <h3 className="text-[20px] text-white leading-tight" style={{ fontWeight: 800 }}>{activeMethod === 'nfc' ? 'Tap the Bytspot patch' : 'Scan the Bytspot patch'}</h3>
                  <p className="text-[13px] text-white/65 mt-1" style={{ fontWeight: 500 }}>{venueName}</p>
                </div>
                <motion.button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white/8 border border-white/15"
                  whileTap={{ scale: 0.92 }}
                >
                  <X className="w-4 h-4 text-white/75" />
                </motion.button>
              </div>

              {!hasConsented && (
                <div className="rounded-[24px] border border-cyan-300/22 bg-gradient-to-br from-cyan-500/8 via-indigo-500/8 to-fuchsia-500/8 p-5 mb-4">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-cyan-400/14 border border-cyan-300/30 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-5 h-5 text-cyan-200" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] text-white" style={{ fontWeight: 800 }}>Confirm intent to read</div>
                      <p className="text-[12.5px] text-white/72 mt-1" style={{ fontWeight: 500 }}>
                        Bytspot needs to use your device’s {supportsNfc ? 'NFC reader' : 'camera'} to verify the {venueName} patch. The reader captures only the patch identifier and a one-time token — no biometrics, no continuous video, no audio.
                      </p>
                    </div>
                  </div>
                  <ul className="text-[11.5px] text-white/68 space-y-1.5 mb-4 pl-1" style={{ fontWeight: 500 }}>
                    <li>• Used only while this sheet is open. Closing the sheet stops the reader.</li>
                    <li>• Patch ID, scan timestamp, and outcome are written to the audit log for your records.</li>
                    <li>• You can revoke at any time — close this sheet, or open Settings → Privacy.</li>
                  </ul>
                  <div className="flex gap-2">
                    <motion.button
                      onClick={() => {
                        emitAudit(createAuditEvent({
                          outcome: 'consent_denied',
                          method: supportsNfc ? 'nfc' : 'qr',
                          vendorId,
                          venueId,
                          reason: 'user_declined_consent',
                        }));
                        onClose();
                      }}
                      className="flex-1 py-3 rounded-[16px] bg-white/7 border border-white/10 text-white/75"
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="text-[13.5px]" style={{ fontWeight: 700 }}>Not now</span>
                    </motion.button>
                    <motion.button
                      onClick={() => setHasConsented(true)}
                      className="flex-[1.4] py-3 rounded-[16px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 text-white"
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="text-[13.5px]" style={{ fontWeight: 800 }}>I agree — start reader</span>
                    </motion.button>
                  </div>
                </div>
              )}

              {hasConsented && (status === 'starting' || status === 'scanning' || status === 'verifying') && activeMethod === 'qr' && supportsLiveQr && (
                <div className="relative rounded-[24px] overflow-hidden border border-cyan-300/18 bg-black mb-4 aspect-[3/4]">
                  <video ref={attachVideoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-7 top-1/2 -translate-y-1/2 h-40 rounded-[26px] border-2 border-cyan-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-[88px] text-[12px] text-cyan-100/85 bg-black/45 px-3 py-1.5 rounded-full border border-cyan-300/20" style={{ fontWeight: 600 }}>
                      {status === 'verifying' ? 'Verifying patch…' : 'Align the QR code inside the frame'}
                    </div>
                  </div>
                </div>
              )}

              {hasConsented && (status === 'starting' || status === 'scanning' || status === 'verifying') && activeMethod === 'nfc' && (
                <div className="relative rounded-[24px] overflow-hidden border border-cyan-300/18 bg-gradient-to-br from-cyan-500/10 via-indigo-500/10 to-fuchsia-500/10 mb-4 aspect-[3/4] flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.14),transparent_62%)]" />
                  <div className="relative flex flex-col items-center text-center px-6">
                    <div className="w-20 h-20 rounded-full border border-cyan-300/30 bg-black/25 flex items-center justify-center shadow-[0_0_36px_rgba(34,211,238,0.18)] mb-4">
                      <Zap className="w-9 h-9 text-cyan-200" strokeWidth={2.5} />
                    </div>
                    <p className="text-[18px] text-white" style={{ fontWeight: 700 }}>Tap ready</p>
                    <p className="text-[13px] text-white/72 mt-2" style={{ fontWeight: 500 }}>
                      Hold the top of your phone close to the Bytspot sticker and keep it steady for a second.
                    </p>
                  </div>
                </div>
              )}

              {(status === 'unsupported' || status === 'error' || status === 'success') && (
                <div className={`rounded-[22px] border p-4 mb-4 ${status === 'success' ? 'border-emerald-300/25 bg-emerald-400/10' : 'border-white/12 bg-white/6'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${status === 'success' ? 'bg-emerald-400/12 border-emerald-300/25' : 'bg-white/8 border-white/10'}`}>
                      {status === 'success' ? (
                        <ShieldCheck className="w-5 h-5 text-emerald-200" strokeWidth={2.5} />
                      ) : status === 'unsupported' ? (
                        <Camera className="w-5 h-5 text-white/80" strokeWidth={2.4} />
                      ) : (
                        <QrCode className="w-5 h-5 text-white/80" strokeWidth={2.4} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] text-white" style={{ fontWeight: 700 }}>
                        {status === 'success' ? 'Patch verified' : status === 'unsupported' ? 'Tap / Scan not supported here' : 'Tap / Scan needs attention'}
                      </div>
                      <p className="text-[12px] text-white/70 mt-1" style={{ fontWeight: 500 }}>{statusMessage}</p>
                      {verification && (
                        <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-white/75">
                          <div className="px-2.5 py-1 rounded-full bg-black/20 border border-white/10">Patch {verification.patchId.slice(-6)}</div>
                          <div className="px-2.5 py-1 rounded-full bg-black/20 border border-white/10">ICT {verification.tokenJti.slice(0, 8)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-[20px] border border-cyan-300/14 bg-cyan-400/8 p-4 mb-4 text-[12px] text-white/72" style={{ fontWeight: 500 }}>
                <div>• Find the Bytspot sticker near the entrance and tap first when your phone supports NFC.</div>
                <div className="mt-2">• If tap is unavailable or the sticker exposes a QR fallback, use the camera path instead.</div>
                <div className="mt-2">• The app verifies the patch through the live Bytspot backend before you continue.</div>
              </div>

              {status !== 'success' && status !== 'verifying' && ((activeMethod === 'nfc' && supportsLiveQr) || (activeMethod === 'qr' && supportsNfc)) && (
                <div className="mb-4">
                  <motion.button
                    onClick={() => handleSwitchMethod(activeMethod === 'nfc' ? 'qr' : 'nfc')}
                    className="w-full py-3 rounded-[16px] bg-white/6 border border-white/10 text-white/80"
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="text-[14px]" style={{ fontWeight: 700 }}>
                      {activeMethod === 'nfc' ? 'Use QR instead' : 'Try tap instead'}
                    </span>
                  </motion.button>
                </div>
              )}

              <div className="flex gap-2">
                <motion.button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-[16px] bg-white/7 border border-white/10 text-white/75"
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="text-[14px]" style={{ fontWeight: 700 }}>{status === 'success' ? 'Done' : 'Close'}</span>
                </motion.button>

                {status === 'success' ? (
                  <motion.button
                    onClick={handleContinue}
                    className="flex-[1.25] py-3 rounded-[16px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 text-white"
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="text-[14px]" style={{ fontWeight: 800 }}>{onOpenAccessWallet ? 'Continue in My Access' : 'Verified'}</span>
                  </motion.button>
                ) : status === 'unsupported' ? (
                  <motion.button
                    onClick={handleContinue}
                    className="flex-[1.25] py-3 rounded-[16px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 text-white"
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="text-[14px]" style={{ fontWeight: 800 }}>{onOpenAccessWallet ? 'Open My Access' : 'Use Tap / Scan later'}</span>
                  </motion.button>
                ) : status === 'error' ? (
                  <motion.button
                    onClick={handleRetry}
                    className="flex-[1.25] py-3 rounded-[16px] bg-gradient-to-r from-cyan-500 via-purple-500 to-fuchsia-500 text-white"
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="text-[14px]" style={{ fontWeight: 800 }}>Retry scan</span>
                  </motion.button>
                ) : (
                  <div className="flex-[1.25] py-3 rounded-[16px] bg-white/6 border border-white/10 text-white/75 flex items-center justify-center gap-2">
                    <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={2.4} />
                    <span className="text-[14px]" style={{ fontWeight: 700 }}>{status === 'verifying' ? 'Verifying…' : activeMethod === 'nfc' ? 'Listening for tap…' : 'Scanner live'}</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}