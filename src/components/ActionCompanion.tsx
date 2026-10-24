import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Pause, Play, Sprout } from 'lucide-react';
import Dialog from './Dialog';
import { dayKey } from '../storage';
import { setGuidedCompletion, stepsForAction, type GuidedAction } from '../guidedActions';
import { usePauseTimer } from '../usePauseTimer';
import type { AppData } from '../types';
import './interaction.css';

type Props = { action: GuidedAction; data: AppData; today: string; onUpdate: (update: (data: AppData) => AppData) => Promise<boolean>; onClose: () => void; onBack: () => void; storageError: string | null };
export default function ActionCompanion({ action, data, today, onUpdate, onClose, onBack, storageError }: Props) {
  const steps = stepsForAction(action);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<Record<number, 'tried' | 'skipped'>>({});
  const [recordDay, setRecordDay] = useState<string>();
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const timer = usePauseTimer();
  const shownDay = recordDay ?? today;
  const recorded = (data.actions[shownDay] ?? []).includes(action.id);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    if (!pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);
  function move(next: number) { timer.pause(); setStep(next); }
  function visit(state: 'tried' | 'skipped') { setVisited((old) => ({ ...old, [step]: state })); move(step + 1); }
  async function record(value: boolean) {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(''); setMessage(''); timer.pause();
    const day = value ? dayKey() : shownDay;
    let detail = '';
    try {
      const saved = await onUpdate((previous) => {
        try { return setGuidedCompletion(previous, action, day, value); }
        catch (cause) { detail = cause instanceof Error ? cause.message : ''; throw cause; }
      });
      if (saved) { setRecordDay(day); setMessage(value ? `已记在 ${day} 的小行动里。今天同一件事只记一次。` : `已撤销 ${day} 的这条完成记录。计划仍保留。`); }
      else setError(detail || '这次没能保存，步骤仍保留。请查看提示后重试。');
    } catch { setError('这次没能保存，步骤仍保留，请重试。'); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return <Dialog title="陪你做一件小事" className="care-modal action-companion" busy={pending} onClose={() => { if (!pendingRef.current) onClose(); }}>
    <p className="care-intro">{action.title} · 一步一步来，也可以随时跳过或停下。</p>
    <fieldset className="care-fields" disabled={pending}>
      <ol className="action-step-nav" aria-label="小行动步骤">{steps.map((item, index) => <li key={item.title}><button aria-current={step === index ? 'step' : undefined} onClick={() => move(index)}><span>{visited[index] === 'tried' ? <Check size={14} aria-hidden="true" /> : index + 1}</span>{item.title}<small>{visited[index] === 'tried' ? '已尝试' : visited[index] === 'skipped' ? '已跳过' : '可选择'}</small></button></li>)}</ol>
      <p className="care-small">已查看 {Object.keys(visited).length} / {steps.length} 步 · 步骤和计时不会自动生成完成记录。</p>
      <section className="companion-step">
        <Sprout size={26} aria-hidden="true" />
        <h3 ref={heading} tabIndex={-1}>{step < steps.length ? steps[step].title : '这件小事，由你来确认'}</h3>
        <p>{step < steps.length ? steps[step].detail : '如果你觉得今天已经照顾了自己一点，可以记录；还没做或暂时停下，也没有关系。'}</p>
      </section>
      {step < steps.length && <div className="care-footer">
        {step > 0 && <button className="button button-ghost" onClick={() => move(step - 1)}><ArrowLeft size={16} />上一步</button>}
        <button className="button button-secondary" onClick={() => visit('skipped')}>跳过这一步</button>
        <button className="button button-primary" onClick={() => visit('tried')}>试过这一步了 <ArrowRight size={16} /></button>
      </div>}
      <details className="companion-timer"><summary>想留一点时间？打开一分钟计时</summary>
        <p>可以自然地做这件事。切到后台会暂停，回来后由你决定是否继续。</p>
        <span role="timer" aria-live="off">还剩 {timer.remaining} 秒</span>
        <button className="button button-secondary" disabled={timer.done} onClick={timer.running ? timer.pause : timer.start}>{timer.running ? <Pause size={16} /> : <Play size={16} />}{timer.done ? '这一分钟结束了' : timer.running ? '暂停计时' : timer.remaining < 60 ? '继续计时' : '开始计时'}</button>
        {timer.backgroundPaused && <p role="status">离开页面时已暂停。</p>}
        {timer.remaining < 60 && <button className="text-link timer-reset" onClick={timer.reset}>重新计时</button>}
      </details>
      <div className="companion-record">
        <p>{recorded ? `${shownDay} 已有这件小事的完成记录。` : '觉得今天做到了，再亲手记下来。无需完成所有步骤。'}</p>
        {recorded ? <button className="button button-secondary" onClick={() => void record(false)}>撤销这条完成记录</button> : <button className="button button-primary" onClick={() => void record(true)}><Check size={16} />将这件小事记为完成</button>}
        <button className="text-link" onClick={() => { if (!pendingRef.current) onBack(); }}>回到行动计划</button>
      </div>
    </fieldset>
    {message && <p className="care-message" role="status">{message}</p>}
    {error && <div className="care-error" role="alert"><p>{error}</p>{storageError && storageError !== error && <p>{storageError}</p>}</div>}
    <p className="care-small">未记录的步骤只留在本次窗口，关闭后可以重新开始。</p>
  </Dialog>;
}
