export type PageQuery = {
  page?: number | string;
  limit?: number | string;
  take?: number | string;
  skip?: number | string;
};

export type PageParams = {
  take: number;
  skip: number;
  page: number;
};

const DEFAULT_TAKE = 20;
const MAX_TAKE = 100;

/** Paginación obligatoria para listados (take ≤ 100, default 20). */
export function parsePagination(
  q: PageQuery | undefined,
  opts?: { defaultTake?: number; maxTake?: number },
): PageParams {
  const maxTake = opts?.maxTake ?? MAX_TAKE;
  const defaultTake = opts?.defaultTake ?? DEFAULT_TAKE;

  let take = Number(q?.take ?? q?.limit ?? defaultTake);
  if (!Number.isFinite(take) || take < 1) take = defaultTake;
  take = Math.min(Math.floor(take), maxTake);

  let page = Number(q?.page ?? 1);
  if (!Number.isFinite(page) || page < 1) page = 1;
  page = Math.floor(page);

  let skip = Number(q?.skip);
  if (!Number.isFinite(skip) || skip < 0) {
    skip = (page - 1) * take;
  } else {
    skip = Math.floor(skip);
    page = Math.floor(skip / take) + 1;
  }

  return { take, skip, page };
}

export function pageMeta(total: number, params: PageParams) {
  return {
    total,
    page: params.page,
    take: params.take,
    pages: Math.max(1, Math.ceil(total / params.take)),
  };
}
