import { expect, test } from "@playwright/test";
import {
  createBackup, emptyData, loadData, MAX_BACKUP_BYTES,
  mergeData, mergeImportedData, parseBackup, saveData, STORAGE_KEY,
  type AppData, type Letter, type Mood,
} from "../src/storage";

const stamp = "2026-10-22T12:00:00.000Z";
const letter = (id = "letter-1", body = "今天愿意对自己温柔一点。"): Letter => ({
  id, title: "给自己的信", body, createdAt: stamp,
});
const mood = (id = "mood-1", day = "2026-10-22"): Mood => ({
  id, value: 2, createdAt: `${day}T12:00:00.000Z`, day, note: "窗边的光很温柔。", tags: ["想念"],
});
const v1 = () => ({
  version: 1,
  moods: [{ id: "old-mood", value: 3, createdAt: stamp }],
  letters: [letter("old-letter")],
  actions: { "2026-10-22": ["water"] },
  reliefSessions: 4,
});

class MemoryStorage implements Storage {
  values = new Map<string, string>();
  denyReads = false;
  denyWrites = false;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) {
    if (this.denyReads) throw new DOMException("Denied", "SecurityError");
    return this.values.get(key) ?? null;
  }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.denyWrites) throw new DOMException("Full", "QuotaExceededError");
    this.values.set(key, value);
  }
}

let memory: MemoryStorage;
let originalStorage: PropertyDescriptor | undefined;
test.beforeEach(() => {
  memory = new MemoryStorage();
  originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: memory, configurable: true });
});
test.afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

test("v1 records migrate in memory, preserve original bytes until an edit and round-trip as v2", () => {
  const original = JSON.stringify(v1(), null, 2);
  memory.setItem(STORAGE_KEY, original);
  const loaded = loadData();
  expect(loaded.error).toBeNull();
  expect(loaded.data.version).toBe(2);
  expect(loaded.data.letters).toEqual(v1().letters);
  expect(loaded.data.moods[0].day).toMatch(/^2026-10-2[23]$/);
  expect(loaded.data.reliefHistory).toEqual([]);
  expect(loaded.data.reliefSessions).toBe(4);
  expect(memory.getItem(STORAGE_KEY)).toBe(original);
  expect(parseBackup(createBackup(loaded.data))).toEqual(loaded.data);
  expect(saveData({ ...loaded.data, letters: [...loaded.data.letters, letter("new-letter")] })).toBe(true);
  expect(loadData().data.letters).toHaveLength(2);
  expect(JSON.parse(memory.getItem(STORAGE_KEY)!).version).toBe(2);
});

for (const [name, raw] of [
  ["broken JSON", '{"version":1,"moods":['],
  ["unknown future version", JSON.stringify({ ...emptyData(), version: 99 })],
  ["invalid shape", JSON.stringify({ ...emptyData(), moods: [null] })],
  ["empty stored string", ""],
] as const) {
  test(`${name} never gets silently overwritten`, () => {
    memory.setItem(STORAGE_KEY, raw);
    expect(loadData().error).toContain("暂时无法读取本地记录");
    expect(saveData(emptyData())).toBe(false);
    expect(memory.getItem(STORAGE_KEY)).toBe(raw);
  });
}

test("denied reads and failed writes retain original records", () => {
  const original = JSON.stringify(v1());
  memory.setItem(STORAGE_KEY, original);
  memory.denyReads = true;
  expect(loadData().error).not.toBeNull();
  expect(saveData(emptyData())).toBe(false);
  memory.denyReads = false;
  const loaded = loadData().data;
  memory.denyWrites = true;
  expect(saveData({ ...loaded, letters: [] })).toBe(false);
  expect(memory.getItem(STORAGE_KEY)).toBe(original);
});

test("legacy records mapping to one local day retain both identities and migrate without loss", () => {
  const older = v1();
  older.moods = [
    { id: "first-check-in", value: 1, createdAt: "2026-10-22T10:00:00.000Z" },
    { id: "second-check-in", value: 3, createdAt: "2026-10-22T12:00:00.000Z" },
  ];
  const raw = JSON.stringify(older);
  memory.setItem(STORAGE_KEY, raw);
  const loaded = loadData();
  expect(loaded.error).toBeNull();
  expect(loaded.data.moods.map((entry) => entry.id)).toEqual(["first-check-in", "second-check-in"]);
  expect(new Set(loaded.data.moods.map((entry) => entry.day)).size).toBe(1);
  expect(saveData(loaded.data)).toBe(true);
  expect(parseBackup(createBackup(loaded.data)).moods).toEqual(loaded.data.moods);
});

test("valid complete v2 content survives export and import without losing private fields", () => {
  const data: AppData = {
    ...emptyData(), moods: [mood()], letters: [{ ...letter(), favorite: true, updatedAt: stamp }],
    actions: { "2026-10-22": ["custom-song"] },
    reliefSessions: 3,
    reliefHistory: [{ id: "relief-1", createdAt: stamp, feeling: "repeat", technique: "grounding", durationSeconds: 23, before: 4, after: 3, action: "water" }],
    customActions: [{ id: "custom-song", title: "听一首歌", detail: "闭眼休息一下", createdAt: stamp, archived: true }],
    plannedActions: ["water"],
  };
  const backup = createBackup(data);
  expect(parseBackup(backup)).toEqual(data);
  const envelope = JSON.parse(backup);
  expect(envelope.app).toBe("huanhuan");
  expect(envelope.backupVersion).toBe(1);
  expect(new Date(envelope.exportedAt).getTime()).toBeGreaterThan(0);
});

test("backup validation rejects ambiguous IDs, impossible dates and unsupported files", () => {
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), letters: [letter(), letter()] }))).toThrow(/重复/);
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), moods: [mood("a", "2026-02-30")] }))).toThrow(/有效日期/);
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), letters: [{ ...letter(), createdAt: "2026-10-22T25:00:00Z" }] }))).toThrow(/有效时间/);
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), actions: { "2026-13-01": ["water"] } }))).toThrow(/有效日期/);
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), reliefSessions: -1 }))).toThrow(/整数/);
  expect(() => parseBackup(JSON.stringify({ app: "another-app", backupVersion: 1, data: emptyData(), exportedAt: stamp }))).toThrow(/不是缓缓/);
  expect(() => parseBackup(JSON.stringify({ app: "huanhuan", backupVersion: 2, data: emptyData(), exportedAt: stamp }))).toThrow(/备份格式版本/);
});

test("prototype keys, illegal identifiers and dangling plans are rejected without changing storage", () => {
  const original = JSON.stringify(v1());
  memory.setItem(STORAGE_KEY, original);
  for (const key of ["__proto__", "prototype", "constructor"]) {
    const raw = `{"version":2,"${key}":{"polluted":true}}`;
    expect(() => parseBackup(raw)).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...emptyData(), letters: [letter(key)] }))).toThrow();
  }
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), plannedActions: ["missing-action"] }))).toThrow(/缺失/);
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), customActions: [{ id: "water", title: "伪装内置行动", createdAt: stamp }] }))).toThrow(/内置行动重复/);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  expect(memory.getItem(STORAGE_KEY)).toBe(original);
});

test("backup limits count UTF-8 bytes, cap long fields and do not partially save", () => {
  const oversized = JSON.stringify({ ...emptyData(), padding: "界".repeat(Math.ceil(MAX_BACKUP_BYTES / 3)) });
  expect(oversized.length).toBeLessThan(MAX_BACKUP_BYTES);
  expect(() => parseBackup(oversized)).toThrow(/10 MB/);
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), moods: [{ ...mood(), note: "字".repeat(501) }] }))).toThrow(/500/);
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), letters: [letter("long", "a".repeat(100_001))] }))).toThrow(/100000/);
  expect(() => parseBackup(JSON.stringify({ ...emptyData(), letters: Array.from({ length: 5001 }, (_, index) => letter(String(index))) }))).toThrow(/5000/);
  expect(memory.getItem(STORAGE_KEY)).toBeNull();
});

test("merging keeps local conflicts, preserves independent records and is idempotent", () => {
  const current: AppData = {
    ...emptyData(), moods: [mood("local-mood")], letters: [letter("same", "本地修改")],
    actions: { "2026-10-22": ["water"] }, plannedActions: ["water"], reliefSessions: 4,
  };
  const incoming: AppData = {
    ...emptyData(), moods: [{ ...mood("other-id"), value: 4 }, mood("old-mood", "2026-10-21")],
    letters: [letter("same", "较早备份"), letter("new")],
    actions: { "2026-10-22": ["water", "walk"] }, plannedActions: ["walk"], reliefSessions: 6,
  };
  const frozenCurrent = JSON.stringify(current);
  const frozenIncoming = JSON.stringify(incoming);
  const merged = mergeImportedData(current, incoming);
  expect(merged.data.moods).toHaveLength(2);
  expect(merged.data.moods.find((entry) => entry.day === "2026-10-22")?.id).toBe("local-mood");
  expect(merged.data.letters.find((entry) => entry.id === "same")?.body).toBe("本地修改");
  expect(merged.data.actions["2026-10-22"]).toEqual(["water", "walk"]);
  expect(merged.data.reliefSessions).toBe(6);
  expect(merged.summary).toEqual({ moodsAdded: 1, lettersAdded: 1, actionCompletionsAdded: 1, reliefRecordsAdded: 0, customActionsAdded: 0, plannedActionsAdded: 1, conflictsKept: 2 });
  expect(mergeData(merged.data, incoming)).toEqual(merged.data);
  expect(JSON.stringify(current)).toBe(frozenCurrent);
  expect(JSON.stringify(incoming)).toBe(frozenIncoming);
});

test("merging an older plan never resurrects a locally archived action", () => {
  const custom = { id: "song", title: "听一首歌", createdAt: stamp };
  const current: AppData = { ...emptyData(), customActions: [{ ...custom, archived: true }], actions: { "2026-10-21": [custom.id] } };
  const incoming: AppData = { ...emptyData(), customActions: [custom], plannedActions: [custom.id], actions: { "2026-10-22": [custom.id] } };
  const merged = mergeImportedData(current, incoming);
  expect(merged.data.customActions[0].archived).toBe(true);
  expect(merged.data.plannedActions).toEqual([]);
  expect(merged.summary.plannedActionsAdded).toBe(0);
  expect(merged.data.actions).toEqual({ "2026-10-21": ["song"], "2026-10-22": ["song"] });
});

test("detailed sessions merge by identity while legacy counters are not added twice", () => {
  const session = { id: "shared", createdAt: stamp, feeling: "cry", technique: "breathing" as const, durationSeconds: 10 };
  const current: AppData = { ...emptyData(), reliefHistory: [session], reliefSessions: 5 };
  const incoming: AppData = { ...emptyData(), reliefHistory: [session, { ...session, id: "new" }], reliefSessions: 6 };
  const result = mergeData(current, incoming);
  expect(result.reliefHistory).toHaveLength(2);
  expect(result.reliefSessions).toBe(6);
  expect(mergeData(result, incoming)).toEqual(result);
});
