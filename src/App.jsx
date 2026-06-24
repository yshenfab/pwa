import { useState, useEffect, useRef, useCallback } from "react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Briefcase, User, BookOpen, ChevronLeft, ChevronRight, Sparkles, Calendar, Trash2, GripVertical, Bell, Volume2, X, RotateCcw, BookMarked } from "lucide-react";
import { storageGet, storageSet } from "./storage.js";
import { GRE_VOCAB } from "./vocabBank.js";
import { PASSAGE_BANK } from "./passageBank.js";
import "./app.css";

// ── 工具函数 ──
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => toKey(new Date());
const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); return toKey(new Date(y, m - 1, d + n)); };
const weekdayCN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const formatDisplay = (key) => { const [y, m, d] = key.split("-").map(Number); const dt = new Date(y, m - 1, d); return `${m}月${d}日 ${weekdayCN[dt.getDay()]}`; };
const dayIndex = (key, len) => { const [y, m, d] = key.split("-").map(Number); const epoch = Math.floor(new Date(y, m - 1, d).getTime() / 86400000); return ((epoch % len) + len) % len; };

// ── 常用任务预设 ──
const DEFAULT_PRESETS = ["跑步 5km", "普拉提", "看书 30 分钟", "冥想 10 分钟", "健身", "散步", "写日记", "整理房间", "早睡 11 点前", "喝够 8 杯水", "拉伸放松", "瑜伽"];

// ── 存储 ──
function emptyDay() { return { work: [], personal: [], englishDone: { passage: false }, carriedChecked: false }; }
async function loadDay(key) { const res = await storageGet(`day:${key}`); return res ? res.value : null; }
async function saveDay(key, data) { await storageSet(`day:${key}`, data); }

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

// ── GRE 单词逻辑 ──
function getNextReviewDate(dateKey, reviewCount) {
  return addDays(dateKey, [1, 3, 7][Math.min(reviewCount, 2)]);
}

function getDailyWords(progress, customVocab = []) {
  const today = todayKey();
  const seenIds = new Set(Object.keys(progress));

  const newWords = GRE_VOCAB
    .filter(w => !seenIds.has(String(w.id)))
    .sort((a, b) => a.tier - b.tier || a.id - b.id)
    .slice(0, 5)
    .map(w => ({ ...w, isNew: true }));

  const customReview = customVocab
    .filter(w => { const p = progress[w.id]; return p && p.reviewCount < 3 && p.nextReview <= today; })
    .sort((a, b) => progress[a.id].nextReview.localeCompare(progress[b.id].nextReview))
    .map(w => ({ ...w, isReview: true, isCustom: true }));

  const greReview = GRE_VOCAB
    .filter(w => { const p = progress[String(w.id)]; return p && p.reviewCount < 3 && p.nextReview <= today; })
    .sort((a, b) => progress[String(a.id)].nextReview.localeCompare(progress[String(b.id)].nextReview))
    .map(w => ({ ...w, isReview: true }));

  const reviewWords = [...customReview, ...greReview].slice(0, 3);
  return [...newWords, ...reviewWords];
}

async function applyVocabDecisions(decisions, existingProgress, dateKey) {
  const updated = { ...existingProgress };
  for (const [wordId, decision] of Object.entries(decisions)) {
    if (decision !== "mastered") continue;
    const p = updated[wordId];
    if (!p) {
      updated[wordId] = { firstSeen: dateKey, reviewCount: 0, nextReview: getNextReviewDate(dateKey, 0) };
    } else {
      const newCount = Math.min(p.reviewCount + 1, 3);
      updated[wordId] = { ...p, reviewCount: newCount, nextReview: newCount >= 3 ? null : getNextReviewDate(dateKey, newCount) };
    }
  }
  await storageSet("vocab_progress", updated);
  return updated;
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
      <button className="drag-handle" {...dragProps} tabIndex={-1}><GripVertical size={13} /></button>
      <button className="check" onClick={onToggle}>
        {task.done && <svg viewBox="0 0 20 20" width="13" height="13"><path d="M4 10.5L8 14L16 5.5" stroke="#FAF8F4" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
      {task.carriedOver && <span className="carried-tag">顺延</span>}
      <span className="task-text">{task.text}</span>
      {task.done && <svg className="strike" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M2 5 Q 50 2, 98 6" /></svg>}
      <button className="del" onClick={onDelete}><Trash2 size={13} /></button>
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
        <button onClick={submit}><Plus size={16} /></button>
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
        <button className="presets-edit-btn" onClick={() => setEditing(e => !e)}>{editing ? "完成" : "编辑"}</button>
      </div>
      <div className="presets-list">
        {presets.map(p => (
          <div key={p} className="preset-chip">
            <button className="preset-add" onClick={() => onAddTask(p)}><Plus size={11} /><span>{p}</span></button>
            {editing && <button className="preset-del" onClick={() => onUpdate(presets.filter(x => x !== p))}><X size={10} /></button>}
          </div>
        ))}
        {editing && <input className="preset-new-input" value={newVal} onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === "Enter" && confirmNew()} onBlur={confirmNew} placeholder="＋ 新增常用任务" autoFocus />}
      </div>
    </div>
  );
}

// ── GRE 进度条 ──
function GREProgress({ progress, customVocab }) {
  const tier1 = GRE_VOCAB.filter(w => w.tier === 1);
  const tier2 = GRE_VOCAB.filter(w => w.tier === 2);
  const t1Done = tier1.filter(w => (progress[String(w.id)]?.reviewCount ?? 0) >= 3).length;
  const t2Done = tier2.filter(w => (progress[String(w.id)]?.reviewCount ?? 0) >= 3).length;
  const cvDone = customVocab.filter(w => (progress[w.id]?.reviewCount ?? 0) >= 3).length;
  const total = tier1.length + tier2.length;
  const done = t1Done + t2Done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="gre-progress">
      <div className="gre-bar"><div className="gre-bar-fill" style={{ width: `${pct}%` }} /></div>
      <div className="gre-stats">
        <span>T1 {t1Done}/{tier1.length}</span>
        <span>T2 {t2Done}/{tier2.length}</span>
        {customVocab.length > 0 && <span>生词本 {cvDone}/{customVocab.length}</span>}
        <span className="gre-pct-label">{done}/{total} 已掌握 · {pct}%</span>
      </div>
    </div>
  );
}

// ── 翻转卡片 ──
function VocabFlipCard({ word, flipped, onClick }) {
  const speak = () => {
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(word.word);
    utt.lang = "en-US"; utt.rate = 0.88;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  };
  return (
    <div className={`vocab-flip-card ${flipped ? "flipped" : ""}`} onClick={!flipped ? onClick : undefined}>
      <div className="vocab-flip-inner">
        <div className="vocab-flip-front">
          <div className="vf-badges">
            <span className={`vf-badge ${word.isNew ? "badge-new" : "badge-review"}`}>{word.isNew ? "新词" : "复习"}</span>
            {word.isCustom ? <span className="vf-tier tier-custom">生词本</span> : <span className="vf-tier">Tier {word.tier}</span>}
          </div>
          <div className="vf-word">{word.word}</div>
          {word.phon && <div className="vf-phon">{word.phon}</div>}
          <button className="vf-speak" onClick={e => { e.stopPropagation(); speak(); }}><Volume2 size={14} /></button>
          <div className="vf-tap-hint">点击翻面查看释义</div>
        </div>
        <div className="vocab-flip-back">
          <div className="vb-word">{word.word}</div>
          <div className="vb-cn">{word.cn}</div>
          {word.root && <div className="vb-root"><span className="vb-root-label">词根</span>{word.root}</div>}
          <div className="vb-ex">"{word.ex}"</div>
          <button className="vb-speak" onClick={e => { e.stopPropagation(); speak(); }}><Volume2 size={13} /> 朗读</button>
        </div>
      </div>
    </div>
  );
}

// ── 单词卡片组 ──
function VocabDeck({ dateKey, customVocab, onProgressChange }) {
  const [progress, setProgress] = useState(null);
  const [words, setWords] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [decisions, setDecisions] = useState({});
  const [phase, setPhase] = useState("loading");

  useEffect(() => {
    setPhase("loading"); setIdx(0); setFlipped(false); setDecisions({});
    storageGet("vocab_progress").then(res => {
      const p = res ? res.value : {};
      setProgress(p);
      const w = getDailyWords(p, customVocab);
      setWords(w);
      setPhase(w.length === 0 ? "done" : "deck");
    });
  }, [dateKey, customVocab]);

  const decide = async (decision) => {
    const word = words[idx];
    const newDecisions = { ...decisions, [String(word.id)]: decision };
    setDecisions(newDecisions);
    if (idx + 1 >= words.length) {
      const updated = await applyVocabDecisions(newDecisions, progress, dateKey);
      setProgress(updated);
      onProgressChange?.(updated);
      setPhase("done");
    } else {
      setIdx(i => i + 1); setFlipped(false);
    }
  };

  const newCount = words.filter(w => w.isNew).length;
  const reviewCount = words.filter(w => w.isReview).length;
  const masteredToday = Object.values(decisions).filter(d => d === "mastered").length;

  if (phase === "loading") return <div className="vocab-deck-loading">加载单词...</div>;

  if (phase === "done") {
    const totalMastered = Object.values(progress || {}).filter(p => p?.reviewCount >= 3).length;
    return (
      <div className="vocab-done">
        <div className="vocab-done-check">✓</div>
        <div className="vocab-done-title">今日单词完成</div>
        <div className="vocab-done-sub">{words.length > 0 ? `${masteredToday} / ${words.length} 词已掌握` : "今日无新词安排"}</div>
        <div className="vocab-done-total">累计已掌握 {totalMastered} / {GRE_VOCAB.length + customVocab.length} 词</div>
      </div>
    );
  }

  const word = words[idx];
  return (
    <div className="vocab-deck">
      <div className="vocab-deck-meta">
        <div className="vocab-deck-tags">
          <span className="tag-new">{newCount} 新词</span>
          {reviewCount > 0 && <span className="tag-review">{reviewCount} 复习</span>}
        </div>
        <span className="vocab-deck-progress">{idx + 1} / {words.length}</span>
      </div>
      <VocabFlipCard word={word} flipped={flipped} onClick={() => setFlipped(true)} />
      <div className="vocab-dots">
        {words.map((w, i) => <div key={i} className={`vocab-dot ${i < idx ? "dot-done" : ""} ${i === idx ? "dot-current" : ""} ${w.isReview ? "dot-review" : ""}`} />)}
      </div>
      {flipped ? (
        <div className="vocab-actions">
          <button className="vocab-btn-retry" onClick={() => decide("retry")}><RotateCcw size={14} /> 再背一次</button>
          <button className="vocab-btn-mastered" onClick={() => decide("mastered")}>记住了 ✓</button>
        </div>
      ) : <div className="vocab-actions-placeholder" />}
    </div>
  );
}

// ── 《飘》原文 ──
function PassageBlock({ passage, done, onToggle, savedWords, onSaveWord }) {
  const [showGloss, setShowGloss] = useState(false);
  const [justSaved, setJustSaved] = useState({});

  const speak = () => {
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(passage.text);
    utt.lang = "en-US"; utt.rate = 0.88;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  };

  const handleSave = (en, cn) => {
    onSaveWord({ word: en, cn, ex: `来自《飘》· ${passage.title}` });
    setJustSaved(prev => ({ ...prev, [en]: true }));
  };

  return (
    <div className={`passage-block ${done ? "block-done" : ""}`}>
      <div className="eng-block-label">{passage.title}</div>
      <div className="passage-text">{passage.text}</div>
      <div className="passage-actions">
        <button className="speak-passage-btn" onClick={speak}><Volume2 size={12} /> 朗读</button>
        <button className="gloss-link" onClick={() => setShowGloss(s => !s)}>{showGloss ? "收起注释" : "查看注释"}</button>
      </div>
      {showGloss && (
        <div className="gloss-list">
          {passage.glossary.map(([en, cn]) => {
            const alreadySaved = savedWords.has(en) || justSaved[en];
            return (
              <div key={en} className="gloss-item">
                <span><b>{en}</b> — {cn}</span>
                <button
                  className={`save-word-btn ${alreadySaved ? "saved" : ""}`}
                  onClick={() => !alreadySaved && handleSave(en, cn)}
                  title={alreadySaved ? "已加入生词本" : "加入生词本"}
                >
                  {alreadySaved ? <BookMarked size={12} /> : <Plus size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button className={`mini-toggle ${done ? "on" : ""}`} onClick={onToggle}>
        {done ? "已读完 ✓" : "标记已读"}
      </button>
    </div>
  );
}

// ── 英语学习卡 ──
function EnglishCard({ dateKey, passage, done, onTogglePassage, customVocab, onSaveWord, onProgressChange }) {
  const savedWords = new Set(customVocab.map(w => w.word));
  return (
    <div className="eng-card">
      <div className="eng-head">
        <BookOpen size={15} />
        <span>每日英语 · GRE 备考</span>
        <Sparkles size={12} className="spark" />
      </div>
      <GREProgress progress={{}} customVocab={customVocab} />
      <VocabDeck dateKey={dateKey} customVocab={customVocab} onProgressChange={onProgressChange} />
      <div className="eng-divider" />
      <div className="eng-passage-head">《飘》原文精读</div>
      <PassageBlock passage={passage} done={done} onToggle={onTogglePassage} savedWords={savedWords} onSaveWord={onSaveWord} />
    </div>
  );
}

// 因为 GREProgress 需要 progress，从外部传入
function EnglishCardWithProgress({ dateKey, passage, done, onTogglePassage, customVocab, onSaveWord }) {
  const [progress, setProgress] = useState({});
  useEffect(() => {
    storageGet("vocab_progress").then(res => { if (res) setProgress(res.value); });
  }, [dateKey]);
  const handleProgressChange = (updated) => setProgress(updated);
  const savedWords = new Set(customVocab.map(w => w.word));
  return (
    <div className="eng-card">
      <div className="eng-head">
        <BookOpen size={15} />
        <span>每日英语 · GRE 备考</span>
        <Sparkles size={12} className="spark" />
      </div>
      <GREProgress progress={progress} customVocab={customVocab} />
      <VocabDeck dateKey={dateKey} customVocab={customVocab} onProgressChange={handleProgressChange} />
      <div className="eng-divider" />
      <div className="eng-passage-head">《飘》原文精读</div>
      <PassageBlock passage={passage} done={done} onToggle={onTogglePassage} savedWords={savedWords} onSaveWord={onSaveWord} />
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
      <Bell size={14} /><span>开启每日提醒</span>
      <input type="time" value={time} onChange={e => setTime(e.target.value)} className="notif-time-input" />
      <button className="notif-ok-btn" onClick={enable}>开启</button>
      <button className="notif-x" onClick={onDismiss}><X size={13} /></button>
    </div>
  );
}

// ── 主应用 ──
export default function App() {
  const [dateKey, setDateKey] = useState(todayKey());
  const [data, setData] = useState(emptyDay());
  const [loading, setLoading] = useState(true);
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [customVocab, setCustomVocab] = useState([]);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const idSeed = useRef(0);

  useEffect(() => {
    storageGet("presets").then(res => { if (res) setPresets(res.value); });
    storageGet("custom_vocab").then(res => { if (res) setCustomVocab(res.value); });
    if ("Notification" in window && Notification.permission === "default" && !localStorage.getItem("notif_dismissed")) setShowNotifBanner(true);
    const t = localStorage.getItem("notif_time");
    if (t && localStorage.getItem("notif_enabled") && Notification.permission === "granted") scheduleNextNotif(t);
  }, []);

  const load = useCallback(async (key) => {
    setLoading(true);
    let d = await loadDay(key);
    if (!d) d = emptyDay();
    if (!d.carriedChecked) {
      const yest = await loadDay(addDays(key, -1));
      if (yest?.work) {
        const undone = yest.work.filter(t => !t.done);
        if (undone.length > 0) {
          const existingIds = new Set(d.work.map(t => t.id));
          const carried = undone.map(t => ({ ...t, id: `co-${t.id}`, carriedOver: true })).filter(t => !existingIds.has(t.id));
          d = { ...d, work: [...carried, ...d.work], carriedChecked: true };
          await saveDay(key, d);
        } else { d = { ...d, carriedChecked: true }; }
      } else { d = { ...d, carriedChecked: true }; }
    }
    setData(d); setLoading(false);
  }, []);

  useEffect(() => { load(dateKey); }, [dateKey, load]);

  const persist = (next) => { setData(next); saveDay(dateKey, next); };
  const addTask = (col, text) => { idSeed.current += 1; persist({ ...data, [col]: [...data[col], { id: `${Date.now()}-${idSeed.current}`, text, done: false }] }); };
  const toggleTask = (col, id) => persist({ ...data, [col]: data[col].map(t => t.id === id ? { ...t, done: !t.done } : t) });
  const deleteTask = (col, id) => persist({ ...data, [col]: data[col].filter(t => t.id !== id) });
  const reorderTasks = (col, list) => persist({ ...data, [col]: list });
  const updatePresets = (next) => { setPresets(next); storageSet("presets", next); };

  const handleSaveWord = async ({ word, cn, ex }) => {
    if (customVocab.some(w => w.word === word)) return;
    const id = `cv_${Date.now()}`;
    const newWord = { id, word, cn, ex, addedDate: todayKey() };
    const newCustomVocab = [...customVocab, newWord];
    setCustomVocab(newCustomVocab);
    await storageSet("custom_vocab", newCustomVocab);
    const res = await storageGet("vocab_progress");
    const progress = res ? res.value : {};
    await storageSet("vocab_progress", { ...progress, [id]: { firstSeen: todayKey(), reviewCount: 0, nextReview: getNextReviewDate(todayKey(), 0) } });
  };

  const pIdx = dayIndex(dateKey, PASSAGE_BANK.length);
  const totalTasks = data.work.length + data.personal.length;
  const doneTasks = data.work.filter(t => t.done).length + data.personal.filter(t => t.done).length;
  const passageDone = data.englishDone?.passage ? 1 : 0;
  const pct = (totalTasks + 1) ? Math.round(((doneTasks + passageDone) / (totalTasks + 1)) * 100) : 0;
  const isToday = dateKey === todayKey();

  return (
    <div className="app-root">
      {showNotifBanner && <NotifBanner onDismiss={() => { setShowNotifBanner(false); localStorage.setItem("notif_dismissed", "1"); }} />}
      <header className="top">
        <div className="top-left">
          <div className="eyebrow">每日记录</div>
          <h1>{formatDisplay(dateKey)}</h1>
        </div>
        <div className="date-nav">
          <button onClick={() => setDateKey(addDays(dateKey, -1))}><ChevronLeft size={16} /></button>
          {!isToday && <button className="today-btn" onClick={() => setDateKey(todayKey())}><Calendar size={12} /> 回到今天</button>}
          <button onClick={() => setDateKey(addDays(dateKey, 1))}><ChevronRight size={16} /></button>
        </div>
      </header>
      <div className="progress-bar-wrap">
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <span className="progress-label">{doneTasks + passageDone}/{totalTasks + 1} 完成 · {pct}%</span>
      </div>
      {loading ? <div className="loading-state">加载中...</div> : (
        <>
          <div className="columns">
            <TaskColumn icon={<Briefcase size={14} />} label="工作任务" accent="#1F2A44" tasks={data.work} onAdd={t => addTask("work", t)} onToggle={id => toggleTask("work", id)} onDelete={id => deleteTask("work", id)} onReorder={l => reorderTasks("work", l)} />
            <TaskColumn icon={<User size={14} />} label="个人安排" accent="#D97757" tasks={data.personal} onAdd={t => addTask("personal", t)} onToggle={id => toggleTask("personal", id)} onDelete={id => deleteTask("personal", id)} onReorder={l => reorderTasks("personal", l)} />
          </div>
          <PresetsPanel presets={presets} onAddTask={t => addTask("personal", t)} onUpdate={updatePresets} />
          <EnglishCardWithProgress
            dateKey={dateKey}
            passage={PASSAGE_BANK[pIdx]}
            done={data.englishDone?.passage}
            onTogglePassage={() => persist({ ...data, englishDone: { ...data.englishDone, passage: !data.englishDone?.passage } })}
            customVocab={customVocab}
            onSaveWord={handleSaveWord}
          />
        </>
      )}
    </div>
  );
}
