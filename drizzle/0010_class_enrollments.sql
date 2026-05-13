CREATE TYPE "public"."class_enrollment_status" AS ENUM('active', 'completed', 'dropped');--> statement-breakpoint
ALTER TABLE "class_students" RENAME TO "class_enrollments";--> statement-breakpoint
ALTER TABLE "class_enrollments" DROP CONSTRAINT "class_students_class_id_student_id_pk";--> statement-breakpoint
ALTER TABLE "class_enrollments" DROP CONSTRAINT "class_students_class_id_classes_id_fk";--> statement-breakpoint
ALTER TABLE "class_enrollments" DROP CONSTRAINT "class_students_student_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "class_enrollments" RENAME COLUMN "created_at" TO "enrolled_at";--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD COLUMN "status" "class_enrollment_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("id");--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_enrollments" ADD CONSTRAINT "class_enrollments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "class_enrollments_class_student_unique" ON "class_enrollments" USING btree ("class_id","student_id");
