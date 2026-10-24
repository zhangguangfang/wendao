import { BASE_ACTIONS } from './actions';
import { explorations } from './explorations';
import { sameRecord } from './records';
import { RecordConflict } from './usePrivateData';
import type { AppData, CustomAction } from './types';

export type GuidedAction = { id: string; title: string; detail?: string; original?: CustomAction };
export type ActionStep = { title: string; detail: string };
export function resolveGuidedAction(data: AppData, id: string): GuidedAction | undefined {
  const base = BASE_ACTIONS.find((item) => item.id === id);
  if (base) return { ...base };
  const custom = data.customActions.find((item) => item.id === id && !item.archived);
  return custom ? { id: custom.id, title: custom.title, detail: custom.detail, original: { ...custom } } : undefined;
}
const guides: Record<string, ActionStep[]> = {
  water: [
    { title: '先让水在手边', detail: '选一杯温度舒服的水，不用特意准备什么。' },
    { title: '慢慢喝一小口', detail: '留意杯子的触感，按自己舒服的速度喝。' },
    { title: '看看身体的需要', detail: '还想喝就再喝一点，够了就放下。没有规定的量。' },
  ],
  walk: [
    { title: '选一段容易返回的路', detail: '穿好鞋，看看天气与环境。出门不方便时，在室内走走也可以。' },
    { title: '把注意放到脚下', detail: '按舒服的速度走，留意一种颜色或声音，不必追求距离。' },
    { title: '在愿意的位置停下', detail: '随时可以返回或坐下。今天走了多远，由你决定。' },
  ],
  friend: [
    { title: '想起一位让你安心的人', detail: '可以是朋友、家人，或愿意提供支持的人。不必联系让你不安的人。' },
    { title: '说清楚此刻需要什么', detail: '例如：“我最近有些难受，你方便听我说一会儿吗？”也可以先在安稳工具箱里准备一句话。' },
    { title: '给双方留一点余地', detail: '对方暂时没空不代表你的感受不重要。可以约另一个时间，或寻找其他支持。' },
  ],
  window: [
    { title: '找一个安全舒服的位置', detail: '坐在窗边也可以；不方便开窗时，不需要打开窗户。' },
    { title: '让视线离开屏幕', detail: '看看远处的一种颜色、一片云，或一处建筑的轮廓。' },
    { title: '再回到身体这里', detail: '松一松肩膀。想继续坐会儿，或回去做事，都可以。' },
  ],
  meal: [
    { title: '先选容易准备的食物', detail: '一份简单的饭、面包或水果都可以，不用做得精致。' },
    { title: '给自己一个舒服的位置', detail: '坐稳，按身体能接受的速度吃，留意一种味道。' },
    { title: '尊重此刻的需要', detail: '吃到愿意停下的位置。不用把这顿饭变成另一项压力。' },
  ],
  rest: [
    { title: '找一个能被托住的姿势', detail: '让背靠着椅子，或找个舒服的地方坐下。' },
    { title: '暂时放下手里的事情', detail: '不用清空脑海。可以听听周围的声音，也可以只待一会儿。' },
    { title: '按自己的节奏回来', detail: '动动手脚，看看还想休息还是继续。休息不需要换来效率。' },
  ],
};
export function stepsForAction(action: GuidedAction): ActionStep[] {
  if (guides[action.id] && !action.original) return guides[action.id];
  const idea = explorations.find((item) => item.id === action.id && item.title === action.title);
  return [
    { title: '把开始变得小一点', detail: action.detail || '只选这件事里最容易开始的一小部分，先不要求全部做完。' },
    { title: '试一个愿意做的片刻', detail: idea?.detail || '按自己的节奏试一试。不舒服或不方便时，可以调整，也可以停下。' },
    { title: '由你决定做到哪里', detail: '看见已经尝试的部分。想继续就继续，想休息也可以。' },
  ];
}
/** Explicit desired state, never a toggle: retries and concurrent confirmations
 * cannot undo another successful completion. Undo keeps the original date. */
export function setGuidedCompletion(data: AppData, action: GuidedAction, day: string, completed: boolean): AppData {
  if (completed && action.original) {
    const current = data.customActions.find((item) => item.id === action.id);
    if (!sameRecord(current, action.original) || current?.archived) throw new RecordConflict('这件小行动已在另一个窗口调整或归档。请回到计划重新打开，原有记录没有改变。');
  }
  const ids = data.actions[day] ?? [];
  if (ids.includes(action.id) === completed) return data;
  return { ...data, actions: { ...data.actions, [day]: completed ? [...ids, action.id] : ids.filter((id) => id !== action.id) } };
}
