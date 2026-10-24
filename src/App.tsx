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
  Wind,
  X,
} from "lucide-react";
import SanctuaryArt from "./components/SanctuaryArt";
import ReliefFlow from "./components/ReliefFlow";
import LetterEditor, { type Letter } from "./components/LetterEditor";
import Dialog from "./components/Dialog";
import MoodJournal from "./components/MoodJournal";
import MoodWeek, { moodDay } from "./components/MoodWeek";
import ActionPlanner from "./components/ActionPlanner";
import DataSettings from "./components/DataSettings";
import PracticeHistory from "./components/PracticeHistory";
import ContactPause from "./components/ContactPause";
import ComfortBox from "./components/ComfortBox";
import WeeklyReview from "./components/WeeklyReview";
import SmallExplore from "./components/SmallExplore";
import ActionCompanion from "./components/ActionCompanion";
import SupportComposer from "./components/SupportComposer";
import { resolveGuidedAction, type GuidedAction } from "./guidedActions";
import CareGuide, { careScenes, type CareScene, type WritingSeed } from "./components/CareGuide";
import { collectPractice } from "./comfort";
import type { ComfortItem, ReliefSession } from "./types";
import { BASE_ACTIONS } from "./actions";
import { RecordConflict, usePrivateData } from "./usePrivateData";
import { sameRecord } from "./records";
import { version } from "../package.json";
import {
  dayKey,
  mergeData,
  type Mood,
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

type Modal = "relief" | "letters" | "settings" | "support" | "history" | "planner" | "practices" | "pause" | "guide" | "comfort" | "review" | "explore" | "action-companion" | "support-composer" | null;

export default function App() {
  const { data, readBlocked, storageError, singleWindowOnly, commit, clearData } = usePrivateData();
  const [modal, setModal] = useState<Modal>(null);
  const [activeNav, setActiveNav] = useState("home");
  const [today, setToday] = useState(dayKey());
  const [group, setGroup] = useState(0);
  const [toast, setToast] = useState("");
  const [scene, setScene] = useState<Exclude<CareScene, "contact">>("repeat");
  const [practiceStart, setPracticeStart] = useState<{ feeling?: string; technique?: ReliefSession["technique"]; direct?: boolean }>({});
  const [writingSeed, setWritingSeed] = useState<WritingSeed>();
  const [initialLetterId, setInitialLetterId] = useState<string>();
  const [guidedAction, setGuidedAction] = useState<GuidedAction>();
  const [supportContact, setSupportContact] = useState<ComfortItem>();
  const [showMoodNext, setShowMoodNext] = useState(false);
  const [moodPending, setMoodPending] = useState(false);
  const moodPendingRef = useRef(false);
  const [actionPending, setActionPending] = useState<string[]>([]);
  const actionPendingRef = useRef(new Set<string>());
  const actionsRef = useRef<HTMLElement>(null);
  const todayMood = [...data.moods].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).find(
    (m) => moodDay(m) === today,
  );
  const currentMood = moodOptions.find((m) => m.value === todayMood?.value);
  const completed = data.actions[today] ?? [];
  const planned = data.plannedActions.flatMap<{ id: string; label: string; detail: string; Icon: typeof Sprout }>((id) => {
    const base = BASE_ACTIONS.find((item) => item.id === id);
    if (base) return [{ ...base, label: base.title, Icon: actionGroups.flat().find((item) => item.id === id)?.Icon ?? Sprout }];
    const custom = data.customActions.find((item) => item.id === id && !item.archived);
    return custom ? [{ ...custom, detail: custom.detail ?? "按自己的节奏就好", label: custom.title, Icon: Sprout }] : [];
  });
  const visibleActions = planned.length ? planned.slice(0, 3) : actionGroups[group];

  useEffect(() => {
    if (!moodPending && actionPending.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [moodPending, actionPending.length]);

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
  function open(next: Modal, nav?: string) {
    if (next === "relief") setPracticeStart({});
    if (next === "letters") { setWritingSeed(undefined); setInitialLetterId(undefined); }
    setModal(next);
    if (nav) setActiveNav(nav);
  }
  function openScene(next: CareScene) {
    if (next === "contact") setModal("pause");
    else { setScene(next); setModal("guide"); }
  }
  function startPractice(technique: ReliefSession["technique"], feeling?: string, direct = false) {
    setPracticeStart({ technique, feeling, direct }); setModal("relief"); setActiveNav("relief");
  }
  function startWriting(seed: WritingSeed) {
    setWritingSeed(seed); setInitialLetterId(undefined); setModal("letters"); setActiveNav("letters");
  }
  function startAction(id: string) {
    const action = resolveGuidedAction(data, id);
    if (!action) { setToast("这件小行动刚被调整了，请到行动计划查看。"); return; }
    setGuidedAction(action); setModal("action-companion"); setActiveNav("actions");
  }
  function close() {
    setModal(null);
    setActiveNav("home");
  }
  async function recordMood(value: number) {
    if (moodPendingRef.current) return;
    moodPendingRef.current = true; setMoodPending(true);
    try {
      const now = new Date();
      const day = dayKey(now);
      setToday(day);
      const saved = await commit((previous) => {
        const existing = [...previous.moods].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).find((mood) => moodDay(mood) === day);
        const mood: Mood = existing
          ? { ...existing, value, day }
          : {
              id: globalThis.crypto?.randomUUID?.() ?? `mood-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              value, day, createdAt: now.toISOString(),
            };
        return { ...previous, moods: [...previous.moods.filter((item) => item.id !== mood.id), mood] };
      });
      if (saved) { setToast("记下了，你的每一种感受都值得被看见。"); setShowMoodNext(true); }
    } finally { moodPendingRef.current = false; setMoodPending(false); }
  }
  async function saveLetter(letter: Letter, expected?: Letter | null) {
    return commit((previous) => {
      const current = previous.letters.find((item) => item.id === letter.id);
      if (expected !== undefined && !sameRecord(current ?? null, expected)) {
        throw new RecordConflict("这封信已在另一个窗口更改。你的文字仍在编辑器中，可以查看最新内容或另存为新信。");
      }
      return { ...previous, letters: [letter, ...previous.letters.filter((item) => item.id !== letter.id)] };
    });
  }
  async function deleteLetter(id: string, expected?: Letter) {
    const deleted = await commit((previous) => {
      const current = previous.letters.find((item) => item.id === id);
      if (expected && current && !sameRecord(current, expected)) {
        throw new RecordConflict("这封信刚在另一个窗口更改，请查看最新内容后再决定是否删除。");
      }
      return { ...previous, letters: previous.letters.filter((item) => item.id !== id) };
    });
    if (deleted) setToast("这封信已删除。");
    return deleted;
  }
  async function saveMood(mood: Mood, expected?: Mood) {
    return commit((previous) => {
      const current = previous.moods.find((item) => item.id === mood.id);
      if (expected && !sameRecord(current, expected)) {
        throw new RecordConflict("这条心情已在另一个窗口更改。请先查看最新记录，你的备注仍保留在编辑器中。");
      }
      return { ...previous, moods: [...previous.moods.filter((item) => item.id !== mood.id), mood] };
    });
  }
  async function deleteMood(id: string, expected?: Mood) {
    return commit((previous) => {
      const current = previous.moods.find((item) => item.id === id);
      if (expected && current && !sameRecord(current, expected)) {
        throw new RecordConflict("这条心情刚在另一个窗口更改，请查看最新记录后再删除。");
      }
      return { ...previous, moods: previous.moods.filter((item) => item.id !== id) };
    });
  }
  async function toggleAction(id: string) {
    if (actionPendingRef.current.has(id)) return false;
    actionPendingRef.current.add(id); setActionPending((old) => [...old, id]);
    try {
      const actionDay = dayKey();
      setToday(actionDay);
      let added = false;
      const saved = await commit((previous) => {
        const current = previous.actions[actionDay] ?? [];
        added = !current.includes(id);
        return {
          ...previous,
          actions: { ...previous.actions, [actionDay]: added ? [...current, id] : current.filter((item) => item !== id) },
        };
      });
      if (saved && added) setToast("做到了这一点，已经很好。谢谢你照顾自己。");
      return saved;
    } finally { actionPendingRef.current.delete(id); setActionPending((old) => old.filter((item) => item !== id)); }
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
      <aside className="sidebar" inert={modal !== null}>
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

      <div className="main-shell" inert={modal !== null}>
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
                    disabled={moodPending}
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
              {moodPending && <p className="care-small" role="status">正在收好心情…</p>}
              {showMoodNext && currentMood && <div className="mood-next" role="group" aria-label="心情记录后的下一步">
                <p>接下来，想怎样照顾自己？</p>
                <div>
                  <button onClick={() => { setShowMoodNext(false); startPractice("grounding", undefined, true); }}>陪我稳一稳</button>
                  <button onClick={() => { setShowMoodNext(false); open(currentMood.value <= 2 ? "comfort" : "explore"); }}>{currentMood.value <= 2 ? "找一点支持" : "选一件小事"}</button>
                </div>
                <button className="mood-next-dismiss" onClick={() => setShowMoodNext(false)}>现在这样就好</button>
              </div>}
              {currentMood && (
                <button className="subtle-link" onClick={() => open("history")}>
                  给今天补充一句话 <ArrowRight size={12} />
                </button>
              )}
            </section>
          </div>

          <section className="scene-section" aria-labelledby="scene-heading">
            <div className="scene-heading"><div><h2 id="scene-heading">此刻，我需要一点什么？</h2><p>从一个熟悉的时刻开始，跟着自己的感觉选。</p></div><button className="text-link" onClick={() => open("comfort")}><BookHeart size={16} />我的安稳工具箱 <ArrowRight size={14} /></button></div>
            <div className="scene-grid">{careScenes.map(({ id, title, detail, Icon }) => <button className="scene-card" key={id} onClick={() => openScene(id)}><Icon size={21} strokeWidth={1.5} /><span><strong>{title}</strong><small>{detail}</small></span></button>)}</div>
          </section>

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
                  onClick={() => planned.length ? open("planner", "actions") : setGroup((value) => (value + 1) % actionGroups.length)}
                >
                  {planned.length ? "我的计划" : "换一组"} <span aria-hidden="true">↻</span>
                </button>
              </div>
              <h2>今天，为自己做一件小事。</h2>
              <p>不用做很多，选一件就已经很好。</p>
              <div className="action-list">
                {visibleActions.map(({ id, label, detail, Icon }) => (
                  <div className="action-row" key={id}>
                  <button
                    disabled={actionPending.includes(id)}
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
                  <div className="action-row-tools"><span>{actionPending.includes(id) ? "正在保存…" : completed.includes(id) ? "已完成 · 点按上方可撤销" : "点按上方标记完成"}</span><button className="text-link" aria-label={`分步开始：${label}`} onClick={() => startAction(id)}>分步开始 <ArrowRight size={13} /></button></div>
                  </div>
                ))}
              </div>
              <button className="text-link action-plan-link" onClick={() => open("planner", "actions")}>
                安排我的小行动 {planned.length > 3 ? `· ${planned.length} 项` : ""}<ArrowRight size={15} />
              </button>
              <button className="subtle-link practice-history-link" onClick={() => open("explore")}><Sparkles size={14} />来一点生活小探索</button>
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
                    已经留下 <strong>{new Set(data.moods.map(moodDay)).size}</strong> 天心情足迹
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
              <button className="subtle-link practice-history-link" onClick={() => open("practices")}>
                我的练习回顾 {data.reliefSessions > 0 ? `· ${data.reliefSessions} 次` : ""}<Wind size={14} />
              </button>
              <button className="subtle-link practice-history-link" onClick={() => open("review")}><Leaf size={14} />温柔的每周回顾</button>
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
              <Leaf size={13} /> 缓缓 v{version} · 陪你找回自己的节奏
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
          initialFeeling={practiceStart.feeling}
          initialTechnique={practiceStart.technique}
          startAtExercise={practiceStart.direct}
          collectedTechniques={data.comfortItems.flatMap((item) => item.kind === "practice" && item.technique ? [item.technique] : [])}
          onComplete={async (session, collect) => {
            const saved = await commit((previous) => {
              const exists = previous.reliefHistory.some((item) => item.id === session.id);
              const next = {
                ...previous,
                reliefSessions: previous.reliefSessions + (exists ? 0 : 1),
                reliefHistory: exists ? previous.reliefHistory : [session, ...previous.reliefHistory],
                plannedActions: session.action
                  ? [...new Set([...previous.plannedActions, session.action])]
                  : previous.plannedActions,
              };
              return collect ? collectPractice(next, session.technique) : next;
            });
            if (saved) setToast(session.action ? "这次练习已收好。你选择的小事，也放进了行动计划。" : "这次练习已收好，谢谢你给了自己一点时间。");
            return saved;
          }}
        />
      )}
      {modal === "guide" && <CareGuide scene={scene} onClose={close} onPractice={(feeling, technique) => startPractice(technique, feeling)} onWrite={startWriting} />}
      {modal === "pause" && <ContactPause storageError={storageError} onClose={close} onSave={saveLetter} onToolbox={() => setModal("comfort")} onLetter={(id) => { setWritingSeed(undefined); setInitialLetterId(id); setModal("letters"); setActiveNav("letters"); }} />}
      {modal === "comfort" && <ComfortBox storageError={storageError} data={data} onUpdate={commit} onClose={close} onContact={(contact) => { setSupportContact({ ...contact }); setModal("support-composer"); }} onPractice={(technique) => startPractice(technique, undefined, true)} />}
      {modal === "review" && <WeeklyReview data={data} today={today} onClose={close} onWrite={startWriting} onHistory={() => open("history", "history")} onPracticeHistory={() => open("practices")} />}
      {modal === "explore" && <SmallExplore storageError={storageError} data={data} onClose={close} onUpdate={commit} onPlanner={() => open("planner", "actions")} />}
      {modal === "action-companion" && guidedAction && <ActionCompanion key={guidedAction.id} action={guidedAction} data={data} today={today} onUpdate={commit} storageError={storageError} onClose={close} onBack={() => open("planner", "actions")} />}
      {modal === "support-composer" && supportContact && <SupportComposer key={supportContact.id} contact={supportContact} currentContact={data.comfortItems.find((item) => item.id === supportContact.id)} onClose={close} onBack={() => open("comfort")} />}
      {modal === "letters" && (
        <LetterEditor
          letters={data.letters}
          onSave={saveLetter}
          onDelete={deleteLetter}
          onClose={close}
          initialSeed={writingSeed}
          initialLetterId={initialLetterId}
        />
      )}
      {modal === "history" && (
        <MoodJournal data={data} today={today} onSave={saveMood} onDelete={deleteMood} onClose={close} />
      )}
      {modal === "planner" && (
        <ActionPlanner data={data} today={today} onUpdate={commit} onToggle={toggleAction} onClose={close} onStart={startAction} />
      )}
      {modal === "practices" && (
        <PracticeHistory data={data} onClose={close} onUpdate={commit} />
      )}
      {modal === "settings" && (
        <DataSettings data={data} readBlocked={readBlocked} singleWindowOnly={singleWindowOnly} onClose={close} onClear={clearData}
          onImport={(incoming) => commit((previous) => mergeData(previous, incoming))} />
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
