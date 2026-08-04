-- AlterTable
ALTER TABLE `ai_operations` ADD COLUMN `mediaAssetId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `media_assets` ADD COLUMN `aiTags` VARCHAR(1000) NOT NULL DEFAULT '[]',
    ADD COLUMN `tagError` VARCHAR(500) NULL,
    ADD COLUMN `tagRetryCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `tagStatus` ENUM('NONE', 'PENDING', 'TAGGING', 'DONE', 'FAILED') NOT NULL DEFAULT 'NONE',
    ADD COLUMN `taggedAt` DATETIME(3) NULL,
    MODIFY `tags` VARCHAR(1000) NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE INDEX `ai_operations_mediaAssetId_idx` ON `ai_operations`(`mediaAssetId`);

-- CreateIndex
CREATE INDEX `media_assets_tagStatus_updatedAt_idx` ON `media_assets`(`tagStatus`, `updatedAt`);

