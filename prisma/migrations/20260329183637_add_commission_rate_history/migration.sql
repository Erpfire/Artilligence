-- CreateTable
CREATE TABLE "commission_rate_history" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "old_percentage" DECIMAL(5,2),
    "new_percentage" DECIMAL(5,2),
    "action" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commission_rate_history_level_idx" ON "commission_rate_history"("level");

-- CreateIndex
CREATE INDEX "commission_rate_history_created_at_idx" ON "commission_rate_history"("created_at");
