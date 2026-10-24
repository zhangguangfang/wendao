import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Mail, Pause, Play } from "lucide-react";
import Dialog from "./Dialog";
import { usePauseTimer } from "../usePauseTimer";
import type { Letter } from "../types";
import { downloadText } from "../download";
import "./care-features.css";

type Props = {
  onSave: (letter: Letter, expected?: Letter | null) => Promise<boolean>;
  onClose: () => void;
  onToolbox: () => void;
  onLetter: (id: string) => void;
  storageError: string | null;
};
const newId = (): string => globalThis.crypto?.randomUUID?.() ?? `pause-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function ContactPause({ onSave, onClose, onToolbox, onLetter, storageError }: Props) {
  const [step, setStep] = useState(0);
  const [body, setBody] = useState("");
  const [saved, setSaved] = useState<Letter | null>(null);
  const [draftId, setDraftId] = useState(newId);
  const [createdAt] = useState(() => new Date().toISOString());
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState<"close" | "toolbox" | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const timer = usePauseTimer();
  const dirty = body !== (saved?.body ?? "");
  useEffect(() => { if (leaving) cancelRef.current?.focus(); }, [leaving]);
  useEffect(() => { headingRef.current?.focus(); }, [step]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  function go(next: number) { timer.pause(); setStep(next); }
  function leave(destination: "close" | "toolbox") {
    if (pendingRef.current) return;
    timer.pause();
    if (dirty && (body.trim() || saved)) { setLeaving(destination); return; }
    if (destination === "toolbox") onToolbox(); else onClose();
  }
  async function save(asNew = false) {
    if (pendingRef.current || (!body.trim() && !saved)) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    timer.pause();
    const letter: Letter = {
      id: asNew ? newId() : draftId,
      title: "先放在这里的话", body, createdAt: asNew ? new Date().toISOString() : (saved?.createdAt ?? createdAt),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (await onSave(letter, asNew ? null : saved)) {
        setSaved(letter); setDraftId(letter.id);
      } else setError("这次没有保存，文字仍在这里。可以重试；如果另一窗口改过这封信，也可以另存为新信。");
    } catch { setError("这次没有保存，文字仍在这里。请稍后重试。"); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return (
    <Dialog title="给决定留一点空间" className="care-modal pause-modal" busy={pending} onClose={() => leaving ? setLeaving(null) : leave("close")}>
      <p className="care-intro">想联系对方的感受可以被看见。你可以先停一下，再按自己的意愿决定。这里写下的内容不会被发送。</p>
      <ol className="care-steps" aria-label="缓冲步骤">
        {["放下想说的话", "给自己一分钟", "选择下一步"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}>{index + 1} · {label}</li>)}
      </ol>
      <fieldset className="care-fields" disabled={pending || Boolean(leaving)}>
        <h3 ref={headingRef} tabIndex={-1}>{["此刻，你最想说什么？", "不用马上作决定", "接下来，由你决定"][step]}</h3>
        {step === 0 && <>
          <p>可以是几个词，也可以什么都不写。只要还没保存，文字就只留在这个窗口。</p>
          <label className="care-label" htmlFor="pause-message">想说的话</label>
          <textarea id="pause-message" value={body} maxLength={8000} rows={7} placeholder="如果不用担心回应，我此刻想说……" onChange={(event) => { setBody(event.target.value); setError(""); }} />
          <div className="care-count">{body.length} / 8000</div>
        </>}
        {step === 1 && <>
          <p>把脚放稳，松一松肩膀，看看身边的一样东西。可以自然呼吸，也可以直接跳过。</p>
          <div className="pause-clock">
            <span className="pause-clock-number" aria-hidden="true">{timer.remaining}<small>秒</small></span>
            <span className="sr-only" role="timer" aria-live="off">还剩 {timer.remaining} 秒</span>
            <p role="status">{timer.done ? "这一分钟结束了。无需达到任何状态。" : timer.backgroundPaused ? "离开页面时已暂停，回来后由你决定是否继续。" : "随时可以暂停，不需要等到计时结束。"}</p>
            {!timer.done && <button className="button button-secondary" onClick={timer.running ? timer.pause : timer.start}>{timer.running ? <Pause size={16} /> : <Play size={16} />}{timer.running ? "暂停这一分钟" : timer.remaining < 60 ? "继续这一分钟" : "开始这一分钟"}</button>}
            {timer.remaining < 60 && <button className="text-link timer-reset" onClick={timer.reset}>重新计时</button>}
          </div>
        </>}
        {step === 2 && <>
          <p>可以问问自己：我希望得到什么？如果回应和期待不同，我准备怎样照顾自己？此刻也可以不作决定。</p>
          <div className="care-next-options">
            <button className="care-choice" onClick={() => go(0)}><strong>再看看我写的话</strong><span>修改一下，或者给自己留一封信。</span></button>
            <button className="care-choice" onClick={() => leave("toolbox")}><strong>找一点支持</strong><span>打开我的安稳工具箱，看看愿意联系的人。</span></button>
            <button className="care-choice" onClick={() => leave("close")}><strong>先放下手机，休息一下</strong><span>回到首页，接下来按自己的节奏。</span></button>
          </div>
        </>}
        {(body.trim() || saved) && <div className="pause-save">
          <button className="button button-secondary" onClick={() => void save()} disabled={!dirty}><Mail size={16} />{pending ? "正在保存…" : saved ? "保存文字修改" : "收进不寄出的信"}</button>
          {saved && !dirty && <p role="status"><Check size={14} />已收进信箱。<button className="text-link" onClick={() => onLetter(saved.id)}>打开这封信</button></p>}
          {dirty && <small>关闭前请保存想保留的文字。</small>}
        </div>}
        {error && <div className="care-error" role="alert"><p>{error}</p>{storageError && <p>{storageError}</p>}{saved && <button className="text-link" onClick={() => void save(true)}>以当前文字另存为新信</button>}<button className="text-link draft-download" onClick={() => {
          try { downloadText(body, "缓缓-暂存的心里话.txt"); }
          catch { setError("下载暂时不可用，请先选中并复制上面的文字，文字仍保留在此窗口。"); }
        }}>先下载这份文字</button><small>下载的是未加密的文字副本，不会改变信箱里的保存状态。</small></div>}
        <div className="care-footer">
          {step > 0 && <button className="button button-ghost" onClick={() => go(step - 1)}><ArrowLeft size={16} />上一步</button>}
          {step < 2 && <button className="button button-primary" onClick={() => go(step + 1)}>{step === 0 ? (body.trim() ? "先缓一缓" : "暂时不写，继续") : "看看下一步"}<ArrowRight size={16} /></button>}
        </div>
      </fieldset>
      {leaving && <div className="confirm-panel" role="group" aria-label="离开前保留文字">
        <p>还有没保存的文字，离开后将不会保留。</p>
        <div><button className="button button-secondary" ref={cancelRef} onClick={() => setLeaving(null)}>继续留在这里</button><button className="button button-danger" onClick={() => { if (leaving === "toolbox") onToolbox(); else onClose(); }}>放下未保存的文字并离开</button></div>
      </div>}
    </Dialog>
  );
}
