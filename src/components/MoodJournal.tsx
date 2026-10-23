import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sameRecord } from "../records";
import { BookHeart, Check, ChevronRight, CloudSun, PencilLine, Sprout, Trash2 } from "lucide-react";
import { type AppData, type Mood } from "../storage";
import Dialog from "./Dialog";
import { calendarDays, journalMoodOptions, latestMoodForDay, moodDay } from "./MoodWeek";
import "./mood-journal.css";

type Props = {
  data: AppData;
  today: string;
  onSave: (mood: Mood, expected?: Mood) => boolean | Promise<boolean>;
  onDelete: (id: string, expected?: Mood) => boolean | Promise<boolean>;
  onClose: () => void;
};

type Range = 7 | 30 | "all";
type Draft = { value: number; note: string; tags: string[] };
type Destination = { kind: "close" } | { kind: "edit"; id: string } | { kind: "list" } | { kind: "range"; range: Range };
type Confirmation = { kind: "discard"; destination: Destination } | { kind: "delete"; mood: Mood };
const tags = ["委屈", "想念", "孤单", "焦虑", "疲惫", "生气", "安心", "感激", "期待", "说不清"];
const emptyDraft = (): Draft => ({ value: 3, note: "", tags: [] });

function draftOf(mood: Mood): Draft {
  return { value: mood.value, note: mood.note ?? "", tags: [...(mood.tags ?? [])] };
}

function formatDay(value: string, year = false): string {
  return new Intl.DateTimeFormat("zh-CN", {
    ...(year ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T12:00:00`));
}

export default function MoodJournal({ data, today, onSave, onDelete, onClose }: Props) {
  const [range, setRange] = useState<Range>(7);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [baseline, setBaseline] = useState<Draft>(emptyDraft);
  const [source, setSource] = useState<Mood | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const editorRef = useRef<HTMLElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmationTrigger = useRef<HTMLElement | null>(null);
  const selected = data.moods.find((mood) => mood.id === selectedId);
  const dirty = selectedId !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
  const days = calendarDays(today, range === "all" ? 30 : range);
  const since = days[0];
  const visible = [...data.moods]
    .filter((mood) => range === "all" || (moodDay(mood) >= since && moodDay(mood) <= today))
    .sort((a, b) => moodDay(b).localeCompare(moodDay(a)) || b.createdAt.localeCompare(a.createdAt));
  const count = new Set(visible.map(moodDay)).size;
  const changedElsewhere = !!selected && !sameRecord(selected, source);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useLayoutEffect(() => {
    if (confirmation) cancelRef.current?.focus();
    else if (confirmationTrigger.current?.isConnected) confirmationTrigger.current.focus();
  }, [confirmation]);

  function navigate(destination: Destination) {
    setConfirmation(null);
    setError("");
    setSaved(false);
    if (destination.kind === "close") {
      onClose();
      return;
    }
    if (destination.kind === "range") setRange(destination.range);
    const next = destination.kind === "edit" ? data.moods.find((mood) => mood.id === destination.id) : undefined;
    setSelectedId(next?.id ?? null);
    const nextDraft = next ? draftOf(next) : emptyDraft();
    setDraft(nextDraft);
    setBaseline(nextDraft);
    setSource(next ?? null);
    if (next) {
      const trigger = document.activeElement;
      requestAnimationFrame(() => {
        if (document.activeElement !== trigger && document.activeElement !== document.body) return;
        noteRef.current?.focus({ preventScroll: true });
        editorRef.current?.scrollIntoView({ block: "nearest" });
      });
    }
  }

  function ask(next: Confirmation) {
    if (pendingRef.current) return;
    confirmationTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setError("");
    setConfirmation(next);
  }

  function requestNavigate(destination: Destination) {
    if (pendingRef.current) return;
    if (dirty) ask({ kind: "discard", destination });
    else navigate(destination);
  }

  function close() {
    if (pendingRef.current) return;
    if (confirmation) {
      setConfirmation(null);
      setError("");
    } else requestNavigate({ kind: "close" });
  }

  function updateDraft(update: Partial<Draft>) {
    if (pendingRef.current) return;
    setDraft((current) => ({ ...current, ...update }));
    setError("");
    setSaved(false);
  }

  async function save() {
    if (pendingRef.current) return;
    if (!source || !selected || changedElsewhere) {
      setError(selected ? "这条记录在另一个窗口中发生了变化。你的文字还在，请先复制想保留的内容，再载入最新记录。" : "这条记录已被删除。你的文字仍留在这里，可以先复制保存。关闭后不会重新创建记录。");
      return;
    }
    const next: Mood = {
      ...source,
      day: moodDay(source),
      value: draft.value,
      note: draft.note.trim(),
      tags: [...draft.tags],
    };
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      if (!await onSave(next, source)) throw new Error("Could not save mood");
      const nextDraft = draftOf(next);
      setDraft(nextDraft);
      setBaseline(nextDraft);
      setSource(next);
      setSaved(true);
      setError("");
    } catch {
      setError("这次还没有保存成功。文字仍在，请检查保存提示后再试一次。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  async function remove(mood: Mood) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      if (!await onDelete(mood.id, mood)) throw new Error("Could not delete mood");
      if (selectedId === mood.id) navigate({ kind: "list" });
      else setConfirmation(null);
      setError("");
    } catch {
      setError("暂时无法删除，原来的记录仍然保留。可以稍后再试。");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog title="我的心情足迹" onClose={close} busy={pending} className="history-modal mood-journal">
      <div inert={confirmation !== null} aria-busy={pending}>
        <p className="modal-description">这里记录感受的变化，不给恢复打分。心情有起伏，也很正常。</p>
        <div className="mj-range" role="group" aria-label="查看记录的时间范围">
          {([7, 30, "all"] as const).map((value) => (
            <button key={value} disabled={pending} aria-pressed={range === value} onClick={() => requestNavigate({ kind: "range", range: value })}>
              {value === "all" ? "全部记录" : `最近 ${value} 天`}
            </button>
          ))}
        </div>
        <p className="mj-summary" role="status">
          {range === "all" ? `你已留下 ${count} 天心情记录。` : `这 ${range} 天里，你为自己留下了 ${count} 天记录。`}
          <span>空白的日子也没关系，想记录时再来。</span>
        </p>

        {range !== "all" && (
          <div className={`mj-calendar ${range === 30 ? "mj-calendar-month" : ""}`} aria-label={`最近 ${range} 天的心情日历`}>
            {days.map((day) => {
              const record = latestMoodForDay(data.moods, day);
              const option = journalMoodOptions.find((mood) => mood.value === record?.value);
              const date = new Date(`${day}T12:00:00`);
              return record && option ? (
                <button key={day} disabled={pending} className={`mj-day mood-${record.value} ${selectedId === record.id ? "is-selected" : ""}`} aria-label={`${formatDay(day)}：${option.label}，查看记录`} aria-pressed={selectedId === record.id} onClick={() => requestNavigate({ kind: "edit", id: record.id })}>
                  <option.Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                  <span>{day === today ? "今天" : `${date.getMonth() + 1}/${date.getDate()}`}</span>
                </button>
              ) : (
                <span key={day} role="img" className="mj-day is-empty" aria-label={`${formatDay(day)}：未记录`}>
                  <span className="mj-empty-dot" aria-hidden="true" />
                  <span>{day === today ? "今天" : `${date.getMonth() + 1}/${date.getDate()}`}</span>
                </span>
              );
            })}
          </div>
        )}

        {selectedId && (
          <section className="mj-editor" ref={editorRef} aria-labelledby="mj-editor-title">
            <div className="mj-editor-heading">
              <div><span className="eyebrow">{selected ? formatDay(moodDay(selected), true) : "未保存的文字"}</span><h3 id="mj-editor-title">留一点此刻的文字</h3></div>
              <PencilLine size={23} strokeWidth={1.5} aria-hidden="true" />
            </div>
            {(!selected || changedElsewhere) && (
              <div className="mj-conflict" role="alert">
                <p>{selected ? "这条记录已在另一个窗口中修改。请先复制想保留的文字，再载入最新内容。" : "这条记录已在另一个窗口中删除。你的未保存文字仍在这里，可以先复制保留。"}</p>
                {selected && <button className="text-link" disabled={pending} onClick={() => requestNavigate({ kind: "edit", id: selected.id })}>载入最新记录</button>}
              </div>
            )}
            <div className="mj-mood-choices" role="group" aria-label="这一天的心情">
              {journalMoodOptions.map(({ value, label, Icon }) => (
                <button key={value} disabled={pending} className={`mood-${value}`} aria-pressed={draft.value === value} onClick={() => updateDraft({ value })}>
                  <Icon size={23} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span>
                </button>
              ))}
            </div>
            <fieldset className="mj-tags">
              <legend>给感受一个名字 <span>选填，最多选择 3 个</span></legend>
              <div>
                {[...new Set([...tags, ...draft.tags])].map((tag) => (
                  <button key={tag} aria-pressed={draft.tags.includes(tag)} disabled={pending || (!draft.tags.includes(tag) && draft.tags.length >= 3)} onClick={() => updateDraft({ tags: draft.tags.includes(tag) ? draft.tags.filter((item) => item !== tag) : [...draft.tags, tag] })}>
                    {draft.tags.includes(tag) && <Check size={12} aria-hidden="true" />}{tag}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="mj-note-label" htmlFor="mj-note">想记下的话（选填）</label>
            <textarea id="mj-note" ref={noteRef} readOnly={pending} maxLength={500} rows={4} value={draft.note} onChange={(event) => updateDraft({ note: event.target.value })} placeholder="可以记下发生了什么、你需要什么，或今天让你舒服一点的小事。" aria-describedby="mj-note-hint" />
            <div className="mj-note-hint" id="mj-note-hint"><span>只保存在这个浏览器里。</span><span>{draft.note.length} / 500</span></div>
            <div className="mj-editor-actions">
              <button className="button button-secondary" disabled={pending} onClick={() => requestNavigate({ kind: "list" })}>收起</button>
              <button className="button button-primary" onClick={save} disabled={pending || !dirty || !selected || changedElsewhere}><Check size={16} aria-hidden="true" />{pending ? "正在收好…" : "保存这段心情"}</button>
            </div>
            {saved && <p className="mj-feedback" role="status">这段心情已经收好。</p>}
            {error && <p className="mj-error" role="alert">{error}</p>}
          </section>
        )}

        {visible.length === 0 ? (
          <div className="empty-state mj-empty-state">
            <CloudSun size={42} strokeWidth={1} aria-hidden="true" />
            <h3>{data.moods.length === 0 ? "你的故事，可以从今天开始。" : "这些日子还没有留下记录。"}</h3>
            <p>{data.moods.length === 0 ? "回到首页，选一个最接近此刻的心情吧。" : "你可以看看其他日子，也可以从今天重新开始。"}</p>
            {data.moods.length === 0 ? <button className="button button-primary" disabled={pending} onClick={() => requestNavigate({ kind: "close" })}>记录今天的心情</button> : <button className="button button-secondary" disabled={pending} onClick={() => requestNavigate({ kind: "range", range: "all" })}>查看全部记录</button>}
          </div>
        ) : (
          <div className="history-list mj-list" aria-label="心情记录列表">
            {visible.map((mood) => {
              const option = journalMoodOptions.find((item) => item.value === mood.value)!;
              return (
                <div className={`history-item ${selectedId === mood.id ? "is-selected" : ""}`} key={mood.id}>
                  <button className="mj-record" disabled={pending} aria-label={`编辑${moodDay(mood)}的心情记录`} aria-expanded={selectedId === mood.id} onClick={() => requestNavigate({ kind: "edit", id: mood.id })}>
                    <span className={`history-icon mood-${mood.value}`}><option.Icon size={23} aria-hidden="true" /></span>
                    <span className="mj-record-copy"><strong>{option.label}</strong><span className="mj-record-date">{formatDay(moodDay(mood), true)}</span>{mood.tags?.length ? <span className="mj-record-tags">{mood.tags.join(" · ")}</span> : null}{mood.note ? <span className="mj-record-note">{mood.note}</span> : null}</span>
                    <ChevronRight className="mj-record-arrow" size={16} aria-hidden="true" />
                  </button>
                  <button className="icon-button" disabled={pending} aria-label={`删除${moodDay(mood)}的心情记录`} onClick={() => ask({ kind: "delete", mood })}><Trash2 size={16} aria-hidden="true" /></button>
                </div>
              );
            })}
          </div>
        )}

        <p className="history-summary"><Sprout size={16} aria-hidden="true" />你也为自己完成过 {data.reliefSessions} 次缓一缓练习。</p>
        <p className="mj-footnote"><BookHeart size={14} aria-hidden="true" />这些足迹只是在记录你的感受，不能用来判断心理健康状况。</p>
      </div>
      {confirmation && (
        <div className="mj-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="mj-confirm-title" aria-describedby="mj-confirm-description" aria-busy={pending} onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
          const first = buttons[0];
          const last = buttons[buttons.length - 1];
          if (!first || !last) { event.preventDefault(); event.stopPropagation(); return; }
          if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
            event.preventDefault();
            event.stopPropagation();
            (event.shiftKey ? last : first).focus();
          }
        }}>
          <h3 id="mj-confirm-title">{confirmation.kind === "discard" ? "这些修改还没有收好" : "要删除这条心情记录吗？"}</h3>
          <p id="mj-confirm-description">{confirmation.kind === "discard" ? "选择继续编辑，可以保留正在写的内容。" : "这一天的心情、感受标签和备注将一起删除。删除后无法恢复。"}</p>
          {confirmation.kind === "delete" && error && <p className="mj-error" role="alert">{error}</p>}
          <div>
            <button ref={cancelRef} className="button button-secondary" disabled={pending} onClick={() => { setConfirmation(null); setError(""); }}>{confirmation.kind === "discard" ? "继续编辑" : "保留记录"}</button>
            <button className="button button-danger" disabled={pending} onClick={() => confirmation.kind === "discard" ? navigate(confirmation.destination) : void remove(confirmation.mood)}>{pending ? "正在处理…" : confirmation.kind === "discard" ? "放弃修改" : "确认删除"}</button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
