import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudRain,
  Hand,
  Heart,
  MessageCircle,
  Moon,
  Pause,
  Play,
  Repeat2,
  Wind,
  X,
} from "lucide-react";
import type { ReliefSession } from "../storage";
import "./relief.css";

type ReliefFlowProps = {
  onClose: () => void;
  onComplete: (session: ReliefSession, collect?: boolean) => boolean | Promise<boolean>;
  initialFeeling?: string;
  initialTechnique?: ReliefSession["technique"];
  startAtExercise?: boolean;
  collectedTechniques?: ReliefSession["technique"][];
};

const feelings = [
  {
    id: "cry",
    label: "有点想哭",
    description: "心里有很多委屈",
    icon: CloudRain,
  },
  {
    id: "repeat",
    label: "反复想起",
    description: "那些画面停不下来",
    icon: Repeat2,
  },
  {
    id: "contact",
    label: "想联系对方",
    description: "有好多话想说",
    icon: MessageCircle,
  },
  {
    id: "sleep",
    label: "有些睡不着",
    description: "身体很累，心还醒着",
    icon: Moon,
  },
  { id: "blame", label: "有些自责", description: "总觉得是自己不好", icon: Heart },
] as const;

const reassurance: Record<string, string> = {
  cry: "想哭的时候，可以让眼泪待一会儿。你不需要马上振作。",
  repeat: "念头又回来了，也没关系。我们可以慢慢把注意力带回此刻。",
  contact: "想联系的冲动可以先被看见。给自己一点时间，再决定下一步。",
  sleep: "暂时不必把睡着当成任务。让身体舒服一点，也是一种休息。",
  blame: "经历难受的事，不代表你不够好。可以先照顾此刻的自己。",
};

const guidance: Record<string, { title: string; text: string }> = {
  blame: {
    title: "给自己一点理解",
    text: "如果一位朋友正在经历这些，你愿意怎样陪伴他？此刻先不用给自己下结论，可以留意脚下的地面，感受身体被稳稳托住。",
  },
  cry: {
    title: "给委屈留一点空间",
    text: "找一个能安心坐着的地方，松一松肩膀。眼泪来了可以停一会儿，也可以抱住枕头或把手放在自己觉得舒服的位置。",
  },
  repeat: {
    title: "念头来了，先轻轻认出它",
    text: "可以在心里说：“我注意到自己又想起了那件事。”暂时不追问答案，试着看一眼周围，把注意力放回眼前的一样东西。",
  },
  contact: {
    title: "给决定留一点余地",
    text: "先把想说的话留在纸上，或练习后写进“不寄出的信”。你可以晚一点再决定是否联系，此刻不需要作出答案。",
  },
  sleep: {
    title: "先让身体舒适一点",
    text: "找一个舒服的姿势，把屏幕调暗一些。无需强迫自己睡着；如果跟着节奏不舒服，就自然呼吸，或者感受床和衣物的触感。",
  },
};

type Technique = ReliefSession["technique"];
type ExerciseTime = Record<Technique, number>;
type GroundingState = "found" | "skipped";

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} 分钟${rest ? ` ${rest} 秒` : ""}`;
}

function IntensityCheck({
  stage,
  value,
  onChange,
  disabled = false,
}: {
  stage: "before" | "after";
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  disabled?: boolean;
}) {
  const label = stage === "before" ? "开始前，有多难受？" : "现在，有多难受？";
  return (
    <fieldset className="relief-intensity" disabled={disabled}>
      <legend>{label} <span>可不选</span></legend>
      <p>只是记下此刻的感受，不需要达到某个分数。</p>
      <div className="relief-intensity-options">
        {[1, 2, 3, 4, 5].map((level) => (
          <button
            type="button"
            key={level}
            aria-label={`${level} 分${level === 1 ? "，较轻" : level === 5 ? "，很强烈" : ""}`}
            aria-pressed={value === level}
            className={value === level ? "is-selected" : ""}
            onClick={() => onChange(value === level ? undefined : level)}
          >
            {level}
          </button>
        ))}
      </div>
      <div className="relief-intensity-labels"><span>较轻</span><span>很强烈</span></div>
      {value !== undefined && (
        <button type="button" className="subtle-link" onClick={() => onChange(undefined)}>
          暂不记录分数
        </button>
      )}
    </fieldset>
  );
}

const grounding = [
  {
    number: "5",
    label: "样你看见的东西",
    example: "窗边的光、杯子、墙上的颜色……",
  },
  {
    number: "4",
    label: "种你能触到的感觉",
    example: "脚下的地面、衣服的布料……",
  },
  {
    number: "3",
    label: "种你听见的声音",
    example: "风声、远处的车声、自己的呼吸……",
  },
  {
    number: "2",
    label: "种你闻到的气味",
    example: "也可以想起两种熟悉的气味。",
  },
  {
    number: "1",
    label: "种你尝到的味道",
    example: "喝一口水，留意这一刻的感觉。",
  },
];

const smallActions = [
  {
    id: "water",
    title: "慢慢喝一杯水",
    detail: "感受杯子的温度，照顾一下身体。",
  },
  {
    id: "window",
    title: "去窗边站一会儿",
    detail: "看看天空，或者让脚稳稳踩在地上。",
  },
  {
    id: "friend",
    title: "找一个信任的人",
    detail: "可以说：“我有些难受，你方便陪我聊聊吗？”",
  },
  {
    id: "rest",
    title: "给自己一点休息",
    detail: "放下手机几分钟，不必做任何决定。",
  },
];

export default function ReliefFlow({ onClose, onComplete, initialFeeling = "", initialTechnique = "breathing", startAtExercise = false, collectedTechniques = [] }: ReliefFlowProps) {
  const [step, setStep] = useState(startAtExercise ? 1 : 0);
  const [feeling, setFeeling] = useState<string>(initialFeeling);
  const [technique, setTechnique] = useState<Technique>(initialTechnique);
  const [collect, setCollect] = useState(false);
  const [running, setRunning] = useState(false);
  const [exerciseTime, setExerciseTime] = useState<ExerciseTime>({ breathing: 0, grounding: 0 });
  const accumulatedRef = useRef<ExerciseTime>({ breathing: 0, grounding: 0 });
  const activeSegmentRef = useRef<{ technique: Technique; startedAt: number } | null>(null);
  const [autoPaused, setAutoPaused] = useState(false);
  const [groundingSteps, setGroundingSteps] = useState<Record<string, GroundingState>>({});
  const [before, setBefore] = useState<number>();
  const [after, setAfter] = useState<number>();
  const [action, setAction] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [sessionId] = useState(() => globalThis.crypto?.randomUUID?.() ?? `relief-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const completedAtRef = useRef<string | null>(null);
  const finishedRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);

  function requestClose() {
    if (!savingRef.current) onClose();
  }

  // Count only an explicitly running exercise, using a monotonic clock. Keeping
  // the active segment in a ref makes pause/switch/finish use the same boundary.
  const currentTime = useCallback((): ExerciseTime => {
    const next = { ...accumulatedRef.current };
    const segment = activeSegmentRef.current;
    if (segment) next[segment.technique] += Math.max(0, performance.now() - segment.startedAt);
    return next;
  }, []);

  const pauseExercise = useCallback(() => {
    const next = currentTime();
    accumulatedRef.current = next;
    activeSegmentRef.current = null;
    setExerciseTime(next);
    setRunning(false);
  }, [currentTime]);

  function startExercise() {
    if (activeSegmentRef.current || document.hidden) return;
    activeSegmentRef.current = { technique, startedAt: performance.now() };
    setAutoPaused(false);
    setRunning(true);
  }

  function chooseTechnique(next: Technique) {
    if (next === technique) return;
    pauseExercise();
    setAutoPaused(false);
    setTechnique(next);
  }

  useEffect(() => {
    closeRef.current = () => {
      if (!savingRef.current) onClose();
    };
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        titleRef.current?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !focusable.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !focusable.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setExerciseTime(currentTime()), 250);
    return () => window.clearInterval(interval);
  }, [running, currentTime]);

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && activeSegmentRef.current) {
        pauseExercise();
        setAutoPaused(true);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [pauseExercise]);

  useEffect(() => {
    titleRef.current?.focus();
    dialogRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const elapsed = Math.floor(exerciseTime.breathing / 1000);
  const totalSeconds = Math.floor((exerciseTime.breathing + exerciseTime.grounding) / 1000);
  const breathing = running && technique === "breathing";
  const cyclePosition = elapsed % 10;
  const inhaling = cyclePosition < 4;
  const countdown = inhaling ? 4 - cyclePosition : 10 - cyclePosition;

  function nextStep() {
    pauseExercise();
    setStep((value) => Math.min(value + 1, 2));
  }

  async function finish() {
    if (finishedRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(false);
    pauseExercise();
    completedAtRef.current ??= new Date().toISOString();
    const duration = currentTime();
    const session: ReliefSession = {
      id: sessionId,
      createdAt: completedAtRef.current,
      feeling,
      technique,
      durationSeconds: Math.floor((duration.breathing + duration.grounding) / 1000),
      ...(before !== undefined ? { before } : {}),
      ...(after !== undefined ? { after } : {}),
      ...(action ? { action } : {}),
    };
    try {
      if (!await onComplete(session, collect)) {
        setSaveError(true);
        return;
      }
      finishedRef.current = true;
      onClose();
    } catch {
      setSaveError(true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className="modal relief-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="relief-title"
        aria-describedby="relief-description"
        aria-busy={saving}
        ref={dialogRef}
      >
        <button
          className="modal-close button-ghost"
          onClick={requestClose}
          disabled={saving}
          aria-label="关闭，回到首页"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <div
          className="relief-progress"
          aria-label={`第 ${step + 1} 步，共 3 步`}
        >
          {[0, 1, 2].map((item) => (
            <span className={item <= step ? "is-active" : ""} key={item} />
          ))}
        </div>
        <p className="eyebrow">此刻，先陪陪自己 · {step + 1} / 3</p>

        {step === 0 && (
          <>
            <div className="relief-heading-icon">
              <Heart size={27} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h2 id="relief-title" tabIndex={-1} ref={titleRef}>
              现在，什么让你难受？
            </h2>
            <p id="relief-description" className="modal-description">
              选一个接近的感受就好，也可以直接开始。
            </p>
            <div className="relief-feelings">
              {feelings.map(({ id, label, description, icon: Icon }) => (
                <button
                  className={`relief-feeling ${feeling === id ? "is-selected" : ""}`}
                  key={id}
                  aria-pressed={feeling === id}
                  onClick={() => setFeeling(id)}
                >
                  <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
                  <strong>{label}</strong>
                  <span>{description}</span>
                  {feeling === id && (
                    <Check
                      className="relief-selection-check"
                      size={17}
                      aria-hidden="true"
                    />
                  )}
                </button>
              ))}
            </div>
            <p className="relief-reassurance" aria-live="polite">
              {feeling
                ? reassurance[feeling]
                : "不用解释清楚所有事情。我们先一起停一小会儿。"}
            </p>
            <IntensityCheck stage="before" value={before} onChange={setBefore} />
            <div className="relief-footer">
              <button className="button button-ghost" onClick={nextStep}>
                先跳过
              </button>
              <button className="button button-primary" onClick={nextStep}>
                陪我缓一缓 <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 id="relief-title" tabIndex={-1} ref={titleRef}>
              把注意力，轻轻带回来。
            </h2>
            <p id="relief-description" className="modal-description">
              选择舒服的方式。随时可以暂停或跳过。
            </p>
            {guidance[feeling] && (
              <div className="relief-personal-guide">
                <strong>{guidance[feeling].title}</strong>
                <p>{guidance[feeling].text}</p>
              </div>
            )}
            <div className="relief-techniques" aria-label="选择练习方式">
              <button
                aria-pressed={technique === "breathing"}
                className={technique === "breathing" ? "is-selected" : ""}
                onClick={() => chooseTechnique("breathing")}
              >
                <Wind size={17} aria-hidden="true" /> 跟着呼吸
              </button>
              <button
                aria-pressed={technique === "grounding"}
                className={technique === "grounding" ? "is-selected" : ""}
                onClick={() => chooseTechnique("grounding")}
              >
                <Hand size={17} aria-hidden="true" /> 感受此刻
              </button>
            </div>
            {autoPaused && (
              <p className="relief-auto-paused" role="status">
                离开页面时已暂停。准备好后，再继续就好。
              </p>
            )}

            {technique === "breathing" ? (
              <div className="relief-breathing">
                <div
                  className={`relief-breath-orbit ${breathing ? "is-breathing" : ""}`}
                  data-phase={inhaling ? "inhale" : "exhale"}
                >
                  <div className="relief-breath-circle">
                    <Wind size={27} strokeWidth={1.3} aria-hidden="true" />
                    <span className="relief-breath-label">
                      {breathing
                        ? inhaling
                          ? "轻轻吸气"
                          : "慢慢呼气"
                        : "按自己的节奏"}
                    </span>
                    <span className="relief-breath-count" aria-hidden="true">
                      {breathing ? countdown : "准备好了再开始"}
                    </span>
                  </div>
                </div>
                <p className="relief-breath-caption">
                  吸气 4 秒 · 呼气 6 秒 · 不用屏息
                </p>
                <p
                  className="sr-only"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {breathing
                    ? inhaling
                      ? "轻轻吸气，4 秒。"
                      : "慢慢呼气，6 秒。"
                    : "呼吸练习已暂停，可以按自己的节奏继续。"}
                </p>
                <button
                  className="button button-secondary"
                  onClick={() => running ? pauseExercise() : startExercise()}
                  aria-pressed={breathing}
                >
                  {breathing ? (
                    <Pause size={17} aria-hidden="true" />
                  ) : (
                    <Play size={17} aria-hidden="true" />
                  )}
                  {breathing
                    ? "暂停一下"
                    : elapsed > 0
                      ? "继续练习"
                      : "开始呼吸"}
                </button>
                <p className="relief-note">
                  如果关注呼吸让你不舒服，可以换成“感受此刻”，或自然呼吸。
                </p>
              </div>
            ) : (
              <div className="relief-grounding">
                <p className="relief-grounding-intro">
                  环顾四周，慢慢找到这些小小的线索。
                </p>
                <div className="relief-grounding-controls">
                  <button
                    type="button"
                    className="button button-secondary"
                    aria-pressed={running}
                    onClick={() => running ? pauseExercise() : startExercise()}
                  >
                    {running ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                    {running ? "暂停感官练习" : exerciseTime.grounding > 0 ? "继续感官练习" : "开始感官练习"}
                  </button>
                  <span>找到后，可以为它留一个记号。</span>
                </div>
                <ol>
                  {grounding.map((item) => (
                    <li key={item.number} className={groundingSteps[item.number] ? `is-${groundingSteps[item.number]}` : ""}>
                      <span
                        className="relief-grounding-number"
                        aria-hidden="true"
                      >
                        {item.number}
                      </span>
                      <div className="relief-grounding-copy">
                        <strong>
                          {item.number} {item.label}
                        </strong>
                        <p>{item.example}</p>
                        <div className="relief-grounding-choices">
                          <button
                            type="button"
                            aria-label={`已留意到 ${item.number} ${item.label}`}
                            aria-pressed={groundingSteps[item.number] === "found"}
                            onClick={() => setGroundingSteps((previous) => {
                              const next = { ...previous };
                              if (next[item.number] === "found") delete next[item.number];
                              else next[item.number] = "found";
                              return next;
                            })}
                          >
                            <Check size={13} aria-hidden="true" /> 我留意到了
                          </button>
                          <button
                            type="button"
                            aria-label={`跳过 ${item.number} ${item.label}`}
                            aria-pressed={groundingSteps[item.number] === "skipped"}
                            onClick={() => setGroundingSteps((previous) => {
                              const next = { ...previous };
                              if (next[item.number] === "skipped") delete next[item.number];
                              else next[item.number] = "skipped";
                              return next;
                            })}
                          >
                            {groundingSteps[item.number] === "skipped" ? "这项先放下" : "这项先跳过"}
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="relief-note">
                  不必做完。任何一项不方便，都可以跳过。
                </p>
              </div>
            )}
            <p className="relief-elapsed" aria-label="本次实际练习时长">
              已练习 {formatDuration(totalSeconds)} <span>· 暂停时间不会计入</span>
            </p>

            <div className="relief-footer">
              <button
                className="button button-ghost"
                onClick={() => {
                  pauseExercise();
                  setStep(0);
                }}
              >
                <ArrowLeft size={16} aria-hidden="true" /> 上一步
              </button>
              <button className="button button-ghost" onClick={nextStep}>
                跳过练习
              </button>
              <button className="button button-primary" onClick={nextStep}>
                继续 <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="relief-heading-icon">
              <Heart size={27} strokeWidth={1.5} aria-hidden="true" />
            </div>
            <h2 id="relief-title" tabIndex={-1} ref={titleRef}>
              接下来，只做一件小事。
            </h2>
            <p id="relief-description" className="modal-description">
              情绪不必马上变好。选一件愿意为自己做的事。
            </p>
            <div className="relief-session-summary">
              <span className="eyebrow">给自己留下一点记录</span>
              <p>{totalSeconds > 0 ? `这次，你为自己留了 ${formatDuration(totalSeconds)} 的练习时间。` : "这次没有计时练习，愿意停下来看看自己，也很好。"}</p>
              {Object.values(groundingSteps).some((item) => item === "found") && (
                <p>你留意了 {Object.values(groundingSteps).filter((item) => item === "found").length} 类身边的感受。</p>
              )}
            </div>
            <IntensityCheck stage="after" value={after} onChange={setAfter} disabled={saving} />
            <label className="relief-collect"><input type="checkbox" checked={collect || collectedTechniques.includes(technique)} disabled={saving || collectedTechniques.includes(technique)} onChange={(event) => setCollect(event.target.checked)} />{collectedTechniques.includes(technique) ? "这个练习已在我的安稳工具箱里" : "把这个练习收进安稳工具箱"}</label>
            {before !== undefined && after !== undefined && (
              <p className="relief-checkin-note">
                开始前 {before} 分，现在 {after} 分。感受暂时没变、或变得更强烈都可以被记录，不需要勉强自己。
              </p>
            )}
            <div className="relief-actions">
              {smallActions.map((item) => (
                <button
                  key={item.id}
                  disabled={saving}
                  className={`relief-action ${action === item.id ? "is-selected" : ""}`}
                  aria-pressed={action === item.id}
                  onClick={() => setAction(action === item.id ? "" : item.id)}
                >
                  <span className="relief-action-radio">
                    {action === item.id && (
                      <Check size={14} aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                </button>
              ))}
            </div>
            {action && <p className="relief-plan-note">这件小事会放进“我的小行动”，等你愿意时再去做。</p>}
            <p className="relief-reassurance">
              谢谢你，愿意留一点时间给自己。需要的时候，这里一直欢迎你回来。
            </p>
            {saveError && (
              <div className="relief-save-error" role="alert">
                <strong>这次没能保存练习记录。</strong>
                <p>你的选择还在这里，可以重试。也可以直接关闭，已经做过的照顾依然有意义。</p>
              </div>
            )}
            <div className="relief-footer">
              <button
                className="button button-ghost"
                onClick={() => setStep(1)}
                disabled={saving}
              >
                <ArrowLeft size={16} aria-hidden="true" /> 上一步
              </button>
              <button className="button button-primary" onClick={finish} disabled={saving}>
                {saving ? "正在收好…" : action ? "带着这件小事，慢慢来" : "先休息一下"}{" "}
                <Check size={17} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
