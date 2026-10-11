import { useCallback, useEffect, useRef, useState } from 'react';
import { PIPELINE_STAGES, groupChecksByStage, stageStateFromChecks, type StageState } from '@/lib/pipeline';
import type { DataSource, EvaluationRecord, StageId } from '@/types';

export type PipelinePhase = 'idle' | 'awaiting' | 'animating' | 'done' | 'error';

const STEP_MS = 520;

function idleStates(): Record<StageId, StageState> {
  return Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, 'idle'])) as Record<StageId, StageState>;
}

function finalStates(record: EvaluationRecord): Record<StageId, StageState> {
  const groups = groupChecksByStage(record.response.checks);
  return Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, stageStateFromChecks(groups[s.id])])) as Record<StageId, StageState>;
}

/**
 * Drives the evaluation pipeline visual.
 * - Mock mode: the result is already computed; stages are revealed one by one as a
 *   clearly-labelled demo visualization.
 * - API mode: stages wait on the real request, then show the returned checks at once.
 */
export function usePipelineRun() {
  const [states, setStates] = useState<Record<StageId, StageState>>(idleStates);
  const [phase, setPhase] = useState<PipelinePhase>('idle');
  const [revealed, setRevealed] = useState(0);
  const runId = useRef(0);

  useEffect(() => () => void (runId.current += 1), []);

  const reset = useCallback(() => {
    runId.current += 1;
    setStates(idleStates());
    setPhase('idle');
    setRevealed(0);
  }, []);

  const showInstant = useCallback((record: EvaluationRecord) => {
    runId.current += 1;
    setStates(finalStates(record));
    setRevealed(PIPELINE_STAGES.length);
    setPhase('done');
  }, []);

  const run = useCallback(async (pending: Promise<EvaluationRecord>, source: DataSource): Promise<EvaluationRecord | null> => {
    const id = ++runId.current;
    setRevealed(0);
    const awaiting = idleStates();
    awaiting.receive = 'processing';
    setStates(awaiting);
    setPhase('awaiting');

    let record: EvaluationRecord;
    try {
      record = await pending;
    } catch (err) {
      if (id === runId.current) {
        setStates({ ...idleStates(), receive: 'failed' });
        setPhase('error');
      }
      throw err;
    }
    if (id !== runId.current) return null;

    const final = finalStates(record);
    if (source === 'api') {
      setStates(final);
      setRevealed(PIPELINE_STAGES.length);
      setPhase('done');
      return record;
    }

    setPhase('animating');
    for (let i = 0; i < PIPELINE_STAGES.length; i++) {
      const stage = PIPELINE_STAGES[i].id;
      setStates((s) => ({ ...s, [stage]: 'processing' }));
      await new Promise((r) => setTimeout(r, STEP_MS));
      if (id !== runId.current) return null;
      setStates((s) => ({ ...s, [stage]: final[stage] }));
      setRevealed(i + 1);
    }
    setPhase('done');
    return record;
  }, []);

  return { states, phase, revealed, run, reset, showInstant };
}
