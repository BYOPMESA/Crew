import { z } from 'zod';

export const INTERESTS = ['Beaches', 'Nightlife', 'Water sports', 'Cafes', 'Treks', 'Seafood', 'Shopping', 'History'];
export const STAY_STYLES = ['Hostel', '3-star hotel', 'Villa', 'Resort'];
export const VIBES = ['chill', 'balanced', 'packed'];

export const MIN_BUDGET_RUPEES = 1;
export const MAX_BUDGET_RUPEES = 10_000_000;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Not a real date');

export const uuidParam = z.string().uuid();

export const createTripSchema = z
  .object({ name: z.string().trim().min(1).max(80).optional() })
  .strict();

export const tripBasicsSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the trip a name').max(80).optional(),
    crew_name: z.string().trim().max(80).nullable().optional(),
    destination: z.string().trim().max(120).nullable().optional(),
    start_date: isoDate.nullable().optional(),
    end_date: isoDate.nullable().optional(),
    expected_size: z.number().int().min(1).max(20).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date, {
    message: 'End date must be on or after the start date',
    path: ['end_date'],
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const preferencesSchema = z
  .object({
    interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length),
    vibe: z.enum(VIBES).nullable(),
    stay_styles: z.array(z.enum(STAY_STYLES)).max(STAY_STYLES.length),
    must_visit: z.string().trim().max(120).nullable(),
  })
  .strict();

export const budgetSchema = z
  .object({ amount_rupees: z.number().min(MIN_BUDGET_RUPEES).max(MAX_BUDGET_RUPEES) })
  .strict();
