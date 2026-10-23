import type { AppData, CustomAction } from "./types";
import { BASE_ACTIONS } from "./actions";
import { RecordConflict } from "./usePrivateData";

export type Energy = "low" | "some" | "more";
export type Exploration = { id: string; title: string; detail: string; energy: Energy; time: string };
export const explorations: Exploration[] = [
  { id: "rest", title: "给自己 5 分钟休息", detail: "选一个舒服的姿势，让身体被椅子或床稳稳托住。", energy: "low", time: "可以只做片刻" },
  { id: "water", title: "慢慢喝一杯温水", detail: "留意杯子的触感，不必一口喝完。", energy: "low", time: "约 1 分钟" },
  { id: "explore-colour", title: "找一种喜欢的颜色", detail: "看看身边，找一个颜色让你愿意多看一眼的东西。", energy: "low", time: "约 1 分钟" },
  { id: "explore-song", title: "听一首此刻合适的歌", detail: "可以选熟悉的，也可以试一首新的；不舒服就换掉或关掉。", energy: "some", time: "约一首歌" },
  { id: "window", title: "打开窗，看看远处", detail: "如果不方便开窗，也可以只让目光离开屏幕一会儿。", energy: "some", time: "约 2 分钟" },
  { id: "explore-corner", title: "整理一个小小的角落", detail: "只选桌上的一小块地方。整理到愿意停下的位置就好。", energy: "some", time: "约 3 分钟" },
  { id: "walk", title: "出去走上 5 分钟", detail: "选一段熟悉、安全的路；不方便出门时，可以在室内活动一下。", energy: "more", time: "约 5 分钟" },
  { id: "meal", title: "认真吃一点东西", detail: "给自己准备一点简单的食物，留意其中一种味道。", energy: "more", time: "按自己的节奏" },
  { id: "explore-photo", title: "拍下一处生活里的小发现", detail: "一片叶子、一束光或一个有趣的影子。照片留在你自己的相册里就好。", energy: "more", time: "约 5 分钟" },
];

/** Joining a plan never marks it complete. Reuse an existing equivalent title,
 * including a restored archived action, and enforce limits inside the write lock. */
export function planExploration(data: AppData, idea: Exploration): AppData {
  const base = BASE_ACTIONS.find((item) => item.id === idea.id);
  let chosen: CustomAction | undefined;
  let customs = data.customActions;
  if (!base) {
    chosen = data.customActions.find((item) => item.title.toLocaleLowerCase() === idea.title.toLocaleLowerCase() && !item.archived)
      ?? data.customActions.find((item) => item.id === idea.id);
    if (chosen && chosen.title !== idea.title) throw new RecordConflict("这件探索已经在行动清单中被改名。请打开我的计划查看，原来的行动会继续保留。");
    if (!chosen || chosen.archived) {
      if (data.customActions.filter((item) => !item.archived).length >= 20) throw new RecordConflict("手边已有 20 件自定义小行动，可以先在计划中归档一件暂时不需要的。");
      if (!chosen && data.customActions.length >= 500) throw new RecordConflict("小行动记录已达到上限，请先整理并备份已有记录。");
      chosen = chosen ? { ...chosen, archived: false } : { id: idea.id, title: idea.title, detail: idea.detail, createdAt: new Date().toISOString() };
      customs = [...data.customActions.filter((item) => item.id !== chosen!.id), chosen];
    }
  }
  const id = base?.id ?? chosen!.id;
  if (data.plannedActions.includes(id)) return data;
  return { ...data, customActions: customs, plannedActions: [...data.plannedActions, id] };
}

export function explorationInPlan(data: AppData, idea: Exploration): boolean {
  return data.plannedActions.some((id) => id === idea.id || data.customActions.some((item) => item.id === id && item.title.toLocaleLowerCase() === idea.title.toLocaleLowerCase() && !item.archived));
}
