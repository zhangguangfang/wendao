import { useEffect, useRef, useState } from "react";
import { Download, FileCheck2, LockKeyhole, ShieldCheck, Trash2, Upload } from "lucide-react";
import Dialog from "./Dialog";
import { createBackup, MAX_BACKUP_BYTES, parseBackup, STORAGE_KEY, type AppData } from "../storage";
import "./data-settings.css";
import { version } from "../../package.json";

type Props = {
  data: AppData;
  readBlocked: boolean;
  singleWindowOnly?: boolean;
  onImport: (incoming: AppData) => boolean | Promise<boolean>;
  onClear: () => boolean | Promise<boolean>;
  onClose: () => void;
};

function downloadText(text: string, name: string, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataSettings({ data, readBlocked, singleWindowOnly = false, onImport, onClear, onClose }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [incoming, setIncoming] = useState<{ data: AppData; name: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const readSequence = useRef(0);
  useEffect(() => () => { readSequence.current += 1; }, []);

  function exportBackup() {
    setError("");
    try {
      const date = new Date().toISOString().slice(0, 10);
      if (readBlocked) {
        const original = localStorage.getItem(STORAGE_KEY);
        if (original === null) throw new Error("没有可导出的原始记录。浏览器可能没有开放存储访问。");
        downloadText(original, `缓缓-原始记录-${date}.txt`, "text/plain");
        setMessage("已发起原始记录下载。请保留文件，里面可能包含尚未恢复的私人内容。");
      } else {
        downloadText(createBackup(data), `缓缓-备份-${date}.json`);
        setMessage("已发起备份下载，请在浏览器的下载列表中查看并妥善保管。");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "暂时无法导出，请稍后重试。");
    }
  }

  async function selectFile(file: File | undefined) {
    const sequence = ++readSequence.current;
    setIncoming(null);
    setMessage("");
    setError("");
    if (!file) return;
    setReading(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("这个文件超过 10 MB，请选择缓缓导出的备份文件。");
      const parsed = parseBackup(await file.text());
      if (sequence === readSequence.current) setIncoming({ data: parsed, name: file.name });
    } catch (cause) {
      if (sequence === readSequence.current) {
        setError(cause instanceof Error ? cause.message : "这个文件暂时无法读取，请重新选择。");
      }
    } finally {
      if (sequence === readSequence.current) setReading(false);
    }
  }

  async function importBackup() {
    if (!incoming || readBlocked || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
    if (await onImport(incoming.data)) {
      setIncoming(null);
      if (fileRef.current) fileRef.current.value = "";
      setMessage("备份已合并到此浏览器。重复的记录不会再次添加，冲突时保留这里已有的内容。");
    } else {
      setError("这次没能导入。已有记录未被替换，请处理保存提示后重试。");
    }
    } catch {
      setError("这次没能导入，备份预览和已有记录仍然保留。");
    } finally { pendingRef.current = false; setPending(false); }
  }

  async function removeAll() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      if (await onClear()) {
        readSequence.current += 1;
        setReading(false);
        setConfirmClear(false);
        setIncoming(null);
        if (fileRef.current) fileRef.current.value = "";
        setError("");
        setMessage("此浏览器中的全部记录已删除。");
      } else setError("这次没能删除，请查看浏览器保存提示。");
    } catch { setError("这次没能删除，请稍后重试。"); }
    finally { pendingRef.current = false; setPending(false); }
  }

  return (
    <Dialog title="隐私与数据" onClose={() => { if (!pendingRef.current) onClose(); }} busy={pending} className="settings-modal">
      <fieldset className="settings-fields" disabled={pending}>
      <div className="privacy-intro">
        <span className="tile-icon green"><ShieldCheck size={25} /></span>
        <h3>你的感受，由你保管。</h3>
        <p>心情、信件、小行动和安稳收藏仅保存在当前浏览器中，不会由本应用上传，也没有 AI 读取或分析。</p>
      </div>
      <div className="info-box">
        <LockKeyhole size={19} />
        <p>本地记录没有额外加密，共用设备的人可能看到。清除浏览器数据、无痕模式结束或更换设备后，记录可能无法找回。</p>
      </div>
      {singleWindowOnly && <p className="backup-blocked">当前浏览器不支持多窗口同时保存，请只在一个缓缓窗口中编辑记录。</p>}
      <div className="data-counts">
        <span><strong>{new Set(data.moods.map((mood) => mood.day ?? mood.createdAt.slice(0, 10))).size}</strong> 天心情</span>
        <span><strong>{data.letters.length}</strong> 封信件</span>
        <span><strong>{Object.values(data.actions).reduce((sum, items) => sum + items.length, 0)}</strong> 个小行动</span>
      </div>

      <section className="backup-section" aria-labelledby="backup-heading">
        <h3 id="backup-heading">给记录留一份备份</h3>
        <p>下载后可以在另一台电脑或更新后的缓缓中导入。备份含有你的私人文字，请保存在自己信任的位置。</p>
        <button className="button button-secondary" onClick={exportBackup}>
          <Download size={17} />{readBlocked ? "导出原始记录" : "下载数据备份"}
        </button>
        {readBlocked && (data.moods.length > 0 || data.letters.length > 0 || data.reliefHistory.length > 0 || Object.keys(data.actions).length > 0 || data.comfortItems.length > 0) && (
          <button className="button button-secondary readable-backup" onClick={() => {
            try { downloadText(createBackup(data), `缓缓-可读取记录备份-${new Date().toISOString().slice(0, 10)}.json`); setMessage("已发起可读取记录的备份下载，也请保留原始文件。"); }
            catch { setError("暂时无法导出这部分记录，请保留原始文件。"); }
          }}>备份可读取的记录</button>
        )}
      </section>

      <section className="backup-section" aria-labelledby="import-heading">
        <h3 id="import-heading">把记录带回来</h3>
        <p>选择缓缓导出的 JSON 备份，先查看内容数量，再决定是否导入。合并时保留已有的同一天心情和同一封信。</p>
        {readBlocked && <p className="backup-blocked">当前记录无法读取。请先导出原始文件妥善保管；只有在你选择清除这些记录之后，才能导入其他备份。</p>}
        <label className={`button button-secondary file-choice ${readBlocked ? "is-disabled" : ""}`}>
          <Upload size={17} />选择备份文件
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            aria-label="选择备份文件"
            disabled={readBlocked}
            onChange={(event) => void selectFile(event.target.files?.[0])}
          />
        </label>
        {reading && <p role="status">正在检查备份文件……</p>}
        {incoming && (
          <div className="backup-preview" role="group" aria-label="备份内容预览">
            <div className="backup-file"><FileCheck2 size={20} /><strong>{incoming.name}</strong></div>
            <p>{incoming.data.moods.length} 天心情 · {incoming.data.letters.length} 封信 · {incoming.data.reliefHistory.length} 条练习回顾</p>
            <p>{incoming.data.customActions.length} 项自定义行动 · {Object.values(incoming.data.actions).reduce((sum, items) => sum + items.length, 0)} 次行动记录</p>
            <p>{incoming.data.comfortItems.length} 项安稳收藏</p>
            <div className="backup-buttons">
              <button className="button button-primary" onClick={importBackup}>确认合并导入</button>
              <button className="button button-secondary" onClick={() => {
                setIncoming(null);
                if (fileRef.current) fileRef.current.value = "";
              }}>取消导入</button>
            </div>
          </div>
        )}
      </section>
      {error && <p className="backup-error" role="alert">{error}</p>}
      {message && <p className="backup-message" role="status">{message}</p>}

      <details className="local-update-help">
        <summary>本地更新与版本 · v{version}</summary>
        <p>Windows 用户可以在原来的“缓缓”文件夹中双击“更新缓缓.bat”。它会下载已发布的版本，校验完整性，备份旧程序，再更新到同一位置。需要网络，无需管理员权限。</p>
        <p>更新前先下载上方的数据备份，关闭缓缓网页和启动器。更新后继续使用原来的浏览器、文件路径和打开方式，核对页脚版本。</p>
        <p>如果文件夹里还没有更新入口，需要先下载一次完整运行包。程序更新不会替你同步浏览器里的私人记录。</p>
        <a href="https://github.com/zhangguangfang/wendao/blob/main/downloads/huanhuan-windows.zip" target="_blank" rel="noopener noreferrer" className="text-link">打开 GitHub 下载页面（新窗口）</a>
      </details>

      <div className="danger-zone">
        <h3>删除本地记录</h3>
        <p>清除心情、信件、小行动计划、练习回顾和安稳收藏。已下载的备份文件需要在电脑上自行删除。此操作无法撤销。</p>
        {!confirmClear ? (
          <button className="button button-danger" onClick={() => setConfirmClear(true)}><Trash2 size={16} />删除全部记录</button>
        ) : (
          <div className="confirm-panel" role="group" aria-label="确认删除全部记录">
            <strong>确定删除此浏览器中的全部记录吗？</strong>
            <div>
              <button className="button button-secondary" onClick={() => setConfirmClear(false)}>保留记录</button>
              <button className="button button-danger" onClick={removeAll}>确认全部删除</button>
            </div>
          </div>
        )}
      </div>
      </fieldset>
    </Dialog>
  );
}
