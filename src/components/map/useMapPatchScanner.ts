import { useCallback, useState } from 'react';
import type { ApiVenue } from '../../utils/trpc';
import type { BytspotPatchTier, BytspotTagIntent, BytspotTagUseMode } from '../../utils/patchTiers';

export type MapPatchScannerSource = 'map' | 'app-clip' | 'wallet';

export type PendingPatchScan = {
  patchId?: string | null;
  venueName?: string;
  tier?: BytspotPatchTier | null;
  tagUseMode?: BytspotTagUseMode | null;
  tagIntent?: BytspotTagIntent | null;
  referralCode?: string | null;
  groupSize?: number | null;
  source?: Extract<MapPatchScannerSource, 'app-clip' | 'wallet'>;
};

export function useMapPatchScanner() {
  const [showQrScannerSheet, setShowQrScannerSheet] = useState(false);
  const [qrScannerVenue, setQrScannerVenue] = useState<ApiVenue | null>(null);
  const [qrScannerEntrySource, setQrScannerEntrySource] = useState<MapPatchScannerSource>('map');
  const [qrScannerTier, setQrScannerTier] = useState<BytspotPatchTier | null>(null);
  const [qrScannerTagUseMode, setQrScannerTagUseMode] = useState<BytspotTagUseMode | null>(null);
  const [qrScannerTagIntent, setQrScannerTagIntent] = useState<BytspotTagIntent | null>(null);
  const [qrScannerReferralCode, setQrScannerReferralCode] = useState<string | null>(null);
  const [qrScannerGroupSize, setQrScannerGroupSize] = useState<number | null>(null);

  const resetQrScannerContext = useCallback(() => {
    setQrScannerEntrySource('map');
    setQrScannerTier(null);
    setQrScannerTagUseMode(null);
    setQrScannerTagIntent(null);
    setQrScannerReferralCode(null);
    setQrScannerGroupSize(null);
  }, []);

  const openMapQrScanner = useCallback((venue: ApiVenue) => {
    resetQrScannerContext();
    setQrScannerVenue(venue);
    setShowQrScannerSheet(true);
  }, [resetQrScannerContext]);

  const openPendingPatchScan = useCallback((pending: PendingPatchScan) => {
    const synthetic = {
      id: null,
      name: pending.venueName ?? 'Bytspot patch',
      hardwarePatch: { id: pending.patchId ?? null },
    } as unknown as ApiVenue;

    setQrScannerEntrySource(pending.source ?? 'app-clip');
    setQrScannerTier(pending.tier ?? null);
    setQrScannerTagUseMode(pending.tagUseMode ?? null);
    setQrScannerTagIntent(pending.tagIntent ?? null);
    setQrScannerReferralCode(pending.referralCode ?? null);
    setQrScannerGroupSize(pending.groupSize ?? null);
    setQrScannerVenue(synthetic);
    setShowQrScannerSheet(true);
  }, []);

  const handleCloseQrScanner = useCallback(() => {
    setShowQrScannerSheet(false);
    setQrScannerVenue(null);
    resetQrScannerContext();
  }, [resetQrScannerContext]);

  return {
    showQrScannerSheet,
    qrScannerVenue,
    qrScannerEntrySource,
    qrScannerTier,
    qrScannerTagUseMode,
    qrScannerTagIntent,
    qrScannerReferralCode,
    qrScannerGroupSize,
    setShowQrScannerSheet,
    setQrScannerVenue,
    resetQrScannerContext,
    openMapQrScanner,
    openPendingPatchScan,
    handleCloseQrScanner,
  };
}