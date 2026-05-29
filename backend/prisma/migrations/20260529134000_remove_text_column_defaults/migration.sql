-- AlterTable: Remove default values from TEXT columns (MySQL strict mode compatibility)
ALTER TABLE `auto_publish_tasks` ALTER `scheduleConfig` DROP DEFAULT;
ALTER TABLE `auto_publish_tasks` ALTER `topicStrategy` DROP DEFAULT;
ALTER TABLE `auto_publish_tasks` ALTER `contentConfig` DROP DEFAULT;
ALTER TABLE `auto_publish_tasks` ALTER `filterConfig` DROP DEFAULT;
ALTER TABLE `auto_publish_tasks` ALTER `publishConfig` DROP DEFAULT;
ALTER TABLE `auto_publish_tasks` ALTER `retryConfig` DROP DEFAULT;
