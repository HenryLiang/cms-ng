-- AlterTable: Add new statuses to ArticleStatus
ALTER TABLE `articles` MODIFY `status` ENUM(
  'DRAFT', 'WRITING', 'AI_OPTIMIZING', 'PENDING_REVIEW', 'IN_REVIEW',
  'REVISION', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'PIPELINE_FAILED', 'AUTO_PUBLISHED'
) NOT NULL DEFAULT 'DRAFT';

-- CreateTable: auto_publish_tasks
CREATE TABLE `auto_publish_tasks` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('ACTIVE', 'PAUSED', 'DISABLED') NOT NULL DEFAULT 'PAUSED',
  `scheduleType` ENUM('FIXED_TIME', 'INTERVAL', 'CRON') NOT NULL DEFAULT 'FIXED_TIME',
  `scheduleConfig` TEXT NOT NULL DEFAULT ('{}'),
  `topicStrategy` TEXT NOT NULL DEFAULT ('{}'),
  `contentConfig` TEXT NOT NULL DEFAULT ('{}'),
  `filterConfig` TEXT NOT NULL DEFAULT ('{}'),
  `publishConfig` TEXT NOT NULL DEFAULT ('{}'),
  `batchSize` INTEGER NOT NULL DEFAULT 1,
  `retryConfig` TEXT NOT NULL DEFAULT ('{}'),
  `lastRunAt` DATETIME(3) NULL,
  `nextRunAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `createdBy` VARCHAR(191) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: auto_publish_runs
CREATE TABLE `auto_publish_runs` (
  `id` VARCHAR(191) NOT NULL,
  `status` ENUM('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'RUNNING',
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completedAt` DATETIME(3) NULL,
  `totalArticles` INTEGER NOT NULL DEFAULT 0,
  `successCount` INTEGER NOT NULL DEFAULT 0,
  `failedCount` INTEGER NOT NULL DEFAULT 0,
  `errorLog` TEXT NULL,
  `triggerType` ENUM('SCHEDULED', 'MANUAL') NOT NULL DEFAULT 'SCHEDULED',
  `taskId` VARCHAR(191) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: auto_publish_articles
CREATE TABLE `auto_publish_articles` (
  `id` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'TOPIC_SELECTED', 'RESEARCHED', 'DRAFTED', 'IMAGED', 'SAVED', 'PUBLISHED', 'FAILED', 'WITHDRAWN') NOT NULL DEFAULT 'PENDING',
  `topic` VARCHAR(191) NULL,
  `articleId` VARCHAR(191) NULL,
  `platformPublishId` VARCHAR(191) NULL,
  `failedStep` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `retryCount` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  `runId` VARCHAR(191) NOT NULL,
  `taskId` VARCHAR(191) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey: auto_publish_tasks → users
ALTER TABLE `auto_publish_tasks` ADD CONSTRAINT `auto_publish_tasks_createdBy_fkey`
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: auto_publish_runs → auto_publish_tasks
ALTER TABLE `auto_publish_runs` ADD CONSTRAINT `auto_publish_runs_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `auto_publish_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: auto_publish_articles → auto_publish_runs
ALTER TABLE `auto_publish_articles` ADD CONSTRAINT `auto_publish_articles_runId_fkey`
  FOREIGN KEY (`runId`) REFERENCES `auto_publish_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: auto_publish_articles → auto_publish_tasks
ALTER TABLE `auto_publish_articles` ADD CONSTRAINT `auto_publish_articles_taskId_fkey`
  FOREIGN KEY (`taskId`) REFERENCES `auto_publish_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
