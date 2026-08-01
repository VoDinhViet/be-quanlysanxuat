CREATE TYPE "public"."file_kind" AS ENUM('IMAGE', 'DOCUMENT');--> statement-breakpoint
CREATE TYPE "public"."upload_type" AS ENUM('USER_AVATAR', 'MATERIAL_IMAGE', 'MATERIAL_DOCUMENT', 'PRODUCT_IMAGE', 'PRODUCT_DOCUMENT', 'SUPPLIER_LOGO', 'SUPPLIER_DOCUMENT', 'BOM_ITEM_DRAWING', 'ORDER_DOCUMENT');--> statement-breakpoint
CREATE TYPE "public"."user_gender" AS ENUM('MALE', 'FEMALE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('WORKING', 'RESIGNED');--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credentials_username_unique" UNIQUE("username"),
	CONSTRAINT "credentials_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"mimetype" varchar(100) NOT NULL,
	"size" integer NOT NULL,
	"checksum" varchar(64),
	"type" "upload_type" NOT NULL,
	"kind" "file_kind" NOT NULL,
	"storage_driver" varchar(20) DEFAULT 'local' NOT NULL,
	"uploaded_by" uuid,
	"linked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(500),
	"department_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "positions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"gender" "user_gender" DEFAULT 'MALE' NOT NULL,
	"date_of_birth" date,
	"id_number" varchar(20),
	"phone_number" varchar(30),
	"email" varchar(255),
	"address" varchar(500),
	"avatar_file_id" uuid,
	"department_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"hire_date" date NOT NULL,
	"note" varchar(1000),
	"status" "user_status" DEFAULT 'WORKING' NOT NULL,
	"credential_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_code_unique" UNIQUE("code"),
	CONSTRAINT "users_id_number_unique" UNIQUE("id_number")
);
--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_credentials_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_credentials_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_credentials_role_id" ON "credentials" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_files_uploaded_by" ON "files" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "idx_positions_department_id" ON "positions" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_users_department_id" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_users_position_id" ON "users" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "idx_users_credential_id" ON "users" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "idx_users_avatar_file_id" ON "users" USING btree ("avatar_file_id");--> statement-breakpoint
CREATE INDEX "idx_users_created_by" ON "users" USING btree ("created_by");