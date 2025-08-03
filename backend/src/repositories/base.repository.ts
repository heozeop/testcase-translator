import { EntityRepository, EntityManager } from '@mikro-orm/core';
import { BaseRepositoryInterface } from './base.repository.interface';

export abstract class BaseRepository<T extends object, ID = string>
  implements BaseRepositoryInterface<T, ID>
{
  constructor(
    protected readonly repository: EntityRepository<T>,
    protected readonly em: EntityManager,
  ) {}

  async findAll(): Promise<T[]> {
    return this.repository.findAll();
  }

  async findById(id: ID): Promise<T | null> {
    return this.repository.findOne(id as any);
  }

  async create(entity: Partial<T>): Promise<T> {
    const newEntity = this.repository.create(entity);
    await this.em.persistAndFlush(newEntity);
    return newEntity;
  }

  async update(id: ID, updates: Partial<T>): Promise<T | null> {
    const entity = await this.findById(id);
    if (!entity) {
      return null;
    }

    this.repository.assign(entity, updates);
    await this.em.persistAndFlush(entity);
    return entity;
  }

  async delete(id: ID): Promise<boolean> {
    const entity = await this.findById(id);
    if (!entity) {
      return false;
    }

    await this.em.removeAndFlush(entity);
    return true;
  }

  async exists(id: ID): Promise<boolean> {
    const count = await this.repository.count({ id } as any);
    return count > 0;
  }

  async count(): Promise<number> {
    return this.repository.count();
  }
}
