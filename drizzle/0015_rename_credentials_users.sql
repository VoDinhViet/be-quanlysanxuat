ALTER TYPE "public"."employee_status" RENAME TO "user_status";--> statement-breakpoint
ALTER TABLE "users" RENAME TO "credentials";--> statement-breakpoint
ALTER TABLE "credentials" RENAME CONSTRAINT "users_pkey" TO "credentials_pkey";--> statement-breakpoint
ALTER TABLE "credentials" RENAME CONSTRAINT "users_username_unique" TO "credentials_username_unique";--> statement-breakpoint
ALTER TABLE "credentials" RENAME CONSTRAINT "users_email_unique" TO "credentials_email_unique";--> statement-breakpoint
ALTER TABLE "credentials" DROP CONSTRAINT "users_code_unique";--> statement-breakpoint
ALTER TABLE "credentials" DROP COLUMN "code";--> statement-breakpoint
ALTER TABLE "products" RENAME CONSTRAINT "products_created_by_users_id_fk" TO "products_created_by_credentials_id_fk";--> statement-breakpoint
ALTER TABLE "employees" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "employees_pkey" TO "users_pkey";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "employees_code_unique" TO "users_code_unique";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "employees_id_number_unique" TO "users_id_number_unique";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "employees_department_id_departments_id_fk" TO "users_department_id_departments_id_fk";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "employees_position_id_positions_id_fk" TO "users_position_id_positions_id_fk";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "user_id" TO "credential_id";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "employees_user_id_users_id_fk" TO "users_credential_id_credentials_id_fk";--> statement-breakpoint
ALTER TABLE "users" RENAME CONSTRAINT "employees_created_by_users_id_fk" TO "users_created_by_credentials_id_fk";
