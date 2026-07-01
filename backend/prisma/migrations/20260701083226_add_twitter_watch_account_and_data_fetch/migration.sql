-- AlterTable
ALTER TABLE `billing_transactions` MODIFY `type` ENUM('TOP_UP', 'AI_LLM', 'AI_IMAGE', 'PUBLISH', 'AUTO_PUBLISH', 'DATA_FETCH', 'REFUND', 'ADJUSTMENT') NOT NULL;

-- CreateTable
CREATE TABLE `twitter_watch_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `userName` VARCHAR(191) NOT NULL,
    `displayName` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `twitter_watch_accounts_userName_key`(`userName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
