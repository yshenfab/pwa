import { describe, expect, it } from "vitest";
import { addDays, dayIndex } from "./dateUtils.js";
import { applyVocabDecisionsToProgress, getDailyWords, getNextReviewDate } from "./learningLogic.js";

const bank = [
  { id: 1, tier: 1, word: "alpha" },
  { id: 2, tier: 1, word: "bravo" },
  { id: 3, tier: 2, word: "charlie" },
];

describe("date utils", () => {
  it("adds days across month boundaries", () => {
    expect(addDays("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("keeps day indexes in range", () => {
    expect(dayIndex("2026-06-25", 10)).toBeGreaterThanOrEqual(0);
    expect(dayIndex("2026-06-25", 10)).toBeLessThan(10);
  });
});

describe("vocab scheduling", () => {
  it("uses the selected date when deciding due reviews", () => {
    const progress = {
      "1": { firstSeen: "2026-06-20", reviewCount: 1, nextReview: "2026-06-25" },
    };

    expect(getDailyWords(progress, [], "2026-06-24", bank).some((w) => w.id === 1)).toBe(false);
    expect(getDailyWords(progress, [], "2026-06-25", bank).some((w) => w.id === 1)).toBe(true);
  });

  it("records retry decisions so the word is not lost", () => {
    const updated = applyVocabDecisionsToProgress({ 1: "retry" }, {}, "2026-06-25");

    expect(updated["1"]).toMatchObject({
      firstSeen: "2026-06-25",
      lastDecision: "retry",
      reviewCount: 0,
      nextReview: "2026-06-25",
    });
  });

  it("advances mastered reviews on the spaced schedule", () => {
    const updated = applyVocabDecisionsToProgress(
      { 1: "mastered" },
      { "1": { firstSeen: "2026-06-20", reviewCount: 1, nextReview: "2026-06-25" } },
      "2026-06-25",
    );

    expect(updated["1"].reviewCount).toBe(2);
    expect(updated["1"].nextReview).toBe(getNextReviewDate("2026-06-25", 2));
  });
});
