/**
 * Paddle 客户门户端点（需登录）。
 *
 * 安全模型：
 * - 先鉴权（全局 JwtAuthGuard，无 @Public），匿名请求直接被拒
 * - customerId 只从服务端解析（登录用户的 email → paddle_customers 镜像表），
 *   绝不接受客户端传入的 customer ID
 * - 只返回 portal URL，不透出 session 原始对象
 */
import { Controller, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PaddleService } from './paddle.service';

@ApiTags('paddle')
@ApiBearerAuth('bearer')
@Controller('paddle')
export class PaddlePortalController {
  constructor(
    private paddle: PaddleService,
    private prisma: PrismaService,
  ) {}

  @Post('portal-session')
  @ApiOperation({ summary: 'Mint a Paddle customer portal session URL' })
  async createPortalSession(@CurrentUser('email') email: string) {
    // email 桥：应用账号邮箱 = Paddle 客户邮箱
    const customer = await this.prisma.paddleCustomer.findFirst({
      where: { email },
      include: { subscriptions: true },
    });
    if (!customer || !customer.customerId) {
      // 用户还没完成过任何 checkout，没有 Paddle 客户记录
      throw new NotFoundException(
        '未找到你的 Paddle 客户记录，请先在定价页完成一次订阅',
      );
    }

    const url = await this.paddle.createPortalSession(
      customer.customerId,
      customer.subscriptions.map((s) => s.subscriptionId),
    );
    return { url };
  }
}
