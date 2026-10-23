import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  RotateCcw,
  Sprout,
  X,
} from "lucide-react";
import { BASE_ACTIONS, getActionTitle } from "../actions";
import { dayKey, type AppData, type CustomAction } from "../storage";
import Dialog from "./Dialog";
import "./action-planner.css";

type Props = {
  data: AppData;
  today: string;
  onUpdate: (update: (previous: AppData) => AppData) => boolean | Promise<boolean>;
  onToggle: (id: string) => boolean | Promise<boolean>;
  onClose: () => void;
};

type Editor = {
  id: string | null;
  title: string;
  detail: string;
  baseline: { title: string; detail: string };
  original?: CustomAction;
};

type Confirmation =
  | { kind: "archive"; action: CustomAction }
  | { kind: "discard"; destination: "close" | "cancel" };

const MAX_ACTIVE_ACTIONS = 20;
const MAX_STORED_ACTIONS = 500;
const SAVE_ERROR = "暂时没有保存成功，内容还在这里。请检查浏览器存储后再试。";

function sameAction(left: CustomAction, right: CustomAction | undefined) {
  return Boolean(right && left.id === right.id && left.title === right.title &&
    (left.detail ?? "") === (right.detail ?? "") && left.createdAt === right.createdAt &&
    Boolean(left.archived) === Boolean(right.archived));
}

export default function ActionPlanner({
  data,
  today,
  onUpdate,
  onToggle,
  onClose,
}: Props) {
  const [showCatalog, setShowCatalog] = useState(data.plannedActions.length === 0);
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const controlsRef = useRef<HTMLFieldSetElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const formOpenerRef = useRef<HTMLElement | null>(null);

  const activeCustom = data.customActions.filter((action) => !action.archived);
  const archived = data.customActions.filter((action) => action.archived);
  const available = [...BASE_ACTIONS, ...activeCustom];
  const planned = data.plannedActions
    .map((id) => available.find((action) => action.id === id))
    .filter((action) => action !== undefined);
  const completed = data.actions[today] ?? [];
  const dirty = Boolean(
    editor &&
      (editor.title !== editor.baseline.title ||
        editor.detail !== editor.baseline.detail),
  );

  useLayoutEffect(() => {
    if (editor) titleRef.current?.focus();
  }, [editor?.id, Boolean(editor)]);

  useLayoutEffect(() => {
    if (confirmation) cancelRef.current?.focus();
    else if (openerRef.current) {
      if (openerRef.current?.isConnected) openerRef.current.focus();
      else controlsRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    }
  }, [confirmation]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);

  function clearFeedback() {
    setError("");
    setMessage("");
  }

  async function mutate(operation: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    clearFeedback();
    try {
      await operation();
    } catch {
      setError(SAVE_ERROR);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  function requestClose() {
    if (pendingRef.current) return;
    if (confirmation) {
      setConfirmation(null);
      return;
    }
    if (dirty) {
      openerRef.current = document.activeElement as HTMLElement;
      setConfirmation({ kind: "discard", destination: "close" });
    } else onClose();
  }

  function finishEditing() {
    const trigger = document.activeElement;
    setEditor(null);
    requestAnimationFrame(() => {
      if (document.activeElement !== trigger && document.activeElement !== document.body) return;
      if (formOpenerRef.current?.isConnected) formOpenerRef.current.focus();
    });
  }

  function cancelEditing() {
    if (pendingRef.current) return;
    clearFeedback();
    if (dirty) {
      openerRef.current = document.activeElement as HTMLElement;
      setConfirmation({ kind: "discard", destination: "cancel" });
    } else finishEditing();
  }

  function edit(action?: CustomAction) {
    if (pendingRef.current) return;
    clearFeedback();
    formOpenerRef.current = document.activeElement as HTMLElement;
    setEditor({
      id: action?.id ?? null,
      title: action?.title ?? "",
      detail: action?.detail ?? "",
      baseline: { title: action?.title ?? "", detail: action?.detail ?? "" },
      original: action ? { ...action } : undefined,
    });
  }

  async function togglePlan(id: string) {
    await mutate(async () => {
      let changed = false;
      const saved = await onUpdate((previous) => {
        const exists =
          BASE_ACTIONS.some((action) => action.id === id) ||
          previous.customActions.some((action) => action.id === id && !action.archived);
        if (!exists) return previous;
        changed = true;
        const included = previous.plannedActions.includes(id);
        return {
          ...previous,
          plannedActions: included
            ? previous.plannedActions.filter((item) => item !== id)
            : [...previous.plannedActions, id],
        };
      });
      if (!saved) setError(SAVE_ERROR);
      else if (!changed) setError("这件小行动刚刚被调整了，请查看最新清单后再选。");
    });
  }

  async function saveAction() {
    if (!editor || pendingRef.current) return;
    clearFeedback();
    const title = editor.title.trim();
    const detail = editor.detail.trim();
    if (!title || title.length > 60 || detail.length > 120) {
      setError("为这件小事写一个名字，60 字以内就好；说明最多 120 字。");
      titleRef.current?.focus();
      return;
    }
    const id = editor.id ?? globalThis.crypto?.randomUUID?.() ??
      `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await mutate(async () => {
      let problem = "";
      const saved = await onUpdate((previous) => {
        const current = previous.customActions.find((action) => action.id === editor.id);
        if (editor.id && (
          !current || current.archived ||
          !sameAction(current, editor.original)
        )) {
          problem = "这件小行动已在另一个窗口改变。你的文字还在这里，请先复制需要保留的内容，再重新打开最新版本。";
          return previous;
        }
        if ([...BASE_ACTIONS, ...previous.customActions.filter((action) => !action.archived)]
          .some((action) => action.id !== editor.id && action.title.toLocaleLowerCase() === title.toLocaleLowerCase())) {
          problem = "清单里已经有同名的小行动了，可以直接把它加入计划。";
          return previous;
        }
        if (!editor.id && previous.customActions.filter((action) => !action.archived).length >= MAX_ACTIVE_ACTIONS) {
          problem = "手边已有 20 件自定义小行动，可以先归档一件暂时不需要的。";
          return previous;
        }
        if (!editor.id && previous.customActions.length >= MAX_STORED_ACTIONS) {
          problem = "这个浏览器保存的小行动已达到上限，暂时无法新增。已有记录仍可使用和备份。";
          return previous;
        }
        const next: CustomAction = current
          ? { ...current, title, detail }
          : { id, title, detail, createdAt: new Date().toISOString() };
        return {
          ...previous,
          customActions: current
            ? previous.customActions.map((action) => action.id === id ? next : action)
            : [...previous.customActions, next],
          plannedActions: current || previous.plannedActions.includes(id)
            ? previous.plannedActions
            : [...previous.plannedActions, id],
        };
      });
      if (problem) setError(problem);
      else if (!saved) setError(SAVE_ERROR);
      else {
        setMessage(editor.id ? "小行动已更新。" : "已经留在计划里了，愿意时再做就好。");
        finishEditing();
      }
    });
  }

  async function archiveAction() {
    if (confirmation?.kind !== "archive" || pendingRef.current) return;
    const original = confirmation.action;
    const id = original.id;
    await mutate(async () => {
      let changedElsewhere = false;
      const saved = await onUpdate((previous) => {
        const current = previous.customActions.find((action) => action.id === id);
        if (!current || !sameAction(current, original)) {
          changedElsewhere = true;
          return previous;
        }
        return {
          ...previous,
          customActions: previous.customActions.map((action) =>
            action.id === id ? { ...action, archived: true } : action,
          ),
          plannedActions: previous.plannedActions.filter((item) => item !== id),
        };
      });
      if (changedElsewhere) setError("这件小行动已在另一个窗口改变。请先留着，查看最新清单后再决定。");
      else if (!saved) setError(SAVE_ERROR);
      else {
        setConfirmation(null);
        setMessage("小行动已归档，做过的记录还在，也可以随时恢复。");
      }
    });
  }

  async function restoreAction(id: string) {
    await mutate(async () => {
      let problem = "";
      const saved = await onUpdate((previous) => {
        const action = previous.customActions.find((item) => item.id === id);
        if (!action || !action.archived) {
          problem = "这件小行动刚刚被调整了，请查看最新清单。";
          return previous;
        }
        if (previous.customActions.filter((item) => !item.archived).length >= MAX_ACTIVE_ACTIONS) {
          problem = "手边已有 20 件自定义小行动，先归档一件后就能恢复。";
          return previous;
        }
        if ([...BASE_ACTIONS, ...previous.customActions.filter((item) => !item.archived)]
          .some((item) => item.title.toLocaleLowerCase() === action.title.toLocaleLowerCase())) {
          problem = "可选清单里已有同名的小行动，可以直接使用。归档的历史记录仍然保留。";
          return previous;
        }
        return {
          ...previous,
          customActions: previous.customActions.map((item) =>
            item.id === id ? { ...item, archived: false } : item,
          ),
        };
      });
      if (problem) setError(problem);
      else if (!saved) setError(SAVE_ERROR);
      else setMessage("小行动已恢复，需要时可以再加入计划。");
    });
  }

  async function toggleCompleted(id: string) {
    await mutate(async () => {
      if (!await onToggle(id)) setError(SAVE_ERROR);
    });
  }

  const recentDays = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${today}T12:00:00`);
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    return { key, date, ids: data.actions[key] ?? [] };
  });
  const recentCount = recentDays.reduce((sum, day) => sum + day.ids.length, 0);

  return (
    <Dialog title="我的小行动计划" onClose={requestClose} className="action-planner-modal">
      {pending && <p className="planner-message" role="status">正在收好这次更改……</p>}
      <fieldset className="planner-controls" ref={controlsRef} disabled={pending} aria-busy={pending}>
      {confirmation && (
        <div className="planner-confirm" role="alertdialog" aria-labelledby="planner-confirm-title">
          <h3 id="planner-confirm-title">
            {confirmation.kind === "archive" ? "先把这件小事收起来吗？" : "这件小行动还没有保存"}
          </h3>
          <p>
            {confirmation.kind === "archive"
              ? `“${confirmation.action.title}”会从计划和可选清单中归档，过去做过的记录会保留。`
              : "可以回来继续写，也可以放弃这次修改。"}
          </p>
          {error && <p className="planner-error" role="alert">{error}</p>}
          <div className="planner-confirm-buttons">
            <button className="button button-secondary" ref={cancelRef} onClick={() => { setConfirmation(null); clearFeedback(); }}>
              {confirmation.kind === "archive" ? "先留着" : "继续编辑"}
            </button>
            <button className="button button-primary" onClick={() => {
              if (confirmation.kind === "archive") archiveAction();
              else {
                const destination = confirmation.destination;
                setConfirmation(null);
                finishEditing();
                if (destination === "close") onClose();
              }
            }}>
              {confirmation.kind === "archive" ? "确认归档" : "放弃修改"}
            </button>
          </div>
        </div>
      )}
      <div inert={Boolean(confirmation)}>
        <p className="modal-description planner-intro">不用做很多。留下几件适合自己的小事，愿意时再做就好。</p>
        <section className="planner-plan" aria-labelledby="planner-plan-title">
          <div className="planner-section-title">
            <h3 id="planner-plan-title"><Sprout size={18} /> 留在手边的小计划</h3>
            <span>{planned.length} 件</span>
          </div>
          <p className="planner-hint">计划会一直保留，完成状态每天重新开始。今天不做也没关系。</p>
          {planned.length ? (
            <ul className="planner-plan-list">
              {planned.map((action) => (
                <li key={action.id}>
                  <button
                    className={`planner-complete ${completed.includes(action.id) ? "is-done" : ""}`}
                    aria-label={`${completed.includes(action.id) ? "取消完成" : "完成"}：${action.title}`}
                    aria-pressed={completed.includes(action.id)}
                    onClick={() => void toggleCompleted(action.id)}
                  >
                    <span className="planner-check">{completed.includes(action.id) && <Check size={15} />}</span>
                    <span><strong>{action.title}</strong>{action.detail && <small>{action.detail}</small>}</span>
                  </button>
                  <button className="icon-button" aria-label={`移出计划：${action.title}`} onClick={() => togglePlan(action.id)}><X size={16} /></button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="planner-empty"><Sprout size={28} strokeWidth={1.2} /><p>从喝一杯水，或者你自己的小事开始。</p></div>
          )}
          <button className="planner-catalog-toggle" aria-expanded={showCatalog} aria-controls="planner-catalog" onClick={() => setShowCatalog((value) => !value)}>
            {showCatalog ? "收起可选清单" : "挑选我的小行动"}{showCatalog ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </section>

        {showCatalog && (
          <section className="planner-catalog" id="planner-catalog" aria-labelledby="planner-catalog-title">
            <h3 id="planner-catalog-title">从这些小事里挑一件</h3>
            <ul className="planner-catalog-list">
              {BASE_ACTIONS.map((action) => (
                <li key={action.id}>
                  <div><strong>{action.title}</strong><p>{action.detail}</p></div>
                  <button className={`planner-pick ${data.plannedActions.includes(action.id) ? "is-picked" : ""}`} aria-label={`${data.plannedActions.includes(action.id) ? "移出计划" : "加入计划"}：${action.title}`} aria-pressed={data.plannedActions.includes(action.id)} onClick={() => togglePlan(action.id)}>
                    {data.plannedActions.includes(action.id) ? <Check size={15} /> : <Plus size={15} />}{data.plannedActions.includes(action.id) ? "已加入" : "加入"}
                  </button>
                </li>
              ))}
            </ul>
            <div className="planner-section-title planner-custom-title">
              <h3>自己的小行动</h3><span>{activeCustom.length} / {MAX_ACTIVE_ACTIONS}</span>
            </div>
            {activeCustom.length > 0 && (
              <ul className="planner-catalog-list planner-custom-list">
                {activeCustom.map((action) => (
                  <li key={action.id}>
                    <div><strong>{action.title}</strong>{action.detail && <p>{action.detail}</p>}
                      <div className="planner-custom-tools">
                        <button disabled={Boolean(editor)} onClick={() => edit(action)} aria-label={`编辑小行动：${action.title}`}><Pencil size={13} /> 编辑</button>
                        <button disabled={Boolean(editor)} onClick={() => { clearFeedback(); openerRef.current = document.activeElement as HTMLElement; setConfirmation({ kind: "archive", action }); }} aria-label={`归档小行动：${action.title}`}><Archive size={13} /> 归档</button>
                      </div>
                    </div>
                    <button className={`planner-pick ${data.plannedActions.includes(action.id) ? "is-picked" : ""}`} aria-label={`${data.plannedActions.includes(action.id) ? "移出计划" : "加入计划"}：${action.title}`} aria-pressed={data.plannedActions.includes(action.id)} onClick={() => togglePlan(action.id)}>
                      {data.plannedActions.includes(action.id) ? <Check size={15} /> : <Plus size={15} />}{data.plannedActions.includes(action.id) ? "已加入" : "加入"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!editor && (
              <button className="planner-add" disabled={activeCustom.length >= MAX_ACTIVE_ACTIONS || data.customActions.length >= MAX_STORED_ACTIONS} onClick={() => edit()}><Plus size={16} /> 写一个自己的小行动</button>
            )}
            {activeCustom.length >= MAX_ACTIVE_ACTIONS && <p className="planner-hint">已留下 20 件小事。可以先归档一件暂时不需要的，再添加新的。</p>}
            {editor && (
              <form className="planner-editor" onSubmit={(event) => { event.preventDefault(); saveAction(); }}>
                <label htmlFor="planner-action-title">这件小事叫什么？<span>{editor.title.length} / 60</span></label>
                <input id="planner-action-title" ref={titleRef} value={editor.title} maxLength={60} placeholder="例如：听一首喜欢的歌" onChange={(event) => { setEditor({ ...editor, title: event.target.value }); clearFeedback(); }} />
                <label htmlFor="planner-action-detail">想给自己的小提醒 <span>可不填</span></label>
                <textarea id="planner-action-detail" value={editor.detail} maxLength={120} rows={2} placeholder="让它小一点、容易开始一点。" onChange={(event) => { setEditor({ ...editor, detail: event.target.value }); clearFeedback(); }} />
                <div className="planner-editor-buttons">
                  <button type="button" className="button button-secondary" onClick={cancelEditing}>取消编辑</button>
                  <button type="submit" className="button button-primary" disabled={!editor.title.trim() || !dirty}>{editor.id ? "保存修改" : "保存并加入计划"}</button>
                </div>
              </form>
            )}
            {archived.length > 0 && (
              <div className="planner-archive">
                <button className="planner-catalog-toggle" aria-expanded={showArchived} aria-controls="planner-archived-actions" onClick={() => setShowArchived((value) => !value)}><Archive size={15} /> 已归档的小行动 · {archived.length}{showArchived ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
                {showArchived && <ul id="planner-archived-actions">{archived.map((action) => <li key={action.id}><span>{action.title}</span><button className="planner-restore" aria-label={`恢复小行动：${action.title}`} onClick={() => restoreAction(action.id)}><RotateCcw size={14} /> 恢复</button></li>)}</ul>}
              </div>
            )}
          </section>
        )}
        {!confirmation && error && <p className="planner-error" role="alert">{error}</p>}
        {message && <p className="planner-message" role="status">{message}</p>}

        <section className="planner-history" aria-labelledby="planner-history-title">
          <h3 id="planner-history-title">最近 7 天的小小照顾</h3>
          <p className="planner-hint">{recentCount ? `你给自己留下了 ${recentCount} 次照顾。每一件都算数。` : "还没有完成记录。哪一天愿意开始，都可以。"}</p>
          <ol>
            {recentDays.map(({ key, date, ids }) => (
              <li key={key}>
                <time dateTime={key}>{key === today ? "今天" : `${date.getMonth() + 1}月${date.getDate()}日`}</time>
                <div>{ids.length ? <><span className="planner-history-count">{ids.length} 件小事</span><p>{ids.map((id) => getActionTitle(data, id)).join(" · ")}</p></> : <span className="planner-no-record">没有记录，也没关系</span>}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      </fieldset>
    </Dialog>
  );
}
