import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Briefcase, User, BookOpen, ChevronLeft, ChevronRight, Sparkles, Calendar, Trash2 } from "lucide-react";
import { storageGet, storageSet } from "./storage.js";
import "./app.css";

// ---------- 工具函数 ----------
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => toKey(new Date());
const addDays = (key, n) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return toKey(dt);
};
const weekdayCN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const formatDisplay = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${m}月${d}日 ${weekdayCN[dt.getDay()]}`;
};

// ---------- 英语学习内容库(可循环复用,按日期取模) ----------
const VOCAB_BANK = [
  { word: "ubiquitous", phon: "/juːˈbɪkwɪtəs/", cn: "无处不在的", ex: "Smartphones have become ubiquitous in modern life." },
  { word: "meticulous", phon: "/məˈtɪkjələs/", cn: "一丝不苟的", ex: "She is meticulous about every detail in her manuscript." },
  { word: "ambiguous", phon: "/æmˈbɪɡjuəs/", cn: "模糊不清的", ex: "The results were ambiguous and required further validation." },
  { word: "elucidate", phon: "/ɪˈluːsɪdeɪt/", cn: "阐明,解释", ex: "The author elucidates the mechanism in the discussion section." },
  { word: "robust", phon: "/roʊˈbʌst/", cn: "稳健的,可靠的", ex: "The model showed robust performance across all test conditions." },
  { word: "discrepancy", phon: "/dɪˈskrɛpənsi/", cn: "差异,不一致", ex: "There is a discrepancy between the predicted and observed values." },
  { word: "intricate", phon: "/ˈɪntrɪkət/", cn: "复杂精细的", ex: "The signaling pathway is far more intricate than initially thought." },
  { word: "plausible", phon: "/ˈplɔːzəbəl/", cn: "看似合理的", ex: "This is the most plausible explanation for the observed effect." },
  { word: "consolidate", phon: "/kənˈsɑːlɪdeɪt/", cn: "巩固,合并", ex: "Sleep helps consolidate memories formed during the day." },
  { word: "underscore", phon: "/ˈʌndərskɔːr/", cn: "强调,突出", ex: "These findings underscore the importance of early intervention." },
  { word: "feasible", phon: "/ˈfiːzəbəl/", cn: "可行的", ex: "It remains feasible to scale up this synthesis route." },
  { word: "deteriorate", phon: "/dɪˈtɪriəreɪt/", cn: "恶化", ex: "Renal function began to deteriorate after the third week." },
  { word: "stringent", phon: "/ˈstrɪndʒənt/", cn: "严格的", ex: "Regulatory agencies enforce stringent safety standards." },
  { word: "versatile", phon: "/ˈvɜːrsətaɪl/", cn: "多功能的", ex: "CRBN ligands are versatile tools in degrader design." },
  { word: "compelling", phon: "/kəmˈpɛlɪŋ/", cn: "令人信服的", ex: "The data presents a compelling case for further trials." },
];

const PASSAGE_BANK = [
  {
    title: "On Deep Work",
    text: "The ability to concentrate without distraction on a cognitively demanding task is becoming increasingly rare, and increasingly valuable. Those who cultivate this skill, and then make it the core of their working life, will thrive.",
    glossary: [["cognitively demanding", "需要高度认知投入的"], ["cultivate", "培养"], ["thrive", "蓬勃发展"]],
  },
  {
    title: "On Scientific Writing",
    text: "Good scientific writing is not about sounding clever. It is about removing every obstacle between the data and the reader's understanding. Clarity is a form of generosity toward whoever reads your work next.",
    glossary: [["obstacle", "障碍"], ["clarity", "清晰"], ["generosity", "慷慨,大方"]],
  },
  {
    title: "On Small Habits",
    text: "It is easy to overestimate the importance of one defining moment and underestimate the value of making small improvements on a daily basis. The difference a tiny habit makes may seem insignificant at first, but it compounds over time.",
    glossary: [["overestimate", "高估"], ["compound", "复合增长,累积"], ["insignificant", "微不足道的"]],
  },
  {
    title: "On Resilience",
    text: "Resilience is not the absence of difficulty, but the capacity to keep moving forward in its presence. The people we admire most are rarely those who never struggled, but those who kept going anyway.",
    glossary: [["resilience", "韧性"], ["capacity", "能力"], ["admire", "钦佩"]],
  },
  {
    title: "On Curiosity",
    text: "Curiosity is the quiet engine behind every discovery. It does not announce itself loudly; it simply keeps asking one more question, long after most people would have stopped.",
    glossary: [["engine", "引擎,驱动力"], ["announce", "宣告"], ["discovery", "发现"]],
  },
];

const dayIndex = (key, len) => {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const epoch = Math.floor(dt.getTime() / 86400000);
  return ((epoch % len) + len) % len;
};

function emptyDay() {
  return { work: [], personal: [], englishDone: { vocab: false, passage: false } };
}

async function loadDay(key) {
  const res = await storageGet(`day:${key}`);
  return res ? res.value : null;
}
async function saveDay(key, data) {
  await storageSet(`day:${key}`, data);
}

// ---------- 小组件 ----------
function TaskRow({ task, onToggle, onDelete }) {
  return (
    <div className={`task-row ${task.done ? "done" : ""}`}>
      <button className="check" onClick={onToggle} aria-label={task.done ? "标记未完成" : "标记完成"}>
        {task.done && (
          <svg viewBox="0 0 20 20" width="13" height="13">
            <path d="M4 10.5L8 14L16 5.5" stroke="#FAF8F4" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <span className="task-text">{task.text}</span>
      {task.done && <svg className="strike" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M2 5 Q 50 2, 98 6" /></svg>}
      <button className="del" onClick={onDelete} aria-label="删除"><Trash2 size={13} /></button>
    </div>
  );
}

function TaskColumn({ icon, label, accent, tasks, onAdd, onToggle, onDelete }) {
  const [val, setVal] = useState("");
  const inputRef = useRef(null);
  const submit = () => {
    const v = val.trim();
    if (!v) return;
    onAdd(v);
    setVal("");
    inputRef.current?.focus();
  };
  const doneCount = tasks.filter((t) => t.done).length;
  return (
    <div className="col" style={{ "--accent": accent }}>
      <div className="col-head">
        <div className="col-title">
          {icon}
          <span>{label}</span>
        </div>
        <span className="col-count">{doneCount}/{tasks.length}</span>
      </div>
      <div className="col-list">
        {tasks.length === 0 && <div className="empty-hint">还没有安排,添加第一项吧</div>}
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onToggle={() => onToggle(t.id)} onDelete={() => onDelete(t.id)} />
        ))}
      </div>
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

function EnglishCard({ vocab, passage, done, onToggleVocab, onTogglePassage }) {
  const [showGloss, setShowGloss] = useState(false);
  return (
    <div className="eng-card">
      <div className="eng-head">
        <BookOpen size={15} />
        <span>每日英语</span>
        <Sparkles size={12} className="spark" />
      </div>
      <div className="eng-grid">
        <div className={`eng-block ${done.vocab ? "block-done" : ""}`}>
          <div className="eng-block-label">今日单词</div>
          <div className="vocab-word">{vocab.word}</div>
          <div className="vocab-phon">{vocab.phon} · {vocab.cn}</div>
          <div className="vocab-ex">"{vocab.ex}"</div>
          <button className={`mini-toggle ${done.vocab ? "on" : ""}`} onClick={onToggleVocab}>
            {done.vocab ? "已掌握 ✓" : "标记已背"}
          </button>
        </div>
        <div className={`eng-block ${done.passage ? "block-done" : ""}`}>
          <div className="eng-block-label">今日短文 · {passage.title}</div>
          <div className="passage-text">{passage.text}</div>
          <button className="gloss-link" onClick={() => setShowGloss((s) => !s)}>
            {showGloss ? "收起生词" : "查看生词"}
          </button>
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

// ---------- 主应用 ----------
export default function App() {
  const [dateKey, setDateKey] = useState(todayKey());
  const [data, setData] = useState(emptyDay());
  const [loading, setLoading] = useState(true);
  const idSeed = useRef(0);

  const load = useCallback(async (key) => {
    setLoading(true);
    const d = await loadDay(key);
    setData(d || emptyDay());
    setLoading(false);
  }, []);

  useEffect(() => { load(dateKey); }, [dateKey, load]);

  const persist = (next) => {
    setData(next);
    saveDay(dateKey, next);
  };

  const addTask = (col, text) => {
    idSeed.current += 1;
    const task = { id: `${Date.now()}-${idSeed.current}`, text, done: false };
    persist({ ...data, [col]: [...data[col], task] });
  };
  const toggleTask = (col, id) => {
    persist({ ...data, [col]: data[col].map((t) => (t.id === id ? { ...t, done: !t.done } : t)) });
  };
  const deleteTask = (col, id) => {
    persist({ ...data, [col]: data[col].filter((t) => t.id !== id) });
  };
  const toggleEnglish = (field) => {
    persist({ ...data, englishDone: { ...data.englishDone, [field]: !data.englishDone[field] } });
  };

  const vIdx = dayIndex(dateKey, VOCAB_BANK.length);
  const pIdx = dayIndex(dateKey, PASSAGE_BANK.length);
  const vocab = VOCAB_BANK[vIdx];
  const passage = PASSAGE_BANK[pIdx];

  const totalTasks = data.work.length + data.personal.length;
  const doneTasks = data.work.filter((t) => t.done).length + data.personal.filter((t) => t.done).length;
  const engDoneCount = (data.englishDone.vocab ? 1 : 0) + (data.englishDone.passage ? 1 : 0);
  const overallTotal = totalTasks + 2;
  const overallDone = doneTasks + engDoneCount;
  const pct = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0;

  const isToday = dateKey === todayKey();

  return (
    <div className="app-root">
      <header className="top">
        <div className="top-left">
          <div className="eyebrow">每日记录</div>
          <h1>{formatDisplay(dateKey)}</h1>
        </div>
        <div className="date-nav">
          <button onClick={() => setDateKey(addDays(dateKey, -1))} aria-label="前一天"><ChevronLeft size={16} /></button>
          {!isToday && <button className="today-btn" onClick={() => setDateKey(todayKey())}><Calendar size={12} /> 回到今天</button>}
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
              icon={<Briefcase size={14} />}
              label="工作任务"
              accent="#1F2A44"
              tasks={data.work}
              onAdd={(t) => addTask("work", t)}
              onToggle={(id) => toggleTask("work", id)}
              onDelete={(id) => deleteTask("work", id)}
            />
            <TaskColumn
              icon={<User size={14} />}
              label="个人安排"
              accent="#D97757"
              tasks={data.personal}
              onAdd={(t) => addTask("personal", t)}
              onToggle={(id) => toggleTask("personal", id)}
              onDelete={(id) => deleteTask("personal", id)}
            />
          </div>

          <EnglishCard
            vocab={vocab}
            passage={passage}
            done={data.englishDone}
            onToggleVocab={() => toggleEnglish("vocab")}
            onTogglePassage={() => toggleEnglish("passage")}
          />
        </>
      )}
    </div>
  );
}
