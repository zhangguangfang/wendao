import type { Letter } from "./components/LetterEditor";

export type Mood = { id: string; value: number; createdAt: string };
export type AppData = {
  version: 1;
  moods: Mood[];
  letters: Letter[];
  actions: Record<string, string[]>;
  reliefSessions: number;
};
export const STORAGE_KEY = "huanhuan.private.v1";
export const emptyData = (): AppData => ({
  version: 1,
  moods: [],
  letters: [],
  actions: {},
  reliefSessions: 0,
});

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function loadData(): { data: AppData; error: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: emptyData(), error: null };
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
      !Array.isArray(data.moods) ||
      !Array.isArray(data.letters) ||
      !data.actions ||
      typeof data.actions !== "object" ||
      Array.isArray(data.actions) ||
      !Number.isInteger(data.reliefSessions) ||
      data.reliefSessions < 0 ||
      !data.moods.every(
        (m: Mood) =>
          typeof m.id === "string" &&
          Number.isInteger(m.value) &&
          m.value >= 1 &&
          m.value <= 4 &&
          typeof m.createdAt === "string" &&
          Number.isFinite(Date.parse(m.createdAt)),
      ) ||
      !data.letters.every(
        (l: Letter) =>
          typeof l.id === "string" &&
          typeof l.title === "string" &&
          typeof l.body === "string" &&
          typeof l.createdAt === "string" &&
          Number.isFinite(Date.parse(l.createdAt)),
      ) ||
      !Object.values(data.actions).every(
        (a) => Array.isArray(a) && a.every((v) => typeof v === "string"),
      )
    )
      throw new Error("Invalid data");
    return { data, error: null };
  } catch {
    return {
      data: emptyData(),
      error:
        "暂时无法读取本地记录。为保护已有内容，本次不会覆盖保存。你仍可以使用情绪缓解练习。",
    };
  }
}

export function saveData(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
