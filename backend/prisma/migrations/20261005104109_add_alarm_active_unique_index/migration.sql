-- CreateIndex
CREATE INDEX "Alarm_createdAt_idx" ON "Alarm"("createdAt");

-- CreateIndex
CREATE INDEX "TelemetryHistory_timestamp_idx" ON "TelemetryHistory"("timestamp");

-- CreateIndex
CREATE INDEX "TelemetrySnapshot15m_bucketTimestamp_idx" ON "TelemetrySnapshot15m"("bucketTimestamp");
