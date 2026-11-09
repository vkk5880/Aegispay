import {
  pgTable,
  varchar,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export const userMemoriesTable = pgTable('user_memories', {
  userId: varchar('user_id', { length: 64 }).primaryKey(),
  universal: jsonb('universal').notNull(),
  domainFacets: jsonb('domain_facets').notNull().default({}),
  purchaseVelocity: jsonb('purchase_velocity').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const userMemories = userMemoriesTable;

export type UserMemory = typeof userMemoriesTable.$inferSelect;
export type NewUserMemory = typeof userMemoriesTable.$inferInsert;
