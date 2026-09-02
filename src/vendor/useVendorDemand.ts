import { useCallback, useEffect, useState } from 'react';
import type { BookableDemandOperationId } from '../utils/bookableTemplates.ts';
import type { Demand, DemandSupply } from './demand.ts';
import type { DemandTransport } from './demandTransport.ts';

export interface VendorDemandState {
  demand: Demand[];
  supply: DemandSupply[];
  blockers: string[];
  busy: boolean;
  /** True until the first read lands, so an empty feed is not shown as one. */
  loading: boolean;
}

export interface VendorDemandActions {
  respond: (demandId: string, bookableId: string, operation: BookableDemandOperationId) => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * Owns the demand feed.
 *
 * Every response replaces both halves from the server's reply rather than
 * patching the local list. Answering a request consumes a slot, which can take
 * the capacity that made a second request answerable: patching only the request
 * that was answered would leave the other one still showing an offer button
 * that no longer has a slot behind it.
 */
export function useVendorDemand(transport: DemandTransport): VendorDemandState & VendorDemandActions {
  const [demand, setDemand] = useState<Demand[]>([]);
  const [supply, setSupply] = useState<DemandSupply[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const result = await transport.loadFeed();
      if (result.value) {
        setDemand(result.value.demand);
        setSupply(result.value.supply);
        setBlockers([]);
      } else {
        setBlockers(result.blockers ?? ['Could not load requests. Try again.']);
      }
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }, [transport]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const respond = useCallback(
    async (demandId: string, bookableId: string, operation: BookableDemandOperationId) => {
      setBlockers([]);
      setBusy(true);
      try {
        const result = await transport.respond(demandId, bookableId, operation);
        if (result.value) {
          setDemand(result.value.demand);
          setSupply(result.value.supply);
        } else {
          setBlockers(result.blockers ?? ['Could not send that. Try again.']);
        }
      } finally {
        setBusy(false);
      }
    },
    [transport],
  );

  return { demand, supply, blockers, busy, loading, respond, reload };
}
