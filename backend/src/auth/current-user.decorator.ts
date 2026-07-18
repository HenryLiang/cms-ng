import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** JWT 解码后挂在 req.user 上的载荷形状 */
interface JwtUser {
  sub: string;
  userId: string;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request: { user: JwtUser | undefined } = ctx
      .switchToHttp()
      .getRequest();
    return data ? request.user?.[data] : request.user;
  },
);
