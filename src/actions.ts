import type { AppData } from "./storage";

export const BASE_ACTIONS = [
  {
    id: "water",
    title: "慢慢喝一杯温水",
    detail: "给身体一点温柔的照顾",
  },
  {
    id: "walk",
    title: "出去走上 5 分钟",
    detail: "看看天，感受脚下的路",
  },
  {
    id: "friend",
    title: "联系一位信任的人",
    detail: "一句“最近怎么样”也可以",
  },
  {
    id: "window",
    title: "打开窗，看看远处",
    detail: "让目光休息一小会儿",
  },
  {
    id: "meal",
    title: "认真吃一点东西",
    detail: "简单的一餐也值得被照顾",
  },
  {
    id: "rest",
    title: "给自己 5 分钟休息",
    detail: "暂时放下手机，什么都不做",
  },
] as const;

export function getActionTitle(
  data: Pick<AppData, "customActions">,
  id: string,
) {
  return (
    BASE_ACTIONS.find((action) => action.id === id)?.title ??
    data.customActions.find((action) => action.id === id)?.title ??
    "以前的小行动"
  );
}
