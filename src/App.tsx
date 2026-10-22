import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookHeart,
  Check,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSun,
  Coffee,
  Feather,
  Footprints,
  Heart,
  HeartHandshake,
  House,
  Leaf,
  LifeBuoy,
  LockKeyhole,
  Mail,
  MessageCircle,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  Wind,
  X,
} from "lucide-react";
import SanctuaryArt from "./components/SanctuaryArt";
import ReliefFlow from "./components/ReliefFlow";
import LetterEditor, { type Letter } from "./components/LetterEditor";
import Dialog from "./components/Dialog";
import {
  dayKey,
  emptyData,
  loadData,
  saveData,
  STORAGE_KEY,
  type AppData,
} from "./storage";

const moodOptions = [
  {
    value: 1,
    label: "很难受",
    Icon: CloudRain,
    response: "难过的时候，不必勉强自己。我们可以先一起缓一缓。",
  },
  {
    value: 2,
    label: "有点低落",
    Icon: CloudDrizzle,
    response: "谢谢你愿意看见自己的感受。今天，对自己温柔一点。",
  },
  {
    value: 3,
    label: "还算平静",
    Icon: Cloud,
    response: "平静的这一刻，也值得被好好收藏。",
  },
  {
    value: 4,
    label: "有点晴朗",
    Icon: CloudSun,
    response: "很高兴，今天有一小束光照进来了。",
  },
];
const actionGroups = [
  [
    {
      id: "water",
      label: "慢慢喝一杯温水",
      detail: "给身体一点温柔的照顾",
      Icon: Coffee,
    },
    {
      id: "walk",
      label: "出去走上 5 分钟",
      detail: "看看天，感受脚下的路",
      Icon: Footprints,
    },
    {
      id: "friend",
      label: "联系一位信任的人",
      detail: "一句“最近怎么样”也可以",
      Icon: MessageCircle,
    },
  ],
  [
    {
      id: "window",
      label: "打开窗，看看远处",
      detail: "让目光休息一小会儿",
      Icon: Sun,
    },
    {
      id: "meal",
      label: "认真吃一点东西",
      detail: "简单的一餐也值得被照顾",
      Icon: Coffee,
    },
    {
      id: "rest",
      label: "给自己 5 分钟休息",
      detail: "暂时放下手机，什么都不做",
      Icon: Leaf,
    },
  ],
];

type Modal = "relief" | "letters" | "settings" | "support" | "history" | null;

export default function App() {
  const [initial] = useState(loadData);
  const [data, setData] = useState(initial.data);
  const dataRef = useRef(data);
  const [readBlocked, setReadBlocked] = useState(Boolean(initial.error));
  const [storageError, setStorageError] = useState(initial.error);
  const [modal, setModal] = useState<Modal>(null);
  const [activeNav, setActiveNav] = useState("home");
  const [today, setToday] = useState(dayKey());
  const [group, setGroup] = useState(0);
  const [toast, setToast] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const actionsRef = useRef<HTMLElement>(null);
  const todayMood = data.moods.find(
    (m) => dayKey(new Date(m.createdAt)) === today,
  );
  const currentMood = moodOptions.find((m) => m.value === todayMood?.value);
  const completed = data.actions[today] ?? [];

  useEffect(() => {
    const update = () => setToday(dayKey());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      const next = loadData();
      dataRef.current = next.data;
      setData(next.data);
      setStorageError(next.error);
      setReadBlocked(Boolean(next.error));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function commit(update: (previous: AppData) => AppData) {
    if (readBlocked) {
      setToast("本地记录暂时不可用，请先在数据设置中处理。");
      return false;
    }
    const next = update(dataRef.current);
    if (!saveData(next)) {
      setStorageError(
        "本地保存失败，可能是浏览器存储已满或被禁用。刚才的更改尚未保存。",
      );
      return false;
    }
    dataRef.current = next;
    setData(next);
    setStorageError(null);
    return true;
  }
  function open(next: Modal, nav?: string) {
    setModal(next);
    if (nav) setActiveNav(nav);
  }
  function close() {
    setModal(null);
    setActiveNav("home");
    setConfirmClear(false);
  }
  function recordMood(value: number) {
    const now = new Date();
    setToday(dayKey(now));
    if (
      commit((previous) => ({
        ...previous,
        moods: [
          ...previous.moods.filter(
            (m) => dayKey(new Date(m.createdAt)) !== dayKey(now),
          ),
          {
            id: globalThis.crypto?.randomUUID?.() ?? `mood-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            value,
            createdAt: now.toISOString(),
          },
        ],
      }))
    )
      setToast("记下了，你的每一种感受都值得被看见。");
  }
  function saveLetter(letter: Letter) {
    const saved = commit((previous) => ({
      ...previous,
      letters: [letter, ...previous.letters.filter((l) => l.id !== letter.id)],
    }));
    return saved;
  }
  function deleteLetter(id: string) {
    const deleted = commit((previous) => ({
      ...previous,
      letters: previous.letters.filter((l) => l.id !== id),
    }));
    if (deleted) setToast("这封信已删除。");
    return deleted;
  }
  function toggleAction(id: string) {
    const actionDay = dayKey();
    setToday(actionDay);
    const current = dataRef.current.actions[actionDay] ?? [];
    const done = current.includes(id);
    if (
      commit((previous) => ({
        ...previous,
        actions: {
          ...previous.actions,
          [actionDay]: done
            ? current.filter((item) => item !== id)
            : [...current, id],
        },
      })) &&
      !done
    )
      setToast("做到了这一点，已经很好。谢谢你照顾自己。");
  }
  function clearData() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      const next = emptyData();
      dataRef.current = next;
      setData(next);
      setReadBlocked(false);
      setStorageError(null);
      setConfirmClear(false);
      setToast("此浏览器中的全部记录已删除。");
    } catch {
      setStorageError(
        "浏览器暂不允许删除本地记录，请在浏览器设置中清除此站点的数据。",
      );
    }
  }
  function goToActions() {
    setActiveNav("actions");
    actionsRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
    actionsRef.current?.focus({ preventScroll: true });
  }

  const dateLabel = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${today}T12:00:00`));

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          aria-label="缓缓，返回首页"
          onClick={(e) => {
            e.preventDefault();
            close();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <span className="brand-icon">
            <Sprout size={28} strokeWidth={1.5} />
          </span>
          <span className="brand-name">
            缓缓<span>给心一点时间</span>
          </span>
        </a>
        <div className="nav-label">你的小小避风港</div>
        <nav aria-label="主要导航">
          <button
            className={`nav-item ${activeNav === "home" ? "active" : ""}`}
            onClick={() => {
              close();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <House size={19} />
            <span>今日港湾</span>
            <span className="nav-dot" />
          </button>
          <button
            className={`nav-item ${activeNav === "relief" ? "active" : ""}`}
            onClick={() => open("relief", "relief")}
          >
            <Wind size={20} />
            <span>陪我缓一缓</span>
          </button>
          <button
            className={`nav-item ${activeNav === "letters" ? "active" : ""}`}
            onClick={() => open("letters", "letters")}
          >
            <Mail size={19} />
            <span>不寄出的信</span>
            {data.letters.length > 0 && (
              <span className="nav-count">{data.letters.length}</span>
            )}
          </button>
          <button
            className={`nav-item ${activeNav === "actions" ? "active" : ""}`}
            onClick={goToActions}
          >
            <Sprout size={20} />
            <span>我的小行动</span>
          </button>
          <button
            className={`nav-item ${activeNav === "history" ? "active" : ""}`}
            onClick={() => open("history", "history")}
          >
            <BookHeart size={19} />
            <span>心情足迹</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="little-sun">
            <Sun size={24} strokeWidth={1.2} />
          </span>
          <p>
            花有花期，
            <br />
            你也有自己的节奏。
          </p>
          <span>慢慢来，就很好。</span>
          <svg viewBox="0 0 150 35" aria-hidden="true">
            <path
              d="M4 28c17-19 28-14 38-4S67 36 82 17 120 1 146 15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => open("support")}>
            <LifeBuoy size={19} />
            <span>寻找更多支持</span>
            <ArrowUpRight size={15} />
          </button>
          <button className="nav-item" onClick={() => open("settings")}>
            <Settings2 size={18} />
            <span>隐私与数据</span>
          </button>
          <div className="sidebar-caption">
            <span className="status-dot" /> 一个安心的小角落
          </div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <span className="topbar-greeting">
            欢迎回来，今天也辛苦了 <span aria-hidden="true">☀</span>
          </span>
          <button className="privacy-pill" onClick={() => open("settings")}>
            <LockKeyhole size={13} />
            <span>只属于你的空间</span>
          </button>
        </header>
        <main id="main-content" tabIndex={-1}>
          {storageError && (
            <div className="storage-warning" role="alert">
              <ShieldCheck size={19} />
              <span>{storageError}</span>
              <button className="text-link" onClick={() => open("settings")}>
                数据设置
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow date-label">
                <span />
                {dateLabel}
              </div>
              <h1>
                慢一点，也没关系<span>。</span>
              </h1>
              <p>这里不用假装坚强，你的每一种情绪都可以被安放。</p>
            </div>
            <div className="heading-mark" aria-hidden="true">
              <Sparkles size={26} strokeWidth={1.1} />
            </div>
          </div>

          <div className="welcome-grid">
            <section className="hero-card">
              <div className="hero-copy">
                <span className="hero-kicker">
                  <span /> 给自己一个温柔的停顿
                </span>
                <h2>
                  心有点累了，
                  <br />
                  就来这里歇一歇。
                </h2>
                <p>
                  不急着走出来，也不必马上变好。
                  <br />
                  先从好好呼吸的这一刻开始。
                </p>
                <button
                  className="button button-primary"
                  onClick={() => open("relief", "relief")}
                >
                  <Wind size={18} /> 陪我缓一缓 <ArrowRight size={17} />
                </button>
                <span className="hero-footnote">
                  大约 3 分钟 · 随时可以停下
                </span>
              </div>
              <div className="hero-art">
                <SanctuaryArt />
              </div>
              <span className="hero-corner" aria-hidden="true">
                TAKE YOUR TIME
              </span>
            </section>
            <section className="mood-card" aria-labelledby="mood-heading">
              <div className="card-topline">
                <span className="mini-label">和自己打个招呼</span>
                <Heart size={17} strokeWidth={1.5} />
              </div>
              <h2 id="mood-heading">此刻，你的心情如何？</h2>
              <p>没有正确答案，跟着感觉选就好。</p>
              <div className="mood-options">
                {moodOptions.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    className={`mood-option mood-${value} ${todayMood?.value === value ? "selected" : ""}`}
                    aria-pressed={todayMood?.value === value}
                    onClick={() => recordMood(value)}
                  >
                    <span className="mood-icon">
                      <Icon size={28} strokeWidth={1.35} />
                    </span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div
                className={`mood-response ${currentMood ? "has-mood" : ""}`}
                aria-live="polite"
              >
                {currentMood ? (
                  <>
                    <Check size={14} />
                    <span>{currentMood.response}</span>
                  </>
                ) : (
                  <>
                    <span className="soft-dot" />
                    <span>所有感受，都值得被温柔对待。</span>
                  </>
                )}
              </div>
              {currentMood && (
                <button className="subtle-link" onClick={() => open("history")}>
                  今天的心情可以随时更新 <ArrowRight size={12} />
                </button>
              )}
            </section>
          </div>

          <div className="section-heading">
            <h2>
              给心一点照顾 <span>A LITTLE CARE</span>
            </h2>
            <span>
              从一件小事开始 <ArrowDown size={13} />
            </span>
          </div>
          <div className="care-grid">
            <section className="letter-card">
              <div className="card-topline">
                <span className="tile-icon coral">
                  <Feather size={22} strokeWidth={1.5} />
                </span>
                <span className="quiet-label">只写给自己看</span>
              </div>
              <h2>有些话，可以先写下来。</h2>
              <p>
                写一封不必寄出的信，
                <br />
                让那些说不出口的话，有个去处。
              </p>
              <div className="letter-illustration" aria-hidden="true">
                <div className="paper-sheet">
                  <span />
                  <span />
                  <span />
                  <Heart size={15} strokeWidth={1.2} />
                </div>
                <div className="envelope-fold" />
                <div className="envelope-front">
                  <span className="envelope-flower">✳</span>
                </div>
                <span className="letter-sparkle">✧</span>
              </div>
              <button
                className="text-link coral-link"
                onClick={() => open("letters", "letters")}
              >
                {data.letters.length
                  ? `打开我的信箱 · ${data.letters.length} 封信`
                  : "写一封不寄出的信"}
                <ArrowRight size={17} />
              </button>
            </section>
            <section
              className="actions-card"
              id="small-actions"
              ref={actionsRef}
              tabIndex={-1}
            >
              <div className="card-topline">
                <span className="tile-icon green">
                  <Sprout size={22} strokeWidth={1.5} />
                </span>
                <button
                  className="subtle-link"
                  onClick={() =>
                    setGroup((value) => (value + 1) % actionGroups.length)
                  }
                >
                  换一组 <span aria-hidden="true">↻</span>
                </button>
              </div>
              <h2>今天，为自己做一件小事。</h2>
              <p>不用做很多，选一件就已经很好。</p>
              <div className="action-list">
                {actionGroups[group].map(({ id, label, detail, Icon }) => (
                  <button
                    key={id}
                    className={`action-item ${completed.includes(id) ? "done" : ""}`}
                    aria-pressed={completed.includes(id)}
                    onClick={() => toggleAction(id)}
                  >
                    <span className="action-symbol">
                      <Icon size={17} strokeWidth={1.6} />
                    </span>
                    <span className="action-text">
                      <strong>{label}</strong>
                      <span>{detail}</span>
                    </span>
                    <span className="action-check">
                      {completed.includes(id) && (
                        <Check size={14} strokeWidth={2.5} />
                      )}
                    </span>
                  </button>
                ))}
              </div>
              <div className="actions-footer">
                <span className="soft-dot" />
                {completed.length
                  ? `今天，你已为自己做了 ${completed.length} 件小事。`
                  : "每一个小行动，都是在慢慢靠近自己。"}
              </div>
            </section>
            <section className="footprints-card">
              <div className="card-topline">
                <span className="tile-icon lavender">
                  <BookHeart size={21} strokeWidth={1.5} />
                </span>
                <span className="quiet-label">最近 7 天</span>
              </div>
              <h2>每一步，都算数。</h2>
              <p>恢复有起伏，你一直在往前走。</p>
              <MoodWeek data={data} today={today} />
              <div className="footprint-note">
                {data.moods.length ? (
                  <>
                    已经留下 <strong>{data.moods.length}</strong> 天心情足迹
                    <br />
                    晴天雨天，都有意义。
                  </>
                ) : (
                  <>
                    从今天的心情开始，
                    <br />
                    慢慢看见自己的变化。
                  </>
                )}
              </div>
              <button
                className="text-link"
                onClick={() => open("history", "history")}
              >
                看看我的足迹 <ArrowRight size={16} />
              </button>
            </section>
          </div>

          <section className="gentle-note">
            <span className="quote-mark" aria-hidden="true">
              “
            </span>
            <div>
              <span className="eyebrow">今日的一点温柔</span>
              <p>允许自己偶尔停留，也相信自己终会再出发。</p>
            </div>
            <div className="note-bloom" aria-hidden="true">
              <Flower />
            </div>
            <span className="note-caption">把这句话，送给今天的你</span>
          </section>
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> 缓缓 · 陪你找回自己的节奏
            </span>
            <span>
              这里提供自我照顾支持，不能替代专业诊疗。
              <button onClick={() => open("support")}>
                需要更多帮助 <ChevronRight size={12} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      {modal === "relief" && (
        <ReliefFlow
          onClose={close}
          onComplete={() => {
            commit((previous) => ({
              ...previous,
              reliefSessions: previous.reliefSessions + 1,
            }));
            setToast("谢谢你，给了自己这几分钟。慢慢来就好。");
          }}
        />
      )}
      {modal === "letters" && (
        <LetterEditor
          letters={data.letters}
          onSave={saveLetter}
          onDelete={deleteLetter}
          onClose={close}
        />
      )}
      {modal === "history" && (
        <Dialog title="我的心情足迹" onClose={close} className="history-modal">
          <p className="modal-description">
            这里记录感受的变化，不给恢复打分。心情有起伏，也很正常。
          </p>
          <MoodWeek data={data} today={today} />
          {data.moods.length === 0 ? (
            <div className="empty-state">
              <CloudSun size={46} strokeWidth={1} />
              <h3>你的故事，可以从今天开始。</h3>
              <p>回到首页，选一个最接近此刻的心情吧。</p>
              <button className="button button-primary" onClick={close}>
                记录今天的心情
              </button>
            </div>
          ) : (
            <>
              <div className="history-list">
                {[...data.moods]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((mood) => {
                    const option = moodOptions.find(
                      (item) => item.value === mood.value,
                    )!;
                    return (
                      <div className="history-item" key={mood.id}>
                        <span className={`history-icon mood-${mood.value}`}>
                          <option.Icon size={23} />
                        </span>
                        <div>
                          <strong>{option.label}</strong>
                          <span>
                            {new Intl.DateTimeFormat("zh-CN", {
                              month: "long",
                              day: "numeric",
                              weekday: "short",
                            }).format(new Date(mood.createdAt))}
                          </span>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`删除${dayKey(new Date(mood.createdAt))}的心情记录`}
                          onClick={() => {
                            if (
                              commit((previous) => ({
                                ...previous,
                                moods: previous.moods.filter(
                                  (m) => m.id !== mood.id,
                                ),
                              }))
                            )
                              setToast("这条心情记录已删除。");
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}
              </div>
              <p className="history-summary">
                <Sprout size={16} />
                你也为自己完成过 {data.reliefSessions} 次缓一缓练习。
              </p>
            </>
          )}
        </Dialog>
      )}
      {modal === "settings" && (
        <Dialog title="隐私与数据" onClose={close} className="settings-modal">
          <div className="privacy-intro">
            <span className="tile-icon green">
              <ShieldCheck size={25} />
            </span>
            <h3>你的感受，由你保管。</h3>
            <p>
              心情、信件和小行动仅保存在当前浏览器中，不会由本应用上传，也没有
              AI 读取或分析。
            </p>
          </div>
          <div className="info-box">
            <LockKeyhole size={19} />
            <p>
              本地记录没有额外加密，共用设备的人可能看到。清除浏览器数据、无痕模式结束或更换设备后，记录可能无法找回。
            </p>
          </div>
          <div className="data-counts">
            <span>
              <strong>{data.moods.length}</strong> 天心情
            </span>
            <span>
              <strong>{data.letters.length}</strong> 封信件
            </span>
            <span>
              <strong>
                {Object.values(data.actions).reduce(
                  (sum, items) => sum + items.length,
                  0,
                )}
              </strong>{" "}
              个小行动
            </span>
          </div>
          <div className="danger-zone">
            <h3>删除本地记录</h3>
            <p>清除心情、信件、小行动和练习次数。删除后无法恢复。</p>
            {!confirmClear ? (
              <button
                className="button button-danger"
                onClick={() => setConfirmClear(true)}
              >
                <Trash2 size={16} />
                删除全部记录
              </button>
            ) : (
              <div
                className="confirm-panel"
                role="group"
                aria-label="确认删除全部记录"
              >
                <strong>确定删除此浏览器中的全部记录吗？</strong>
                <div>
                  <button
                    className="button button-secondary"
                    onClick={() => setConfirmClear(false)}
                  >
                    保留记录
                  </button>
                  <button className="button button-danger" onClick={clearData}>
                    确认全部删除
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}
      {modal === "support" && (
        <Dialog
          title="让更多支持靠近你"
          onClose={close}
          className="support-modal"
        >
          <div className="support-lead">
            <HeartHandshake size={39} strokeWidth={1.25} />
            <h3>这些难受，你可以找人一起分担。</h3>
            <p>
              如果情绪持续影响睡眠、饮食或日常生活，可以联系心理咨询师、精神心理科医生，或一位你信任的人。
            </p>
          </div>
          <div className="support-message">
            <span className="eyebrow">不知道怎么开口时，可以这样说</span>
            <p>“我最近有些难受。你今天方便陪我聊一会儿，或者一起散散步吗？”</p>
            <button
              className="button button-secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    "我最近有些难受。你今天方便陪我聊一会儿，或者一起散散步吗？",
                  );
                  setToast("已复制，你可以自行发送给信任的人。");
                } catch {
                  setToast("暂时无法复制，可以长按或选中上面的文字。");
                }
              }}
            >
              复制这句话 <Plus size={15} />
            </button>
          </div>
          <div className="support-resource">
            <LifeBuoy size={22} />
            <div>
              <h3>需要即时支持时</h3>
              <p>
                中国大陆可尝试拨打 <a href="tel:12356">12356 心理援助热线</a>
                。服务安排可能因地区而异；其他地区请联系当地心理援助服务。
              </p>
              <p>
                如果你正面临立即伤害自己的危险，请拨打 <a href="tel:120">120</a>{" "}
                / <a href="tel:110">110</a>{" "}
                或所在地紧急电话，并尽快让信任的人陪在身边。
              </p>
            </div>
          </div>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={16} />
          </span>
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="关闭提示"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function MoodWeek({ data, today }: { data: AppData; today: string }) {
  return (
    <div className="mood-week" aria-label="最近七天的心情记录">
      {Array.from({ length: 7 }, (_, index) => {
        const day = new Date(`${today}T12:00:00`);
        day.setDate(day.getDate() - 6 + index);
        const key = dayKey(day);
        const mood = data.moods.find(
          (item) => dayKey(new Date(item.createdAt)) === key,
        );
        const option = moodOptions.find((item) => item.value === mood?.value);
        return (
          <div
            className={`week-day ${key === today ? "is-today" : ""}`}
            key={key}
          >
            <span
              className={`week-dot ${option ? `recorded mood-${option.value}` : ""}`}
              aria-label={`${day.getMonth() + 1}月${day.getDate()}日：${option?.label ?? "未记录"}`}
            >
              {option ? <option.Icon size={18} strokeWidth={1.4} /> : <span />}
            </span>
            <span>
              {key === today
                ? "今"
                : ["日", "一", "二", "三", "四", "五", "六"][day.getDay()]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Flower() {
  return (
    <svg width="73" height="76" viewBox="0 0 73 76" fill="none">
      <path
        d="M39 65c0-12-4-24-5-34M37 55c13 1 17-7 18-13-12-2-19 4-18 13Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M32 24c-24-6-14-22-2-11C24-9 47-6 40 15c15-18 27 0 8 9 25 4 15 25-3 12 8 24-17 25-16 3-18 18-29-2-9-11Z"
        fill="#e7cfbd"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <circle cx="35" cy="28" r="7" fill="#c79570" />
    </svg>
  );
}
