CREATE TABLE `article_status_audits` (
  `id` VARCHAR(191) NOT NULL,
  `articleId` VARCHAR(191) NOT NULL,
  `fromStatus` ENUM('DRAFT', 'WRITING', 'AI_OPTIMIZING', 'PENDING_REVIEW', 'IN_REVIEW', 'REVISION', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'PIPELINE_FAILED', 'AUTO_PUBLISHED') NOT NULL,
  `toStatus` ENUM('DRAFT', 'WRITING', 'AI_OPTIMIZING', 'PENDING_REVIEW', 'IN_REVIEW', 'REVISION', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'PIPELINE_FAILED', 'AUTO_PUBLISHED') NOT NULL,
  `operatorId` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `article_status_audits_articleId_createdAt_idx` (`articleId`, `createdAt`),
  INDEX `article_status_audits_operatorId_idx` (`operatorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `article_status_audits`
  ADD CONSTRAINT `article_status_audits_articleId_fkey`
  FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `article_status_audits`
  ADD CONSTRAINT `article_status_audits_operatorId_fkey`
  FOREIGN KEY (`operatorId`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
