-- AlterTable
ALTER TABLE `auto_publish_articles` ADD COLUMN `executionTrace` LONGTEXT NULL,
    ADD COLUMN `totalDurationMs` INTEGER NULL;
