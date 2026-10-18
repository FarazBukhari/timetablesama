/// <reference lib="webworker" />
import type { Project } from '../model/types';
import { generate, type GenerateProgress, type GenerateResult } from './engine';

export type WorkerRequest = { type: 'generate'; project: Project; seed?: number };
export type WorkerResponse =
  | { type: 'progress'; progress: GenerateProgress }
  | { type: 'done'; result: GenerateResult }
  | { type: 'error'; message: string };

const post = (msg: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  if (e.data.type !== 'generate') return;
  try {
    const result = generate(e.data.project, {
      seed: e.data.seed,
      onProgress: (progress) => post({ type: 'progress', progress }),
    });
    post({ type: 'done', result });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
