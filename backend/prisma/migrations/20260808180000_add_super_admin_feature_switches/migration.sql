-- Add the independently privileged SUPER_ADMIN role.
ALTER TABLE `users`
  MODIFY `role` ENUM('REPORTER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN') NOT NULL DEFAULT 'REPORTER';

CREATE INDEX `users_role_isActive_idx` ON `users`(`role`, `isActive`);

-- Preserve access on upgrade: promote the earliest active admin only when no
-- super administrator exists yet. The bootstrap script remains the recovery path.
SET @super_admin_exists = (
  SELECT COUNT(*) FROM `users` WHERE `role` = 'SUPER_ADMIN'
);
SET @super_admin_candidate = (
  SELECT `id`
  FROM `users`
  WHERE `role` = 'ADMIN' AND `isActive` = TRUE
  ORDER BY `createdAt` ASC
  LIMIT 1
);
UPDATE `users`
SET `role` = 'SUPER_ADMIN'
WHERE `id` = @super_admin_candidate AND @super_admin_exists = 0;

CREATE TABLE `system_feature_switches` (
  `feature` VARCHAR(64) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `updatedById` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `system_feature_switches_updatedById_idx` (`updatedById`),
  PRIMARY KEY (`feature`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `system_feature_audits` (
  `id` VARCHAR(191) NOT NULL,
  `feature` VARCHAR(64) NOT NULL,
  `previousEnabled` BOOLEAN NOT NULL,
  `enabled` BOOLEAN NOT NULL,
  `operatorId` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `system_feature_audits_feature_createdAt_idx` (`feature`, `createdAt`),
  INDEX `system_feature_audits_operatorId_idx` (`operatorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `system_feature_switches`
  ADD CONSTRAINT `system_feature_switches_updatedById_fkey`
  FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `system_feature_audits`
  ADD CONSTRAINT `system_feature_audits_feature_fkey`
  FOREIGN KEY (`feature`) REFERENCES `system_feature_switches`(`feature`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `system_feature_audits`
  ADD CONSTRAINT `system_feature_audits_operatorId_fkey`
  FOREIGN KEY (`operatorId`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
