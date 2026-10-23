import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, BookHeart, Check, Pencil, Plus, Search, Trash2, UserRound, Wind } from "lucide-react";
import Dialog from "./Dialog";
import { collectPractice, comfortLimit, makeComfortId, practiceNames, saveComfortItem } from "../comfort";
import type { AppData, ComfortItem, ReliefSession } from "../types";
import { sameRecord } from "../records";
import { RecordConflict } from "../usePrivateData";
import "./care-features.css";

type Props = { data: AppData; onUpdate: (update: (previous: AppData) => AppData) => Promise<boolean>; onClose: () => void; onPractice: (technique: ReliefSession["technique"]) => void; storageError: string | null };
type Draft = { id: string; kind: "note" | "contact"; title: string; body: string; createdAt: string };
const labels = { note: "安稳的话", contact: "支持我的人", practice: "收藏的练习" } as const;

export default function ComfortBox({ data, onUpdate, onClose, onPractice, storageError }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState<ComfortItem | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [filter, setFilter] = useState<"all" | ComfortItem["kind"]>("all");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [deleting, setDeleting] = useState<ComfortItem | null>(null);
  const [leaving, setLeaving] = useState<"close" | "editor" | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dirty = Boolean(draft && (draft.title !== (original?.title ?? "") || draft.body !== (original?.body ?? "")));
  const conflict = Boolean(original && !sameRecord(data.comfortItems.find((item) => item.id === original.id), original));
  const search = query.trim().toLocaleLowerCase();
  const visible = data.comfortItems.filter((item) => (filter === "all" || item.kind === filter) && (!search || `${item.title}\n${item.body}`.toLocaleLowerCase().includes(search)))
    .sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt));
  useLayoutEffect(() => { if (draft) titleRef.current?.focus(); }, [draft?.id]);
  useEffect(() => { if (leaving || deleting) cancelRef.current?.focus(); }, [leaving, deleting]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  function finishLeave(destination: "close" | "editor") {
    setLeaving(null); setDraft(null); setOriginal(null); setError("");
    if (destination === "close") onClose();
  }
  function leave(destination: "close" | "editor") {
    if (pendingRef.current) return;
    if (dirty) { setLeaving(destination); return; }
    finishLeave(destination);
  }
  function edit(item?: ComfortItem, kind: Draft["kind"] = "note") {
    if (item?.kind === "practice") return;
    setOriginal(item ?? null);
    setDraft(item ? { ...item, kind: item.kind } : { id: makeComfortId(), kind, title: "", body: "", createdAt: new Date().toISOString() });
    setError(""); setMessage("");
  }
  async function run(update: (previous: AppData) => AppData, success: () => void) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(""); setMessage("");
    try {
      if (await onUpdate(update)) success();
      else setError("这次没有保存。请查看保存提示；你的输入仍在这里，可以重试。");
    } catch { setError("这次没有保存，原来的收藏和当前输入仍保留。"); }
    finally { pendingRef.current = false; setPending(false); }
  }
  function save(asNew = false) {
    if (!draft) return;
    if (!draft.title.trim()) { setError(draft.kind === "contact" ? "请写一个称呼，方便之后找到这位支持你的人。" : "请给这句话起一个简短的名字。"); titleRef.current?.focus(); return; }
    const item: ComfortItem = { ...draft, id: asNew ? makeComfortId() : draft.id, title: draft.title.trim(), createdAt: asNew ? new Date().toISOString() : draft.createdAt, updatedAt: new Date().toISOString() };
    void run((previous) => saveComfortItem(previous, item, asNew ? null : original), () => { setDraft(null); setOriginal(null); setMessage("已经收进安稳工具箱。"); });
  }
  return <Dialog title="我的安稳工具箱" onClose={() => {
    if (pendingRef.current) return;
    if (leaving) setLeaving(null); else if (deleting) setDeleting(null); else leave("close");
  }} busy={pending} className="care-modal comfort-modal">
    <p className="care-intro">把有帮助的小事、想留给自己的话，以及愿意联系的人收在这里。需要的时候，少费一点力气就能找到。</p>
    <fieldset className="care-fields" disabled={pending || Boolean(leaving) || Boolean(deleting)}>
      {draft ? <div className="comfort-editor">
        <h3>{original ? "编辑" : "添加"}{labels[draft.kind]}</h3>
        <label className="care-label" htmlFor="comfort-title">{draft.kind === "contact" ? "怎么称呼 TA" : "给这句话起个名字"}</label>
        <input ref={titleRef} id="comfort-title" value={draft.title} maxLength={60} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        <label className="care-label" htmlFor="comfort-body">{draft.kind === "contact" ? "联系线索或想说的话（可不填）" : "想留给自己的话（可不填）"}</label>
        <textarea id="comfort-body" value={draft.body} maxLength={1000} rows={5} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder={draft.kind === "contact" ? "例如：姐姐，晚上通常方便；我可以问她能不能陪我散步。" : "可以写一句曾让你安心的话，或一个对自己有效的小办法。"} />
        <div className="care-count">{draft.body.length} / 1000</div>
        {draft.kind === "contact" && <p className="care-small">这些线索只保存在本机，不会自动联系任何人。也可以只写称呼，不填写号码。</p>}
        {conflict && <div role="alert" className="care-error"><p>这项收藏已在另一个窗口更改或删除。当前输入仍保留，直接保存不会覆盖对方的修改。</p><button className="text-link" onClick={() => save(true)}>把我的内容另存一份</button></div>}
        <div className="care-footer"><button className="button button-secondary" onClick={() => leave("editor")}>返回工具箱</button><button className="button button-primary" onClick={() => save()} disabled={conflict}><Check size={16} />保存收藏</button></div>
      </div> : <>
        <div className="comfort-add"><button className="button button-secondary" onClick={() => edit()}><Plus size={16} />留一句安稳的话</button><button className="button button-secondary" onClick={() => edit(undefined, "contact")}><UserRound size={16} />添加支持我的人</button></div>
        <div className="comfort-practice-add" aria-label="收藏练习">{(["breathing", "grounding"] as const).map((technique) => {
          const collected = data.comfortItems.some((item) => item.kind === "practice" && item.technique === technique);
          return <button key={technique} className="subtle-link" disabled={collected} onClick={() => void run((previous) => collectPractice(previous, technique), () => setMessage("练习已收藏，需要时随时回来。"))}>{collected ? "已收藏" : "收藏"} · {practiceNames[technique]}</button>;
        })}</div>
        <div className="comfort-search"><Search size={17} /><input aria-label="搜索安稳收藏" value={query} maxLength={200} onChange={(event) => { setQuery(event.target.value); setLimit(20); }} placeholder="找一句话、一个人或一个练习" /></div>
        <div className="practice-filters" aria-label="收藏类型">{(["all", "note", "contact", "practice"] as const).map((kind) => <button key={kind} aria-pressed={filter === kind} onClick={() => { setFilter(kind); setLimit(20); }}>{kind === "all" ? "全部" : labels[kind]}</button>)}</div>
        {!visible.length && <p className="care-empty">{search || filter !== "all" ? "暂时没有匹配的收藏，可以换个词或查看全部。" : "这里还空着。从一句愿意留给自己的话开始吧。"}</p>}
        <div className="comfort-list">{visible.slice(0, limit).map((item) => <article className="comfort-item" key={item.id}>
          <div className="comfort-item-top">{item.kind === "practice" ? <Wind size={18} /> : item.kind === "contact" ? <UserRound size={18} /> : <BookHeart size={18} />}<h3>{item.title}</h3><span>{labels[item.kind]}</span></div>
          {item.body && <p>{item.body}</p>}
          <div className="comfort-item-actions">
            {item.kind === "practice" && item.technique && <button className="text-link" onClick={() => onPractice(item.technique!)}>开始这个练习 <ArrowRight size={15} /></button>}
            {item.kind !== "practice" && <button className="subtle-link" aria-label={`编辑${item.title}`} onClick={() => edit(item)}><Pencil size={14} />编辑</button>}
            <button className="subtle-link" aria-label={`移除${item.title}`} onClick={() => setDeleting(item)}><Trash2 size={14} />移除</button>
          </div>
        </article>)}</div>
        {visible.length > limit && <button className="button button-secondary comfort-more" onClick={() => setLimit((count) => count + 20)}>再看一些收藏</button>}
        <p className="care-small">已收藏 {data.comfortItems.length} / {comfortLimit} 项 · 会随“隐私与数据”中的备份一起保存。</p>
      </>}
    </fieldset>
    {error && <div role="alert" className="care-error"><p>{error}</p>{storageError && <p>{storageError}</p>}</div>}
    {message && <p role="status" className="care-message">{message}</p>}
    {leaving && <div className="confirm-panel" role="group" aria-label="保留未保存的收藏"><p>还有未保存的文字，离开后将不会保留。</p><div><button ref={cancelRef} className="button button-secondary" onClick={() => setLeaving(null)}>继续编辑</button><button className="button button-danger" onClick={() => finishLeave(leaving)}>放弃这次修改</button></div></div>}
    {deleting && <div className="confirm-panel" role="group" aria-label="确认移除收藏"><p>从工具箱移除“{deleting.title}”？这不会删除练习历史，也不会联系任何人。</p><div><button className="button button-secondary" ref={cancelRef} disabled={pending} onClick={() => setDeleting(null)}>保留收藏</button><button className="button button-danger" disabled={pending} onClick={() => void run((previous) => {
      const current = previous.comfortItems.find((item) => item.id === deleting.id);
      if (current && !sameRecord(current, deleting)) throw new RecordConflict("这项收藏刚在另一个窗口更改，请查看最新内容后再移除。");
      return { ...previous, comfortItems: previous.comfortItems.filter((item) => item.id !== deleting.id) };
    }, () => { setDeleting(null); setMessage("已从工具箱移除。"); })}>确认移除</button></div></div>}
  </Dialog>;
}
