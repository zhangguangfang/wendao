import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Feather,
  LockKeyhole,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import "./letter-features.css";
import type { Letter } from "../storage";
export type { Letter } from "../storage";

type Props = {
  letters: Letter[];
  onSave: (letter: Letter, expected?: Letter | null) => boolean | Promise<boolean>;
  onDelete: (id: string, expected?: Letter) => boolean | Promise<boolean>;
  onClose: () => void;
};

type Destination =
  | { kind: "close" }
  | { kind: "new" }
  | { kind: "letter"; letter: Letter };
type Confirmation =
  | { kind: "discard"; destination: Destination }
  | { kind: "delete"; letter: Letter }
  | { kind: "conflict" };

const prompts = [
  { label: "发生了什么", text: "最近发生了一件让我在意的事：\n" },
  { label: "此刻的感受", text: "如果给此刻的感受一个名字，它是：\n" },
  { label: "我需要什么", text: "此刻，我真正需要的是：\n" },
  { label: "照顾自己", text: "今天，我愿意为自己做的一件小事是：\n" },
];

const writingDirections = [
  {
    id: "free",
    label: "随心写",
    description: "不必组织好语言，想从哪里说起都可以。",
    prompts,
  },
  {
    id: "them",
    label: "写给对方",
    description: "这封信不会被发送，可以先把想说的话留在这里。",
    prompts: [
      { label: "没说出口的话", text: "有些话，我一直没有说出口：\n" },
      { label: "让我在意的事", text: "那件让我在意的事，带给我的感受是：\n" },
      { label: "此刻的需要", text: "不论对方如何回应，此刻我需要的是：\n" },
    ],
  },
  {
    id: "self",
    label: "写给自己",
    description: "如果此刻的你是一位朋友，你愿意怎样陪伴自己？",
    prompts: [
      { label: "看见自己", text: "亲爱的自己，我看见你最近经历了：\n" },
      { label: "允许感受", text: "你可以暂时不用勉强自己去：\n" },
      { label: "温柔的一步", text: "今天，我们可以先一起做这件小事：\n" },
    ],
  },
  {
    id: "goodbye",
    label: "练习告别",
    description: "不需要今天就放下。写到自己愿意停下的地方就好。",
    prompts: [
      { label: "值得珍藏的", text: "这段经历里，我愿意珍藏的是：\n" },
      { label: "还舍不得的", text: "此刻，我还舍不得的是：\n" },
      { label: "留给未来的", text: "接下来的日子里，我想给自己留一点：\n" },
    ],
  },
  {
    id: "boundaries",
    label: "守住界限",
    description: "可以先分清感受和需要，再决定是否行动。",
    prompts: [
      { label: "我的界限", text: "为了照顾自己，目前我不愿意接受的是：\n" },
      { label: "能够决定的", text: "在这件事里，我可以为自己决定的是：\n" },
      { label: "想要的支持", text: "如果需要帮助，我愿意向谁开口、说些什么：\n" },
    ],
  },
] as const;

function sameLetter(a: Letter | null | undefined, b: Letter | null | undefined) {
  if (!a || !b) return a === b;
  return (
    a.id === b.id && a.title === b.title && a.body === b.body &&
    a.createdAt === b.createdAt && a.updatedAt === b.updatedAt &&
    Boolean(a.favorite) === Boolean(b.favorite)
  );
}

function newLetterId() {
  return globalThis.crypto?.randomUUID?.() ??
    `letter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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
  const [favorite, setFavorite] = useState(false);
  const [baseline, setBaseline] = useState({ title: "", body: "", favorite: false });
  const [original, setOriginal] = useState<Letter | null>(null);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [direction, setDirection] = useState("free");
  const [promptFeedback, setPromptFeedback] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "error" | null>(null);
  const [pending, setPending] = useState<"save" | "delete" | null>(null);
  const pendingRef = useRef(false);
  const focusTitleAfterRender = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<() => void>(() => undefined);
  const confirmationRef = useRef<Confirmation | null>(null);
  const selectedLetter = letters.find((letter) => letter.id === selectedId);
  const dirty = title !== baseline.title || body !== baseline.body || favorite !== baseline.favorite;
  const conflict = Boolean(selectedId && original && !sameLetter(original, selectedLetter));
  const saved = saveState === "saved" && !dirty && !conflict;
  const writingDirection = writingDirections.find((item) => item.id === direction)!;
  const search = query.trim().toLocaleLowerCase();
  const visibleLetters = letters.filter((letter) =>
    (!favoritesOnly || letter.favorite) &&
    (!search || `${letter.title}\n${letter.body}`.toLocaleLowerCase().includes(search)),
  ).sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt) - Date.parse(a.updatedAt ?? a.createdAt));

  function goTo(destination: Destination) {
    setConfirmation(null);
    setSaveState(null);
    setPromptFeedback("");
    if (destination.kind === "close") {
      onClose();
      return;
    }
    const next = destination.kind === "letter" ? destination.letter : null;
    setSelectedId(next?.id ?? null);
    setTitle(next?.title ?? "");
    setBody(next?.body ?? "");
    setFavorite(Boolean(next?.favorite));
    setOriginal(next ?? null);
    setBaseline({ title: next?.title ?? "", body: next?.body ?? "", favorite: Boolean(next?.favorite) });
    focusTitleAfterRender.current = true;
  }

  function requestGoTo(destination: Destination) {
    if (pendingRef.current) return;
    if (dirty && (title.trim() || body.trim() || selectedId)) {
      setConfirmation({ kind: "discard", destination });
      return;
    }
    goTo(destination);
  }

  closeRef.current = () => requestGoTo({ kind: "close" });
  confirmationRef.current = confirmation;

  useLayoutEffect(() => {
    if (focusTitleAfterRender.current && titleRef.current && !titleRef.current.matches(":disabled")) {
      focusTitleAfterRender.current = false;
      titleRef.current.focus();
    }
  });

  useLayoutEffect(() => {
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
        if (pendingRef.current) return;
        if (confirmationRef.current) setConfirmation(null);
        else closeRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
      ) ?? []).filter((element) => element.getClientRects().length > 0);
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
        (active === first || !focusable.includes(active as HTMLElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !focusable.includes(active as HTMLElement))
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

  useLayoutEffect(() => {
    setDeleteError(false);
    if (confirmation) cancelRef.current?.focus();
    else titleRef.current?.focus();
  }, [confirmation]);

  useEffect(() => {
    if (!dirty && !pending) return;
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty, pending]);

  async function saveLetter(asNew = false) {
    if (pendingRef.current || !body.trim()) return;
    if (!asNew && conflict) {
      setConfirmation({ kind: "conflict" });
      return;
    }
    const savedTitle = title.trim() || "写给自己的信";
    const now = new Date().toISOString();
    const letter: Letter = {
      id: asNew ? newLetterId() : selectedId ?? newLetterId(),
      title: savedTitle,
      body,
      createdAt: asNew ? now : original?.createdAt ?? now,
      updatedAt: now,
      favorite,
    };
    pendingRef.current = true;
    setPending("save");
    setSaveState(null);
    try {
      if (!await onSave(letter, asNew ? null : original)) {
        setSaveState("error");
        return;
      }
      setSelectedId(letter.id);
      setTitle(savedTitle);
      setOriginal(letter);
      setBaseline({ title: savedTitle, body, favorite });
      setConfirmation(null);
      setPromptFeedback("");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  }

  async function confirmAction() {
    if (!confirmation || pendingRef.current) return;
    if (confirmation.kind === "discard") {
      goTo(confirmation.destination);
      return;
    }
    if (confirmation.kind === "conflict") {
      await saveLetter(true);
      return;
    }
    if (!sameLetter(confirmation.letter, selectedLetter)) {
      setConfirmation({ kind: "conflict" });
      return;
    }
    pendingRef.current = true;
    setPending("delete");
    setDeleteError(false);
    try {
      if (await onDelete(confirmation.letter.id, confirmation.letter)) {
        goTo({ kind: "new" });
      } else setDeleteError(true);
    } catch {
      setDeleteError(true);
    } finally {
      pendingRef.current = false;
      setPending(null);
    }
  }

  function insertPrompt(text: string) {
    const input = bodyRef.current;
    const trigger = document.activeElement;
    const start = body.length;
    const prefix = start > 0 && body[start - 1] !== "\n" ? "\n\n" : "";
    const insertion = prefix + text;
    if (body.length + insertion.length > 8000) {
      setPromptFeedback("剩余字数放不下这条提示，你的正文没有改变。");
      return;
    }
    setBody(body + insertion);
    setPromptFeedback("");
    setSaveState(null);
    requestAnimationFrame(() => {
      if (document.activeElement !== trigger && document.activeElement !== document.body) return;
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
        aria-busy={Boolean(pending)}
        aria-labelledby={
          confirmation ? "letter-confirm-heading" : "letter-heading"
        }
        aria-describedby={
          confirmation ? "letter-confirm-description" : "letter-description"
        }
        tabIndex={-1}
        ref={dialogRef}
      >
        <fieldset className="letter-interaction" disabled={Boolean(pending)}>
        {confirmation ? (
          <div className="letter-confirm">
            <span className="letter-confirm-icon">
              <BookOpen size={26} strokeWidth={1.5} />
            </span>
            <p className="eyebrow">给心事留一点空间</p>
            <h2 id="letter-confirm-heading">
              {confirmation.kind === "discard"
                ? "这封信还没有收好"
                : confirmation.kind === "conflict"
                  ? "这封信在别处有了变化"
                  : "要放下这封信吗？"}
            </h2>
            <p id="letter-confirm-description">
              {confirmation.kind === "discard"
                ? "离开后，这次尚未保存的文字会丢失。你可以留下继续写，或放弃这次修改。"
                : confirmation.kind === "conflict"
                  ? selectedLetter
                    ? "另一个窗口修改了这封信。你的文字仍保留在这里，可以另存为新信；载入最新版本会放弃当前未保存的修改。"
                    : "这封信已在另一个窗口中被删除。你的文字仍保留在这里，可以另存为一封新的信。"
                  : "删除后，这封信无法恢复。如果还舍不得，也可以先留在这里。"}
            </p>
            {deleteError && (
              <p className="letter-save-error" role="alert">
                这次没能删除。这封信和你的修改都还在，请稍后重试。
              </p>
            )}
            {confirmation.kind === "conflict" && saveState === "error" && (
              <p className="letter-save-error" role="alert">
                这次没能保存新信。你的文字仍在这里，请先复制留存后再重试。
              </p>
            )}
            <div className="letter-confirm-actions">
              <button
                className="button button-secondary"
                ref={cancelRef}
                onClick={() => setConfirmation(null)}
              >
                {confirmation.kind === "discard"
                  ? "继续写信"
                  : confirmation.kind === "conflict" ? "继续保留草稿" : "先留着"}
              </button>
              <button
                className="button button-primary"
                onClick={() => void confirmAction()}
              >
                {pending === "delete" ? "正在删除…" : pending === "save" ? "正在收好…" : confirmation.kind === "discard"
                  ? "放弃修改"
                  : confirmation.kind === "conflict" ? "另存为新信" : "确认删除"}
              </button>
            </div>
            {confirmation.kind === "conflict" && selectedLetter && (
              <button
                className="button button-ghost letter-conflict-load"
                onClick={() => goTo({ kind: "letter", letter: selectedLetter })}
              >
                载入最新版本
              </button>
            )}
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
                <div className="letter-tools">
                  <label className="letter-search">
                    <Search size={14} aria-hidden="true" />
                    <span className="sr-only">搜索标题或正文</span>
                    <input
                      type="search"
                      placeholder="搜索标题或正文"
                      value={query}
                      maxLength={200}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  <button
                    className="letter-filter"
                    aria-pressed={favoritesOnly}
                    onClick={() => setFavoritesOnly((value) => !value)}
                  >
                    <Star size={13} aria-hidden="true" /> 只看收藏
                  </button>
                </div>
                <div className="letter-list-heading">
                  <span>安放的心事</span>
                  <span>{visibleLetters.length} / {letters.length}</span>
                </div>
                <div className="letter-list">
                  {visibleLetters.length ? (
                    visibleLetters
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
                          {letter.favorite && (
                            <span className="letter-favorite-mark">
                              <Star size={11} aria-hidden="true" /> 收藏
                            </span>
                          )}
                          <span className="letter-list-item-excerpt">
                            {letter.body.replace(/\s+/g, " ").slice(0, 48)}
                          </span>
                          <time dateTime={letter.updatedAt ?? letter.createdAt}>
                            {formatDate(letter.updatedAt ?? letter.createdAt)}
                            {letter.updatedAt ? " · 编辑" : " · 写下"}
                          </time>
                        </button>
                      ))
                  ) : letters.length ? (
                    <div className="letter-empty letter-empty-search">
                      <Search size={24} strokeWidth={1.4} />
                      <p>{favoritesOnly && !query.trim() ? "还没有收藏的信。打开一封信，选择收藏后收好它。" : "没有找到这封信，试试别的词。"}</p>
                      <button
                        className="subtle-link"
                        onClick={() => { setQuery(""); setFavoritesOnly(false); }}
                      >
                        查看全部信件
                      </button>
                    </div>
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
                {conflict && (
                  <p className="letter-conflict-notice" role="status">
                    {selectedLetter
                      ? "这封信在另一个窗口中有了修改。当前草稿还在，收好时可以选择如何保留。"
                      : "这封信已在另一个窗口中被删除。当前草稿还在，收好时可另存为新信。"}
                  </p>
                )}
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
                <div className="letter-writing-direction">
                  <label htmlFor="letter-direction">想从哪里写起</label>
                  <select
                    id="letter-direction"
                    value={direction}
                    onChange={(event) => setDirection(event.target.value)}
                  >
                    {writingDirections.map((item) => (
                      <option value={item.id} key={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <p className="letter-direction-description">{writingDirection.description}</p>
                <div className="letter-prompts" aria-label="写作提示，点击追加到正文末尾">
                  {writingDirection.prompts.map((prompt) => (
                    <button
                      key={prompt.label}
                      className="letter-prompt"
                      onClick={() => insertPrompt(prompt.text)}
                    >
                      {prompt.label} <Plus size={12} />
                    </button>
                  ))}
                </div>
                {promptFeedback && <p className="letter-save-error" role="status">{promptFeedback}</p>}
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
                <div className="letter-detail-bar">
                  <button
                    className="letter-favorite-toggle"
                    aria-pressed={favorite}
                    aria-label={favorite ? "取消收藏" : "收藏这封信"}
                    onClick={() => { setFavorite((value) => !value); setSaveState(null); }}
                  >
                    <Star size={15} aria-hidden="true" />
                    {favorite ? "已选收藏" : "收藏这封信"}
                  </button>
                  <span>{dirty ? "有尚未收好的修改" : original ? `上次收好：${new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(original.updatedAt ?? original.createdAt))}` : "文字只在收好后保存"}</span>
                </div>
                {favorite !== baseline.favorite && <p className="letter-favorite-hint">收藏状态会随这次修改一起保存。</p>}
                <div className="letter-editor-footer">
                  {selectedLetter ? (
                    <button
                      className="button button-ghost letter-delete"
                      onClick={() =>
                        setConfirmation(conflict ? { kind: "conflict" } : {
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
                    disabled={!body.trim() || saved}
                    onClick={() => void saveLetter()}
                  >
                    {saved ? (
                      <Check size={17} />
                    ) : (
                      <BookOpen size={17} />
                    )}
                    {pending === "save" ? "正在收好…" : saved ? "已经收好" : "收好这封信"}
                  </button>
                </div>
                {saved && (
                  <p className="letter-save-status" role="status">
                    已经保存在此浏览器。愿此刻的你，能轻松一点。
                  </p>
                )}
                {saveState === "error" && (
                  <p className="letter-save-error" role="alert">
                    这次没能保存，可能是记录已在别处更新，或浏览器暂时无法写入。文字仍在这里，请先复制留存后再重试。
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
        </fieldset>
        {pending && <p className="letter-pending-status" role="status">{pending === "delete" ? "正在删除这封信，请稍候。" : "正在收好这封信，请稍候。"}</p>}
      </section>
    </div>
  );
}
