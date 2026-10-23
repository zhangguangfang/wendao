import type { AppData, ComfortItem, CustomAction, Letter, Mood, ReliefSession } from "./types";
export type { AppData, ComfortItem, CustomAction, Letter, Mood, ReliefSession } from "./types";

// Keep the original key so upgrading the app does not strand existing records.
export const STORAGE_KEY = "huanhuan.private.v1";
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
const baseActionIds = new Set(["water", "walk", "friend", "window", "meal", "rest"]);
const limits = {
  moods: 20_000,
  letters: 5_000,
  actionDays: 20_000,
  actionsPerDay: 200,
  reliefHistory: 50_000,
  customActions: 500,
  plannedActions: 200,
  comfortItems: 200,
} as const;

export type ImportSummary = {
  moodsAdded: number;
  lettersAdded: number;
  actionCompletionsAdded: number;
  reliefRecordsAdded: number;
  customActionsAdded: number;
  plannedActionsAdded: number;
  comfortItemsAdded: number;
  conflictsKept: number;
};

export const emptyData = (): AppData => ({
  version: 3,
  moods: [],
  letters: [],
  actions: {},
  reliefSessions: 0,
  reliefHistory: [],
  customActions: [],
  plannedActions: [],
  comfortItems: [],
});

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function invalid(message: string): never {
  throw new Error(message);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.keys(value).some((key) => forbiddenKeys.has(key))
  ) invalid(`${label}格式不正确。`);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string, max: number, allowEmpty = true): string {
  if (typeof value !== "string") invalid(`${label}需要是文字。`);
  if (value.length > max) invalid(`${label}不能超过 ${max} 个字符。`);
  if (!allowEmpty && !value.trim()) invalid(`${label}不能为空。`);
  return value;
}

function identifier(value: unknown, label: string): string {
  const result = string(value, label, 200, false);
  if (forbiddenKeys.has(result) || /[\u0000-\u001f\u007f]/.test(result))
    invalid(`${label}包含不支持的字符。`);
  return result;
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    invalid(`${label}必须是 ${min} 到 ${max} 之间的整数。`);
  return value;
}

function calendarDay(value: unknown, label: string): string {
  const text = string(value, label, 10, false);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) invalid(`${label}不是有效日期。`);
  const date = new Date(`${text}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text)
    invalid(`${label}不是有效日期。`);
  return text;
}

function timestamp(value: unknown, label: string): string {
  const text = string(value, label, 40, false);
  // Date.parse alone silently turns dates such as February 30 into another day.
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(text);
  if (!match || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 || !Number.isFinite(Date.parse(text)))
    invalid(`${label}不是带时区的有效时间。`);
  calendarDay(match[1], label);
  return text;
}

function array<T>(value: unknown, label: string, max: number, parse: (item: unknown, index: number) => T): T[] {
  if (!Array.isArray(value)) invalid(`${label}需要是列表。`);
  if (value.length > max) invalid(`${label}最多支持 ${max} 条。`);
  return value.map(parse);
}

function uniqueIds<T extends { id: string }>(items: T[], label: string): T[] {
  if (new Set(items.map((item) => item.id)).size !== items.length)
    invalid(`${label}中有重复的记录编号，请使用完整、未修改的备份。`);
  return items;
}

function stringList(value: unknown, label: string, max: number): string[] {
  const result = array(value, label, max, (item) => identifier(item, label));
  if (new Set(result).size !== result.length) invalid(`${label}中有重复的项目。`);
  return result;
}

function parseMood(value: unknown): Mood {
  const data = record(value, "心情记录");
  const createdAt = timestamp(data.createdAt, "心情记录时间");
  const result: Mood = {
    id: identifier(data.id, "心情编号"),
    value: integer(data.value, "心情状态", 1, 4),
    createdAt,
    day: data.day === undefined ? dayKey(new Date(createdAt)) : calendarDay(data.day, "心情日期"),
  };
  if (data.note !== undefined) result.note = string(data.note, "心情备注", 500);
  if (data.tags !== undefined) {
    const tags = array(data.tags, "感受标签", 10, (tag) => string(tag, "感受标签", 40, false));
    result.tags = [...new Set(tags)];
  }
  return result;
}

function parseLetter(value: unknown): Letter {
  const data = record(value, "信件");
  const result: Letter = {
    id: identifier(data.id, "信件编号"),
    title: string(data.title, "信件标题", 200),
    body: string(data.body, "信件正文", 100_000),
    createdAt: timestamp(data.createdAt, "信件创建时间"),
  };
  if (data.updatedAt !== undefined) result.updatedAt = timestamp(data.updatedAt, "信件修改时间");
  if (data.favorite !== undefined) {
    if (typeof data.favorite !== "boolean") invalid("信件收藏状态不正确。");
    result.favorite = data.favorite;
  }
  return result;
}

function parseRelief(value: unknown): ReliefSession {
  const data = record(value, "练习记录");
  if (data.technique !== "breathing" && data.technique !== "grounding") invalid("练习方式不正确。");
  const result: ReliefSession = {
    id: identifier(data.id, "练习编号"),
    createdAt: timestamp(data.createdAt, "练习时间"),
    feeling: string(data.feeling, "练习前感受", 80),
    technique: data.technique,
    durationSeconds: integer(data.durationSeconds, "练习时长", 0, 86_400),
  };
  if (data.before !== undefined) result.before = integer(data.before, "练习前强度", 1, 5);
  if (data.after !== undefined) result.after = integer(data.after, "练习后强度", 1, 5);
  if (data.action !== undefined) result.action = identifier(data.action, "练习后小行动");
  return result;
}

function parseCustomAction(value: unknown): CustomAction {
  const data = record(value, "自选行动");
  const result: CustomAction = {
    id: identifier(data.id, "自选行动编号"),
    title: string(data.title, "自选行动名称", 80, false),
    createdAt: timestamp(data.createdAt, "自选行动创建时间"),
  };
  if (baseActionIds.has(result.id)) invalid("自选行动编号与内置行动重复，请检查备份内容。");
  if (data.detail !== undefined) result.detail = string(data.detail, "自选行动说明", 300);
  if (data.archived !== undefined) {
    if (typeof data.archived !== "boolean") invalid("自选行动归档状态不正确。");
    result.archived = data.archived;
  }
  return result;
}

function parseComfortItem(value: unknown): ComfortItem {
  const data = record(value, "安稳收藏");
  if (data.kind !== "note" && data.kind !== "contact" && data.kind !== "practice") invalid("安稳收藏类型不正确。");
  const result: ComfortItem = {
    id: identifier(data.id, "安稳收藏编号"), kind: data.kind,
    title: string(data.title, "安稳收藏标题", 60, false),
    body: string(data.body, "安稳收藏内容", 1000),
    createdAt: timestamp(data.createdAt, "安稳收藏时间"),
  };
  if (data.updatedAt !== undefined) result.updatedAt = timestamp(data.updatedAt, "安稳收藏修改时间");
  if (data.kind === "practice") {
    if (data.technique !== "breathing" && data.technique !== "grounding") invalid("安稳收藏的练习方式不正确。");
    result.technique = data.technique;
  } else if (data.technique !== undefined) invalid("文字或联系人收藏不能包含练习方式。");
  return result;
}

/** Validate unknown input and construct a fresh, bounded v3 object. Older apps
 * reject v3 instead of silently dropping the new private comfort items. */
function parseData(value: unknown): AppData {
  const data = record(value, "备份内容");
  if (data.version !== 1 && data.version !== 2 && data.version !== 3)
    invalid("暂不支持这个数据版本，请使用对应版本的缓缓打开。原有记录不会被覆盖。");
  const moods = uniqueIds(array(data.moods, "心情记录", limits.moods, parseMood), "心情记录");
  // v1 did not persist a calendar day. After a timezone change, two older
  // records can map to the same local day. Keep both IDs and all their text;
  // the UI uses the latest record for quick check-ins and shows both in history.
  const rawActions = record(data.actions, "小行动记录");
  if (Object.keys(rawActions).length > limits.actionDays) invalid(`小行动记录最多支持 ${limits.actionDays} 天。`);
  const actions: Record<string, string[]> = {};
  for (const [key, items] of Object.entries(rawActions)) {
    actions[calendarDay(key, "小行动日期")] = stringList(items, "当天的小行动", limits.actionsPerDay);
  }
  const result: AppData = {
    version: 3,
    moods,
    letters: uniqueIds(array(data.letters, "信件", limits.letters, parseLetter), "信件"),
    actions,
    reliefSessions: integer(data.reliefSessions, "累计练习次数", 0, Number.MAX_SAFE_INTEGER),
    reliefHistory: [],
    customActions: [],
    plannedActions: [],
    comfortItems: [],
  };
  if (data.version === 2 || data.version === 3) {
    result.reliefHistory = uniqueIds(array(data.reliefHistory, "练习记录", limits.reliefHistory, parseRelief), "练习记录");
    result.customActions = uniqueIds(array(data.customActions, "自选行动", limits.customActions, parseCustomAction), "自选行动");
    result.plannedActions = stringList(data.plannedActions, "待办小行动", limits.plannedActions);
    const availableActions = new Set([
      ...baseActionIds,
      ...result.customActions.filter((action) => !action.archived).map((action) => action.id),
    ]);
    if (result.plannedActions.some((id) => !availableActions.has(id)))
      invalid("小行动计划中包含缺失或已归档的项目，请检查备份内容。");
    if (result.reliefSessions < result.reliefHistory.length) invalid("累计练习次数不能小于详细练习记录数量。");
  }
  if (data.version === 3) result.comfortItems = uniqueIds(array(data.comfortItems, "安稳收藏", limits.comfortItems, parseComfortItem), "安稳收藏");
  return result;
}

function checkSize(text: string) {
  if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES)
    invalid("备份文件过大，最多支持 10 MB。原有记录不会被覆盖。");
}

function parseJson(text: string): unknown {
  checkSize(text);
  try {
    return JSON.parse(text, (key, value: unknown) => {
      if (forbiddenKeys.has(key)) throw new Error("unsafe key");
      return value;
    });
  } catch {
    invalid("无法读取这个文件，请选择由缓缓导出的完整 JSON 备份。");
  }
}

/** Accept exported backup envelopes and original v1/v2/v3 storage JSON. */
export function parseBackup(text: string): AppData {
  const value = record(parseJson(text), "备份文件");
  if ("app" in value || "backupVersion" in value || "data" in value) {
    if (value.app !== "huanhuan") invalid("这不是缓缓的备份文件。");
    if (value.backupVersion !== 1) invalid("暂不支持这个备份格式版本，请更新缓缓后再试。");
    timestamp(value.exportedAt, "备份导出时间");
    return parseData(value.data);
  }
  return parseData(value);
}

export function createBackup(data: AppData): string {
  const text = JSON.stringify({
    app: "huanhuan",
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    data: parseData(data),
  }, null, 2);
  checkSize(text);
  return text;
}

/** Keep local conflicting records. Re-importing a backup is idempotent. */
export function mergeImportedData(current: AppData, incoming: AppData): { data: AppData; summary: ImportSummary } {
  const local = parseData(current);
  const imported = parseData(incoming);
  const summary: ImportSummary = {
    moodsAdded: 0, lettersAdded: 0, actionCompletionsAdded: 0,
    reliefRecordsAdded: 0, customActionsAdded: 0, plannedActionsAdded: 0, comfortItemsAdded: 0,
    conflictsKept: 0,
  };
  const mergeRecords = <T extends { id: string }>(
    existing: T[], added: T[], onAdded: () => void, extraConflict?: (item: T) => boolean,
  ): T[] => {
    const byId = new Map(existing.map((item) => [item.id, item]));
    const result = [...existing];
    for (const item of added) {
      const match = byId.get(item.id);
      if (match || extraConflict?.(item)) {
        if (!match || JSON.stringify(match) !== JSON.stringify(item)) summary.conflictsKept += 1;
        continue;
      }
      result.push(item);
      byId.set(item.id, item);
      onAdded();
    }
    return result;
  };
  const localDays = new Set(local.moods.map((item) => item.day));
  const moods = mergeRecords(local.moods, imported.moods, () => summary.moodsAdded += 1, (item) => localDays.has(item.day));
  const letters = mergeRecords(local.letters, imported.letters, () => summary.lettersAdded += 1);
  const reliefHistory = mergeRecords(local.reliefHistory, imported.reliefHistory, () => summary.reliefRecordsAdded += 1);
  const customActions = mergeRecords(local.customActions, imported.customActions, () => summary.customActionsAdded += 1);
  const comfortItems = mergeRecords(local.comfortItems, imported.comfortItems, () => summary.comfortItemsAdded += 1);
  const actions = { ...local.actions };
  for (const [day, items] of Object.entries(imported.actions)) {
    const previous = actions[day] ?? [];
    const merged = [...new Set([...previous, ...items])];
    summary.actionCompletionsAdded += merged.length - previous.length;
    actions[day] = merged;
  }
  // A local archived record wins a conflict with an active imported record.
  // Do not silently restore that action's plan when merging the two files.
  const availableActions = new Set([
    ...baseActionIds,
    ...customActions.filter((action) => !action.archived).map((action) => action.id),
  ]);
  const plannedActions = [...new Set([...local.plannedActions, ...imported.plannedActions])]
    .filter((id) => availableActions.has(id));
  summary.plannedActionsAdded = plannedActions.length - local.plannedActions.length;
  // Older data has a count without IDs. Keep the larger unlinked count and add
  // unique detailed sessions; overlap in legacy counts cannot be reconstructed.
  const legacyCount = Math.max(local.reliefSessions - local.reliefHistory.length, imported.reliefSessions - imported.reliefHistory.length);
  const data = parseData({
    version: 3, moods, letters, actions, reliefHistory, customActions, plannedActions, comfortItems,
    reliefSessions: legacyCount + reliefHistory.length,
  });
  checkSize(JSON.stringify(data));
  return { data, summary };
}

export function mergeData(current: AppData, incoming: AppData): AppData {
  return mergeImportedData(current, incoming).data;
}

export function loadData(): { data: AppData; error: string | null; sourceVersion?: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { data: emptyData(), error: null };
    // Migration is in memory only. A successful user edit performs the write.
    const parsed = record(parseJson(raw), "本地记录");
    return { data: parseData(parsed), error: null, sourceVersion: parsed.version as number };
  } catch {
    return {
      data: emptyData(),
      error: "暂时无法读取本地记录。为保护已有内容，本次不会覆盖保存。你仍可以使用情绪缓解练习。",
    };
  }
}

export function saveData(data: AppData): boolean {
  try {
    const next = parseData(data);
    const raw = JSON.stringify(next);
    checkSize(raw);
    // Protect against unreadable/newer data written by another tab before its
    // storage event arrives. A deliberate reset is a separate user action.
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing !== null) parseData(parseJson(existing));
    localStorage.setItem(STORAGE_KEY, raw);
    return true;
  } catch {
    return false;
  }
}
