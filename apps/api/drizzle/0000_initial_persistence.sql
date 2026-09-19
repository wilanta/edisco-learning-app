-- Initial schema: rollback is destructive; use a forward migration after deployment.
-- Extension initialization must also work on databases outside Docker Compose.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('PROGRAMMING', 'LANGUAGE', 'MATH', 'SCIENCE', 'ENGINEERING', 'GENERAL');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."lesson_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."pace" AS ENUM('CASUAL', 'REGULAR', 'INTENSIVE');--> statement-breakpoint
CREATE TYPE "public"."part_type" AS ENUM('MULTIPLE_CHOICE', 'FILL_IN_BLANK', 'MATCHING', 'TRUE_FALSE', 'CODE_PREDICT', 'TRANSLATE', 'SHORT_ANSWER');--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"track_id" uuid,
	"requested_topic" text NOT NULL,
	"category" "category" NOT NULL,
	"status" "generation_status" NOT NULL,
	"result_lesson_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_template_topic" text NOT NULL,
	"category" "category" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"embedding" vector NOT NULL,
	"content_version" integer DEFAULT 1 NOT NULL,
	"generated_by_user_id" uuid NOT NULL,
	"is_expired_for_reuse" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lesson_id" uuid NOT NULL,
	"order" integer NOT NULL,
	"type" "part_type" NOT NULL,
	"prompt_content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parts_lesson_order_unique" UNIQUE("lesson_id","order"),
	CONSTRAINT "parts_order_range" CHECK ("parts"."order" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"category" "category" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracks_id_user_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"order_in_track" integer NOT NULL,
	"status" "lesson_status" NOT NULL,
	"was_reused" boolean NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_lessons_track_order_unique" UNIQUE("track_id","order_in_track"),
	CONSTRAINT "user_lessons_positive_order" CHECK ("user_lessons"."order_in_track" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_part_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_lesson_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"is_correct" boolean,
	"attempts" integer DEFAULT 0 NOT NULL,
	"xp_earned" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_part_progress_assignment_part_unique" UNIQUE("user_lesson_id","part_id"),
	CONSTRAINT "user_part_progress_nonnegative_counters" CHECK ("user_part_progress"."attempts" >= 0 AND "user_part_progress"."xp_earned" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"pace" "pace" NOT NULL,
	"interests" text[] NOT NULL,
	"free_generations_left" integer DEFAULT 3 NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" date,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_nonnegative_counters" CHECK ("users"."free_generations_left" >= 0 AND "users"."total_xp" >= 0 AND "users"."current_streak" >= 0 AND "users"."longest_streak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "weekly_league_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start_date" date NOT NULL,
	"xp_this_week" integer DEFAULT 0 NOT NULL,
	"rank" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_league_entries_user_week_unique" UNIQUE("user_id","week_start_date"),
	CONSTRAINT "weekly_league_entries_nonnegative_xp" CHECK ("weekly_league_entries"."xp_this_week" >= 0),
	CONSTRAINT "weekly_league_entries_positive_rank" CHECK ("weekly_league_entries"."rank" > 0),
	CONSTRAINT "weekly_league_entries_monday" CHECK (extract(isodow FROM "weekly_league_entries"."week_start_date") = 1)
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_result_lesson_id_lessons_id_fk" FOREIGN KEY ("result_lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_track_owner_fk" FOREIGN KEY ("track_id","user_id") REFERENCES "public"."tracks"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lessons" ADD CONSTRAINT "user_lessons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lessons" ADD CONSTRAINT "user_lessons_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lessons" ADD CONSTRAINT "user_lessons_track_owner_fk" FOREIGN KEY ("track_id","user_id") REFERENCES "public"."tracks"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_part_progress" ADD CONSTRAINT "user_part_progress_user_lesson_id_user_lessons_id_fk" FOREIGN KEY ("user_lesson_id") REFERENCES "public"."user_lessons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_part_progress" ADD CONSTRAINT "user_part_progress_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_league_entries" ADD CONSTRAINT "weekly_league_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_jobs_user_idx" ON "generation_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "generation_jobs_track_idx" ON "generation_jobs" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "generation_jobs_result_idx" ON "generation_jobs" USING btree ("result_lesson_id");--> statement-breakpoint
CREATE INDEX "lessons_generator_idx" ON "lessons" USING btree ("generated_by_user_id");--> statement-breakpoint
CREATE INDEX "lessons_topic_category_idx" ON "lessons" USING btree ("track_template_topic","category");--> statement-breakpoint
CREATE INDEX "lessons_expiry_idx" ON "lessons" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tracks_user_idx" ON "tracks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_lessons_user_idx" ON "user_lessons" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_lessons_lesson_idx" ON "user_lessons" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "user_part_progress_part_idx" ON "user_part_progress" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "weekly_league_entries_week_xp_idx" ON "weekly_league_entries" USING btree ("week_start_date","xp_this_week" DESC NULLS LAST);
