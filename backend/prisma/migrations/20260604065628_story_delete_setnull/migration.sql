-- DropForeignKey
ALTER TABLE `articles` DROP FOREIGN KEY `articles_storyId_fkey`;

-- DropIndex
DROP INDEX `articles_storyId_fkey` ON `articles`;

-- AlterTable
ALTER TABLE `articles` MODIFY `storyId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `articles` ADD CONSTRAINT `articles_storyId_fkey` FOREIGN KEY (`storyId`) REFERENCES `stories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
