import { z } from 'zod';

import { PlainText } from '../common/schemas/field-formats.js';

/* Request and response schemas never share a definition (AGENTS.md). Contract:
 * specs/002-space-marketplace/contracts/owner-operations.md "Layout". */

export const DEFAULT_COLUMNS = 40;
export const DEFAULT_ROWS = 30;

const kind = z.enum(['seat', 'cubicle', 'area']);

export const LayoutElementSchema = z
  .object({
    id: z.uuid(),
    kind,
    seatId: z.uuid().nullable(),
    cubicleId: z.uuid().nullable(),
    label: z.string().describe('Seat label, cubicle name or area label'),
    x: z.int(),
    y: z.int(),
    w: z.int(),
    h: z.int(),
  })
  .meta({ id: 'LayoutElement' });
export type LayoutElement = z.infer<typeof LayoutElementSchema>;

export const OwnerLayoutSchema = z
  .object({
    columns: z.int(),
    rows: z.int(),
    version: z.int().describe('0 until the first save'),
    elements: z.array(LayoutElementSchema),
    unplacedSeatIds: z.array(z.uuid()).describe('Active seats with no element on the plan'),
  })
  .meta({ id: 'OwnerLayout' });
export type OwnerLayout = z.infer<typeof OwnerLayoutSchema>;

export const SaveLayoutInputSchema = z
  .strictObject({
    version: z.int().nonnegative().describe('The version the editor opened'),
    columns: z.int().min(10).max(80),
    rows: z.int().min(10).max(80),
    elements: z
      .array(
        z.strictObject({
          kind,
          seatId: z.uuid().optional(),
          cubicleId: z.uuid().optional(),
          label: PlainText.trim().min(1).max(40).optional().describe('Areas only'),
          x: z.int().min(0),
          y: z.int().min(0),
          w: z.int().min(1),
          h: z.int().min(1),
        }),
      )
      .max(600),
  })
  .superRefine((v, ctx) => {
    v.elements.forEach((e, i) => {
      const ok =
        (e.kind === 'seat') === (e.seatId !== undefined) &&
        (e.kind === 'cubicle') === (e.cubicleId !== undefined) &&
        (e.kind === 'area') === (e.label !== undefined);
      if (!ok) {
        ctx.addIssue({
          code: 'custom',
          path: ['elements', i],
          message: 'A seat needs seatId, a cubicle cubicleId and an area a label, and nothing else',
        });
      }
    });
  })
  .meta({ id: 'SaveLayoutInput' });
export type SaveLayoutInput = z.infer<typeof SaveLayoutInputSchema>;

export const ListingLayoutElementSchema = z
  .object({
    kind,
    seatId: z.uuid().nullable(),
    label: z.string(),
    x: z.int(),
    y: z.int(),
    w: z.int(),
    h: z.int(),
  })
  .meta({ id: 'ListingLayoutElement' });

export const ListingLayoutSchema = z
  .object({
    columns: z.int(),
    rows: z.int(),
    elements: z.array(ListingLayoutElementSchema),
  })
  .meta({ id: 'ListingLayout' });
export type ListingLayout = z.infer<typeof ListingLayoutSchema>;
