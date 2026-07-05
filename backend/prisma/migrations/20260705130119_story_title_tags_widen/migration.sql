-- AlterTable
ALTER TABLE `stories` MODIFY `title` TEXT NOT NULL,
    MODIFY `tags` VARCHAR(1000) NOT NULL DEFAULT '[]';
