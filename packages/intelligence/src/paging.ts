// Keyset paging for the intelligence list endpoints (section 11: "?limit= (default 50) and ?cursor="). Lists run
// newest first and the cursor is the id of the last item already received — the convention of the order lists.
import { and, eq, lt, or, type Column, type SQL } from 'drizzle-orm';
import { AppError } from '@fairfold/contracts';

export interface Page {
  limit: number;
  cursor?: string;
}

/** Section 11's default page. */
export const DEFAULT_PAGE: Page = { limit: 50 };

export const invalidCursor = () =>
  new AppError('INVALID_CURSOR', 'The list cursor is not an item of this list', 400);

/** Rows after `anchor` in `created_at desc, id desc` order. */
export function olderThan(
  createdAt: Column,
  id: Column,
  anchor: { createdAt: Date; id: string },
): SQL {
  return or(
    lt(createdAt, anchor.createdAt),
    and(eq(createdAt, anchor.createdAt), lt(id, anchor.id)),
  )!;
}

/** The page after the item whose id is `page.cursor`, for a list that is already complete and ordered in memory. */
export function pageAfter<T>(items: T[], idOf: (item: T) => string, page: Page): T[] {
  let start = 0;
  if (page.cursor !== undefined) {
    const at = items.findIndex((item) => idOf(item) === page.cursor);
    if (at < 0) throw invalidCursor();
    start = at + 1;
  }
  return items.slice(start, start + page.limit);
}
