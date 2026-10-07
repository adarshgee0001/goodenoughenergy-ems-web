CREATE UNIQUE INDEX "Alarm_deviceId_faultCode_active_key"
ON "Alarm" ("deviceId", "faultCode")
WHERE "status" = 'ACTIVE'
  AND "faultCode" IS NOT NULL;
