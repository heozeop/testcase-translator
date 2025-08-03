export interface BaseRepositoryInterface<T, ID = string> {
  findAll(): Promise<T[]>;
  findById(id: ID): Promise<T | null>;
  create(entity: Partial<T>): Promise<T>;
  update(id: ID, updates: Partial<T>): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
  exists(id: ID): Promise<boolean>;
  count(): Promise<number>;
}
