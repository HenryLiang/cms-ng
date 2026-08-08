-- P1(L2 稿件一键成片)checkpoint 字段:口播脚本 / 分镜 JSON / 配音 provider
-- 遵循仓库零 Json 字段惯例:JSON 以 TEXT 存储,应用层 safeJsonParse
ALTER TABLE `video_generation_jobs`
  ADD COLUMN `script` TEXT NULL,
  ADD COLUMN `storyboard` TEXT NULL,
  ADD COLUMN `ttsProvider` VARCHAR(20) NULL;
