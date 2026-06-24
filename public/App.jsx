import { useState, useEffect, useRef, useCallback } from "react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus, Briefcase, User, BookOpen, ChevronLeft, ChevronRight,
  Sparkles, Calendar, Trash2, GripVertical, Bell, Volume2, X,
} from "lucide-react";
import { storageGet, storageSet } from "./storage.js";
import "./app.css";

// ── 工具函数 ──
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => toKey(new Date());
const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  return toKey(new Date(y, m - 1, d + n));
};
const weekdayCN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const formatDisplay = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}月${d}日 ${weekdayCN[dt.getDay()]}`;
};
const dayIndex = (key, len) => {
  const [y, m, d] = key.split("-").map(Number);
  const epoch = Math.floor(new Date(y, m - 1, d).getTime() / 86400000);
  return ((epoch % len) + len) % len;
};

// ── 单词库 ──
const VOCAB_BANK = [
  { word: "ubiquitous",   phon: "/juːˈbɪkwɪtəs/",  cn: "无处不在的",   ex: "Smartphones have become ubiquitous in modern life." },
  { word: "meticulous",   phon: "/məˈtɪkjələs/",    cn: "一丝不苟的",   ex: "She is meticulous about every detail in her manuscript." },
  { word: "ambiguous",    phon: "/æmˈbɪɡjuəs/",     cn: "模糊不清的",   ex: "The results were ambiguous and required further validation." },
  { word: "elucidate",    phon: "/ɪˈluːsɪdeɪt/",    cn: "阐明，解释",   ex: "The author elucidates the mechanism in the discussion section." },
  { word: "robust",       phon: "/roʊˈbʌst/",        cn: "稳健的，可靠的", ex: "The model showed robust performance across all test conditions." },
  { word: "discrepancy",  phon: "/dɪˈskrɛpənsi/",   cn: "差异，不一致", ex: "There is a discrepancy between the predicted and observed values." },
  { word: "intricate",    phon: "/ˈɪntrɪkət/",       cn: "复杂精细的",   ex: "The signaling pathway is far more intricate than initially thought." },
  { word: "plausible",    phon: "/ˈplɔːzəbəl/",      cn: "看似合理的",   ex: "This is the most plausible explanation for the observed effect." },
  { word: "consolidate",  phon: "/kənˈsɑːlɪdeɪt/",  cn: "巩固，合并",   ex: "Sleep helps consolidate memories formed during the day." },
  { word: "underscore",   phon: "/ˈʌndərskɔːr/",     cn: "强调，突出",   ex: "These findings underscore the importance of early intervention." },
  { word: "feasible",     phon: "/ˈfiːzəbəl/",       cn: "可行的",       ex: "It remains feasible to scale up this synthesis route." },
  { word: "deteriorate",  phon: "/dɪˈtɪriəreɪt/",   cn: "恶化",         ex: "Renal function began to deteriorate after the third week." },
  { word: "stringent",    phon: "/ˈstrɪndʒənt/",     cn: "严格的",       ex: "Regulatory agencies enforce stringent safety standards." },
  { word: "versatile",    phon: "/ˈvɜːrsətaɪl/",     cn: "多功能的",     ex: "CRBN ligands are versatile tools in degrader design." },
  { word: "compelling",   phon: "/kəmˈpɛlɪŋ/",       cn: "令人信服的",   ex: "The data presents a compelling case for further trials." },
  { word: "eloquent",     phon: "/ˈɛləkwənt/",       cn: "雄辩的，有说服力的", ex: "Her eloquent speech moved the entire audience." },
  { word: "tenacious",    phon: "/təˈneɪʃəs/",       cn: "坚韧的，顽强的", ex: "She was tenacious in her pursuit of justice." },
  { word: "pragmatic",    phon: "/præɡˈmætɪk/",      cn: "务实的",       ex: "A pragmatic approach often yields better results than idealism." },
  { word: "candid",       phon: "/ˈkændɪd/",         cn: "坦诚的，直率的", ex: "I appreciate your candid feedback on my proposal." },
  { word: "resilient",    phon: "/rɪˈzɪliənt/",      cn: "有韧性的，迅速恢复的", ex: "Children are often more resilient than adults expect." },
];

// ── 《飘》原文节选 ──
const PASSAGE_BANK = [
  {
    title: "《飘》· 第一章",
    text: "Scarlett O'Hara was not beautiful, but men seldom realized it when caught by her charm as the Tarleton twins were. In her face were too sharply blended the delicate features of her mother, a Coast aristocrat of French descent, and the heavy ones of her florid Irish father.",
    glossary: [
      ["seldom", "很少，不常"],
      ["charm", "魅力"],
      ["aristocrat", "贵族"],
      ["florid", "红润的；华丽的"],
      ["descent", "血统，出身"],
    ],
  },
  {
    title: "《飘》· 斯嘉丽的虚荣",
    text: "The world could end and Scarlett would still find it necessary to have the neatest waist and the most becoming bonnet. It was the one vanity she could not overcome, the need to be the most attractive woman in any room she entered.",
    glossary: [
      ["becoming", "合适的，相称的"],
      ["bonnet", "女帽"],
      ["vanity", "虚荣心"],
      ["overcome", "克服"],
      ["attractive", "有吸引力的"],
    ],
  },
  {
    title: "《飘》· 战争阴云",
    text: "She had never had enough sense to be afraid. What most people called courage was nothing but ignorance of danger. And she had always been too willful to see past the end of her nose.",
    glossary: [
      ["courage", "勇气"],
      ["ignorance", "无知"],
      ["willful", "任性的，固执的"],
      ["see past the end of her nose", "目光短浅"],
    ],
  },
  {
    title: "《飘》· 上帝为证",
    text: "As God is my witness, they're not going to lick me. I'm going to live through this, and when it's all over, I'll never be hungry again. No, nor any of my folk. If I have to lie, steal, cheat or kill, as God is my witness, I'll never be hungry again.",
    glossary: [
      ["witness", "见证人"],
      ["lick", "（口语）击败"],
      ["live through", "挺过，度过"],
      ["folk", "家人，族人"],
    ],
  },
  {
    title: "《飘》· 瑞特·巴特勒",
    text: "Rhett Butler was not disturbed by any of the threats the town made concerning him. He returned their cold stares with a cool insolence that infuriated them. He had no intention of leaving until he was good and ready.",
    glossary: [
      ["insolence", "傲慢，无礼"],
      ["infuriate", "激怒"],
      ["intention", "意图，打算"],
      ["stare", "凝视，盯着看"],
    ],
  },
  {
    title: "《飘》· 封存的记忆",
    text: "She knew then that she had never forgotten nor forgiven. She had merely put it all away in the back of her mind in a secret place that she had tried never to unlock. But the lock was broken now and the memories were tumbling out.",
    glossary: [
      ["forgiven", "原谅（forgive 过去分词）"],
      ["merely", "仅仅，只是"],
      ["tumbling out", "涌出，倾泻而出"],
      ["unlock", "打开，解锁"],
    ],
  },
  {
    title: "《飘》· 向前走",
    text: "Life was not easy, nor was it just, but it had to be lived, and there was no time for repining. One simply did what one had to do, and kept one's chin up and one's eyes ahead.",
    glossary: [
      ["repining", "抱怨，忧郁"],
      ["chin up", "振作精神"],
      ["simply", "只是，不过"],
      ["ahead", "向前"],
    ],
  },
  {
    title: "《飘》· 内心的骄傲",
    text: "She had learned that in a hard school. Pride was something you kept inside you, for your own sustenance when the world went wrong. It was not something you wore on your face for the world to see.",
    glossary: [
      ["sustenance", "支撑，慰藉"],
      ["hard school", "艰难的人生历练"],
      ["wore on your face", "挂在脸上，外露"],
      ["pride", "自尊，骄傲"],
    ],
  },
  {
    title: "《飘》· 塔拉的土地",
    text: "The red Georgia clay of Tara was in her blood. It was there in her stubborn refusal to accept defeat, in her determination to cling to the land no matter what the cost.",
    glossary: [
      ["clay", "黏土，泥土"],
      ["stubborn", "顽固的，坚定的"],
      ["refusal", "拒绝"],
      ["determination", "决心"],
      ["cling to", "紧抓，坚守"],
    ],
  },
  {
    title: "《飘》· 明天又是新的一天",
    text: "She would think of it all tomorrow, at Tara. She could stand it then. Tomorrow, I'll think of some way to get him back. After all, tomorrow is another day.",
    glossary: [
      ["after all", "毕竟，终究"],
      ["stand it", "承受，忍受"],
      ["some way", "某种方法"],
      ["tomorrow is another day", "明天又是新的一天"],
    ],
  },
];

// ── 常用个人任务预设 ──
const DEFAULT_PRESETS = [
  "跑步 5km", "普拉提", "看书 30 分钟", "冥想 10 分钟",
  "健身", "散步", "写日记", "整理房间",
  "早睡 11 点前", "喝够 8 杯水", "拉伸放松", "瑜伽",
];

// ── 存储 ──
function emptyDay() {
  return { work: [], personal: [], englishDone: { vocab: false, passage: false }, carriedChecked: false };
}
async function loadDay(key) {
  const res = await storageGet(`day:${key}`);
  return res ? res.value : null;
}
async function saveDay(key, data) {
  await storageSet(`day:${key}`, data);
}

// ── 通知调度 ──
let notifTimer = null;
function scheduleNextNotif(timeStr) {
  if (notifTimer) clearTimeout(notifTimer);
  const [h, m] = timeStr.split(":").map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const ms = target - now;
  notifTimer = setTimeout(() => {
    new Notification("每日任务", {
      body: "今天的任务和英语学习等你来完成！",
      icon: "/icons/icon-192.png",
    });
    scheduleNextNotif(timeStr);
  }, ms);
}

// ── SortableTaskRow ──
function SortableTaskRow({ task, onToggle, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <TaskRow task={task} onToggle={onToggle} onDelete={onDelete} dragProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

// ── TaskRow ──
function TaskRow({ task, onToggle, onDelete, dragProps }) {
  return (
    <div className={`task-row ${task.done ? "done" : ""}`}>
      <button className="drag-handle" {...dragProps} aria-label="拖动排序" tabIndex={-1}>
        <GripVertical size={13} />
      </button>
      <button className="check" onClick={onToggle} aria-label={task.done ? "标记未完成" : "标记完成"}>
        {task.done && (
          <svg viewBox="0 0 20 20" width="13" height="13">
            <path d="M4 10.5L8 14L16 5.5" stroke="#FAF8F4" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {task.carriedOver && <span className="carried-tag">顺延</span>}
      <span className="task-text">{task.text}</span>
      {task.done && (
        <svg className="strike" viewBox="0 0 100 10" preserveAspectRatio="none">
          <path d="M2 5 Q 50 2, 98 6" />
        </svg>
      )}
      <button className="del" onClick={onDelete} aria-label="删除"><Trash2 size={13} /></button>
    </div>
  );
}

// ── TaskColumn ──
function TaskColumn({ icon, label, accent, tasks, onAdd, onToggle, onDelete, onReorder }) {
  const [val, setVal] = useState("");
  const inputRef = useRef(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const submit = () => {
    const v = val.trim();
    if (!v) return;
    onAdd(v);
    setVal("");
    inputRef.current?.focus();
  };

  const handleDragEnd = ({ active, over }) => {
    if (over && active.id !== over.id) {
      const oldIdx = tasks.findIndex((t) => t.id === active.id);
      const newIdx = tasks.findIndex((t) => t.id === over.id);
      onReorder(arrayMove(tasks, oldIdx, newIdx));
    }
  };

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="col" style={{ "--accent": accent }}>
      <div className="col-head">
        <div className="col-title">{icon}<span>{label}</span></div>
        <span className="col-count">{doneCount}/{tasks.length}</span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="col-list">
            {tasks.length === 0 && <div className="empty-hint">还没有安排，添加第一项吧</div>}
            {tasks.map((t) => (
              <SortableTaskRow
                key={t.id}
                task={t}
                onToggle={() => onToggle(t.id)}
                onDelete={() => onDelete(t.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <div className="add-row">
        <input
          ref={inputRef}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={`添加${label}...`}
        />
        <button onClick={submit}><Plus size={16} /></button>
      </div>
    </div>
  );
}

// ── PresetsPanel ──
function PresetsPanel({ presets, onAddTask, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [newVal, setNewVal] = useState("");

  const confirmNew = () => {
    const v = newVal.trim();
    if (!v || presets.includes(v)) return;
    onUpdate([...presets, v]);
    setNewVal("");
  };

  return (
    <div className="presets-panel">
      <div className="presets-head">
        <span className="presets-title">常用个人任务</span>
        <button className="presets-edit-btn" onClick={() => setEditing((e) => !e)}>
          {editing ? "完成" : "编辑"}
        </button>
      </div>
      <div className="presets-list">
        {presets.map((p) => (
          <div key={p} className="preset-chip">
            <button className="preset-add" onClick={() => onAddTask(p)}>
              <Plus size={11} />
              <span>{p}</span>
            </button>
            {editing && (
              <button
                className="preset-del"
                onClick={() => onUpdate(presets.filter((x) => x !== p))}
                aria-label="删除"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
        {editing && (
          <input
            className="preset-new-input"
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmNew()}
            onBlur={confirmNew}
            placeholder="＋ 新增常用任务"
            autoFocus
          />
        )}
      </div>
    </div>
  );
}

// ── EnglishCard ──
function EnglishCard({ vocab, passage, done, onToggleVocab, onTogglePassage }) {
  const [showGloss, setShowGloss] = useState(false);

  const speak = (text, lang = "en-US") => {
    if (!window.speechSynthesis) return;
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = lang;
    utt.rate = 0.88;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
  };

  return (
    <div className="eng-card">
      <div className="eng-head">
        <BookOpen size={15} />
        <span>每日英语 · 《飘》原文</span>
        <Sparkles size={12} className="spark" />
      </div>
      <div className="eng-grid">
        {/* 单词块 */}
        <div className={`eng-block ${done.vocab ? "block-done" : ""}`}>
          <div className="eng-block-label">今日单词</div>
          <div className="vocab-word-row">
            <div className="vocab-word">{vocab.word}</div>
            <button className="speak-btn" onClick={() => speak(vocab.word)} aria-label="朗读单词">
              <Volume2 size={14} />
            </button>
          </div>
          <div className="vocab-phon">{vocab.phon} · {vocab.cn}</div>
          <div className="vocab-ex">"{vocab.ex}"</div>
          <button className={`mini-toggle ${done.vocab ? "on" : ""}`} onClick={onToggleVocab}>
            {done.vocab ? "已掌握 ✓" : "标记已背"}
          </button>
        </div>
        {/* 原文块 */}
        <div className={`eng-block ${done.passage ? "block-done" : ""}`}>
          <div className="eng-block-label">{passage.title}</div>
          <div className="passage-text">{passage.text}</div>
          <div className="passage-actions">
            <button className="speak-passage-btn" onClick={() => speak(passage.text)} aria-label="朗读原文">
              <Volume2 size={12} /> 朗读
            </button>
            <button className="gloss-link" onClick={() => setShowGloss((s) => !s)}>
              {showGloss ? "收起注释" : "查看注释"}
            </button>
          </div>
          {showGloss && (
            <div className="gloss-list">
              {passage.glossary.map(([en, cn]) => (
                <div key={en} className="gloss-item"><b>{en}</b> — {cn}</div>
              ))}
            </div>
          )}
          <button className={`mini-toggle ${done.passage ? "on" : ""}`} onClick={onTogglePassage}>
            {done.passage ? "已读完 ✓" : "标记已读"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 通知 Banner ──
function NotifBanner({ onDismiss }) {
  const [time, setTime] = useState("09:00");

  const enable = async () => {
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      localStorage.setItem("notif_time", time);
      localStorage.setItem("notif_enabled", "1");
      scheduleNextNotif(time);
    }
    onDismiss();
  };

  return (
    <div className="notif-banner">
      <Bell size={14} />
      <span>开启每日提醒</span>
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="notif-time-input"
      />
      <button className="notif-ok-btn" onClick={enable}>开启</button>
      <button className="notif-x" onClick={onDismiss} aria-label="关闭"><X size={13} /></button>
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
  const idSeed = useRef(0);

  // 初始化：加载预设、通知设置
  useEffect(() => {
    storageGet("presets").then((res) => {
      if (res) setPresets(res.value);
    });
    if ("Notification" in window && Notification.permission === "default") {
      if (!localStorage.getItem("notif_dismissed")) setShowNotifBanner(true);
    }
    const notifTime = localStorage.getItem("notif_time");
    if (notifTime && localStorage.getItem("notif_enabled") && Notification.permission === "granted") {
      scheduleNextNotif(notifTime);
    }
  }, []);

  const load = useCallback(async (key) => {
    setLoading(true);
    let d = await loadDay(key);
    if (!d) d = emptyDay();

    // 顺延昨日未完成的工作任务
    if (!d.carriedChecked) {
      const yesterKey = addDays(key, -1);
      const yest = await loadDay(yesterKey);
      if (yest?.work) {
        const undone = yest.work.filter((t) => !t.done);
        if (undone.length > 0) {
          const existingIds = new Set(d.work.map((t) => t.id));
          const carried = undone
            .map((t) => ({ ...t, id: `co-${t.id}`, carriedOver: true }))
            .filter((t) => !existingIds.has(t.id));
          d = { ...d, work: [...carried, ...d.work], carriedChecked: true };
          await saveDay(key, d);
        } else {
          d = { ...d, carriedChecked: true };
        }
      } else {
        d = { ...d, carriedChecked: true };
      }
    }

    setData(d);
    setLoading(false);
  }, []);

  useEffect(() => { load(dateKey); }, [dateKey, load]);

  const persist = (next) => { setData(next); saveDay(dateKey, next); };

  const addTask = (col, text) => {
    idSeed.current += 1;
    const task = { id: `${Date.now()}-${idSeed.current}`, text, done: false };
    persist({ ...data, [col]: [...data[col], task] });
  };
  const toggleTask = (col, id) =>
    persist({ ...data, [col]: data[col].map((t) => (t.id === id ? { ...t, done: !t.done } : t)) });
  const deleteTask = (col, id) =>
    persist({ ...data, [col]: data[col].filter((t) => t.id !== id) });
  const reorderTasks = (col, newList) =>
    persist({ ...data, [col]: newList });
  const toggleEnglish = (field) =>
    persist({ ...data, englishDone: { ...data.englishDone, [field]: !data.englishDone[field] } });

  const updatePresets = (next) => {
    setPresets(next);
    storageSet("presets", next);
  };

  const vIdx = dayIndex(dateKey, VOCAB_BANK.length);
  const pIdx = dayIndex(dateKey, PASSAGE_BANK.length);

  const totalTasks = data.work.length + data.personal.length;
  const doneTasks =
    data.work.filter((t) => t.done).length + data.personal.filter((t) => t.done).length;
  const engDone = (data.englishDone.vocab ? 1 : 0) + (data.englishDone.passage ? 1 : 0);
  const overallTotal = totalTasks + 2;
  const overallDone = doneTasks + engDone;
  const pct = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0;
  const isToday = dateKey === todayKey();

  return (
    <div className="app-root">
      {showNotifBanner && (
        <NotifBanner onDismiss={() => {
          setShowNotifBanner(false);
          localStorage.setItem("notif_dismissed", "1");
        }} />
      )}

      <header className="top">
        <div className="top-left">
          <div className="eyebrow">每日记录</div>
          <h1>{formatDisplay(dateKey)}</h1>
        </div>
        <div className="date-nav">
          <button onClick={() => setDateKey(addDays(dateKey, -1))} aria-label="前一天"><ChevronLeft size={16} /></button>
          {!isToday && (
            <button className="today-btn" onClick={() => setDateKey(todayKey())}>
              <Calendar size={12} /> 回到今天
            </button>
          )}
          <button onClick={() => setDateKey(addDays(dateKey, 1))} aria-label="后一天"><ChevronRight size={16} /></button>
        </div>
      </header>

      <div className="progress-bar-wrap">
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        <span className="progress-label">{overallDone}/{overallTotal} 完成 · {pct}%</span>
      </div>

      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : (
        <>
          <div className="columns">
            <TaskColumn
              icon={<Briefcase size={14} />} label="工作任务" accent="#1F2A44"
              tasks={data.work}
              onAdd={(t) => addTask("work", t)}
              onToggle={(id) => toggleTask("work", id)}
              onDelete={(id) => deleteTask("work", id)}
              onReorder={(list) => reorderTasks("work", list)}
            />
            <TaskColumn
              icon={<User size={14} />} label="个人安排" accent="#D97757"
              tasks={data.personal}
              onAdd={(t) => addTask("personal", t)}
              onToggle={(id) => toggleTask("personal", id)}
              onDelete={(id) => deleteTask("personal", id)}
              onReorder={(list) => reorderTasks("personal", list)}
            />
          </div>

          <PresetsPanel
            presets={presets}
            onAddTask={(t) => addTask("personal", t)}
            onUpdate={updatePresets}
          />

          <EnglishCard
            vocab={VOCAB_BANK[vIdx]}
            passage={PASSAGE_BANK[pIdx]}
            done={data.englishDone}
            onToggleVocab={() => toggleEnglish("vocab")}
            onTogglePassage={() => toggleEnglish("passage")}
          />
        </>
      )}
    </div>
  );
}
