CREATE TYPE "public"."client_status" AS ENUM('ACTIVE', 'PAUSED');--> statement-breakpoint
CREATE TABLE "client_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "client_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "client_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"position" varchar(255),
	"phone_number" varchar(30),
	"email" varchar(255),
	"note" varchar(500),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "client_group_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "tax_code" varchar(50);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "note" varchar(1000);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "status" "client_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_client_contacts_client_id" ON "client_contacts" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_client_group_id_client_groups_id_fk" FOREIGN KEY ("client_group_id") REFERENCES "public"."client_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_clients_client_group_id" ON "clients" USING btree ("client_group_id");--> statement-breakpoint
CREATE INDEX "idx_clients_status" ON "clients" USING btree ("status") WHERE deleted_at IS NULL;