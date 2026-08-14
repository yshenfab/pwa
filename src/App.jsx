import { useState, useEffect, useRef, useCallback } from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Briefcase, User, BookOpen, ChevronLeft, ChevronRight, Sparkles, Calendar, CalendarDays, Trash2, GripVertical, Bell, X } from "lucide-react";
import { storageGet, storageSet, storageList } from "./storage.js";
import { addDays, formatDisplay, todayKey, pad } from "./dateUtils.js";
import { getStudyQueue, getMasteredCount, getLearnedCount } from "./learningLogic.js";
import { VOCAB } from "./vocabBank.js";
import StudyMode from "./StudyMode.jsx";
import "./app.css";

// ── 常用任务预设 ──
const DEFAULT_PRESETS = ["跑步 5km", "普拉提", "看书 30 分钟", "冥想 10 分钟", "健身", "散步", "写日记", "整理房间", "早睡 11 点前", "喝够 8 杯水", "拉伸放松", "瑜伽"];
// ── 每天默认的个人安排（新的一天自动带上；删除后当天不再出现）──
const DEFAULT_PERSONAL = ["看书 30 分钟", "喝够 8 杯水", "拉伸放松", "背单词", "早睡 11 点前"];

// ── 存储 ──
function emptyDay() { return { work: [], personal: [], englishDone: { vocab: false }, carriedChecked: false }; }
function normalizeDay(day) {
  return {
    ...emptyDay(),
    ...day,
    englishDone: { vocab: false, ...(day?.englishDone || {}) },
  };
}
async function loadDay(key) { const res = await storageGet(`day:${key}`); return res ? res.value : null; }
async function saveDay(key, data) { return storageSet(`day:${key}`, data); }

// ── 通知 ──
let notifTimer = null;
function scheduleNextNotif(timeStr) {
  if (notifTimer) clearTimeout(notifTimer);
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date(), target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  notifTimer = setTimeout(() => {
    new Notification("每日任务", { body: "今天的任务和英语学习等你来完成！", icon: "/icons/icon-192.png" });
    scheduleNextNotif(timeStr);
  }, target - now);
}

// ── 任务组件 ──
function SortableTaskRow({ task, onToggle, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}>
      <TaskRow task={task} onToggle={onToggle} onDelete={onDelete} dragProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete, dragProps }) {
  return (
    <div className={`task-row ${task.done ? "done" : ""}`}>
      <button type="button" className="drag-handle" aria-label="拖动排序" {...dragProps} tabIndex={-1}><GripVertical size={13} /></button>
      <button type="button" className="check" aria-label={task.done ? "标记为未完成" : "标记为完成"} onClick={onToggle}>
        {task.done && <svg viewBox="0 0 20 20" width="13" height="13"><path d="M4 10.5L8 14L16 5.5" stroke="#FAF8F4" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
      {task.carriedOver && <span className="carried-tag">顺延</span>}
      <span className="task-text">{task.text}</span>
      {task.done && <svg className="strike" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M2 5 Q 50 2, 98 6" /></svg>}
      <button type="button" className="del" aria-label="删除任务" onClick={onDelete}><Trash2 size={13} /></button>
    </div>
  );
}

function TaskColumn({ icon, label, accent, tasks, onAdd, onToggle, onDelete, onReorder }) {
  const [val, setVal] = useState("");
  const inputRef = useRef(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );
  const submit = () => { const v = val.trim(); if (!v) return; onAdd(v); setVal(""); inputRef.current?.focus(); };
  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) onReorder(arrayMove(tasks, tasks.findIndex(t => t.id === active.id), tasks.findIndex(t => t.id === over.id)));
  };
  const doneCount = tasks.filter(t => t.done).length;
  return (
    <div className="col" style={{ "--accent": accent }}>
      <div className="col-head">
        <div className="col-title">{icon}<span>{label}</span></div>
        <span className="col-count">{doneCount}/{tasks.length}</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="col-list">
            {tasks.length === 0 && <div className="empty-hint">还没有安排，添加第一项吧</div>}
            {tasks.map(t => <SortableTaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />)}
          </div>
        </SortableContext>
      </DndContext>
      <div className="add-row">
        <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && submit()} placeholder={`添加${label}...`} />
        <button type="button" aria-label={`添加${label}`} onClick={submit}><Plus size={16} /></button>
      </div>
    </div>
  );
}

function PresetsPanel({ presets, onAddTask, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [newVal, setNewVal] = useState("");
  const confirmNew = () => { const v = newVal.trim(); if (!v || presets.includes(v)) return; onUpdate([...presets, v]); setNewVal(""); };
  return (
    <div className="presets-panel">
      <div className="presets-head">
        <span className="presets-title">常用个人任务</span>
        <button type="button" className="presets-edit-btn" onClick={() => setEditing(e => !e)}>{editing ? "完成" : "编辑"}</button>
      </div>
      <div className="presets-list">
        {presets.map(p => (
          <div key={p} className="preset-chip">
            <button type="button" className="preset-add" onClick={() => onAddTask(p)}><Plus size={11} /><span>{p}</span></button>
            {editing && <button type="button" className="preset-del" aria-label={`删除常用任务 ${p}`} onClick={() => onUpdate(presets.filter(x => x !== p))}><X size={10} /></button>}
          </div>
        ))}
        {editing && <input className="preset-new-input" value={newVal} onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmNew()} onBlur={confirmNew} placeholder="＋ 新增常用任务" autoFocus />}
      </div>
    </div>
  );
}

// ── 每日单词卡片（今日：摘要 + 打开全屏背单词 + 测试成绩；往日：当日学习记录）──
function VocabCard({ dateKey, isToday, onAfterStudy }) {
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dayRec, setDayRec] = useState(null);
  const load = useCallback(() => {
    storageGet("vocab_progress").then((res) => setProgress(res ? res.value : {}));
    storageGet(`vocab_day:${dateKey}`).then((res) => setDayRec(res ? res.value : { studied: [], test: null }));
  }, [dateKey]);
  useEffect(() => { load(); }, [load]);

  const todayK = todayKey();
  const queue = progress ? getStudyQueue({ vocab: VOCAB, progress, todayK }) : [];
  const reviews = queue.filter((w) => w.isReview).length;
  const news = queue.filter((w) => w.isNew).length;
  const mastered = progress ? getMasteredCount(progress) : 0;
  const learned = progress ? getLearnedCount(progress) : 0;
  const todo = reviews + news;
  const testRec = dayRec?.test;
  const studied = dayRec?.studied || [];

  return (
    <div className="eng-card">
      <div className="eng-head">
        <BookOpen size={15} />
        <span>每日单词 · 日常英语</span>
        <Sparkles size={12} className="spark" />
      </div>

      {isToday ? (
        <div className="vc-body">
          <div className="vc-stats">
            <div className="vc-stat"><b className="c-review">{reviews}</b><span>待复习</span></div>
            <div className="vc-stat"><b className="c-new">{news}</b><span>新词</span></div>
            <div className="vc-stat"><b className="c-done">{mastered}</b><span>已掌握</span></div>
          </div>
          <button type="button" className="vc-start" onClick={() => setOpen(true)}>
            {todo ? `开始背单词 (${todo})` : "复习 / 测试 →"}
          </button>
          <div className={`vc-test-line ${testRec ? "on" : ""}`}>
            <span>📝 今日测试</span>
            {testRec ? <b>已完成 · {testRec.correct}/{testRec.total} · {testRec.pct}%</b> : <em>未测试</em>}
          </div>
          <div className="vc-sub">累计已学 {learned} / {VOCAB.length} 词</div>
        </div>
      ) : (
        <div className="vc-body">
          <div className="vc-hist-head">当日学习记录{studied.length ? `（${studied.length} 词）` : ""}</div>
          {studied.length ? (
            <div className="vc-hist-words">
              {studied.map((w) => <span key={w.id} className="vc-chip">{w.word}<i>{w.cn}</i></span>)}
            </div>
          ) : <div className="vc-hist-empty">那天没有背单词</div>}
          <div className={`vc-test-line ${testRec ? "on" : ""}`}>
            <span>📝 单词测试</span>
            {testRec ? <b>{testRec.correct}/{testRec.total} · {testRec.pct}%</b> : <em>未测试</em>}
          </div>
        </div>
      )}

      {open && (
        <StudyMode
          onClose={() => { setOpen(false); load(); }}
          onAfterStudy={() => { onAfterStudy?.(); load(); }}
        />
      )}
    </div>
  );
}

// ── 通知 Banner ──
function NotifBanner({ onDismiss }) {
  const [time, setTime] = useState("09:00");
  const enable = async () => {
    const perm = await Notification.requestPermission();
    if (perm === "granted") { localStorage.setItem("notif_time", time); localStorage.setItem("notif_enabled", "1"); scheduleNextNotif(time); }
    onDismiss();
  };
  return (
    <div className="notif-banner">
      <Bell size={14} /><span>开启应用内每日提醒</span>
      <input type="time" value={time} onChange={e => setTime(e.target.value)} className="notif-time-input" />
      <button type="button" className="notif-ok-btn" onClick={enable}>开启</button>
      <button type="button" className="notif-x" aria-label="关闭提醒提示" onClick={onDismiss}><X size={13} /></button>
    </div>
  );
}

// ── 日历（选日期查看当天记录）──
function CalendarModal({ selected, onPick, onClose }) {
  const [ym, setYm] = useState(() => { const [y, m] = selected.split("-").map(Number); return { y, m }; });
  const [active, setActive] = useState(new Set());
  useEffect(() => {
    Promise.all([storageList("day:"), storageList("vocab_day:")]).then(([a, b]) => {
      const s = new Set();
      (a?.keys || []).forEach((k) => s.add(String(k).slice(4)));
      (b?.keys || []).forEach((k) => s.add(String(k).slice(10)));
      setActive(s);
    });
  }, []);

  const daysInMonth = new Date(ym.y, ym.m, 0).getDate();
  const startDow = new Date(ym.y, ym.m - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const todayK = todayKey();
  const keyFor = (d) => `${ym.y}-${pad(ym.m)}-${pad(d)}`;
  const prev = () => setYm(({ y, m }) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 }));
  const next = () => setYm(({ y, m }) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 }));

  return (
    <div className="cal-backdrop" onClick={onClose}>
      <div className="cal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-head">
          <button type="button" aria-label="上个月" onClick={prev}><ChevronLeft size={18} /></button>
          <span>{ym.y} 年 {ym.m} 月</span>
          <button type="button" aria-label="下个月" onClick={next}><ChevronRight size={18} /></button>
        </div>
        <div className="cal-grid cal-dow">
          {["日", "一", "二", "三", "四", "五", "六"].map((d) => <span key={d} className="cal-dowcell">{d}</span>)}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (d === null) return <span key={i} className="cal-cell empty" />;
            const k = keyFor(d);
            const cls = ["cal-cell"];
            if (k === selected) cls.push("selected");
            else if (k === todayK) cls.push("today");
            if (active.has(k)) cls.push("has");
            return (
              <button type="button" key={i} className={cls.join(" ")} onClick={() => { onPick(k); onClose(); }}>
                {d}{active.has(k) && <i className="cal-dot" />}
              </button>
            );
          })}
        </div>
        <div className="cal-foot">
          <button type="button" className="cal-today-btn" onClick={() => { onPick(todayK); onClose(); }}>回到今天</button>
          <button type="button" className="cal-close-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}

// ── 主应用 ──
export default function App() {
  const [dateKey, setDateKey] = useState(todayKey());
  const [data, setData] = useState(emptyDay());
  const [loading, setLoading] = useState(true);
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [showCalendar, setShowCalendar] = useState(false);
  const idSeed = useRef(0);

  useEffect(() => {
    storageGet("presets").then(res => { if (res) setPresets(res.value); });
    if ("Notification" in window && Notification.permission === "default" && !localStorage.getItem("notif_dismissed")) setShowNotifBanner(true);
    const t = localStorage.getItem("notif_time");
    if (t && localStorage.getItem("notif_enabled") && Notification.permission === "granted") scheduleNextNotif(t);
  }, []);

  const load = useCallback(async (key) => {
    setLoading(true);
    const raw = await loadDay(key);
    const isNewDay = !raw;
    let d = normalizeDay(raw);
    if (isNewDay && d.personal.length === 0) {
      d = { ...d, personal: DEFAULT_PERSONAL.map((text, i) => ({ id: `def-${key}-${i}`, text, done: false })) };
    }
    if (!d.carriedChecked) {
      const yest = await loadDay(addDays(key, -1));
      if (yest?.work) {
        const undone = yest.work.filter(t => !t.done);
        if (undone.length > 0) {
          const existingIds = new Set(d.work.map(t => t.id));
          const carried = undone.map(t => ({ ...t, id: `co-${t.id}`, carriedOver: true })).filter(t => !existingIds.has(t.id));
          d = { ...d, work: [...carried, ...d.work], carriedChecked: true };
        } else { d = { ...d, carriedChecked: true }; }
      } else { d = { ...d, carriedChecked: true }; }
      const saved = await saveDay(key, d);
      if (!saved) setStorageError("任务顺延保存失败，请检查浏览器存储权限。");
    }
    setData(d); setLoading(false);
  }, []);

  useEffect(() => { load(dateKey); }, [dateKey, load]);

  const persist = useCallback((nextOrUpdater) => {
    setData(prev => {
      const next = typeof nextOrUpdater === "function" ? nextOrUpdater(prev) : nextOrUpdater;
      saveDay(dateKey, next).then(saved => {
        if (!saved) setStorageError("保存失败，请检查浏览器存储权限。");
        else setStorageError("");
      });
      return next;
    });
  }, [dateKey]);

  const addTask = (col, text) => {
    idSeed.current += 1;
    persist(prev => ({ ...prev, [col]: [...prev[col], { id: `${Date.now()}-${idSeed.current}`, text, done: false }] }));
  };
  const toggleTask = (col, id) => persist(prev => ({ ...prev, [col]: prev[col].map(t => t.id === id ? { ...t, done: !t.done } : t) }));
  const deleteTask = (col, id) => persist(prev => ({ ...prev, [col]: prev[col].filter(t => t.id !== id) }));
  const reorderTasks = (col, list) => persist(prev => ({ ...prev, [col]: list }));
  const updatePresets = async (next) => {
    setPresets(next);
    const saved = await storageSet("presets", next);
    if (!saved) setStorageError("常用任务保存失败，请检查浏览器存储权限。");
    else setStorageError("");
  };

  const markVocabDone = useCallback(() => {
    persist(prev => {
      const personal = prev.personal.map(t => (t.text === "背单词" && !t.done ? { ...t, done: true } : t));
      const changed = !prev.englishDone?.vocab || personal.some((t, i) => t !== prev.personal[i]);
      if (!changed) return prev;
      return { ...prev, englishDone: { ...prev.englishDone, vocab: true }, personal };
    });
  }, [persist]);

  const totalTasks = data.work.length + data.personal.length;
  const doneTasks = data.work.filter(t => t.done).length + data.personal.filter(t => t.done).length;
  const vocabDone = data.englishDone?.vocab ? 1 : 0;
  const totalUnits = totalTasks + 1;
  const doneUnits = doneTasks + vocabDone;
  const pct = totalUnits ? Math.round((doneUnits / totalUnits) * 100) : 0;
  const isToday = dateKey === todayKey();

  return (
    <div className="app-root">
      {showNotifBanner && <NotifBanner onDismiss={() => { setShowNotifBanner(false); localStorage.setItem("notif_dismissed", "1"); }} />}
      {storageError && <div className="storage-error" role="alert">{storageError}</div>}
      <header className="top">
        <div className="top-left">
          <div className="eyebrow">每日记录</div>
          <h1>{formatDisplay(dateKey)}</h1>
        </div>
        <div className="date-nav">
          <button type="button" aria-label="打开日历" onClick={() => setShowCalendar(true)}><CalendarDays size={16} /></button>
          <button type="button" aria-label="前一天" onClick={() => setDateKey(addDays(dateKey, -1))}><ChevronLeft size={16} /></button>
          {!isToday && <button type="button" className="today-btn" onClick={() => setDateKey(todayKey())}><Calendar size={12} /> 回到今天</button>}
          <button type="button" aria-label="后一天" onClick={() => setDateKey(addDays(dateKey, 1))}><ChevronRight size={16} /></button>
        </div>
      </header>
      {showCalendar && <CalendarModal selected={dateKey} onPick={setDateKey} onClose={() => setShowCalendar(false)} />}
      <div className="progress-bar-wrap">
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <span className="progress-label">{doneUnits}/{totalUnits} 完成 · {pct}%</span>
      </div>
      {loading ? <div className="loading-state">加载中...</div> : (
        <>
          <div className="columns">
            <TaskColumn icon={<Briefcase size={14} />} label="工作任务" accent="#1F2A44" tasks={data.work} onAdd={t => addTask("work", t)} onToggle={id => toggleTask("work", id)} onDelete={id => deleteTask("work", id)} onReorder={l => reorderTasks("work", l)} />
            <TaskColumn icon={<User size={14} />} label="个人安排" accent="#D97757" tasks={data.personal} onAdd={t => addTask("personal", t)} onToggle={id => toggleTask("personal", id)} onDelete={id => deleteTask("personal", id)} onReorder={l => reorderTasks("personal", l)} />
          </div>
          <PresetsPanel presets={presets} onAddTask={t => addTask("personal", t)} onUpdate={updatePresets} />
          <VocabCard dateKey={dateKey} isToday={isToday} onAfterStudy={markVocabDone} />
        </>
      )}
    </div>
  );
}
