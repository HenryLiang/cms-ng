-- CreateTable
CREATE TABLE `platform_publishes` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'GENERATING', 'READY', 'SCHEDULED', 'PUBLISHED', 'FAILED') NOT NULL DEFAULT 'DRAFT',
    `adaptedTitle` VARCHAR(191) NULL,
    `adaptedContent` TEXT NULL,
    `adaptedExcerpt` TEXT NULL,
    `adaptedTags` VARCHAR(191) NOT NULL DEFAULT '[]',
    `coverImages` VARCHAR(191) NOT NULL DEFAULT '[]',
    `scheduledAt` DATETIME(3) NULL,
    `publishedAt` DATETIME(3) NULL,
    `publishedUrl` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `platform_publishes_articleId_platform_key`(`articleId`, `platform`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `platform_publishes` ADD CONSTRAINT `platform_publishes_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
