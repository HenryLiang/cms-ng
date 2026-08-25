/**
 * 简体中文消息目录(命名空间聚合)。
 *
 * 约定:
 * - 每个业务模块一个命名空间文件,文件名即 useTranslations('<namespace>') 的入参
 * - 通用操作/状态词放 common;模块专属词汇放各自命名空间,避免 common 膨胀
 * - 新增命名空间需同时更新 en/index.ts 与本文件(由 i18n 基础设施统一维护)
 */
import common from './common.json';
import meta from './meta.json';
import auth from './auth.json';
import dashboard from './dashboard.json';
import stories from './stories.json';
import articles from './articles.json';
import review from './review.json';
import media from './media.json';
import video from './video.json';
import hotTopics from './hot-topics.json';
import autoPublish from './auto-publish.json';
import billing from './billing.json';
import accounts from './accounts.json';
import profile from './profile.json';
import settings from './settings.json';
import components from './components.json';
import panels from './panels.json';
import lib from './lib.json';

export default {
  common,
  meta,
  auth,
  dashboard,
  stories,
  articles,
  review,
  media,
  video,
  hotTopics,
  autoPublish,
  billing,
  accounts,
  profile,
  settings,
  components,
  panels,
  lib,
};
