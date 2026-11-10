import {
  pgTable,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import type { ProductCardData } from '@aegispay/shared-types';

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    buyer_id: varchar('buyer_id', { length: 64 }).notNull(),
    title: varchar('title', { length: 255 }).notNull().default('New Shopping Session'),
    metadata: jsonb('metadata'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    buyerIdIdx: index('idx_chat_sessions_buyer_id').on(table.buyer_id),
    updatedAtIdx: index('idx_chat_sessions_updated_at').on(table.updated_at),
  })
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    session_id: varchar('session_id', { length: 64 })
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull(), // 'user' | 'assistant' | 'system'
    content: text('content').notNull(),
    action: varchar('action', { length: 32 }), // 'DISCOVER' | 'COMPARE' | 'DETAILS' | 'BUY'
    selected_product_ids: text('selected_product_ids').array(),
    attached_products: jsonb('attached_products').$type<ProductCardData[]>(),
    tool_calls: jsonb('tool_calls'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdIdx: index('idx_chat_messages_session_id').on(table.session_id),
    createdAtIdx: index('idx_chat_messages_created_at').on(table.created_at),
  })
);

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;

export type ChatMessageRow = typeof chatMessages.$inferSelect;
export type NewChatMessageRow = typeof chatMessages.$inferInsert;
