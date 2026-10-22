import { useEffect, useRef, useState } from "react";
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

type ReliefFlowProps = {
  onClose: () => void;
  onComplete: () => void;
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
] as const;

const reassurance: Record<string, string> = {
  cry: "想哭的时候，可以让眼泪待一会儿。你不需要马上振作。",
  repeat: "念头又回来了，也没关系。我们可以慢慢把注意力带回此刻。",
  contact: "想联系的冲动可以先被看见。给自己一点时间，再决定下一步。",
  sleep: "暂时不必把睡着当成任务。让身体舒服一点，也是一种休息。",
};

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

export default function ReliefFlow({ onClose, onComplete }: ReliefFlowProps) {
  const [step, setStep] = useState(0);
  const [feeling, setFeeling] = useState<string>("");
  const [technique, setTechnique] = useState<"breathing" | "grounding">(
    "breathing",
  );
  const [breathing, setBreathing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [action, setAction] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
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
          'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
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
    if (!breathing || step !== 1 || technique !== "breathing") return;
    const interval = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(interval);
  }, [breathing, step, technique]);

  useEffect(() => {
    titleRef.current?.focus();
    dialogRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const cyclePosition = elapsed % 10;
  const inhaling = cyclePosition < 4;
  const countdown = inhaling ? 4 - cyclePosition : 10 - cyclePosition;

  function nextStep() {
    setBreathing(false);
    setStep((value) => Math.min(value + 1, 2));
  }

  function finish() {
    setBreathing(false);
    onComplete();
    onClose();
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal relief-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="relief-title"
        aria-describedby="relief-description"
        ref={dialogRef}
      >
        <button
          className="modal-close button-ghost"
          onClick={onClose}
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
            <div className="relief-techniques" aria-label="选择练习方式">
              <button
                aria-pressed={technique === "breathing"}
                className={technique === "breathing" ? "is-selected" : ""}
                onClick={() => {
                  setTechnique("breathing");
                  setBreathing(false);
                }}
              >
                <Wind size={17} aria-hidden="true" /> 跟着呼吸
              </button>
              <button
                aria-pressed={technique === "grounding"}
                className={technique === "grounding" ? "is-selected" : ""}
                onClick={() => {
                  setTechnique("grounding");
                  setBreathing(false);
                }}
              >
                <Hand size={17} aria-hidden="true" /> 感受此刻
              </button>
            </div>

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
                  onClick={() => setBreathing((value) => !value)}
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
                <ol>
                  {grounding.map((item) => (
                    <li key={item.number}>
                      <span
                        className="relief-grounding-number"
                        aria-hidden="true"
                      >
                        {item.number}
                      </span>
                      <div>
                        <strong>
                          {item.number} {item.label}
                        </strong>
                        <p>{item.example}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="relief-note">
                  不必做完。任何一项不方便，都可以跳过。
                </p>
              </div>
            )}

            <div className="relief-footer">
              <button
                className="button button-ghost"
                onClick={() => {
                  setBreathing(false);
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
            <div className="relief-actions">
              {smallActions.map((item) => (
                <button
                  key={item.id}
                  className={`relief-action ${action === item.id ? "is-selected" : ""}`}
                  aria-pressed={action === item.id}
                  onClick={() => setAction(item.id)}
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
            <p className="relief-reassurance">
              谢谢你，愿意留一点时间给自己。需要的时候，这里一直欢迎你回来。
            </p>
            <div className="relief-footer">
              <button
                className="button button-ghost"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={16} aria-hidden="true" /> 上一步
              </button>
              <button className="button button-primary" onClick={finish}>
                {action ? "带着这件小事，慢慢来" : "先休息一下"}{" "}
                <Check size={17} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
