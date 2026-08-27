CREATE TABLE `system_brand_settings` (
  `id` VARCHAR(32) NOT NULL,
  `preset` VARCHAR(32) NOT NULL DEFAULT 'CMS_NG',
  `name` VARCHAR(40) NOT NULL,
  `logoUrl` VARCHAR(500) NULL,
  `logoKey` VARCHAR(500) NULL,
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `system_brand_settings_updatedById_idx` (`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `system_brand_settings`
  ADD CONSTRAINT `system_brand_settings_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
