import { useCallback, useEffect, useRef, useState } from "react";
import { emptyData, loadData, saveData, STORAGE_KEY, type AppData } from "./storage";
import { clearSharedSnapshot, readSharedSnapshot, RepositoryUnavailable, stageSharedSnapshot, writeSharedSnapshot, type SharedSnapshot } from "./privateRepository";
import { storageScope } from "./storageScope";

export const WRITE_LOCK = `huanhuan-private-write${storageScope}`;

/** Raised by an editor when another window changed its original record. */
export class RecordConflict extends Error {}

export function usePrivateData() {
  const [initial] = useState(loadData);
  const [data, setData] = useState(initial.data);
  const [readBlocked, setReadBlocked] = useState(Boolean(initial.error));
  const [storageError, setStorageError] = useState(initial.error);
  const dataRef = useRef(data);
  const fallbackQueue = useRef(Promise.resolve());
  const [singleWindowOnly, setSingleWindowOnly] = useState(!navigator.locks?.request || !globalThis.indexedDB || !globalThis.crypto?.subtle);
  const useRepository = useRef(!singleWindowOnly);

  const applySnapshot = useCallback((next: AppData, error: string | null) => {
    dataRef.current = next;
    setData(next);
    setReadBlocked(Boolean(error));
    setStorageError(error);
  }, []);

  const withWriteLock = useCallback(async (write: () => boolean | Promise<boolean>): Promise<boolean> => {
    try {
      if (navigator.locks?.request) {
        return await navigator.locks.request(WRITE_LOCK, write);
      }
      // Older browsers serialize this window only. The UI explains this limit.
      const result = fallbackQueue.current.then(write);
      fallbackQueue.current = result.then(() => undefined, () => undefined);
      return await result;
    } catch {
      setStorageError("这次没能保存，请稍后重试。你的更改仍留在当前页面。");
      return false;
    }
  }, []);

  const resolveCurrent = useCallback(async () => {
    if (useRepository.current) {
      return readSharedSnapshot();
    }
    const loaded = loadData();
    return { snapshot: { data: loaded.data, hashes: [] } as SharedSnapshot, error: loaded.error };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => withWriteLock(async () => {
      try {
        const current = await resolveCurrent();
        if (!cancelled) {
          setSingleWindowOnly(!useRepository.current);
          applySnapshot(current.snapshot.data, current.error);
        }
      } catch (cause) {
        // Some private/file browser contexts disallow IndexedDB. Keep their
        // original records usable and clearly limit this session to one window.
        if (cause instanceof RepositoryUnavailable || (cause instanceof DOMException && cause.name === "SecurityError")) {
          useRepository.current = false;
          if (!cancelled) {
            setSingleWindowOnly(true);
            const current = loadData();
            applySnapshot(current.data, current.error);
          }
        } else if (!cancelled) {
          setReadBlocked(true);
          setStorageError("暂时无法读取本地事务记录。为保护已有内容，本次不会覆盖保存。请先在数据设置中备份可读取的记录。");
        }
      }
      return true;
    });
    void refresh();
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      void refresh();
    };
    window.addEventListener("storage", sync);
    return () => { cancelled = true; window.removeEventListener("storage", sync); };
  }, [applySnapshot, resolveCurrent, withWriteLock]);

  const commit = useCallback((update: (previous: AppData) => AppData): Promise<boolean> => withWriteLock(async () => {
    // Complete the authoritative local transaction under one origin write lock.
    // Never derive a mutation from a potentially stale React render snapshot.
    const resolved = await resolveCurrent();
    const current = { data: resolved.snapshot.data, error: resolved.error };
    if (current.error) {
      applySnapshot(current.data, current.error);
      return false;
    }
    let next: AppData;
    try {
      next = update(current.data);
    } catch (cause) {
      applySnapshot(current.data, null);
      setStorageError(cause instanceof RecordConflict ? cause.message : "这次更改未保存，请重试。");
      return false;
    }
    const staged = useRepository.current ? await stageSharedSnapshot(resolved.snapshot, next) : null;
    if (!saveData(staged?.data ?? next)) {
      applySnapshot(current.data, null);
      setStorageError("本地保存失败，可能是浏览器存储已满或被禁用。刚才的更改尚未保存。");
      return false;
    }
    if (staged) {
      try { await writeSharedSnapshot(staged); }
      catch {
        saveData(current.data);
        applySnapshot(current.data, null);
        setStorageError("这次没能完成保存，原来的记录仍保留。请重试。");
        return false;
      }
    }
    applySnapshot(staged?.data ?? next, null);
    return true;
  }), [applySnapshot, resolveCurrent, withWriteLock]);

  const clearData = useCallback(() => withWriteLock(async () => {
    let current;
    try { current = await resolveCurrent(); }
    catch {
      // The user has explicitly confirmed deletion, including unreadable data.
      current = { snapshot: { data: loadData().data, hashes: [] } };
    }
    const staged = useRepository.current ? await clearSharedSnapshot(current.snapshot) : null;
    try {
      localStorage.removeItem(STORAGE_KEY);
      if (staged) {
        try { await writeSharedSnapshot(staged); }
        catch {
          saveData(current.snapshot.data);
          throw new Error("Could not finish clearing records");
        }
      }
      applySnapshot(emptyData(), null);
      return true;
    } catch {
      setStorageError("浏览器暂不允许删除本地记录，请在浏览器设置中清除此站点的数据。");
      return false;
    }
  }), [applySnapshot, resolveCurrent, withWriteLock]);

  return { data, dataRef, readBlocked, storageError, singleWindowOnly, commit, clearData };
}
