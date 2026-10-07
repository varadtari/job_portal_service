import type { NormalizedJob } from "../types";

/** Decides from title/location (description may be empty) whether a job is worth keeping. */
export type Keep = (job: NormalizedJob) => boolean;

export type BoardResult = { company: string; total: number; jobs: NormalizedJob[] };
