CREATE TABLE "web_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" varchar(36) NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_reading_progress" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "web_reading_progress_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bookId" varchar(512) NOT NULL,
	"bookTitle" varchar(512),
	"position" varchar(1024) NOT NULL,
	"currentPage" integer,
	"totalPages" integer,
	"progress" real NOT NULL,
	"epubUrl" varchar(1024),
	"renderSettings" text,
	"excerpt" varchar(2048),
	"source" varchar(32),
	"updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" varchar(36) NOT NULL,
	CONSTRAINT "web_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "web_sync_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "web_sync_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"bookId" varchar(512) NOT NULL,
	"position" varchar(1024) NOT NULL,
	"currentPage" integer,
	"totalPages" integer,
	"progress" real NOT NULL,
	"excerpt" varchar(2048),
	"source" varchar(32) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" varchar(255) NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "web_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "web_verifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "web_accounts" ADD CONSTRAINT "web_accounts_userId_web_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."web_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_userId_web_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."web_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "web_accounts" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "book_id_idx" ON "web_reading_progress" USING btree ("bookId");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "web_sessions" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "sync_history_book_id_idx" ON "web_sync_history" USING btree ("bookId");--> statement-breakpoint
CREATE INDEX "sync_history_book_source_idx" ON "web_sync_history" USING btree ("bookId","source");