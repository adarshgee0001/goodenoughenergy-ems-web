BEGIN;
UPDATE _prisma_migrations
SET checksum = 'd2de481b813c3924a24d80922329fc3dac4973c4629c383324199ab1fc29bd52'
WHERE migration_name = '20260914151234_device_mapping_ownership'
  AND checksum = 'eeeac3d31f95eb5dd20309b4fdec61cde45793e2cc606864c40aab04e41b7be9';
COMMIT;