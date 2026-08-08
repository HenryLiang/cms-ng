-- 文生视频 P0(PRD: docs/PRD-text-to-video.md)
-- 注:本迁移在无 DB 连接环境下手写,DDL 风格对齐 prisma migrate 产物;有库后可用
-- `prisma migrate diff` 校验等价性。

-- AlterEnum: billing_transactions.type 增加 AI_VIDEO
ALTER TABLE `billing_transactions` MODIFY `type` ENUM('TOP_UP', 'AI_LLM', 'AI_IMAGE', 'AI_VIDEO', 'PUBLISH', 'AUTO_PUBLISH', 'DATA_FETCH', 'REFUND', 'ADJUSTMENT') NOT NULL;

-- AlterTable: media_assets 增加视频时长(秒),图片为 NULL
ALTER TABLE `media_assets` ADD COLUMN `duration` INTEGER NULL;

-- CreateTable
CREATE TABLE `video_generation_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `mode` ENUM('TEXT_TO_CLIP', 'ARTICLE_TO_VIDEO') NOT NULL DEFAULT 'TEXT_TO_CLIP',
    `status` ENUM('PENDING', 'SCRIPTING', 'STORYBOARDING', 'ASSETS_GENERATING', 'VOICE_SYNTHESIZING', 'COMPOSING', 'UPLOADING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `failedStep` VARCHAR(50) NULL,
    `prompt` TEXT NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `provider` VARCHAR(20) NOT NULL,
    `providerTaskId` VARCHAR(100) NULL,
    `durationSec` INTEGER NULL,
    `resolution` VARCHAR(10) NULL,
    `aspectRatio` VARCHAR(10) NULL,
    `costEstimate` DOUBLE NULL,
    `costActual` DOUBLE NULL,
    `resultAssetId` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `video_generation_jobs_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `video_generation_jobs_status_updatedAt_idx`(`status`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `video_generation_jobs` ADD CONSTRAINT `video_generation_jobs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
