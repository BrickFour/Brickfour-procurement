import { useCallback, useEffect, useState } from 'react';
import type { VendorPerformance } from '../types';

/** Automatic vendor ratings (shared cache so every screen shows the same numbers) */
let cache: Map<string, VendorPerformance> | null = null;
let inflight: Promise<Map<string, VendorPerformance>> | null = null;
const listeners = new Set<(m: Map<string, VendorPerformance>) => void>();

async function load(force = false): Promise<Map<string, VendorPerformance>> {
  if (cache && !force) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch('/api/vendors/performance');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) return cache || new Map();
      cache = new Map((json.vendors as VendorPerformance[]).map((v) => [v.vendorId, v]));
      listeners.forEach((fn) => fn(cache!));
      return cache;
    } catch {
      return cache || new Map();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useVendorPerformance(): { byVendor: Map<string, VendorPerformance>; refresh: () => void } {
  const [byVendor, setByVendor] = useState<Map<string, VendorPerformance>>(cache || new Map());
  useEffect(() => {
    listeners.add(setByVendor);
    load().then(setByVendor);
    return () => {
      listeners.delete(setByVendor);
    };
  }, []);
  const refresh = useCallback(() => {
    load(true);
  }, []);
  return { byVendor, refresh };
}

/** Rating to show for a vendor: the measured rating, or the manual one until there is history */
export function displayRating(perf: VendorPerformance | undefined, manual: number): { value: number; measured: boolean } {
  return perf && perf.rating !== null ? { value: perf.rating, measured: true } : { value: manual || 0, measured: false };
}
