import { ArrowRight, Feather, Leaf } from "lucide-react";
import Dialog from "./Dialog";
import type { AppData } from "../types";
import { weekReview } from "../review";
import type { WritingSeed } from "./CareGuide";
import "./care-features.css";

const moodLabels = ["", "很难受", "有点低落", "还算平静", "有点晴朗"];
const shortDate = (day: string) => new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${day}T12:00:00`));

export default function WeeklyReview({ data, today, onClose, onWrite, onHistory, onPracticeHistory }: {
  data: AppData; today: string; onClose: () => void;
  onWrite: (seed: WritingSeed) => void; onHistory: () => void; onPracticeHistory: () => void;
}) {
  const review = weekReview(data, today);
  const practiced = review.sessions.filter((entry) => entry.durationSeconds > 0).length;
  return <Dialog title="温柔的每周回顾" onClose={onClose} className="care-modal review-modal">
    <div className="review-lead"><Leaf size={25} strokeWidth={1.4} /><p>{shortDate(review.days[0])} — {shortDate(today)} · 最近 7 天</p><h3>看看这些天，怎样陪自己走过。</h3><p>有记录的日子值得留意，空白的日子也不需要补交作业。</p></div>
    <div className="review-counts">
      <div><strong>{review.moodsByDay.size}</strong><span>天留下心情</span></div>
      <div><strong>{review.completedActions}</strong><span>次小行动完成</span></div>
      <div><strong>{practiced}</strong><span>次有计时的练习</span></div>
    </div>
    <section className="review-section" aria-labelledby="review-moods">
      <h3 id="review-moods">心情有自己的天气</h3>
      <ol className="review-weather">{review.days.map((day) => {
        const mood = review.moodsByDay.get(day);
        return <li key={day} className={mood ? `review-mood-${mood.value}` : ""}><time dateTime={day}>{shortDate(day)}</time><span>{mood ? moodLabels[mood.value] : "未记录"}</span></li>;
      })}</ol>
      <p className="care-small">同一天有多条旧记录时，这里显示最近的一条。没有记录的日子不会被当作心情不好。</p>
      <button className="text-link" onClick={onHistory}>打开完整心情足迹 <ArrowRight size={15} /></button>
    </section>
    <section className="review-section" aria-labelledby="review-practices">
      <h3 id="review-practices">练习前后，你记录了什么？</h3>
      {review.paired.length ? <>
        <p>最近 7 天，{review.paired.length} 次停顿同时留下了前后感受。难受程度为 1–5 分，数字越小表示当时越轻。</p>
        <dl className="review-changes"><div><dt>之后分数较低</dt><dd>{review.changes.lower} 次</dd></div><div><dt>前后分数相同</dt><dd>{review.changes.same} 次</dd></div><div><dt>之后分数较高</dt><dd>{review.changes.higher} 次</dd></div></dl>
        {review.paired.length < 3 && <p className="care-small">目前只有 {review.paired.length} 次完整自评，信息还很少，可以先保留观察。</p>}
      </> : <p>这一周还没有同时填写前后感受的记录。下次练习时，如果愿意，可以各留一个分数；不填写也能使用全部练习。</p>}
      <p className="care-small">这些是你当时的主观记录，包含跳过计时但填写了感受的停顿。变化可能有多种原因，不能据此判断某种练习的疗效。</p>
      <button className="text-link" onClick={onPracticeHistory}>看看每次练习的详情 <ArrowRight size={15} /></button>
    </section>
    <section className="review-reflection"><Feather size={23} strokeWidth={1.4} /><h3>这一周，想谢谢自己的哪一件事？</h3><p>{review.actionDays ? `你在 ${review.actionDays} 天里完成过小行动。哪怕只是一杯水，也可以被记住。` : "可以是一件很小的事：吃了一顿饭、向人开口，或者允许自己休息。"}</p><button className="button button-secondary" onClick={() => onWrite({ title: `给这一周的自己 · ${shortDate(today)}`, direction: "self", body: "这一周，我想谢谢自己的一件事是：\n\n曾让我轻松一点的是：\n\n接下来，我愿意继续或调整的是：\n" })}>写几句话给自己 <ArrowRight size={15} /></button></section>
  </Dialog>;
}
