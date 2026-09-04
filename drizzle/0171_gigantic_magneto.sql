ALTER TABLE "clients" DROP CONSTRAINT "clients_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "uq_clients_code_active" ON "clients" USING btree ("code") WHERE deleted_at IS NULL;