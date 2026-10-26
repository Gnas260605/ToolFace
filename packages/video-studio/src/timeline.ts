import { EditPlan, Transition } from './plan';

export interface TimedScene {
  index: number;
  /** When the scene starts being the "current" picture on the output timeline. */
  start: number;
  /** Time the scene owns on the timeline (excludes the overlap with the next scene). */
  duration: number;
  /** Length of the rendered clip = duration + overlap into the next scene. */
  clipLength: number;
  transition: Transition;
  transitionDuration: number;
  /** Absolute time the narration starts. */
  audioStart: number;
  audioDuration: number;
}

export interface Timeline {
  scenes: TimedScene[];
  total: number;
}

export const TIMING = {
  /** Silence before the voice starts in each scene. */
  lead: 0.25,
  /** Breathing room after the voice ends. */
  tail: 0.35,
  transition: 0.5,
  /** A "cut" is a near-instant crossfade so every join can use one xfade chain. */
  cut: 0.04,
};

/**
 * Lay the scenes out on the timeline. Each scene lasts long enough for its narration
 * (or its minimum duration) and each clip is extended by the transition length so the
 * xfade into the next scene eats into overlap, not into the narration.
 */
export function buildTimeline(plan: EditPlan, audioDurations: number[]): Timeline {
  if (audioDurations.length !== plan.scenes.length) {
    throw new Error('audioDurations must have one entry per scene');
  }
  const durations = plan.scenes.map((s, i) =>
    Math.max(
      s.minDuration,
      audioDurations[i] > 0 ? TIMING.lead + audioDurations[i] + TIMING.tail : 0,
    ),
  );

  const scenes: TimedScene[] = [];
  let t = 0;
  plan.scenes.forEach((s, i) => {
    const isLast = i === plan.scenes.length - 1;
    let transitionDuration = 0;
    if (!isLast) {
      transitionDuration = s.transition === 'cut' ? TIMING.cut : TIMING.transition;
      // Never let a transition swallow most of a short scene.
      transitionDuration = Math.min(transitionDuration, durations[i] * 0.4, durations[i + 1] * 0.4);
    }
    scenes.push({
      index: i,
      start: t,
      duration: durations[i],
      clipLength: durations[i] + transitionDuration,
      transition: isLast ? 'cut' : s.transition,
      transitionDuration,
      audioStart: t + (audioDurations[i] > 0 ? TIMING.lead : 0),
      audioDuration: audioDurations[i],
    });
    t += durations[i];
  });
  return { scenes, total: t };
}
