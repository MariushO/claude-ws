/**
 * Project CRUD service - list, get, create, update, delete projects in SQLite via Drizzle ORM
 */
import { eq, desc } from 'drizzle-orm';
import * as schema from '../../db/database-schema.ts';
import { generateId } from '../../lib/nanoid-id-generator.ts';

export function createProjectService(db: any) {
  return {
    async list() {
      return db.select().from(schema.projects).orderBy(desc(schema.projects.createdAt)).all();
    },

    async getById(id: string) {
      return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    },

    async getByPath(path: string) {
      return db.select().from(schema.projects).where(eq(schema.projects.path, path)).get();
    },

    async create(data: { id?: string; name: string; path: string }) {
      const id = data.id || generateId('proj');
      const project = { id, name: data.name, path: data.path, createdAt: Date.now() };
      await db.insert(schema.projects).values(project);
      return project;
    },

    async update(id: string, data: Partial<{ name: string; path: string }>) {
      // Build selective update — only include provided fields
      const updateData: any = {};
      if (data.name) updateData.name = data.name;
      if (data.path) updateData.path = data.path;

      const result = await db.update(schema.projects).set(updateData).where(eq(schema.projects.id, id));
      // result.changes === 0 means project not found
      if (result.changes === 0) return null;
      return db.select().from(schema.projects).where(eq(schema.projects.id, id)).get();
    },

    async remove(id: string) {
      const result = await db.delete(schema.projects).where(eq(schema.projects.id, id));
      return result.changes > 0;
    },
  };
}
