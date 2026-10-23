import { useRef, useState } from "react";
import { ArrowRight, Check, RefreshCw, Sprout } from "lucide-react";
import Dialog from "./Dialog";
import type { AppData } from "../types";
import { explorations, explorationInPlan, planExploration, type Energy } from "../explorations";
import "./care-features.css";

export default function SmallExplore({ data, onClose, onUpdate, onPlanner, storageError }: {
  data: AppData; onClose: () => void; onUpdate: (update: (previous: AppData) => AppData) => Promise<boolean>; onPlanner: () => void;
  storageError: string | null;
}) {
  const [energy, setEnergy] = useState<Energy>("low");
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const choices = explorations.filter((item) => item.energy === energy);
  const idea = choices[index % choices.length];
  const included = explorationInPlan(data, idea);
  const archived = data.customActions.some((item) => item.id === idea.id && item.archived);
  async function add() {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(""); setMessage("");
    try {
      if (await onUpdate((previous) => planExploration(previous, idea))) setMessage("已放进我的计划，等愿意的时候再去做。还没有标记为完成。");
      else setError("这次没有加入计划，请查看保存提示。你可以稍后重试。");
    } catch { setError("这次没有加入计划，已有记录仍保留。"); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return <Dialog title="一点生活小探索" onClose={onClose} busy={pending} className="care-modal explore-modal">
    <p className="care-intro">给生活留一点新鲜感。先看看今天有多少力气，再选一件愿意试的小事。</p>
    <fieldset className="care-fields" disabled={pending}>
      <legend className="care-label">此刻的精力更接近哪一种？</legend>
      <div className="explore-energy">{([["low", "只有一点力气"], ["some", "愿意动一动"], ["more", "想多探索一点"]] as const).map(([value, label]) => <button key={value} aria-pressed={value === energy} onClick={() => { setEnergy(value); setIndex(0); setError(""); setMessage(""); }}>{label}</button>)}</div>
      <article className="explore-idea" aria-live="polite" aria-atomic="true"><Sprout size={34} strokeWidth={1.2} /><span>{idea.time}</span><h3>{idea.title}</h3><p>{idea.detail}</p><small>不用做完，也不用证明什么。今天不想做也没关系。</small></article>
      <div className="care-footer"><button className="button button-secondary" onClick={() => { setIndex((value) => value + 1); setError(""); setMessage(""); }}><RefreshCw size={15} />换一个试试</button><button className="button button-primary" disabled={included} onClick={() => void add()}>{included ? <Check size={16} /> : <Sprout size={16} />}{included ? "已经在我的计划里" : archived ? "恢复并加入我的计划" : "加入我的计划"}</button></div>
      <button className="text-link explore-plan-link" onClick={onPlanner}>打开我的行动计划 <ArrowRight size={15} /></button>
    </fieldset>
    {error && <div role="alert" className="care-error"><p>{error}</p>{storageError && <p>{storageError}</p>}</div>}
    {message && <p role="status" className="care-message">{message}</p>}
  </Dialog>;
}
