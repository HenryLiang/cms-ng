-- AlterTable
ALTER TABLE `video_generation_jobs` ADD COLUMN `lastFrameAssetId` VARCHAR(191) NULL,
    ADD COLUMN `submitOptions` TEXT NULL;
