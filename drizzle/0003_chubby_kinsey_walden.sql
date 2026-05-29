ALTER TABLE "users" ALTER COLUMN "gender" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."user_gender";--> statement-breakpoint
CREATE TYPE "public"."user_gender" AS ENUM('MALE', 'FEMALE', 'OTHER');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "gender" SET DATA TYPE "public"."user_gender" USING "gender"::"public"."user_gender";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::text;--> statement-breakpoint
DROP TYPE "public"."user_status";--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"public"."user_status";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "status" SET DATA TYPE "public"."user_status" USING "status"::"public"."user_status";--> statement-breakpoint
DROP INDEX "permissions_code_unique";--> statement-breakpoint
DROP INDEX "permissions_module_resource_action_unique";--> statement-breakpoint
DROP INDEX "roles_code_unique";--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "created_at" SET DATA TYPE timestamp;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "permissions" ADD COLUMN "group" text NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "permissions" DROP COLUMN "module";--> statement-breakpoint
ALTER TABLE "permissions" DROP COLUMN "resource";--> statement-breakpoint
ALTER TABLE "permissions" DROP COLUMN "action";--> statement-breakpoint
ALTER TABLE "permissions" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "permissions" DROP COLUMN "is_active";--> statement-breakpoint
ALTER TABLE "permissions" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "role_permissions" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "roles" DROP COLUMN "is_system";--> statement-breakpoint
ALTER TABLE "roles" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "roles" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_code_unique" UNIQUE("code");--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_code_unique" UNIQUE("code");--> statement-breakpoint
DROP TYPE "public"."role_status";