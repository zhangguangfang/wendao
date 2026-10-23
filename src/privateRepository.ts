import { emptyData, loadData, parseBackup, type AppData } from "./storage";
import { storageScope } from "./storageScope";

export const PRIVATE_DATABASE = `huanhuan.private.transactions.v2${storageScope}`;
const STORE = "snapshots";
const KEY = "current";
export type SharedSnapshot = { data: AppData; hashes: string[] };
export class RepositoryUnavailable extends Error {}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PRIVATE_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error?.name === "SecurityError" ? new RepositoryUnavailable("Browser disallows IndexedDB") : request.error);
    request.onblocked = () => reject(new Error("Database unavailable"));
    request.onsuccess = () => resolve(request.result);
  });
}

async function readSnapshot(): Promise<SharedSnapshot | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      tx.oncomplete = () => {
        const value = request.result;
        if (value === undefined) { resolve(undefined); return; }
        try {
          if (!value || !Array.isArray(value.hashes) || !value.hashes.every((hash: unknown) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) throw new Error("Invalid snapshot metadata");
          resolve({ data: parseBackup(JSON.stringify(value.data)), hashes: value.hashes });
        } catch (cause) { reject(cause); }
      };
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function writeSharedSnapshot(snapshot: SharedSnapshot): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(snapshot, KEY);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function digest(data: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function stageSharedSnapshot(current: SharedSnapshot, next: AppData): Promise<SharedSnapshot> {
  const normalized = parseBackup(JSON.stringify(next));
  const currentHash = await digest(parseBackup(JSON.stringify(current.data)));
  const hash = await digest(normalized);
  const hashes = [...new Set([...current.hashes, currentHash, hash])];
  // Record the mirror fingerprint before publishing localStorage. A failed
  // mirror write or a late storage event must never become a new user edit.
  await writeSharedSnapshot({ data: current.data, hashes });
  return { data: normalized, hashes };
}

/** Must be called while holding the app's cross-window write lock. */
export async function readSharedSnapshot(): Promise<{ snapshot: SharedSnapshot; error: string | null }> {
  const existing = await readSnapshot();
  const mirror = loadData();
  if (mirror.error) return { snapshot: existing ?? { data: mirror.data, hashes: [] }, error: mirror.error };
  const hash = await digest(mirror.data);
  // localStorage has per-process caches. Known older mirror snapshots are
  // ignored; the committed IndexedDB value is the cross-window authority.
  if (existing?.hashes.includes(hash)) return { snapshot: existing, error: null };
  if (existing && (mirror.sourceVersion === 1 || mirror.sourceVersion === 2)) {
    // v0.2 hashed its normalized v2 object. Preserve those fingerprints across
    // the v3 migration so a stale v2 mirror cannot replace the committed record.
    const { comfortItems: _items, ...legacy } = mirror.data;
    const legacyHash = await digest({ ...legacy, version: 2 });
    if (existing.hashes.includes(legacyHash)) return { snapshot: existing, error: null };
  }
  const adopted = mirror.sourceVersion === 1 || mirror.sourceVersion === 2
    ? { ...mirror.data, comfortItems: existing?.data.comfortItems ?? [] }
    : mirror.data;
  const snapshot = { data: adopted, hashes: [...(existing?.hashes ?? []), hash] };
  // A new, valid external edit (including the first v1 migration) is adopted.
  // Existing localStorage bytes remain untouched until a successful user edit.
  await writeSharedSnapshot(snapshot);
  return { snapshot, error: null };
}

export async function clearSharedSnapshot(current: SharedSnapshot): Promise<SharedSnapshot> {
  return stageSharedSnapshot(current, emptyData());
}
