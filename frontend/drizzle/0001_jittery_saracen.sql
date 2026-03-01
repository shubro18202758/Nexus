CREATE TYPE "public"."opportunity_status" AS ENUM('pending', 'applied', 'rejected');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"url" text NOT NULL,
	"source" text NOT NULL,
	"content" text,
	"ai_summary" text,
	"relevance_score" integer,
	"event_type" text,
	"status" "opportunity_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_url_unique";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "event_date" timestamp;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "metadata" jsonb;