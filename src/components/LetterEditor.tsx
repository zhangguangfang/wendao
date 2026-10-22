import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Feather,
  LockKeyhole,
  Plus,
  Trash2,
  X,
} from "lucide-react";

export type Letter = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

type Props = {
  letters: Letter[];
  onSave: (letter: Letter) => boolean;
  onDelete: (id: string) => boolean;
  onClose: () => void;
};

type Destination =
  | { kind: "close" }
  | { kind: "new" }
  | { kind: "letter"; letter: Letter };
type Confirmation =
  | { kind: "discard"; destination: Destination }
  | { kind: "delete"; letter: Letter };

const prompts = [
  { label: "发生了什么", text: "最近发生了一件让我在意的事：\n" },
  { label: "此刻的感受", text: "如果给此刻的感受一个名字，它是：\n" },
  { label: "我需要什么", text: "此刻，我真正需要的是：\n" },
  { label: "照顾自己", text: "今天，我愿意为自己做的一件小事是：\n" },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "一封心事";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export default function LetterEditor({
  letters,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [baseline, setBaseline] = useState({ title: "", body: "" });
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "error" | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<() => void>(() => undefined);
  const confirmationRef = useRef<Confirmation | null>(null);
  const selectedLetter = letters.find((letter) => letter.id === selectedId);
  const dirty = title !== baseline.title || body !== baseline.body;

  function goTo(destination: Destination) {
    setConfirmation(null);
    setSaveState(null);
    if (destination.kind === "close") {
      onClose();
      return;
    }
    const next = destination.kind === "letter" ? destination.letter : null;
    setSelectedId(next?.id ?? null);
    setTitle(next?.title ?? "");
    setBody(next?.body ?? "");
    setBaseline({ title: next?.title ?? "", body: next?.body ?? "" });
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function requestGoTo(destination: Destination) {
    if (dirty && (title.trim() || body.trim() || selectedId)) {
      setConfirmation({ kind: "discard", destination });
      return;
    }
    goTo(destination);
  }

  closeRef.current = () => requestGoTo({ kind: "close" });
  confirmationRef.current = confirmation;

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (confirmationRef.current) setConfirmation(null);
        else closeRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
      );
      if (!focusable?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialogRef.current?.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    setDeleteError(false);
    if (confirmation) cancelRef.current?.focus();
    else titleRef.current?.focus();
  }, [confirmation]);

  useEffect(() => {
    if (!dirty) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  function saveLetter() {
    if (!body.trim()) return;
    const savedTitle = title.trim() || "写给自己的信";
    const letter: Letter = {
      id:
        selectedId ??
        globalThis.crypto?.randomUUID?.() ??
        `letter-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: savedTitle,
      body,
      createdAt: selectedLetter?.createdAt ?? new Date().toISOString(),
    };
    try {
      if (!onSave(letter)) {
        setSaveState("error");
        return;
      }
      setSelectedId(letter.id);
      setTitle(savedTitle);
      setBaseline({ title: savedTitle, body });
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  function insertPrompt(text: string) {
    const input = bodyRef.current;
    const start = input?.selectionStart ?? body.length;
    const end = input?.selectionEnd ?? body.length;
    const prefix = start > 0 && body[start - 1] !== "\n" ? "\n\n" : "";
    const insertion = prefix + text;
    if (body.length - (end - start) + insertion.length > 8000) return;
    setBody(body.slice(0, start) + insertion + body.slice(end));
    setSaveState(null);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(
        start + insertion.length,
        start + insertion.length,
      );
    });
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !confirmation)
          requestGoTo({ kind: "close" });
      }}
    >
      <section
        className="modal letter-modal"
        role={confirmation ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={
          confirmation ? "letter-confirm-heading" : "letter-heading"
        }
        aria-describedby={
          confirmation ? "letter-confirm-description" : "letter-description"
        }
        tabIndex={-1}
        ref={dialogRef}
      >
        {confirmation ? (
          <div className="letter-confirm">
            <span className="letter-confirm-icon">
              <BookOpen size={26} strokeWidth={1.5} />
            </span>
            <p className="eyebrow">给心事留一点空间</p>
            <h2 id="letter-confirm-heading">
              {confirmation.kind === "discard"
                ? "这封信还没有收好"
                : "要放下这封信吗？"}
            </h2>
            <p id="letter-confirm-description">
              {confirmation.kind === "discard"
                ? "离开后，这次尚未保存的文字会丢失。你可以留下继续写，或放弃这次修改。"
                : "删除后，这封信无法恢复。如果还舍不得，也可以先留在这里。"}
            </p>
            {deleteError && (
              <p className="letter-save-error" role="alert">
                这次没能删除。这封信和你的修改都还在，请稍后重试。
              </p>
            )}
            <div className="letter-confirm-actions">
              <button
                className="button button-secondary"
                ref={cancelRef}
                onClick={() => setConfirmation(null)}
              >
                {confirmation.kind === "discard" ? "继续写信" : "先留着"}
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  if (confirmation.kind === "discard")
                    goTo(confirmation.destination);
                  else {
                    try {
                      if (onDelete(confirmation.letter.id))
                        goTo({ kind: "new" });
                      else setDeleteError(true);
                    } catch {
                      setDeleteError(true);
                    }
                  }
                }}
              >
                {confirmation.kind === "discard" ? "放弃修改" : "确认删除"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-header">
              <div>
                <p className="eyebrow">把说不出口的话，轻轻放下</p>
                <h2 id="letter-heading">不寄出的信</h2>
                <p id="letter-description">
                  写给某个人，也写给正在慢慢恢复的自己。
                </p>
              </div>
              <button
                className="icon-button"
                aria-label="关闭写信窗口"
                onClick={() => requestGoTo({ kind: "close" })}
              >
                <X size={20} />
              </button>
            </div>
            <div className="letter-layout">
              <aside className="letter-sidebar" aria-label="已保存的信">
                <button
                  className="button button-secondary letter-new"
                  onClick={() => requestGoTo({ kind: "new" })}
                >
                  <Plus size={16} /> 写一封新的信
                </button>
                <div className="letter-list-heading">
                  <span>安放的心事</span>
                  <span>{letters.length}</span>
                </div>
                <div className="letter-list">
                  {letters.length ? (
                    [...letters]
                      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                      .map((letter) => (
                        <button
                          key={letter.id}
                          className={`letter-list-item${selectedId === letter.id ? " is-active" : ""}`}
                          onClick={() => {
                            if (selectedId !== letter.id)
                              requestGoTo({ kind: "letter", letter });
                          }}
                          aria-current={
                            selectedId === letter.id ? "true" : undefined
                          }
                        >
                          <span className="letter-list-item-title">
                            {letter.title || "写给自己的信"}
                          </span>
                          <span className="letter-list-item-excerpt">
                            {letter.body.replace(/\s+/g, " ").slice(0, 48)}
                          </span>
                          <time dateTime={letter.createdAt}>
                            {formatDate(letter.createdAt)}
                          </time>
                        </button>
                      ))
                  ) : (
                    <div className="letter-empty">
                      <Feather size={25} strokeWidth={1.4} />
                      <p>
                        这里还很安静。
                        <br />
                        你的第一封信，会被好好收起。
                      </p>
                    </div>
                  )}
                </div>
                <p className="letter-privacy">
                  <LockKeyhole size={13} />
                  <span>仅保存在此浏览器中。共用设备时，请留意隐私。</span>
                </p>
              </aside>
              <div className="letter-editor">
                <label className="letter-field-label" htmlFor="letter-title">
                  给这封信一个名字 <span>（选填）</span>
                </label>
                <input
                  id="letter-title"
                  ref={titleRef}
                  className="letter-title-input"
                  maxLength={60}
                  placeholder="例如：写给今天的自己"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setSaveState(null);
                  }}
                />
                <div className="letter-prompts" aria-label="写作提示">
                  {prompts.map((prompt) => (
                    <button
                      key={prompt.label}
                      className="letter-prompt"
                      onClick={() => insertPrompt(prompt.text)}
                      disabled={body.length > 7950}
                    >
                      {prompt.label} <Plus size={12} />
                    </button>
                  ))}
                </div>
                <label className="sr-only" htmlFor="letter-body">
                  信的正文
                </label>
                <textarea
                  id="letter-body"
                  ref={bodyRef}
                  className="letter-body-input"
                  placeholder={
                    "亲爱的，\n\n在这里，不必组织好语言。\n想说什么，就慢慢写下来吧。"
                  }
                  value={body}
                  maxLength={8000}
                  onChange={(event) => {
                    setBody(event.target.value);
                    setSaveState(null);
                  }}
                />
                <div className="letter-editor-meta">
                  <span>这封信不会被发送。</span>
                  <span>{body.length.toLocaleString()} / 8,000</span>
                </div>
                <div className="letter-editor-footer">
                  {selectedLetter ? (
                    <button
                      className="button button-ghost letter-delete"
                      onClick={() =>
                        setConfirmation({
                          kind: "delete",
                          letter: selectedLetter,
                        })
                      }
                    >
                      <Trash2 size={15} /> 删除这封信
                    </button>
                  ) : (
                    <span className="letter-soft-note">
                      <Feather size={14} /> 不必写得完整
                    </span>
                  )}
                  <button
                    className="button button-primary"
                    disabled={!body.trim() || (!dirty && saveState === "saved")}
                    onClick={saveLetter}
                  >
                    {saveState === "saved" ? (
                      <Check size={17} />
                    ) : (
                      <BookOpen size={17} />
                    )}
                    {saveState === "saved" ? "已经收好" : "收好这封信"}
                  </button>
                </div>
                {saveState === "saved" && (
                  <p className="letter-save-status" role="status">
                    已经保存在此浏览器。愿此刻的你，能轻松一点。
                  </p>
                )}
                {saveState === "error" && (
                  <p className="letter-save-error" role="alert">
                    这次没能保存，可能是浏览器存储空间不足。文字仍在这里，请先复制留存后再重试。
                  </p>
                )}
              </div>
            </div>
            <button
              className="button button-ghost letter-back"
              onClick={() => requestGoTo({ kind: "close" })}
            >
              <ArrowLeft size={15} /> 回到今日港湾
            </button>
          </>
        )}
      </section>
    </div>
  );
}
