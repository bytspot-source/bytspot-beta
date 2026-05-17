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
  /**
   * Optional age-gate. When present, the user must affirm they meet the
   * minimum age before the consent panel renders or any sensor starts.
   * Used by 21+ nightlife / lounge / dispensary venues. Affirmation is
   * non-persistent and resets every time the sheet closes.
   */
  ageGate?: { minAge: number } | null;
}

const APPLE_DEMO_SERVICES = [
  {
    name: 'Verified Entry',
    title: 'Instant Access',
    detail: 'Skip the line and walk straight in.',
    cta: 'Get Verified Entry Now',
    accent: 'from-fuchsia-500 to-purple-600',
    icon: '✓',
  },
  {
    name: 'VIP Access Demo',
    title: 'Premium seating + priority valet',
    detail: 'Dedicated lounge service for reviewed guests.',
    cta: 'Request VIP Access',
    accent: 'from-purple-500 to-indigo-600',
    icon: '★',
  },
  {
    name: 'Smart Parking',
    title: 'Real-time spots & valet',
    detail: 'Find parking and book venue pickup.',
    cta: 'Find Parking / Valet',
    accent: 'from-cyan-500 to-blue-600',
    icon: 'P',
  },
  {
    name: 'Concierge Help',
    title: 'Private chef, massage, ride, etc.',
    detail: 'Message the venue team for anything you need.',
    cta: 'Message Concierge Now',
    accent: 'from-emerald-500 to-teal-600',
    icon: '✦',
  },
];

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
  ageGate = null,
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
  /**
   * Optional age-gate affirmation. Sequenced before the consent panel so
   * an under-age user never sees the "intent to read" surface and the
   * sensor is never armed. Defaults to true when no gate is configured.
   */
  const [hasAffirmedAge, setHasAffirmedAge] = useState(!ageGate);

  const emitAudit = useCallback((event: VirtualPatchAuditEvent) => {
    const sink = onAuditEvent ?? defaultAuditSink;
    try { sink(event); } catch { /* never let an audit sink crash the scanner */ }
  }, [onAuditEvent]);

  const isNativeApp = useMemo(
    () => typeof window !== 'undefined' && Capacitor.isNativePlatform(),
    [],
  );
  const supportsLiveQr = useMemo(
    () => typeof window !== 'undefined'
      && typeof (window as Window & { BarcodeDetector?: unknown }).BarcodeDetector === 'function'
      && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );
  const supportsBrowserNfc = useMemo(
    () => typeof window !== 'undefined'
      && typeof (window as Window & { NDEFReader?: unknown }).NDEFReader === 'function',
    [],
  );
  const supportsNfc = useMemo(
    () => isNativeApp || supportsBrowserNfc,
    [isNativeApp, supportsBrowserNfc],
  );
  const isIosWebFallback = useMemo(
    () => !isNativeApp && typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent),
    [isNativeApp],
  );
  const showAppleDemoServices = useMemo(
    () => /apple\s+demo/i.test(venueName),
    [venueName],
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
        throw new Error('This Bytspot patch has been revoked. Ask the venue team for a fresh sticker.');
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
    // Some browser-provided streams may not expose every MediaStream method; the
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
      // Age affirmation is also per-session. Defaults to true when the
      // venue carries no ageGate so the consent panel renders immediately.
      setHasAffirmedAge(!ageGate);
    }
  }, [isOpen, ageGate]);

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
    // The age-gate (when configured) sequences before consent — sensors stay
    // dark until both gates are cleared.
    if (!hasAffirmedAge || !hasConsented) {
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
      setStatusMessage(isIosWebFallback
        ? 'Safari opened this patch in web access. This browser cannot start the reader here, but your patch handoff is ready in My Access.'
        : 'This device does not expose Tap / Scan APIs here yet. Continue in My Access and use the venue fallback flow.');
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
  }, [hasAffirmedAge, hasConsented, isIosWebFallback, isNativeApp, isOpen, preferredMethod, scheduleScan, sessionKey, stopScanner, supportsLiveQr, supportsNfc, verifyRawValue]);

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
    } else if (fallbackPatchId || venueName) {
      saveVirtualPatchContext({
        source: 'scanner',
        mode: 'wallet-fallback',
        initiatedAt: new Date().toISOString(),
        venueId: venueId ?? null,
        venueName,
        patchId: fallbackPatchId ?? null,
        distanceMeters: null,
        capabilities: { nfc: supportsNfc, qr: supportsLiveQr },
      });
    }
    onClose();
    onOpenAccessWallet?.();
  }, [fallbackPatchId, onClose, onOpenAccessWallet, supportsLiveQr, supportsNfc, verification, venueId, venueName]);

  const handleServiceRequest = useCallback((serviceName: string) => {
    if (!hasConsented && hasAffirmedAge) {
      setHasConsented(true);
      toast.success(serviceName, { description: 'Reader starting — verify the patch to request this service.' });
      return;
    }
    toast.success(serviceName, { description: 'Opening your Bytspot Passport request.' });
    handleContinue();
  }, [handleContinue, hasAffirmedAge, hasConsented]);

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
            className="w-full max-w-sm max-h-[calc(100vh-24px)] overflow-y-auto rounded-[28px] border backdrop-blur-2xl shadow-2xl"
            style={{
              background: 'linear-gradient(145deg, rgba(13,16,23,0.94), rgba(15,23,42,0.86))',
              borderColor: 'rgba(103,232,249,0.25)',
              boxShadow: '0 0 42px rgba(34,211,238,0.18), 0 24px 70px rgba(0,0,0,0.58)',
            }}
            initial={{ y: 140, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 140, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5 pb-4">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-300/10 border border-cyan-300/30 text-cyan-100 text-[11px] mb-2 shadow-[0_0_18px_rgba(34,211,238,0.12)]" style={{ fontWeight: 850 }}>
                    {activeMethod === 'nfc' ? <Zap className="w-3.5 h-3.5" strokeWidth={2.4} /> : <QrCode className="w-3.5 h-3.5" strokeWidth={2.4} />}
                    {activeMethod === 'nfc' ? 'NFC Tap Reader' : 'QR Backup Scanner'}
                  </div>
                  <h3 className="text-[21px] text-white leading-tight" style={{ fontWeight: 850 }}>{showAppleDemoServices ? 'Apple Demo Venue' : activeMethod === 'nfc' ? 'Tap the Bytspot patch' : 'Scan the Bytspot patch'}</h3>
                  <p className="text-[13.5px] text-white/70 mt-1" style={{ fontWeight: 650 }}>{showAppleDemoServices ? 'Live • Midtown Atlanta' : venueName}</p>
                </div>
                <motion.button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 border border-white/20 backdrop-blur-md"
                  whileTap={{ scale: 0.92 }}
                >
                  <X className="w-4 h-4 text-white/80" />
                </motion.button>
              </div>

              {!hasAffirmedAge && ageGate && (
                <div className="rounded-[24px] border border-amber-300/30 bg-gradient-to-br from-amber-400/20 via-orange-500/10 to-rose-500/10 p-5 mb-4 backdrop-blur-xl">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-amber-300/20 border border-amber-300/30 flex items-center justify-center flex-shrink-0">
                      <ShieldCheck className="w-5 h-5 text-amber-100" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] text-white" style={{ fontWeight: 850 }}>Verify your age</div>
                      <p className="text-[12.5px] text-white/70 mt-1" style={{ fontWeight: 600 }}>
                        {venueName} requires guests to be {ageGate.minAge} or older. Bytspot does not store your date of birth — only your one-tap affirmation, scoped to this session.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <motion.button
                      onClick={() => {
                        emitAudit(createAuditEvent({
                          outcome: 'consent_denied',
                          method: supportsNfc ? 'nfc' : 'qr',
                          vendorId,
                          venueId,
                          reason: `age_gate_declined_min_${ageGate.minAge}`,
                        }));
                        onClose();
                      }}
                      className="flex-1 py-3 rounded-[16px] bg-white/10 border border-white/20 text-white/80 backdrop-blur-md"
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="text-[13.5px]" style={{ fontWeight: 700 }}>{'I\u2019m under ' + ageGate.minAge}</span>
                    </motion.button>
                    <motion.button
                      onClick={() => setHasAffirmedAge(true)}
                      className="flex-[1.4] py-3 rounded-[16px] bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white shadow-[0_12px_30px_rgba(251,146,60,0.22)]"
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="text-[13.5px]" style={{ fontWeight: 800 }}>{'I\u2019m ' + ageGate.minAge + ' or older'}</span>
                    </motion.button>
                  </div>
                </div>
              )}

              {showAppleDemoServices && hasAffirmedAge && !hasConsented && (
                <div className="mb-4 select-none rounded-[24px] border border-cyan-100/30 bg-[linear-gradient(145deg,rgba(8,47,73,0.92),rgba(17,24,39,0.99)_54%,rgba(88,28,135,0.78))] p-4 text-white shadow-[0_18px_44px_rgba(0,0,0,0.35),0_0_30px_rgba(168,85,247,0.22)] ring-1 ring-white/10">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/18 bg-white/10 shadow-[0_0_30px_rgba(217,70,239,0.24)]">
                      <ShieldCheck className="h-6 w-6 text-cyan-100" strokeWidth={2.6} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] uppercase tracking-[0.15em] text-cyan-100" style={{ fontWeight: 950 }}>Patch reader</p>
                      <p className="mt-1 text-[13px] leading-5 text-slate-200" style={{ fontWeight: 760 }}>Start the reader once, then tap any service below to request instantly.</p>
                    </div>
                  </div>
                  <motion.button
                    onClick={() => setHasConsented(true)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-[18px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 px-4 py-4 text-white shadow-[0_18px_42px_rgba(168,85,247,0.35)]"
                    whileTap={{ scale: 0.97 }}
                  >
                    <Zap className="h-4 w-4" strokeWidth={2.8} />
                    <span className="text-[15px]" style={{ fontWeight: 900 }}>Start Reader</span>
                  </motion.button>
                </div>
              )}

              {hasAffirmedAge && !hasConsented && !showAppleDemoServices && (
                <div className="rounded-[26px] border border-cyan-300/25 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-fuchsia-500/10 p-6 mb-5 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_42px_rgba(0,0,0,0.18)]">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-11 h-11 rounded-full bg-cyan-300/10 border border-cyan-300/30 flex items-center justify-center flex-shrink-0 shadow-[0_0_22px_rgba(34,211,238,0.12)]">
                      <ShieldCheck className="w-5 h-5 text-cyan-100" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[16px] text-white tracking-[-0.01em]" style={{ fontWeight: 850 }}>Confirm intent to read</div>
                      <p className="text-[13px] mt-1.5" style={{ color: 'rgba(255,255,255,0.80)', fontWeight: 625, lineHeight: 1.55 }}>
                        Bytspot needs to use your device’s {supportsNfc ? 'NFC reader' : 'camera'} to verify the {venueName} patch. The reader captures only the patch identifier and a one-time token — no biometrics, no continuous video, no audio.
                      </p>
                    </div>
                  </div>
                  <ul className="text-[12px] space-y-2 mb-5 pl-1" style={{ color: 'rgba(255,255,255,0.76)', fontWeight: 650, lineHeight: 1.5 }}>
                    <li>• Used only while this sheet is open. Closing the sheet stops the reader.</li>
                    <li>• Patch ID, scan timestamp, and outcome are written to the audit log for your records.</li>
                    <li>• You can revoke at any time — close this sheet, or open Settings → Privacy.</li>
                  </ul>
                  <div className="flex gap-3">
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
                      className="px-4 py-3.5 rounded-[18px] bg-white/10 border border-white/20 text-white/80 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      style={{ flex: '0.85 1 0', minWidth: 0 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="whitespace-nowrap text-[13.5px]" style={{ color: 'rgba(255,255,255,0.86)', fontWeight: 720 }}>Not now</span>
                    </motion.button>
                    <motion.button
                      onClick={() => setHasConsented(true)}
                      className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                      style={{ flex: '1.55 1 0', minWidth: 0 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 875 }}>Start reader</span>
                    </motion.button>
                  </div>
                </div>
              )}

              {hasConsented && (status === 'starting' || status === 'scanning' || status === 'verifying') && activeMethod === 'qr' && supportsLiveQr && (
                <div className="relative rounded-[24px] overflow-hidden border border-cyan-300/20 bg-black mb-4 aspect-[3/4]">
                  <video ref={attachVideoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-7 top-1/2 -translate-y-1/2 h-40 rounded-[26px] border-2 border-cyan-300/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]" />
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-[88px] text-[12px] text-cyan-100/80 bg-black/40 px-3 py-1.5 rounded-full border border-cyan-300/20" style={{ fontWeight: 600 }}>
                      {status === 'verifying' ? 'Verifying patch…' : 'Align the QR code inside the frame'}
                    </div>
                  </div>
                </div>
              )}

              {hasConsented && (status === 'starting' || status === 'scanning' || status === 'verifying') && activeMethod === 'nfc' && (
                <div className="relative rounded-[24px] overflow-hidden border border-cyan-300/25 bg-gradient-to-br from-cyan-400/10 via-indigo-500/10 to-fuchsia-500/10 mb-4 aspect-[3/4] flex items-center justify-center backdrop-blur-xl">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.18),transparent_62%)]" />
                  <div className="relative flex flex-col items-center text-center px-6">
                    <div className="w-20 h-20 rounded-full border border-cyan-300/30 bg-black/25 flex items-center justify-center shadow-[0_0_38px_rgba(34,211,238,0.22)] mb-4 backdrop-blur-md">
                      <Zap className="w-9 h-9 text-cyan-100" strokeWidth={2.5} />
                    </div>
                    <p className="text-[20px] text-white" style={{ fontWeight: 850 }}>Tap ready</p>
                    <p className="text-[14px] mt-2 leading-5" style={{ color: 'rgba(255,255,255,0.78)', fontWeight: 600 }}>
                      Hold the top of your phone close to the Bytspot sticker and keep it steady for a second.
                    </p>
                  </div>
                </div>
              )}

              {(status === 'unsupported' || status === 'error' || status === 'success') && (
                <div className={`rounded-[22px] border p-4 mb-4 backdrop-blur-xl ${status === 'success' ? 'border-emerald-300/30 bg-emerald-400/10' : 'border-rose-300/30 bg-rose-400/10'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${status === 'success' ? 'bg-emerald-300/10 border-emerald-300/30' : 'bg-rose-300/10 border-rose-300/30'}`}>
                      {status === 'success' ? (
                        <ShieldCheck className="w-5 h-5 text-emerald-100" strokeWidth={2.5} />
                      ) : status === 'unsupported' ? (
                        <Camera className="w-5 h-5 text-rose-100" strokeWidth={2.4} />
                      ) : (
                        <QrCode className="w-5 h-5 text-rose-100" strokeWidth={2.4} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[15px] text-white" style={{ fontWeight: 850 }}>
                        {status === 'success' ? 'Patch verified' : status === 'unsupported' ? 'Tap / Scan not supported here' : 'Tap / Scan needs attention'}
                      </div>
                      <p className="text-[13px] mt-1 leading-5" style={{ color: 'rgba(255,255,255,0.74)', fontWeight: 600 }}>{statusMessage}</p>
                      {verification && (
                        <div className="flex flex-wrap gap-2 mt-3 text-[11px] text-emerald-50" style={{ fontWeight: 750 }}>
                          <div className="px-2.5 py-1 rounded-full bg-black/20 border border-emerald-300/25">Patch {verification.patchId.slice(-6)}</div>
                          <div className="px-2.5 py-1 rounded-full bg-black/20 border border-emerald-300/25">ICT {verification.tokenJti.slice(0, 8)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {!showAppleDemoServices && (
                <div className="rounded-[20px] border border-cyan-300/20 bg-cyan-300/10 p-4 mb-4 text-[12.5px] leading-5 backdrop-blur-xl" style={{ color: 'rgba(255,255,255,0.74)', fontWeight: 600 }}>
                  <div>• Tap the Bytspot sticker first when NFC is available.</div>
                  <div className="mt-2">• Use QR only if NFC is unavailable.</div>
                  <div className="mt-2">• Bytspot verifies the patch with the live backend.</div>
                </div>
              )}

              {showAppleDemoServices && (
                <div className="mb-4 select-none rounded-[26px] border border-cyan-100/25 bg-[linear-gradient(145deg,rgba(15,23,42,0.99),rgba(30,41,59,0.98)_48%,rgba(88,28,135,0.82))] p-4 text-white shadow-[0_20px_55px_rgba(0,0,0,0.40),0_0_36px_rgba(168,85,247,0.22)] ring-1 ring-cyan-100/10">
                  <div className="text-center">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-100" style={{ fontWeight: 950 }}>Venue Services</p>
                    <h4 className="mt-1 text-[22px] leading-7 text-white" style={{ fontWeight: 950 }}>Apple Demo Venue</h4>
                    <p className="mt-1 text-[12px] leading-5 text-cyan-100" style={{ fontWeight: 850 }}>Live • Midtown Atlanta</p>
                    <p className="mx-auto mt-1 max-w-[260px] text-[13px] leading-5 text-slate-200" style={{ fontWeight: 800 }}>Tap any service below to request instantly.</p>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-2.5">
                    {APPLE_DEMO_SERVICES.map((service) => (
                      <motion.button
                        key={service.name}
                        onClick={() => handleServiceRequest(service.name)}
                        className="w-full rounded-[18px] border border-white/16 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(2,6,23,0.84))] p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_24px_rgba(0,0,0,0.24)]"
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br ${service.accent} text-white shadow-[0_12px_26px_rgba(168,85,247,0.24)]`} style={{ fontWeight: 950 }}>
                            {service.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] leading-5 text-white" style={{ fontWeight: 950 }}>{service.name}</p>
                            <p className="mt-0.5 text-[13px] leading-5 text-cyan-100" style={{ fontWeight: 850 }}>{service.title}</p>
                            <p className="mt-0.5 text-[12px] leading-5 text-slate-200" style={{ fontWeight: 700 }}>{service.detail}</p>
                            <div className="mt-2.5 rounded-[14px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 px-3 py-2 text-center text-[13px] text-white shadow-[0_12px_26px_rgba(168,85,247,0.25)]" style={{ fontWeight: 950 }}>
                              → {service.cta}
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  <p className="mt-4 text-center text-[12px] leading-5 text-slate-200" style={{ fontWeight: 760 }}>Tap a service above to send request to the vendor.</p>
                  <p className="text-center text-[11px] text-cyan-100" style={{ fontWeight: 850 }}>Powered by Bytspot Passport</p>
                </div>
              )}

              {status !== 'success' && status !== 'verifying' && ((activeMethod === 'nfc' && supportsLiveQr) || (activeMethod === 'qr' && supportsNfc)) && (
                <div className="mb-4">
                  <motion.button
                    onClick={() => handleSwitchMethod(activeMethod === 'nfc' ? 'qr' : 'nfc')}
                    className="w-full py-3 rounded-[16px] bg-white/10 border border-white/20 text-white/80 backdrop-blur-md"
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="text-[14px]" style={{ color: 'rgba(255,255,255,0.86)', fontWeight: 700 }}>
                      {activeMethod === 'nfc' ? 'Use QR instead' : 'Try tap instead'}
                    </span>
                  </motion.button>
                </div>
              )}

              <div className="flex gap-3">
                <motion.button
                  onClick={onClose}
                  className="px-4 py-3.5 rounded-[18px] bg-white/10 border border-white/20 text-white/80 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                  style={{ flex: '0.9 1 0', minWidth: 0 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <span className="whitespace-nowrap text-[14px]" style={{ color: 'rgba(255,255,255,0.86)', fontWeight: 720 }}>{status === 'success' ? 'Done' : 'Close'}</span>
                </motion.button>

                {status === 'success' ? (
                  <motion.button
                    onClick={handleContinue}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 875 }}>{onOpenAccessWallet ? 'Continue in My Access' : 'Verified'}</span>
                  </motion.button>
                ) : status === 'unsupported' ? (
                  <motion.button
                    onClick={handleContinue}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 875 }}>{onOpenAccessWallet ? 'Continue in My Access' : 'Use Web Access'}</span>
                  </motion.button>
                ) : status === 'error' ? (
                  <motion.button
                    onClick={handleRetry}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-cyan-400 via-purple-500 to-fuchsia-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 875 }}>Retry scan</span>
                  </motion.button>
                ) : !hasConsented && hasAffirmedAge && showAppleDemoServices ? (
                  <motion.button
                    onClick={() => setHasConsented(true)}
                    className="px-4 py-3.5 rounded-[18px] bg-gradient-to-r from-fuchsia-500 via-purple-600 to-cyan-500 text-white shadow-[0_16px_36px_rgba(168,85,247,0.32),inset_0_1px_0_rgba(255,255,255,0.2)]"
                    style={{ flex: '1.55 1 0', minWidth: 0 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="whitespace-nowrap" style={{ color: '#fff', fontSize: '14px', fontWeight: 900 }}>Start Reader</span>
                  </motion.button>
                ) : (
                  <div className="px-4 py-3.5 rounded-[18px] bg-white/10 border border-white/20 flex items-center justify-center gap-2 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" style={{ flex: '1.1 1 0', minWidth: 0, color: 'rgba(255,255,255,0.78)' }}>
                    <LoaderCircle className="w-4 h-4 animate-spin" strokeWidth={2.4} />
                    <span className="whitespace-nowrap text-[14px]" style={{ color: 'rgba(255,255,255,0.82)', fontWeight: 720 }}>{status === 'verifying' ? 'Verifying…' : activeMethod === 'nfc' ? 'Listening for tap…' : 'Scanner live'}</span>
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