CREATE TABLE "web_api_keys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "web_api_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" varchar(36) NOT NULL,
	"prefix" varchar(16) NOT NULL,
	"keyHash" varchar(64) NOT NULL,
	"name" varchar(128) DEFAULT 'KOReader' NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revokedAt" timestamp with time zone,
	CONSTRAINT "web_api_keys_keyHash_unique" UNIQUE("keyHash")
);
--> statement-breakpoint
ALTER TABLE "web_api_keys" ADD CONSTRAINT "web_api_keys_userId_web_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."web_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "web_api_keys" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "api_keys_key_hash_idx" ON "web_api_keys" USING btree ("keyHash");