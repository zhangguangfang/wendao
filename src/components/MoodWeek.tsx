import { Cloud, CloudDrizzle, CloudRain, CloudSun } from "lucide-react";
import { dayKey, type AppData, type Mood } from "../storage";

export const journalMoodOptions = [
  { value: 1, label: "很难受", Icon: CloudRain },
  { value: 2, label: "有点低落", Icon: CloudDrizzle },
  { value: 3, label: "还算平静", Icon: Cloud },
  { value: 4, label: "有点晴朗", Icon: CloudSun },
];

export function moodDay(mood: Mood): string {
  return mood.day ?? dayKey(new Date(mood.createdAt));
}

/** Old backups can contain two records on one local day after a timezone change. */
export function latestMoodForDay(moods: Mood[], day: string): Mood | undefined {
  return moods.reduce<Mood | undefined>((latest, mood) => {
    if (moodDay(mood) !== day) return latest;
    return !latest || Date.parse(mood.createdAt) > Date.parse(latest.createdAt) ? mood : latest;
  }, undefined);
}

export function calendarDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - count + 1 + index);
    return dayKey(date);
  });
}

export default function MoodWeek({
  data,
  today,
}: {
  data: Pick<AppData, "moods">;
  today: string;
}) {
  return (
    <div className="mood-week" aria-label="最近七天的心情记录">
      {calendarDays(today, 7).map((key) => {
        const day = new Date(`${key}T12:00:00`);
        const mood = latestMoodForDay(data.moods, key);
        const option = journalMoodOptions.find((item) => item.value === mood?.value);
        return (
          <div className={`week-day ${key === today ? "is-today" : ""}`} key={key}>
            <span
              className={`week-dot ${option ? `recorded mood-${option.value}` : ""}`}
              aria-label={`${day.getMonth() + 1}月${day.getDate()}日：${option?.label ?? "未记录"}`}
            >
              {option ? <option.Icon size={18} strokeWidth={1.4} aria-hidden="true" /> : <span />}
            </span>
            <span>{key === today ? "今" : ["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}</span>
          </div>
        );
      })}
    </div>
  );
}
