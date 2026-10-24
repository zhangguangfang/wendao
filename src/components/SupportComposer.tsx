import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Copy, Download, MessageCircle } from 'lucide-react';
import Dialog from './Dialog';
import type { ComfortItem } from '../types';
import { sameRecord } from '../records';
import { downloadText } from '../download';
import './interaction.css';

const templates = [
  { title: '想有人听一听', body: '我最近有些难受，你方便听我说一会儿吗？我现在更需要有人听，不急着找解决办法。如果今天不方便，我们也可以约另一个时间。' },
  { title: '想有人陪一会儿', body: '我今天有点难熬。如果你有空，愿意陪我散散步或聊一会儿吗？不方便也没关系，告诉我一个合适的时间就好。' },
  { title: '需要具体帮助', body: '我最近状态不太好，有件事想请你帮忙：____。你方便吗？如果不方便，也可以直接告诉我。' },
];
export default function SupportComposer({ contact, currentContact, onClose, onBack }: { contact: ComfortItem; currentContact?: ComfortItem; onClose: () => void; onBack: () => void }) {
  const [selected, setSelected] = useState(0);
  const [body, setBody] = useState(templates[0].body);
  const [baseline, setBaseline] = useState(templates[0].body);
  const [kept, setKept] = useState<string>();
  const [confirmation, setConfirmation] = useState<'replace' | 'close' | 'back' | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const previousConfirmation = useRef<typeof confirmation>(null);
  const dirty = body !== baseline && body !== kept;
  const changed = !sameRecord(contact, currentContact);
  useLayoutEffect(() => {
    if (confirmation) cancel.current?.focus();
    else if (previousConfirmation.current) input.current?.focus();
    previousConfirmation.current = confirmation;
  }, [confirmation]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);
  function replace() { setBody(templates[selected].body); setBaseline(templates[selected].body); setConfirmation(null); setError(''); setMessage('已放入编辑框，可以按自己的语气修改。'); input.current?.focus(); }
  function leave(destination: 'close' | 'back') {
    if (pendingRef.current) return;
    if (dirty) setConfirmation(destination); else if (destination === 'back') onBack(); else onClose();
  }
  async function copy() {
    if (pendingRef.current || !body.trim()) return;
    pendingRef.current = true; setPending(true); setMessage(''); setError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(body);
      setKept(body); setMessage('已经复制。请到你选择的聊天工具中粘贴、检查，再决定是否发送。');
    } catch {
      setError('浏览器没有允许复制。请选中文字手动复制（Windows 可按 Ctrl+C），或下载文字副本。');
      // Focus after pending is released; the textarea is disabled during copying.
    } finally { pendingRef.current = false; setPending(false); }
  }
  useEffect(() => { if (error && !pending) { input.current?.focus(); input.current?.select(); } }, [error, pending]);
  return <Dialog title="准备一句求助的话" className="care-modal support-composer" busy={pending} onClose={() => confirmation ? setConfirmation(null) : leave('close')}>
    <p className="care-intro">想向“{contact.title}”开口时，可以先准备一句符合自己语气的话。这里不会发送消息。</p>
    {changed && <p className="care-error" role="status">这位支持者的收藏已在另一个窗口修改或移除。下面保留打开时的线索，文字草稿不变；返回工具箱可以查看最新内容。</p>}
    <fieldset className="care-fields" disabled={pending || Boolean(confirmation)}>
      {contact.body && <details className="support-clue"><summary>查看我留下的联系线索</summary><p>{contact.body}</p></details>}
      <div className="support-needs" role="group" aria-label="此刻想怎样被支持">{templates.map((item, index) => <button key={item.title} aria-pressed={selected === index} onClick={() => setSelected(index)}>{item.title}</button>)}</div>
      <div className="support-template"><MessageCircle size={20} aria-hidden="true" /><p>{templates[selected].body}</p><button className="text-link" onClick={() => { if (body !== baseline && body.trim()) setConfirmation('replace'); else replace(); }}>把这段话放入编辑框</button></div>
      <label className="care-label" htmlFor="support-message-draft">按自己的语气改一改</label>
      <textarea ref={input} id="support-message-draft" value={body} maxLength={2000} rows={7} onChange={(event) => { setBody(event.target.value); setError(''); setMessage(''); }} />
      <div className="care-count">{body.length} / 2000</div>
      {body.includes('____') && <p className="care-small">复制前，记得把“____”换成希望对方帮忙的具体小事。</p>}
      <div className="care-footer"><button className="button button-secondary" disabled={!body.trim()} onClick={() => {
        try { downloadText(body, '缓缓-准备求助的话.txt'); setMessage('已发起文字副本下载，请确认下载列表中已有文件。副本未加密，请妥善保管。'); setError(''); }
        catch { setError('下载暂时不可用，请先选中文字手动复制。'); }
      }}><Download size={16} />下载文字</button><button className="button button-primary" disabled={!body.trim()} onClick={() => void copy()}><Copy size={16} />{pending ? '正在复制…' : '复制这段话'}</button></div>
      <button className="text-link composer-back" onClick={() => leave('back')}>返回安稳工具箱</button>
    </fieldset>
    {message && <p className="care-message" role="status">{message}</p>}
    {error && <p className="care-error" role="alert">{error}</p>}
    {confirmation && <div className="confirm-panel" role="group" aria-label={confirmation === 'replace' ? '替换前保留文字' : '离开前保留求助草稿'}>
      <p>{confirmation === 'replace' ? '编辑框里有你改过的文字。要用选中的话术替换吗？' : '你修改的文字还没有复制或下载，离开后不会保留。'}</p>
      <div><button ref={cancel} className="button button-secondary" onClick={() => { setConfirmation(null); input.current?.focus(); }}>继续编辑</button><button className="button button-danger" onClick={() => {
        if (confirmation === 'replace') replace(); else if (confirmation === 'back') onBack(); else onClose();
      }}>{confirmation === 'replace' ? '确认替换文字' : '放弃这份草稿并离开'}</button></div>
    </div>}
    <p className="care-small">文字只留在当前窗口，复制和下载由你发起。对方暂时没空时，也可以寻找另一位支持者。</p>
  </Dialog>;
}
