-- Add a per-user display-language preference. Content-language preferences
-- become nullable-without-default so users may inherit the system default.
ALTER TABLE `users`
  ADD COLUMN `displayLanguage` VARCHAR(16) NULL;

-- The previous schema wrote Simplified Chinese into every account by default,
-- so those legacy values cannot represent an explicit personal choice. Clear
-- them once so existing accounts can inherit the new system-level default.
UPDATE `users`
  SET `preferredLanguage` = NULL
  WHERE `preferredLanguage` = 'SIMPLIFIED_CHINESE';

ALTER TABLE `users`
  ALTER COLUMN `preferredLanguage` DROP DEFAULT;

CREATE TABLE `system_language_settings` (
  `id` VARCHAR(32) NOT NULL,
  `displayLanguage` VARCHAR(16) NOT NULL DEFAULT 'zh-CN',
  `contentLanguage` ENUM(
    'SIMPLIFIED_CHINESE',
    'TRADITIONAL_CHINESE_HK',
    'TRADITIONAL_CHINESE_CANTONESE',
    'ENGLISH'
  ) NOT NULL DEFAULT 'SIMPLIFIED_CHINESE',
  `updatedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `system_language_settings_updatedById_idx` (`updatedById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `system_language_settings`
  ADD CONSTRAINT `system_language_settings_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
