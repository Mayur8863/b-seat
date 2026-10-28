/** Text with optional inline links, so callers render real anchors. */
export type ProblemPart = string | { text: string; href: string };

export interface ProblemCopy {
  title: string;
  description: ProblemPart[];
}
