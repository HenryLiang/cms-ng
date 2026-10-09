-- Paddle 订阅镜像表（webhook 驱动，upsert 写入，详见 schema.prisma 注释）

CREATE TABLE `paddle_customers` (
    `customer_id` VARCHAR(64) NOT NULL,
    `email` VARCHAR(255) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `paddle_customers_email_idx`(`email`),
    PRIMARY KEY (`customer_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `paddle_subscriptions` (
    `subscription_id` VARCHAR(64) NOT NULL,
    `customer_id` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `price_id` VARCHAR(64) NOT NULL,
    `product_id` VARCHAR(64) NOT NULL,
    `scheduled_change_action` VARCHAR(16) NULL,
    `scheduled_change_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `paddle_subscriptions_customer_id_idx`(`customer_id`),
    INDEX `paddle_subscriptions_status_idx`(`status`),
    PRIMARY KEY (`subscription_id`),
    CONSTRAINT `paddle_subscriptions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `paddle_customers`(`customer_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
