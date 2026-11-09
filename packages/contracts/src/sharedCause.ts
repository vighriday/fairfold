import { z } from 'zod';
import { UuidSchema } from './common.js';

export const DimensionSchema = z.enum([
  'batch_code',
  'carrier',
  'listing_version',
  'packer',
  'ship_week',
  'ship_to_country',
]);
export type Dimension = z.infer<typeof DimensionSchema>;
export const ValueTestSchema = z.object({
  dimension: DimensionSchema,
  value: z.string(),
  n: z.number().int().nonnegative(),
  k: z.number().int().nonnegative(),
  exposureDays: z.number().nonnegative(),
  nRest: z.number().int().nonnegative(),
  kRest: z.number().int().nonnegative(),
  exposureDaysRest: z.number().nonnegative(),
  rateRatio: z.number().nonnegative(),
  p: z.number().min(0).max(1),
  q: z.number().min(0).max(1),
  wilson95: z.tuple([z.number(), z.number()]),
  wilson95Rest: z.tuple([z.number(), z.number()]),
});
export type ValueTest = z.infer<typeof ValueTestSchema>;
export const HypothesisStatsSchema = z.object({
  horizonDays: z.number().positive(),
  testsRun: z.number().int().nonnegative(),
  primary: ValueTestSchema,
  confounders: z.object({
    medianDaysSinceDelivery: z.object({ value: z.number(), rest: z.number() }),
    spread: z.array(
      z.object({
        dimension: DimensionSchema,
        distinctValues: z.number().int(),
        topShare: z.number(),
      }),
    ),
    coincidesWithListingChange: z.boolean(),
  }),
});
export type HypothesisStats = z.infer<typeof HypothesisStatsSchema>;
export const AffectedOrdersSchema = z.object({
  unshipped: z.array(UuidSchema),
  inTransit: z.array(UuidSchema),
  deliveredNoComplaint: z.array(UuidSchema),
  openDisputes: z.array(z.string()),
});
export type AffectedOrders = z.infer<typeof AffectedOrdersSchema>;
