import type { AppData, ComfortItem, ReliefSession } from "./types";
import { RecordConflict } from "./usePrivateData";
import { sameRecord } from "./records";

export const comfortLimit = 200;
export const practiceNames = { breathing: "轻柔的呼吸", grounding: "感受此刻" } as const;
export const makeComfortId = () => globalThis.crypto?.randomUUID?.() ?? `comfort-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function saveComfortItem(data: AppData, item: ComfortItem, expected: ComfortItem | null): AppData {
  const current = data.comfortItems.find((entry) => entry.id === item.id) ?? null;
  if (!sameRecord(current, expected)) throw new RecordConflict("这项收藏已在另一个窗口更改。请先查看最新内容，你正在编辑的文字仍保留。");
  if (!current && data.comfortItems.length >= comfortLimit) throw new RecordConflict("安稳工具箱已满，请先整理一些收藏。你的文字仍保留。");
  return { ...data, comfortItems: [item, ...data.comfortItems.filter((entry) => entry.id !== item.id)] };
}

export function collectPractice(data: AppData, technique: ReliefSession["technique"]): AppData {
  if (data.comfortItems.some((item) => item.kind === "practice" && item.technique === technique)) return data;
  return saveComfortItem(data, {
    id: makeComfortId(), kind: "practice", technique, title: practiceNames[technique],
    body: technique === "breathing" ? "按舒服的节奏呼吸，任何时候都可以停下。" : "留意身边看见、触到或听见的小线索。",
    createdAt: new Date().toISOString(),
  }, null);
}
