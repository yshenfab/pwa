import { describe, expect, it } from "vitest";
import { addDays } from "./dateUtils.js";
import {
  applyGrade, getStudyQueue, getThemeStats, getMasteredCount, clozeInfo, buildTest, getTestPool, computeStreak,
} from "./learningLogic.js";

const T = "2026-08-14";
const bank = [
  { id: 0, theme: "A", word: "head", cn: "头", ex: "She nodded her head." },
  { id: 1, theme: "A", word: "to smile", cn: "微笑", ex: "She smiled at me." },
  { id: 2, theme: "B", word: "apple", cn: "苹果", ex: "" },
];

describe("applyGrade (SM-2)", () => {
  it("first correct grade schedules 1 day out", () => {
    const p = applyGrade(null, 2, T);
    expect(p.reps).toBe(1);
    expect(p.interval).toBe(1);
    expect(p.due).toBe(addDays(T, 1));
    expect(p.status).toBe("learning");
  });
  it("second correct grade jumps to 6 days and becomes review", () => {
    const p1 = applyGrade(null, 2, T);
    const p2 = applyGrade(p1, 2, T);
    expect(p2.reps).toBe(2);
    expect(p2.interval).toBe(6);
    expect(p2.status).toBe("review");
  });
  it("forgetting resets interval to 1 day", () => {
    const p1 = applyGrade(applyGrade(null, 2, T), 2, T);
    const p = applyGrade(p1, 0, T);
    expect(p.reps).toBe(0);
    expect(p.interval).toBe(1);
    expect(p.due).toBe(addDays(T, 1));
  });
});

describe("getStudyQueue", () => {
  it("caps new words and puts due reviews first", () => {
    const progress = { 0: { reps: 1, interval: 1, ef: 2.5, status: "learning", due: T, lastReviewed: T } };
    const q = getStudyQueue({ vocab: bank, progress, dailyNew: 1, todayK: T });
    expect(q[0].isReview).toBe(true);     // head is due
    expect(q.filter((w) => w.isNew).length).toBe(1); // capped
  });
  it("filters by theme", () => {
    const q = getStudyQueue({ vocab: bank, progress: {}, theme: "B", todayK: T });
    expect(q.every((w) => w.theme === "B")).toBe(true);
  });
  it("caps reviews when reviewCap is set", () => {
    const progress = {
      0: { reps: 1, interval: 1, ef: 2.5, status: "learning", due: T, lastReviewed: T },
      1: { reps: 1, interval: 1, ef: 2.5, status: "learning", due: T, lastReviewed: T },
    };
    const q = getStudyQueue({ vocab: bank, progress, dailyNew: 0, reviewCap: 1, todayK: T });
    expect(q.filter((w) => w.isReview).length).toBe(1);
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    const days = new Set([addDays(T, -2), addDays(T, -1), T]);
    expect(computeStreak(days, T)).toBe(3);
  });
  it("still counts when today not yet done but yesterday was", () => {
    const days = new Set([addDays(T, -2), addDays(T, -1)]);
    expect(computeStreak(days, T)).toBe(2);
  });
  it("breaks on a gap", () => {
    const days = new Set([addDays(T, -3), T]);
    expect(computeStreak(days, T)).toBe(1);
  });
  it("is 0 with no days", () => {
    expect(computeStreak(new Set(), T)).toBe(0);
  });
});

describe("getThemeStats", () => {
  it("counts totals per theme", () => {
    const stats = getThemeStats({ vocab: bank, progress: {}, todayK: T, themeOrder: ["A", "B"] });
    expect(stats.find((s) => s.theme === "A").total).toBe(2);
    expect(stats.find((s) => s.theme === "B").newLeft).toBe(1);
  });
});

describe("clozeInfo", () => {
  it("blanks the base word when present in the example", () => {
    expect(clozeInfo(bank[0])).toEqual({ sentence: "She nodded her ______.", answer: "head" });
  });
  it("returns null when only an inflected form is present", () => {
    expect(clozeInfo(bank[1])).toBeNull(); // 'smiled' != 'smile'
  });
  it("returns null without an example", () => {
    expect(clozeInfo(bank[2])).toBeNull();
  });
});

describe("test pool & builder", () => {
  it("today pool includes words studied today", () => {
    const progress = { 0: { reps: 1, interval: 1, ef: 2.5, status: "learning", due: addDays(T, 1), lastReviewed: T } };
    const pool = getTestPool({ vocab: bank, progress, scope: "today", todayK: T });
    expect(pool.map((w) => w.id)).toContain(0);
  });
  it("builds multiple-choice questions", () => {
    const progress = { 0: { reps: 1, interval: 1, ef: 2.5, status: "learning", due: T, lastReviewed: T } };
    const qs = buildTest({ vocab: bank, progress, scope: "all", todayK: T });
    expect(qs.length).toBeGreaterThan(0);
    expect(qs[0].options).toContain(qs[0].correct);
  });
});

describe("getMasteredCount", () => {
  it("counts words with reps >= 3", () => {
    const progress = { 0: { reps: 3 }, 1: { reps: 1 } };
    expect(getMasteredCount(progress)).toBe(1);
  });
});
