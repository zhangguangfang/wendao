import { useRef, useState } from "react";
import { Hand, Trash2, Wind } from "lucide-react";
import Dialog from "./Dialog";
import { getActionTitle } from "../actions";
import type { AppData, ReliefSession } from "../storage";
import "./practice-history.css";

type Props = {
  data: AppData;
  onUpdate: (update: (previous: AppData) => AppData) => Promise<boolean>;
  onClose: () => void;
};
const feelings: Record<string, string> = { cry: "有点想哭", repeat: "反复想起", contact: "想联系对方", sleep: "有些睡不着" };

function duration(seconds: number) {
  if (!seconds) return "这次没有计时练习";
  return seconds < 60 ? `${seconds} 秒练习` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒练习`;
}

export default function PracticeHistory({ data, onUpdate, onClose }: Props) {
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(10);
  const [confirm, setConfirm] = useState<ReliefSession | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const entries = data.reliefHistory.filter((item) => filter === "all" || item.technique === filter)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const legacy = Math.max(0, data.reliefSessions - data.reliefHistory.length);

  async function remove() {
    if (!confirm || pendingRef.current) return;
    const id = confirm.id;
    pendingRef.current = true;
    setPending(true);
    try {
      const saved = await onUpdate((previous) => ({
        ...previous,
        reliefHistory: previous.reliefHistory.filter((item) => item.id !== id),
        reliefSessions: previous.reliefSessions - (previous.reliefHistory.some((item) => item.id === id) ? 1 : 0),
      }));
      if (saved) { setConfirm(null); setError(""); }
      else setError("这次没能删除，原记录仍然保留。请稍后重试。");
    } catch { setError("这次没能删除，请稍后重试。"); }
    finally { pendingRef.current = false; setPending(false); }
  }

  return (
    <Dialog title="我的练习回顾" busy={pending} className="practice-history-modal"
      onClose={() => { if (!pendingRef.current) { if (confirm) setConfirm(null); else onClose(); } }}>
      <p className="modal-description">看看自己尝试过的照顾方式。感受没有变轻也没关系，记录不是对练习效果的评分。</p>
      <div className="practice-filters" role="group" aria-label="筛选练习方式">
        {[["all", "全部练习"], ["breathing", "呼吸练习"], ["grounding", "感官练习"]].map(([value, label]) => (
          <button key={value} aria-pressed={filter === value} disabled={pending} onClick={() => { setFilter(value); setLimit(10); }}>{label}</button>
        ))}
      </div>
      {entries.length === 0 ? <div className="empty-state"><Wind size={38} /><h3>这里会收好你尝试过的练习。</h3><p>每次缓一缓结束后，都可以回来看看。</p></div> : (
        <div className="practice-entries">
          {entries.slice(0, limit).map((entry) => (
            <article key={entry.id} className="practice-entry">
              <div className="practice-entry-heading">
                <span className="tile-icon green">{entry.technique === "breathing" ? <Wind size={20} /> : <Hand size={20} />}</span>
                <div><h3>{entry.technique === "breathing" ? "呼吸练习" : "感官练习"}</h3>
                  <time dateTime={entry.createdAt}>{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt))}</time>
                </div>
                <button className="icon-button" disabled={pending} aria-label={`删除${new Date(entry.createdAt).toLocaleString("zh-CN")}的练习记录`} onClick={() => { setConfirm(entry); setError(""); }}><Trash2 size={16} /></button>
              </div>
              <p>{feelings[entry.feeling] ?? "给自己一点时间"} · 本次合计：{duration(entry.durationSeconds)}</p>
              <p className="practice-method-note">上方为最后选择的练习方式，合计时长包括本次尝试的两种方式。</p>
              {(entry.before !== undefined || entry.after !== undefined) && <p className="practice-ratings">当时的难受程度：练习前 {entry.before ?? "未填写"} → 练习后 {entry.after ?? "未填写"}<small>1 表示较轻，5 表示很强烈；这是你当时的主观感受。</small></p>}
              {entry.action && <p>想试的小事：{getActionTitle(data, entry.action)}</p>}
            </article>
          ))}
          {entries.length > limit && <button className="button button-secondary" disabled={pending} onClick={() => setLimit((value) => value + 10)}>再看一些记录</button>}
        </div>
      )}
      {legacy > 0 && <p className="practice-legacy">旧版本还留下了 {legacy} 次练习次数。它们没有详细内容，仍然保留在累计记录中。</p>}
      {confirm && <div className="confirm-panel practice-confirm" role="group" aria-label="确认删除练习记录">
        <strong>删除这条练习回顾吗？</strong><p>行动计划和已经完成的小事会继续保留。</p>
        <div><button className="button button-secondary" disabled={pending} onClick={() => { setConfirm(null); setError(""); }}>保留记录</button>
          <button className="button button-danger" disabled={pending} onClick={remove}>确认删除这次练习</button></div>
        {error && <p role="alert">{error}</p>}
      </div>}
    </Dialog>
  );
}
