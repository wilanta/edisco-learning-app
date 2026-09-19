ALTER TABLE "lessons" ALTER COLUMN "embedding" SET DATA TYPE vector(1536);--> statement-breakpoint
CREATE INDEX "lessons_embedding_hnsw_idx" ON "lessons" USING hnsw ("embedding" vector_cosine_ops);