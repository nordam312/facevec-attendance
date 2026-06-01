/** A page of rows from a service, before serialization. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Standard list envelope: `{ data: [...], meta: { page, pageSize, total, totalPages } }`. */
export function paginatedResponse<T, R>(page: Page<T>, map: (item: T) => R) {
  return {
    data: page.items.map(map),
    meta: {
      page: page.page,
      pageSize: page.pageSize,
      total: page.total,
      totalPages: Math.max(1, Math.ceil(page.total / page.pageSize)),
    },
  };
}
