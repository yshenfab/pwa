// 日常单词学习逻辑：SM-2 间隔重复 + 主题统计 + 测试出题（纯函数，便于测试）
import { addDays } from "./dateUtils.js";
import { VOCAB } from "./vocabBank.js";

// 四档自评 → SM-2 质量分：0 忘了 / 1 模糊 / 2 记得 / 3 简单
const QUALITY = [2, 3, 4, 5];
export const DAILY_NEW_DEFAULT = 10;

// 依据一次评分，计算某个词的新进度条目。prev 为空表示新词。
export function applyGrade(prev, grade, todayK) {
  const q = QUALITY[grade];
  let ef = prev ? prev.ef : 2.5;
  let interval = prev ? prev.interval : 0;
  let reps = prev ? prev.reps : 0;

  if (q < 3) {
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ef);
    reps += 1;
  }
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  if (grade === 3) interval = Math.round(interval * 1.3); // “简单”额外拉长

  return {
    ef: Math.round(ef * 1000) / 1000,
    interval,
    reps,
    status: reps >= 2 ? "review" : "learning",
    due: addDays(todayK, interval),
    lastReviewed: todayK,
  };
}

// 今日学习队列：到期复习 + 新词（新词受每日上限约束，复习可设上限），可按主题过滤。
// theme：单主题学习时只取该主题。allowedThemes：混合模式下新词只从这些主题里取（null=全部）；
// 复习不受 allowedThemes 限制，避免已开始学的词被永久搁置。
export function getStudyQueue({ vocab = VOCAB, progress = {}, dailyNew = DAILY_NEW_DEFAULT, reviewCap = 0, theme = null, allowedThemes = null, todayK }) {
  const newAllowed = (w) => (theme ? w.theme === theme : (!allowedThemes || allowedThemes.includes(w.theme)));
  let reviews = vocab
    .filter((w) => (!theme || w.theme === theme) && progress[w.id] && progress[w.id].due <= todayK)
    .sort((a, b) => (progress[a.id].due < progress[b.id].due ? -1 : 1))
    .map((w) => ({ ...w, isReview: true }));
  if (reviewCap > 0) reviews = reviews.slice(0, reviewCap);
  const news = vocab
    .filter((w) => newAllowed(w) && !progress[w.id])
    .sort((a, b) => a.id - b.id)
    .slice(0, dailyNew)
    .map((w) => ({ ...w, isNew: true }));
  return [...reviews, ...news];
}

// 连续打卡天数：studiedDays 为有学习记录的日期集合（Set of 'YYYY-MM-DD'）。
// 从今天（若今天没学则从昨天）往前数连续天数。
export function computeStreak(studiedDays, todayK) {
  if (!studiedDays || studiedDays.size === 0) return 0;
  let cursor = todayK;
  if (!studiedDays.has(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (studiedDays.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function getLearnedCount(progress = {}) {
  return Object.keys(progress).length;
}
export function getMasteredCount(progress = {}) {
  return Object.values(progress).filter((p) => p && p.reps >= 3).length;
}

// 各主题进度统计
export function getThemeStats({ vocab = VOCAB, progress = {}, todayK, dailyNew = DAILY_NEW_DEFAULT, themeOrder = [] }) {
  const map = {};
  for (const w of vocab) {
    const s = (map[w.theme] ||= { theme: w.theme, total: 0, learned: 0, mastered: 0, due: 0, newLeft: 0 });
    s.total++;
    const p = progress[w.id];
    if (p) {
      s.learned++;
      if (p.reps >= 3) s.mastered++;
      if (p.due <= todayK) s.due++;
    } else {
      s.newLeft++;
    }
  }
  const order = themeOrder.length ? themeOrder : Object.keys(map);
  return order
    .filter((t) => map[t])
    .map((t) => {
      const s = map[t];
      s.todo = s.due + Math.min(s.newLeft, dailyNew);
      return s;
    });
}

// ── 测试出题 ──
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 若例句里能找到词（原形或去 to 形），返回挖空后的句子与答案
export function clozeInfo(w) {
  if (!w.ex) return null;
  const forms = [w.word.replace(/^to\s+/i, ""), w.word];
  for (const f of forms) {
    if (!f) continue;
    const escaped = f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("\\b" + escaped + "\\b", "i");
    const m = w.ex.match(re);
    if (m) return { sentence: w.ex.replace(re, "______"), answer: m[0] };
  }
  return null;
}

// 随机题型：英译中 / 中译英 / 选词填空
export function makeQuestion(w, pool, allVocab = VOCAB) {
  const source = pool.length >= 6 ? pool : allVocab;
  const cz = Math.random() < 0.34 ? clozeInfo(w) : null;
  if (cz) {
    const others = shuffle(source.filter((x) => x.id !== w.id)).map((x) => x.word.replace(/^to\s+/i, ""));
    const uniq = [];
    for (const v of others) {
      if (v && v.toLowerCase() !== cz.answer.toLowerCase() && !uniq.some((u) => u.toLowerCase() === v.toLowerCase())) uniq.push(v);
      if (uniq.length >= 3) break;
    }
    return { word: w, type: "cloze", prompt: cz.sentence, hint: w.cn, correct: cz.answer, options: shuffle([cz.answer, ...uniq]) };
  }
  const dir = Math.random() < 0.5 ? "en2cn" : "cn2en";
  const field = dir === "en2cn" ? "cn" : "word";
  const correct = w[field];
  const prompt = dir === "en2cn" ? w.word : w.cn;
  const others = shuffle(source.filter((x) => x.id !== w.id && x[field] && x[field] !== correct));
  const distractors = others.slice(0, 3).map((x) => x[field]);
  return { word: w, type: dir, hint: "", prompt, correct, options: shuffle([correct, ...distractors]) };
}

// 测试范围：today = 今天学过 + 到期复习；all = 全部已学
export function getTestPool({ vocab = VOCAB, progress = {}, scope, todayK }) {
  if (scope === "all") return vocab.filter((w) => progress[w.id]);
  return vocab.filter((w) => {
    const p = progress[w.id];
    return p && (p.lastReviewed === todayK || p.due <= todayK);
  });
}

export function buildTest({ vocab = VOCAB, progress = {}, scope, todayK, max = 20 }) {
  const pool = getTestPool({ vocab, progress, scope, todayK });
  return shuffle(pool.slice())
    .slice(0, Math.min(max, pool.length))
    .map((w) => makeQuestion(w, pool, vocab));
}
