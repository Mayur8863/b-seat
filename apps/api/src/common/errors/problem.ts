import { z } from 'zod';

/** RFC 9457 problem details: the body of every non-2xx API response. */
export const ProblemSchema = z
  .object({
    type: z.string().describe('URI identifying the problem type'),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
    instance: z.string().optional(),
    requestId: z.string().optional(),
    errors: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional()
      .describe('Field-level validation errors'),
  })
  .meta({ id: 'Problem' });

export type Problem = z.infer<typeof ProblemSchema>;
