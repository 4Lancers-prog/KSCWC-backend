// wallet.repository.ts — wallet + transaction + payment-order reads.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { skip, type PageParams } from '../../common/utils/pagination';

export function getWalletByUser(userId: string) {
  return prisma.walletAccount.findUnique({ where: { userId } });
}

export async function listTransactions(
  userId: string,
  page: PageParams,
  filter: { type?: Prisma.WalletTransactionWhereInput['type'] } = {},
) {
  const where: Prisma.WalletTransactionWhereInput = {
    userId,
    ...(filter.type ? { type: filter.type } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: skip(page),
      take: page.limit,
    }),
    prisma.walletTransaction.count({ where }),
  ]);
  return { items, total };
}

export function findPaymentOrderByRazorpayId(razorpayOrderId: string) {
  return prisma.paymentOrder.findUnique({ where: { razorpayOrderId } });
}

export function findPaymentOrderById(id: string) {
  return prisma.paymentOrder.findUnique({ where: { id } });
}

export async function adminListWallets(page: PageParams, search?: string) {
  const where: Prisma.WalletAccountWhereInput = search
    ? {
        user: {
          OR: [
            { fullName: { contains: search, mode: 'insensitive' } },
            { phoneNormalized: { contains: search } },
          ],
        },
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.walletAccount.findMany({
      where,
      include: { user: { select: { id: true, fullName: true, phoneNormalized: true, accountStatus: true } } },
      orderBy: { updatedAt: 'desc' },
      skip: skip(page),
      take: page.limit,
    }),
    prisma.walletAccount.count({ where }),
  ]);
  return { items, total };
}
