import { useEffect, useMemo, useState } from "react";
import { X, Volume2, RotateCcw, LayoutGrid, GraduationCap, BookOpen, ArrowLeft } from "lucide-react";
import { storageGet, storageSet } from "./storage.js";
import { todayKey } from "./dateUtils.js";
import { VOCAB, THEME_ORDER } from "./vocabBank.js";
import {
  DAILY_NEW_DEFAULT, applyGrade, getStudyQueue, getThemeStats,
  getMasteredCount, getLearnedCount, buildTest,
} from "./learningLogic.js";

function speak(text) {
  if (!window.speechSynthesis || !text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

const GRADES = [
  { g: 0, label: "忘了", sub: "<1天", cls: "g-forgot" },
  { g: 1, label: "模糊", sub: "短间隔", cls: "g-vague" },
  { g: 2, label: "记得", sub: "正常", cls: "g-good" },
  { g: 3, label: "简单", sub: "长间隔", cls: "g-easy" },
];

export default function StudyMode({ onClose, onAfterStudy }) {
  const todayK = todayKey();
  const [progress, setProgress] = useState(null);
  const [backup, setBackup] = useState({ date: todayK, words: {} });
  const [tab, setTab] = useState("learn");

  // 学习会话
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | deck | done
  const [sessionTheme, setSessionTheme] = useState(null);
  const [masteredThisSession, setMasteredThisSession] = useState(0);

  // 测试会话
  const [test, setTest] = useState({ phase: "intro" }); // intro | quiz | result

  useEffect(() => {
    let alive = true;
    Promise.all([storageGet("vocab_progress"), storageGet("vocab_today_backup")]).then(([p, b]) => {
      if (!alive) return;
      setProgress(p ? p.value : {});
      const bk = b && b.value && b.value.date === todayK ? b.value : { date: todayK, words: {} };
      setBackup(bk);
    });
    return () => { alive = false; };
  }, [todayK]);

  const saveProgress = async (next) => {
    setProgress(next);
    await storageSet("vocab_progress", next);
  };
  const saveBackup = async (next) => {
    setBackup(next);
    await storageSet("vocab_today_backup", next);
  };

  const stats = useMemo(
    () => (progress ? getThemeStats({ vocab: VOCAB, progress, todayK, themeOrder: THEME_ORDER }) : []),
    [progress, todayK],
  );
  const todayQueue = useMemo(
    () => (progress ? getStudyQueue({ vocab: VOCAB, progress, todayK }) : []),
    [progress, todayK],
  );
  const hasBackup = backup && backup.date === todayK && Object.keys(backup.words).length > 0;

  // ── 学习 ──
  const startStudy = (theme = null) => {
    const q = getStudyQueue({ vocab: VOCAB, progress, dailyNew: DAILY_NEW_DEFAULT, theme, todayK });
    if (!q.length) {
      window.alert(theme ? "这个主题今天没有要学的了 🎉" : "今天没有需要学习的单词啦 🎉");
      return;
    }
    setQueue(q);
    setIdx(0);
    setFlipped(false);
    setSessionTheme(theme);
    setMasteredThisSession(0);
    setPhase("deck");
    setTab("learn");
  };

  const grade = async (g) => {
    const w = queue[idx];
    // 快照（供“重置今日”）：null 表示学习前是新词
    const nextBackup = { date: todayK, words: { ...backup.words } };
    if (!(w.id in nextBackup.words)) nextBackup.words[w.id] = progress[w.id] || null;
    const nextProgress = { ...progress, [w.id]: applyGrade(progress[w.id], g, todayK) };
    await saveProgress(nextProgress);
    await saveBackup(nextBackup);
    if (g >= 2) setMasteredThisSession((n) => n + 1);
    speak(w.word);

    let q = queue;
    if (g <= 1) q = [...queue, { ...w, isNew: false, isReview: true, _requeued: true }]; // 忘了/模糊：稍后再来一次
    if (idx + 1 >= q.length) {
      setPhase("done");
      onAfterStudy?.();
    } else {
      setQueue(q);
      setIdx(idx + 1);
      setFlipped(false);
    }
  };

  const resetToday = async () => {
    if (!hasBackup) return;
    const n = Object.keys(backup.words).length;
    if (!window.confirm(`重置今日学习？\n今天学过/复习过的 ${n} 个单词会恢复到今天开始前的状态。`)) return;
    const next = { ...progress };
    for (const [id, prev] of Object.entries(backup.words)) {
      if (prev === null) delete next[id];
      else next[id] = prev;
    }
    await saveProgress(next);
    await saveBackup({ date: todayK, words: {} });
    setPhase("idle");
    setQueue([]);
  };

  // ── 测试 ──
  const startTest = (scope) => {
    const qs = buildTest({ vocab: VOCAB, progress, scope, todayK });
    if (!qs.length) {
      window.alert(scope === "today" ? "今天还没有可测的内容，先去学习吧" : "还没有已学的单词");
      return;
    }
    setTest({ phase: "quiz", qs, qi: 0, answered: false, chosen: null, correct: 0, wrong: [], scope });
  };
  const answerTest = (i) => {
    if (test.answered) return;
    const q = test.qs[test.qi];
    const ok = q.options[i] === q.correct;
    speak(q.word.word);
    setTest((t) => ({
      ...t, answered: true, chosen: i,
      correct: t.correct + (ok ? 1 : 0),
      wrong: ok ? t.wrong : [...t.wrong, q],
    }));
  };
  const nextTest = () => {
    setTest((t) => {
      if (t.qi + 1 >= t.qs.length) return { ...t, phase: "result" };
      return { ...t, qi: t.qi + 1, answered: false, chosen: null };
    });
  };

  if (!progress) {
    return (
      <div className="sm-overlay">
        <div className="sm-loading">加载中…</div>
      </div>
    );
  }

  const learnedTotal = getLearnedCount(progress);
  const masteredTotal = getMasteredCount(progress);
  const reviewsToday = todayQueue.filter((w) => w.isReview).length;
  const newsToday = todayQueue.filter((w) => w.isNew).length;

  return (
    <div className="sm-overlay">
      <div className="sm-header">
        <div className="sm-title"><BookOpen size={16} /> 背单词</div>
        <button type="button" className="sm-close" aria-label="关闭" onClick={onClose}><X size={18} /></button>
      </div>

      {phase !== "deck" && (
        <div className="sm-tabs">
          <button type="button" className={tab === "learn" ? "on" : ""} onClick={() => setTab("learn")}><GraduationCap size={15} /> 学习</button>
          <button type="button" className={tab === "themes" ? "on" : ""} onClick={() => setTab("themes")}><LayoutGrid size={15} /> 主题</button>
          <button type="button" className={tab === "test" ? "on" : ""} onClick={() => { setTab("test"); setTest({ phase: "intro" }); }}>📝 测试</button>
        </div>
      )}

      <div className="sm-body">
        {/* ── 学习 Tab ── */}
        {tab === "learn" && phase === "idle" && (
          <div className="sm-pane">
            <div className="sm-stat-row">
              <div className="sm-stat"><b className="c-review">{reviewsToday}</b><span>待复习</span></div>
              <div className="sm-stat"><b className="c-new">{newsToday}</b><span>新词</span></div>
              <div className="sm-stat"><b className="c-done">{masteredTotal}</b><span>已掌握</span></div>
            </div>
            <button type="button" className="sm-btn" disabled={reviewsToday + newsToday === 0} onClick={() => startStudy()}>
              {reviewsToday + newsToday === 0 ? "今日已完成 ✓" : `开始今日学习 (${reviewsToday + newsToday})`}
            </button>
            {hasBackup && (
              <button type="button" className="sm-btn ghost" onClick={resetToday}>
                <RotateCcw size={14} /> 重置今日学习（点错可还原）
              </button>
            )}
            <div className="sm-mini-note">累计已学 {learnedTotal} / {VOCAB.length} 词 · 已掌握 {masteredTotal}</div>
          </div>
        )}

        {tab === "learn" && phase === "deck" && <Deck word={queue[idx]} idx={idx} total={queue.length} flipped={flipped} onFlip={() => setFlipped(true)} onGrade={grade} onExit={() => { setPhase("idle"); setQueue([]); }} sessionTheme={sessionTheme} />}

        {tab === "learn" && phase === "done" && (
          <div className="sm-pane sm-done">
            <div className="sm-done-check">✓</div>
            <div className="sm-done-title">本次完成！</div>
            <div className="sm-done-sub">学习了 {queue.length} 张卡片{sessionTheme ? ` · ${sessionTheme}` : ""}</div>
            <div className="sm-done-total">累计已掌握 {masteredTotal} / {VOCAB.length} 词</div>
            <button type="button" className="sm-btn" onClick={() => { setPhase("idle"); setTab("test"); setTest({ phase: "intro" }); }}>去测一测</button>
            <button type="button" className="sm-btn ghost" onClick={() => { setPhase("idle"); setQueue([]); }}>返回</button>
          </div>
        )}

        {/* ── 主题 Tab ── */}
        {tab === "themes" && (
          <div className="sm-pane">
            <button type="button" className="sm-btn" onClick={() => startStudy()}>📚 综合学习（所有主题混合）</button>
            <div className="sm-section-title">按主题学习（点击开始）</div>
            <div className="sm-theme-list">
              {stats.map((s) => {
                const pct = s.total ? Math.round((s.mastered / s.total) * 100) : 0;
                return (
                  <button type="button" key={s.theme} className="sm-theme-card" onClick={() => startStudy(s.theme)}>
                    <div className="sm-theme-head">
                      <span className="sm-theme-name">{s.theme}</span>
                      <span className={`sm-theme-todo ${s.todo ? "" : "dim"}`}>{s.todo ? `今日 ${s.todo}` : "✓ 已学完"}</span>
                    </div>
                    <div className="sm-theme-bar"><i style={{ width: `${pct}%` }} /></div>
                    <div className="sm-theme-meta">共 {s.total} · 待复习 {s.due} · 未学 {s.newLeft} · 已掌握 {s.mastered}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 测试 Tab ── */}
        {tab === "test" && <TestPane test={test} todayCount={todayQueue.length + Object.values(progress).filter((p) => p.lastReviewed === todayK).length} onStart={startTest} onAnswer={answerTest} onNext={nextTest} onRestart={() => startTest(test.scope)} onBack={() => setTest({ phase: "intro" })} />}
      </div>
    </div>
  );
}

// ── 翻卡学习 ──
function Deck({ word, idx, total, flipped, onFlip, onGrade, onExit, sessionTheme }) {
  return (
    <div className="sm-pane">
      <div className="sm-deck-top">
        <button type="button" className="sm-link" onClick={onExit}><ArrowLeft size={14} /> 退出</button>
        <span className="sm-deck-count">{idx + 1} / {total}{sessionTheme ? ` · ${sessionTheme}` : ""}</span>
      </div>
      <div className="sm-progressbar"><i style={{ width: `${(idx / total) * 100}%` }} /></div>
      <div className={`vocab-flip-card ${flipped ? "flipped" : ""}`} onClick={!flipped ? onFlip : undefined}>
        <div className="vocab-flip-inner">
          <div className="vocab-flip-front">
            <div className="vf-badges">
              <span className={`vf-badge ${word.isNew ? "badge-new" : "badge-review"}`}>{word.isNew ? "新词" : "复习"}</span>
              <span className="vf-tier">{word.theme}</span>
            </div>
            <div className="vf-word">{word.word}</div>
            <button type="button" className="vf-speak" aria-label={`朗读 ${word.word}`} onClick={(e) => { e.stopPropagation(); speak(word.word); }}><Volume2 size={14} /></button>
            <div className="vf-tap-hint">点击翻面查看释义</div>
          </div>
          <div className="vocab-flip-back">
            <div className="vb-word">{word.word}</div>
            <div className="vb-cn">{word.cn}</div>
            {word.ex && <div className="vb-ex">"{word.ex}"</div>}
            <button type="button" className="vb-speak" onClick={(e) => { e.stopPropagation(); speak(word.word); }}><Volume2 size={13} /> 朗读</button>
          </div>
        </div>
      </div>
      {flipped ? (
        <div className="sm-grades">
          {GRADES.map((gr) => (
            <button type="button" key={gr.g} className={`sm-grade ${gr.cls}`} onClick={() => onGrade(gr.g)}>
              {gr.label}<small>{gr.sub}</small>
            </button>
          ))}
        </div>
      ) : <div className="sm-grades-placeholder" />}
    </div>
  );
}

// ── 测试 ──
function TestPane({ test, todayCount, onStart, onAnswer, onNext, onRestart, onBack }) {
  if (test.phase === "intro") {
    return (
      <div className="sm-pane sm-test-intro">
        <div className="sm-test-emoji">📝</div>
        <div className="sm-test-h">单词测试</div>
        <div className="sm-test-desc">选择题检验记忆（英译中 / 中译英 / 选词填空随机）<br />答完给分数并列出错题，不影响复习安排</div>
        <button type="button" className="sm-btn" onClick={() => onStart("today")}>测试今日内容（{todayCount}）</button>
        <button type="button" className="sm-btn ghost" onClick={() => onStart("all")}>测试全部已学单词</button>
      </div>
    );
  }
  if (test.phase === "quiz") {
    const q = test.qs[test.qi];
    const dirLabel = q.type === "cloze" ? "选词填空" : q.type === "en2cn" ? "选择正确的中文意思" : "选择正确的英文单词";
    return (
      <div className="sm-pane">
        <div className="sm-progressbar"><i style={{ width: `${(test.qi / test.qs.length) * 100}%` }} /></div>
        <div className="sm-test-meta">{test.qi + 1} / {test.qs.length} · {dirLabel}</div>
        <div className="sm-test-prompt">
          {q.prompt}
          {q.hint && <div className="sm-cloze-hint">（{q.hint}）</div>}
        </div>
        <div className="sm-test-opts">
          {q.options.map((o, i) => {
            let cls = "";
            if (test.answered) {
              if (o === q.correct) cls = "correct";
              else if (i === test.chosen) cls = "wrong";
            }
            return <button type="button" key={i} className={`sm-opt ${cls}`} disabled={test.answered} onClick={() => onAnswer(i)}>{o}</button>;
          })}
        </div>
        {test.answered && <button type="button" className="sm-btn" onClick={onNext}>{test.qi + 1 >= test.qs.length ? "查看结果" : "下一题"}</button>}
      </div>
    );
  }
  // result
  const total = test.qs.length;
  const pct = Math.round((test.correct / total) * 100);
  const emoji = pct === 100 ? "🏆" : pct >= 80 ? "🎉" : pct >= 60 ? "💪" : pct >= 40 ? "📖" : "📚";
  const msg = pct === 100 ? "满分！全部答对 🎯" : pct >= 80 ? "太棒了，答得很好！" : pct >= 60 ? "不错，继续加油！" : pct >= 40 ? "还行，多复习错题。" : "别灰心，重点看看错题。";
  return (
    <div className="sm-pane">
      <div className="sm-result-card">
        <div className="sm-result-emoji">{emoji}</div>
        <div className="sm-result-score">{test.correct} / {total}</div>
        <div className="sm-result-msg">{msg}</div>
      </div>
      {test.wrong.length > 0 && (
        <>
          <div className="sm-section-title">错题（{test.wrong.length}）</div>
          <div className="sm-wrong-list">
            {test.wrong.map((q, i) => (
              <div key={i} className="sm-wrong-item">
                <div><div className="sm-wrong-word">{q.word.word}</div><div className="sm-wrong-cn">{q.word.cn}</div></div>
                <button type="button" className="sm-link" aria-label={`朗读 ${q.word.word}`} onClick={() => speak(q.word.word)}><Volume2 size={15} /></button>
              </div>
            ))}
          </div>
        </>
      )}
      <button type="button" className="sm-btn" onClick={onRestart}>再测一次</button>
      <button type="button" className="sm-btn ghost" onClick={onBack}>完成</button>
    </div>
  );
}
