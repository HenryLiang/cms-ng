-- AlterTable: Add PIPELINE_FAILED and AUTO_PUBLISHED to stories.status ENUM
-- Fixes #38: stories.status was missing these values, causing "Data truncated" errors
ALTER TABLE `stories` MODIFY `status` ENUM(
  'DRAFT', 'WRITING', 'AI_OPTIMIZING', 'PENDING_REVIEW', 'IN_REVIEW',
  'REVISION', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'PIPELINE_FAILED', 'AUTO_PUBLISHED'
) NOT NULL DEFAULT 'DRAFT';
