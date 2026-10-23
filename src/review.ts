import { dayKey } from "./storage";
import type { AppData, Mood } from "./types";

export function recentDays(today: string, count = 7): string[] {
  const end = new Date(`${today}T12:00:00`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(end);
    date.setDate(date.getDate() - (count - 1 - index));
    return dayKey(date);
  });
}

/** Descriptive counts only. No diagnosis, prediction, score or causal ranking. */
export function weekReview(data: AppData, today: string) {
  const days = recentDays(today);
  const included = new Set(days);
  const moodsByDay = new Map<string, Mood>();
  for (const mood of data.moods) {
    const day = mood.day ?? dayKey(new Date(mood.createdAt));
    if (!included.has(day)) continue;
    const existing = moodsByDay.get(day);
    if (!existing || Date.parse(mood.createdAt) > Date.parse(existing.createdAt)) moodsByDay.set(day, mood);
  }
  const sessions = data.reliefHistory.filter((entry) => included.has(dayKey(new Date(entry.createdAt))));
  const completedActions = days.reduce((sum, day) => sum + (data.actions[day]?.length ?? 0), 0);
  const actionDays = days.filter((day) => (data.actions[day]?.length ?? 0) > 0).length;
  const paired = sessions.filter((entry) => entry.before !== undefined && entry.after !== undefined);
  const changes = {
    lower: paired.filter((entry) => entry.after! < entry.before!).length,
    same: paired.filter((entry) => entry.after === entry.before).length,
    higher: paired.filter((entry) => entry.after! > entry.before!).length,
  };
  return { days, moodsByDay, sessions, paired, changes, completedActions, actionDays };
}
