import { z } from 'zod';

/** `:id` route parameter — every resource is keyed by a UUID. */
export const idParamSchema = z.object({ id: z.string().uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

/** Standard list pagination, with sane defaults and an upper bound. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Prisma `skip`/`take` for a pagination request. */
export function toSkipTake(p: Pagination): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}
