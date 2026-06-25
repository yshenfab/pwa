import { addDays } from "./dateUtils.js";
import { GRE_VOCAB } from "./vocabBank.js";

export function getNextReviewDate(dateKey, reviewCount) {
  return addDays(dateKey, [1, 3, 7][Math.min(reviewCount, 2)]);
}

export function getDailyWords(progress = {}, customVocab = [], dateKey, vocabBank = GRE_VOCAB) {
  const seenIds = new Set(Object.keys(progress));

  const newWords = vocabBank
    .filter((w) => !seenIds.has(String(w.id)))
    .sort((a, b) => a.tier - b.tier || a.id - b.id)
    .slice(0, 5)
    .map((w) => ({ ...w, isNew: true }));

  const customReview = customVocab
    .filter((w) => {
      const p = progress[w.id];
      return p && p.reviewCount < 3 && p.nextReview && p.nextReview <= dateKey;
    })
    .sort((a, b) => progress[a.id].nextReview.localeCompare(progress[b.id].nextReview))
    .map((w) => ({ ...w, isReview: true, isCustom: true }));

  const greReview = vocabBank
    .filter((w) => {
      const p = progress[String(w.id)];
      return p && p.reviewCount < 3 && p.nextReview && p.nextReview <= dateKey;
    })
    .sort((a, b) => progress[String(a.id)].nextReview.localeCompare(progress[String(b.id)].nextReview))
    .map((w) => ({ ...w, isReview: true }));

  return [...newWords, ...customReview, ...greReview].slice(0, newWords.length + 3);
}

export function applyVocabDecisionsToProgress(decisions, existingProgress = {}, dateKey) {
  const updated = { ...existingProgress };

  for (const [wordId, decision] of Object.entries(decisions)) {
    const current = updated[wordId];

    if (decision === "mastered") {
      if (!current) {
        updated[wordId] = {
          firstSeen: dateKey,
          lastSeen: dateKey,
          lastDecision: "mastered",
          reviewCount: 0,
          nextReview: getNextReviewDate(dateKey, 0),
        };
      } else {
        const newCount = Math.min((current.reviewCount ?? 0) + 1, 3);
        updated[wordId] = {
          ...current,
          lastSeen: dateKey,
          lastDecision: "mastered",
          reviewCount: newCount,
          nextReview: newCount >= 3 ? null : getNextReviewDate(dateKey, newCount),
        };
      }
      continue;
    }

    if (decision === "retry") {
      updated[wordId] = {
        ...current,
        firstSeen: current?.firstSeen ?? dateKey,
        lastSeen: dateKey,
        lastDecision: "retry",
        reviewCount: current?.reviewCount ?? 0,
        nextReview: dateKey,
      };
    }
  }

  return updated;
}

export function countMastered(progress = {}) {
  return Object.values(progress).filter((p) => p?.reviewCount >= 3).length;
}
