CREATE TYPE "public"."unit_scope" AS ENUM('PRODUCT', 'MATERIAL', 'SEMI_FINISHED');--> statement-breakpoint
CREATE TABLE "unit_scopes" (
	"unit_id" uuid NOT NULL,
	"scope" "unit_scope" NOT NULL,
	CONSTRAINT "unit_scopes_unit_id_scope_pk" PRIMARY KEY("unit_id","scope")
);
--> statement-breakpoint
ALTER TABLE "unit_scopes" ADD CONSTRAINT "unit_scopes_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;