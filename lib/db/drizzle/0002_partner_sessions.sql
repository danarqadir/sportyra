CREATE TABLE "partner_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_sessions" ADD CONSTRAINT "partner_sessions_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "partner_sessions_token_hash_idx" ON "partner_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "partner_sessions_partner_id_idx" ON "partner_sessions" USING btree ("partner_id");