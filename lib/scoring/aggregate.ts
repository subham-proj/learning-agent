import { type MasteryByObjective } from "@/lib/agent/schemas";
import { type Objective } from "@/lib/agent/schemas";

interface RawAttempt {
  objectiveId: string;
  correct: boolean;
  attemptNumber: number;
}

/**
 * Computes per-objective mastery from persisted attempts.
 * An objective is mastered if the user eventually answered correctly.
 * masteryPercent = ratio of objectives answered correctly on the first try,
 * weighted by eventual-correct attempts to reward persistence.
 */
export function aggregateAttempts(
  attempts: RawAttempt[],
  objectives: Objective[]
): { masteryByObjective: MasteryByObjective[]; overallScore: number } {
  const byObjective = new Map<string, RawAttempt[]>();

  for (const a of attempts) {
    const existing = byObjective.get(a.objectiveId) ?? [];
    existing.push(a);
    byObjective.set(a.objectiveId, existing);
  }

  const masteryByObjective: MasteryByObjective[] = objectives.map((obj) => {
    const objAttempts = byObjective.get(obj.id) ?? [];

    const totalAttempts = objAttempts.length;
    const correctAttempts = objAttempts.filter((a) => a.correct).length;
    const firstAttempt = objAttempts.find((a) => a.attemptNumber === 1);
    const firstTryCorrect = firstAttempt?.correct ?? false;

    // Score: 100 if first-try correct, 60 if eventually correct, 0 if no correct attempt.
    let masteryPercent = 0;
    if (correctAttempts > 0) {
      masteryPercent = firstTryCorrect ? 100 : Math.round(60 + 40 / totalAttempts);
    }

    return {
      objectiveId: obj.id,
      objectiveTitle: obj.title,
      totalAttempts,
      correctAttempts,
      masteryPercent,
      firstTryCorrect,
    };
  });

  const overallScore =
    masteryByObjective.length === 0
      ? 0
      : Math.round(
          masteryByObjective.reduce((sum, m) => sum + m.masteryPercent, 0) /
            masteryByObjective.length
        );

  return { masteryByObjective, overallScore };
}
