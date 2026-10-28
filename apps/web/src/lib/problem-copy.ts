import type { Route } from 'next';

/** Text with optional inline links, so callers render real anchors. */
export type ProblemPart = string | { text: string; href: Route };

export interface ProblemCopy {
  title: string;
  description: ProblemPart[];
}
