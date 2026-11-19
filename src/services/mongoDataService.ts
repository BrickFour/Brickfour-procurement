import { User, Project, Material, InventoryTransaction, SiteQuery, ContractorRecord, InternalTransferRecord, Vendor, MarketPriceBenchmark, ProjectRequirement, VendorQuotation } from '../types';
import { INITIAL_USERS, INITIAL_PROJECTS, INITIAL_MATERIALS, INITIAL_TRANSACTIONS, INITIAL_QUERIES, INITIAL_CONTRACTORS, INITIAL_TRANSFERS, INITIAL_VENDORS, INITIAL_MARKET_BENCHMARKS, INITIAL_PRS, INITIAL_QUOTES } from '../initialData';

/**
 * MongoDB is the single source of truth for all application data.
 *
 * Flow:
 *  1. On startup the client calls `loadAppStateFromMongo()` which reads every collection via the API server.
 *  2. If the database has never been seeded, empty collections are filled from any data that was previously
 *     stored in this browser's localStorage (one-time migration) or from the bundled initial data.
 *  3. Afterwards every state change is diffed against the last known database snapshot and only the changed /
 *     removed documents are sent to `/api/db/sync` (debounced), so concurrent users never overwrite each other's
 *     untouched records.
 */

export interface MongoAppState {
  users: User[];
  projects: Project[];
  materials: Material[];
  transactions: InventoryTransaction[];
  queries: SiteQuery[];
  contractors: ContractorRecord[];
  internal_transfers: InternalTransferRecord[];
  vendors: Vendor[];
  market_benchmarks: MarketPriceBenchmark[];
  project_requirements: ProjectRequirement[];
  vendor_quotations: VendorQuotation[];
}

export type CollectionName =
  | 'users'
  | 'projects'
  | 'materials'
  | 'inventory_transactions'
  | 'site_queries'
  | 'contractors'
  | 'internal_transfers'
  | 'vendors'
  | 'market_benchmarks'
  | 'project_requirements'
  | 'vendor_quotations';

interface CollectionConfig {
  stateKey: keyof MongoAppState;
  collection: CollectionName;
  /** Legacy localStorage keys used by the previous local-only version (migrated once). */
  legacyKeys: string[];
  initial: any[];
}

const COLLECTIONS: CollectionConfig[] = [
  { stateKey: 'users', collection: 'users', legacyKeys: ['builder_users'], initial: INITIAL_USERS },
  { stateKey: 'projects', collection: 'projects', legacyKeys: ['builder_projects'], initial: INITIAL_PROJECTS },
  { stateKey: 'materials', collection: 'materials', legacyKeys: ['builder_materials'], initial: INITIAL_MATERIALS },
  { stateKey: 'transactions', collection: 'inventory_transactions', legacyKeys: ['builder_transactions'], initial: INITIAL_TRANSACTIONS },
  { stateKey: 'queries', collection: 'site_queries', legacyKeys: [], initial: INITIAL_QUERIES },
  { stateKey: 'contractors', collection: 'contractors', legacyKeys: ['builder_contractors'], initial: INITIAL_CONTRACTORS },
  { stateKey: 'internal_transfers', collection: 'internal_transfers', legacyKeys: ['builder_internal_transfers'], initial: INITIAL_TRANSFERS },
  { stateKey: 'vendors', collection: 'vendors', legacyKeys: ['builder_vendors'], initial: INITIAL_VENDORS },
  { stateKey: 'market_benchmarks', collection: 'market_benchmarks', legacyKeys: ['builder_market_benchmarks'], initial: INITIAL_MARKET_BENCHMARKS },
  { stateKey: 'project_requirements', collection: 'project_requirements', legacyKeys: ['builder_prs'], initial: INITIAL_PRS },
  { stateKey: 'vendor_quotations', collection: 'vendor_quotations', legacyKeys: ['builder_quotes'], initial: INITIAL_QUOTES },
];

/** Market benchmarks are identified by material code, everything else by `id`. */
const docKey = (collection: CollectionName, doc: any): string | undefined => {
  const key = collection === 'market_benchmarks' ? doc?.materialCode ?? doc?.id : doc?.id;
  return key === undefined || key === null ? undefined : String(key);
};

const LEGACY_BACKUP_KEYS = ['vyas_mongo_app_backup_v1', 'bhandar_supabase_backup_v1', 'builderstore_supabase_backup_v1'];

function readLegacyLocalData(cfg: CollectionConfig): any[] | null {
  if (typeof window === 'undefined') return null;
  try {
    for (const key of cfg.legacyKeys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    }
    for (const key of LEGACY_BACKUP_KEYS) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const value = parsed?.[cfg.stateKey];
        if (Array.isArray(value) && value.length > 0) return value;
      }
    }
  } catch {
    // ignore malformed legacy data
  }
  return null;
}

function clearLegacyLocalData() {
  try {
    for (const cfg of COLLECTIONS) cfg.legacyKeys.forEach((k) => localStorage.removeItem(k));
    LEGACY_BACKUP_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

function buildFallbackState(): MongoAppState {
  const state: any = {};
  for (const cfg of COLLECTIONS) state[cfg.stateKey] = cfg.initial;
  return state as MongoAppState;
}

export async function loadAppStateFromMongo(): Promise<{ state: MongoAppState; isLiveMongo: boolean; error?: string }> {
  try {
    const res = await fetch('/api/db/load');
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json.data) {
      throw new Error(json?.error || `HTTP error! status: ${res.status}`);
    }

    const data = json.data as Record<string, any[]>;
    const seeded = Boolean(json.seeded);
    const state: any = {};
    let migratedFromLocal = false;

    for (const cfg of COLLECTIONS) {
      const dbDocs = Array.isArray(data[cfg.collection]) ? data[cfg.collection] : [];
      // The database baseline is exactly what MongoDB holds; anything else in state gets pushed by the syncer.
      setSyncBaseline(cfg.collection, dbDocs);

      if (dbDocs.length === 0 && !seeded) {
        const legacy = readLegacyLocalData(cfg);
        if (legacy) migratedFromLocal = true;
        state[cfg.stateKey] = legacy || cfg.initial;
      } else {
        state[cfg.stateKey] = dbDocs;
      }
    }

    if (migratedFromLocal) {
      console.info('[MongoDB] Migrating previously stored browser data into MongoDB.');
    }
    if (!seeded) {
      pendingLegacyCleanup = true;
    }

    return { state: state as MongoAppState, isLiveMongo: true };
  } catch (err: any) {
    console.warn('[MongoDB] Unable to load data from the server. Changes will not be persisted until the database is reachable:', err?.message);
    return { state: buildFallbackState(), isLiveMongo: false, error: err?.message };
  }
}

/* ------------------------------------------------------------------ */
/* Diff-based synchronisation                                          */
/* ------------------------------------------------------------------ */

type Snapshot = Map<string, string>;

const baselines = new Map<CollectionName, Snapshot>();
const pendingDocs = new Map<CollectionName, any[]>();
const timers = new Map<CollectionName, ReturnType<typeof setTimeout>>();
const queues = new Map<CollectionName, Promise<void>>();
const localVersions = new Map<CollectionName, number>();
const inFlight = new Map<CollectionName, number>();
let pendingLegacyCleanup = false;

const SYNC_DEBOUNCE_MS = 400;
const RETRY_DELAY_MS = 5000;

function toSnapshot(collection: CollectionName, docs: any[]): Snapshot {
  const snap: Snapshot = new Map();
  for (const doc of docs || []) {
    const key = docKey(collection, doc);
    if (key !== undefined) snap.set(key, JSON.stringify(doc));
  }
  return snap;
}

function setSyncBaseline(collection: CollectionName, docs: any[]) {
  baselines.set(collection, toSnapshot(collection, docs));
}

async function postSync(collection: CollectionName, upserts: any[], deletes: string[], keepalive = false) {
  const res = await fetch('/api/db/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection, upserts, deletes }),
    keepalive,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error || `Sync failed with status ${res.status}`);
  }
}

function computeDiff(collection: CollectionName, docs: any[]) {
  const prev = baselines.get(collection) || new Map();
  const next = toSnapshot(collection, docs);
  const upserts: any[] = [];
  for (const doc of docs) {
    const key = docKey(collection, doc);
    if (key === undefined) continue;
    if (prev.get(key) !== next.get(key)) upserts.push(doc);
  }
  const deletes = [...prev.keys()].filter((k) => !next.has(k));
  return { prev, next, upserts, deletes };
}

function flushCollection(collection: CollectionName, keepalive = false): Promise<void> {
  const run = async () => {
    const docs = pendingDocs.get(collection);
    if (!docs) return;
    pendingDocs.delete(collection);

    const { prev, next, upserts, deletes } = computeDiff(collection, docs);
    if (upserts.length === 0 && deletes.length === 0) return;

    baselines.set(collection, next);
    inFlight.set(collection, (inFlight.get(collection) || 0) + 1);
    try {
      await postSync(collection, upserts, deletes, keepalive);
      if (pendingLegacyCleanup) {
        pendingLegacyCleanup = false;
        clearLegacyLocalData();
      }
    } catch (err) {
      console.warn(`[MongoDB] Failed to sync collection "${collection}", retrying shortly:`, err);
      baselines.set(collection, prev);
      if (!pendingDocs.has(collection)) pendingDocs.set(collection, docs);
      clearTimeout(timers.get(collection));
      timers.set(collection, setTimeout(() => flushCollection(collection), RETRY_DELAY_MS));
    } finally {
      inFlight.set(collection, (inFlight.get(collection) || 1) - 1);
    }
  };

  const queued = (queues.get(collection) || Promise.resolve()).then(run, run);
  queues.set(collection, queued);
  return queued;
}

/**
 * Persist the latest state of a collection. Only documents that changed since the last sync are sent,
 * and documents that disappeared from the array are deleted from MongoDB.
 * Does nothing until the collection has been loaded from the database.
 */
export function syncCollection(collection: CollectionName, docs: any[]) {
  if (!baselines.has(collection) || !Array.isArray(docs)) return;
  localVersions.set(collection, (localVersions.get(collection) || 0) + 1);
  pendingDocs.set(collection, docs);
  clearTimeout(timers.get(collection));
  timers.set(collection, setTimeout(() => flushCollection(collection), SYNC_DEBOUNCE_MS));
}

const isBusy = (collection: CollectionName) => pendingDocs.has(collection) || (inFlight.get(collection) || 0) > 0;

/**
 * Re-read collections that can change on the server without this browser's involvement
 * (e.g. quotations vendors submit through their quote link).
 * A collection is skipped when this browser has unsaved local changes to it, so local edits are never lost.
 */
export async function fetchServerUpdates(
  collections: CollectionName[]
): Promise<Partial<Record<CollectionName, any[]>>> {
  const ready = collections.filter((c) => baselines.has(c) && !isBusy(c));
  if (ready.length === 0) return {};
  const versionsBefore = new Map(ready.map((c) => [c, localVersions.get(c) || 0]));

  try {
    const res = await fetch(`/api/db/load?only=${encodeURIComponent(ready.join(','))}`);
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json.data) return {};

    const result: Partial<Record<CollectionName, any[]>> = {};
    for (const collection of ready) {
      const docs = json.data[collection];
      if (!Array.isArray(docs)) continue;
      // Skip if the user changed this collection while the request was in progress
      if (isBusy(collection) || (localVersions.get(collection) || 0) !== versionsBefore.get(collection)) continue;
      setSyncBaseline(collection, docs);
      result[collection] = docs;
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Merge server documents into the current list while keeping the on-screen order stable:
 * existing items keep their position (updated in place), new items are added at the top.
 */
export function mergeServerDocs<T>(current: T[], serverDocs: T[], keyOf: (doc: T) => string): T[] {
  const serverByKey = new Map(serverDocs.map((d) => [keyOf(d), d]));
  const currentKeys = new Set(current.map(keyOf));
  const added = serverDocs.filter((d) => !currentKeys.has(keyOf(d)));
  const kept = current.filter((d) => serverByKey.has(keyOf(d))).map((d) => serverByKey.get(keyOf(d))!);
  const merged = [...added, ...kept];
  const unchanged = merged.length === current.length && merged.every((d, i) => JSON.stringify(d) === JSON.stringify(current[i]));
  return unchanged ? current : merged;
}

function flushAllNow() {
  for (const collection of [...pendingDocs.keys()]) {
    clearTimeout(timers.get(collection));
    flushCollection(collection, true);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAllNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAllNow();
  });
}
