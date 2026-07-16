-- CreateTable
CREATE TABLE `media_assets` (
    `id` VARCHAR(191) NOT NULL,
    `storageKey` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `thumbnailUrl` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `mimeType` VARCHAR(191) NOT NULL,
    `size` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `source` ENUM('UPLOAD', 'AI_GENERATED') NOT NULL DEFAULT 'UPLOAD',
    `sourceRef` VARCHAR(191) NULL,
    `prompt` TEXT NULL,
    `altText` VARCHAR(191) NULL,
    `title` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `tags` VARCHAR(191) NOT NULL DEFAULT '[]',
    `ownerId` VARCHAR(191) NOT NULL,
    `libraryType` ENUM('PERSONAL', 'TEAM') NOT NULL DEFAULT 'PERSONAL',
    `teamId` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'ARCHIVED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `media_assets_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    INDEX `media_assets_source_idx`(`source`),
    INDEX `media_assets_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
