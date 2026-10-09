/**
 * Paddle.js 初始化（仅客户端）。
 *
 * 环境变量缺失时直接抛错，绝不在缺少配置时静默降级——
 * 避免把流量打到错误的 Paddle 环境（sandbox / production）。
 * 服务端 API key（PADDLE_API_KEY）永远不允许出现在这里。
 *
 * 注意：NEXT_PUBLIC_* 必须用静态属性访问（process.env.NEXT_PUBLIC_X），
 * Next.js 只在编译时内联静态引用，动态访问 process.env[name] 在浏览器里恒为 undefined。
 */
import {
  initializePaddle,
  type Environments,
  type Paddle,
} from '@paddle/paddle-js';

export function getPaddleClientConfig(): {
  token: string;
  environment: Environments;
} {
  const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
  const environment = process.env.NEXT_PUBLIC_PADDLE_ENV;
  if (!token) {
    throw new Error(
      'Paddle 配置缺失：环境变量 NEXT_PUBLIC_PADDLE_CLIENT_TOKEN 未设置。请在 frontend/.env.local 中配置后重启 dev server。',
    );
  }
  if (!environment) {
    throw new Error(
      'Paddle 配置缺失：环境变量 NEXT_PUBLIC_PADDLE_ENV 未设置（sandbox | production）。请在 frontend/.env.local 中配置后重启 dev server。',
    );
  }
  return { token, environment: environment as Environments };
}

export function initPaddle(): Promise<Paddle | undefined> {
  // 包一层 Promise，让配置缺失的同步抛错转为 rejection，
  // 由调用方在 .catch 回调里 setState（react-hooks/set-state-in-effect）
  return Promise.resolve().then(() => {
    const { token, environment } = getPaddleClientConfig();
    return initializePaddle({ token, environment });
  });
}
