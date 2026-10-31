// A weekly review in progress is kept on this device as it is typed, one draft
// per week, so Exit, or iOS closing the app in the background, no longer loses
// the answers: they come back when that week's review is opened again, until
// it is saved.

export interface ReviewDraft {
  answers: Record<string, unknown>;
  phaseIdx?: number;
  keptAt?: string;
}

const two = (n: number) => String(n).padStart(2, '0');

/** One key per week, by its Monday in local time. */
export const reviewDraftKey = (weekStart: Date) =>
  `my-planning-review-draft:${weekStart.getFullYear()}-${two(weekStart.getMonth() + 1)}-${two(weekStart.getDate())}`;

export function readReviewDraft(key: string): ReviewDraft | null {
  try {
    const draft = JSON.parse(localStorage.getItem(key) || 'null');
    return draft && draft.answers && typeof draft.answers === 'object' ? draft : null;
  } catch {
    return null;
  }
}

/** Keeps `draft`, or forgets the week's draft when given null. */
export function writeReviewDraft(key: string, draft: ReviewDraft | null) {
  try {
    if (draft) localStorage.setItem(key, JSON.stringify(draft));
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked or full: the review works as before, without a draft.
  }
}

/** Whether this device holds unsaved answers for the review of that week. */
export function hasReviewDraft(weekStart: Date) {
  return !!readReviewDraft(reviewDraftKey(weekStart));
}
