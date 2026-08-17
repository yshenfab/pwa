import { useRef, useState } from "react";
import { X, Download, Upload } from "lucide-react";
import { storageExportAll, storageImportAll } from "./storage.js";
import { todayKey } from "./dateUtils.js";

export default function Settings({ settings, onChange, onClose }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");

  const setNum = (key, val, min, max) => {
    const n = parseInt(val, 10);
    if (Number.isNaN(n)) return;
    onChange({ ...settings, [key]: Math.max(min, Math.min(max, n)) });
  };

  const exportData = async () => {
    try {
      const data = await storageExportAll();
      const payload = { app: "daily-tasks-english", version: 1, exportedAt: new Date().toISOString(), data };
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `单词任务备份-${todayKey()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMsg("已导出备份文件");
    } catch (e) {
      setMsg("导出失败：" + e.message);
    }
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed.data || parsed; // 兼容直接是 data 的备份
        if (!data || typeof data !== "object") throw new Error("文件格式不对");
        if (!window.confirm("导入会用备份覆盖当前所有数据（任务、单词进度等），确定继续吗？")) return;
        await storageImportAll(data);
        setMsg("导入成功，正在刷新…");
        setTimeout(() => window.location.reload(), 600);
      } catch (err) {
        setMsg("导入失败：" + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="cal-backdrop" onClick={onClose}>
      <div className="set-modal" onClick={(e) => e.stopPropagation()}>
        <div className="set-head">
          <span>设置</span>
          <button type="button" className="set-x" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="set-section">
          <label className="set-row">
            <span>每天新学单词数</span>
            <input type="number" min="1" max="50" value={settings.dailyNew} onChange={(e) => setNum("dailyNew", e.target.value, 1, 50)} />
          </label>
          <label className="set-row">
            <span>每天复习上限</span>
            <input type="number" min="10" max="200" value={settings.reviewCap} onChange={(e) => setNum("reviewCap", e.target.value, 10, 200)} />
          </label>
          <div className="set-hint">复习堆积太多时，每天最多安排这么多，其余自动顺延到之后。</div>
        </div>

        <div className="set-section">
          <div className="set-sub">数据备份</div>
          <div className="set-hint">数据只存在本机浏览器，换设备或清缓存会丢失，建议定期导出。</div>
          <div className="set-btn-row">
            <button type="button" className="set-btn" onClick={exportData}><Download size={15} /> 导出备份</button>
            <button type="button" className="set-btn" onClick={() => fileRef.current?.click()}><Upload size={15} /> 导入备份</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={importData} />
        </div>

        {msg && <div className="set-msg">{msg}</div>}
      </div>
    </div>
  );
}
