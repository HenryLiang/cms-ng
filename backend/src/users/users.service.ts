import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        department: true,
        expertise: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => ({
      ...u,
      expertise: JSON.parse(u.expertise || '[]'),
    }));
  }

  async findEditors() {
    const users = await this.prisma.user.findMany({
      where: { role: 'EDITOR' },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        department: true,
      },
      orderBy: { name: 'asc' },
    });
    return users;
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        department: true,
        expertise: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) return null;
    return {
      ...user,
      expertise: JSON.parse(user.expertise || '[]'),
    };
  }
}
