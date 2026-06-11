-- AlterTable
ALTER TABLE `users` ADD COLUMN `balance` DECIMAL(12, 4) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `billing_configs` (
    `id` VARCHAR(191) NOT NULL,
    `category` ENUM('AI', 'PUBLISHING', 'OTHER') NOT NULL,
    `itemKey` VARCHAR(191) NOT NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `unitPrice` DECIMAL(12, 4) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NULL,

    UNIQUE INDEX `billing_configs_category_itemKey_key`(`category`, `itemKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `top_up_records` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 4) NOT NULL,
    `creditsAdded` DECIMAL(12, 4) NOT NULL,
    `bonusCredits` DECIMAL(12, 4) NOT NULL DEFAULT 0,
    `paymentMethod` ENUM('ALIPAY', 'WECHAT_PAY', 'BANK_TRANSFER', 'MANUAL') NOT NULL,
    `externalOrderId` VARCHAR(255) NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `top_up_records_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `top_up_records_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `billing_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` ENUM('TOP_UP', 'AI_LLM', 'AI_IMAGE', 'PUBLISH', 'AUTO_PUBLISH', 'REFUND', 'ADJUSTMENT') NOT NULL,
    `category` ENUM('AI', 'PUBLISHING', 'OTHER') NOT NULL,
    `amount` DECIMAL(12, 4) NOT NULL,
    `balanceAfter` DECIMAL(12, 4) NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `articleId` VARCHAR(191) NULL,
    `aiOperationId` VARCHAR(191) NULL,
    `platformPublishId` VARCHAR(191) NULL,
    `topUpRecordId` VARCHAR(191) NULL,
    `quantity` DECIMAL(12, 4) NULL,
    `unitPrice` DECIMAL(12, 4) NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'COMPLETED',
    `idempotencyKey` VARCHAR(255) NULL,
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `billing_transactions_aiOperationId_key`(`aiOperationId`),
    UNIQUE INDEX `billing_transactions_platformPublishId_key`(`platformPublishId`),
    UNIQUE INDEX `billing_transactions_topUpRecordId_key`(`topUpRecordId`),
    UNIQUE INDEX `billing_transactions_idempotencyKey_key`(`idempotencyKey`),
    INDEX `billing_transactions_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `billing_transactions_type_createdAt_idx`(`type`, `createdAt`),
    INDEX `billing_transactions_articleId_idx`(`articleId`),
    INDEX `billing_transactions_aiOperationId_idx`(`aiOperationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `balance_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `thresholdAmount` DECIMAL(12, 4) NOT NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `lastTriggeredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `balance_alerts_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `top_up_records` ADD CONSTRAINT `top_up_records_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billing_transactions` ADD CONSTRAINT `billing_transactions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billing_transactions` ADD CONSTRAINT `billing_transactions_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `articles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billing_transactions` ADD CONSTRAINT `billing_transactions_aiOperationId_fkey` FOREIGN KEY (`aiOperationId`) REFERENCES `ai_operations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billing_transactions` ADD CONSTRAINT `billing_transactions_platformPublishId_fkey` FOREIGN KEY (`platformPublishId`) REFERENCES `platform_publishes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billing_transactions` ADD CONSTRAINT `billing_transactions_topUpRecordId_fkey` FOREIGN KEY (`topUpRecordId`) REFERENCES `top_up_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `balance_alerts` ADD CONSTRAINT `balance_alerts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
