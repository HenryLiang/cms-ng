-- CreateTable
CREATE TABLE `trending_topics` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `source` VARCHAR(191) NULL,
    `heatScore` INTEGER NOT NULL DEFAULT 0,
    `tags` VARCHAR(191) NOT NULL DEFAULT '[]',
    `status` ENUM('OPEN', 'ADOPTED', 'ARCHIVED') NOT NULL DEFAULT 'OPEN',
    `suggestedAngles` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `adoptedStoryId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
