import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

export const pace = pgEnum('pace', ['CASUAL', 'REGULAR', 'INTENSIVE']);
export const category = pgEnum('category', [
  'PROGRAMMING',
  'LANGUAGE',
  'MATH',
  'SCIENCE',
  'ENGINEERING',
  'GENERAL',
]);
export const partType = pgEnum('part_type', [
  'MULTIPLE_CHOICE',
  'FILL_IN_BLANK',
  'MATCHING',
  'TRUE_FALSE',
  'CODE_PREDICT',
  'TRANSLATE',
  'SHORT_ANSWER',
]);
export const lessonStatus = pgEnum('lesson_status', [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
]);
export const generationStatus = pgEnum('generation_status', [
  'PENDING',
  'PROCESSING',
  'DONE',
  'FAILED',
]);

export const EMBEDDING_DIMENSIONS = 1536;

export const users = pgTable(
  'users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull().unique(),
    passwordHash: text('password_hash'),
    name: text().notNull(),
    pace: pace(),
    interests: text().array(),
    freeGenerationsLeft: integer('free_generations_left').notNull().default(3),
    totalXp: integer('total_xp').notNull().default(0),
    currentStreak: integer('current_streak').notNull().default(0),
    longestStreak: integer('longest_streak').notNull().default(0),
    lastActivityDate: date('last_activity_date'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'users_nonnegative_counters',
      sql`${t.freeGenerationsLeft} >= 0 AND ${t.totalXp} >= 0 AND ${t.currentStreak} >= 0 AND ${t.longestStreak} >= 0`,
    ),
  ],
);

export const tracks = pgTable(
  'tracks',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    category: category().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('tracks_id_user_unique').on(t.id, t.userId),
    index('tracks_user_idx').on(t.userId),
  ],
);

export const lessons = pgTable(
  'lessons',
  {
    id: uuid().primaryKey().defaultRandom(),
    trackTemplateTopic: text('track_template_topic').notNull(),
    category: category().notNull(),
    title: text().notNull(),
    description: text().notNull(),
    // Legacy content remains owned/readable; only compatible vectors are reused.
    embedding: vector({ dimensions: EMBEDDING_DIMENSIONS }),
    embeddingProfile: text('embedding_profile'),
    generationPace: pace('generation_pace'),
    generationContext: text('generation_context'),
    contentVersion: integer('content_version').notNull().default(1),
    generatedByUserId: uuid('generated_by_user_id')
      .notNull()
      .references(() => users.id),
    isExpiredForReuse: boolean('is_expired_for_reuse').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('lessons_generator_idx').on(t.generatedByUserId),
    index('lessons_topic_category_idx').on(t.trackTemplateTopic, t.category),
    index('lessons_expiry_idx').on(t.expiresAt),
    index('lessons_embedding_hnsw_idx').using(
      'hnsw',
      t.embedding.op('vector_cosine_ops'),
    ),
  ],
);

export const parts = pgTable(
  'parts',
  {
    id: uuid().primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id),
    order: integer().notNull(),
    type: partType().notNull(),
    promptContent: jsonb('prompt_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('parts_lesson_order_unique').on(t.lessonId, t.order),
    check('parts_order_range', sql`${t.order} BETWEEN 1 AND 5`),
  ],
);

export const userLessons = pgTable(
  'user_lessons',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id),
    trackId: uuid('track_id').notNull(),
    orderInTrack: integer('order_in_track').notNull(),
    status: lessonStatus().notNull(),
    wasReused: boolean('was_reused').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'user_lessons_track_owner_fk',
      columns: [t.trackId, t.userId],
      foreignColumns: [tracks.id, tracks.userId],
    }),
    unique('user_lessons_track_order_unique').on(t.trackId, t.orderInTrack),
    check('user_lessons_positive_order', sql`${t.orderInTrack} > 0`),
    index('user_lessons_user_idx').on(t.userId),
    index('user_lessons_lesson_idx').on(t.lessonId),
  ],
);

export const userPartProgress = pgTable(
  'user_part_progress',
  {
    id: uuid().primaryKey().defaultRandom(),
    userLessonId: uuid('user_lesson_id')
      .notNull()
      .references(() => userLessons.id),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id),
    isCorrect: boolean('is_correct'),
    attempts: integer().notNull().default(0),
    xpEarned: integer('xp_earned').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('user_part_progress_assignment_part_unique').on(
      t.userLessonId,
      t.partId,
    ),
    check(
      'user_part_progress_nonnegative_counters',
      sql`${t.attempts} >= 0 AND ${t.xpEarned} >= 0`,
    ),
    index('user_part_progress_part_idx').on(t.partId),
  ],
);

export const generationJobs = pgTable(
  'generation_jobs',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    trackId: uuid('track_id'),
    requestedTopic: text('requested_topic').notNull(),
    category: category().notNull(),
    status: generationStatus().notNull(),
    resultLessonId: uuid('result_lesson_id').references(() => lessons.id),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'generation_jobs_track_owner_fk',
      columns: [t.trackId, t.userId],
      foreignColumns: [tracks.id, tracks.userId],
    }),
    index('generation_jobs_user_idx').on(t.userId),
    index('generation_jobs_track_idx').on(t.trackId),
    index('generation_jobs_result_idx').on(t.resultLessonId),
  ],
);

export const weeklyLeagueEntries = pgTable(
  'weekly_league_entries',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    weekStartDate: date('week_start_date').notNull(),
    xpThisWeek: integer('xp_this_week').notNull().default(0),
    rank: integer(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('weekly_league_entries_user_week_unique').on(
      t.userId,
      t.weekStartDate,
    ),
    check('weekly_league_entries_nonnegative_xp', sql`${t.xpThisWeek} >= 0`),
    check('weekly_league_entries_positive_rank', sql`${t.rank} > 0`),
    check(
      'weekly_league_entries_monday',
      sql`extract(isodow FROM ${t.weekStartDate}) = 1`,
    ),
    index('weekly_league_entries_week_xp_idx').on(
      t.weekStartDate,
      t.xpThisWeek.desc(),
    ),
  ],
);
