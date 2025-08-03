export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface FilterParams {
  [key: string]: any;
}

export interface SortParams {
  field: string;
  order: 'ASC' | 'DESC';
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  page?: number;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
  filters?: FilterParams;
  pagination?: PaginationParams;
  sort?: SortParams;
}

export interface QueryParams {
  filters?: FilterParams;
  pagination?: PaginationParams;
  sort?: SortParams;
}

export interface DatabaseError extends Error {
  code?: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
}
