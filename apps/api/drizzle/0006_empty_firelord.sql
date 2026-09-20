CREATE TYPE "public"."theme_preference" AS ENUM('LIGHT', 'DARK');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" "theme_preference" DEFAULT 'LIGHT' NOT NULL;