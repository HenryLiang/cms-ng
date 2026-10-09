/**
 * 通过 Paddle.PricePreview() 拉取各套餐的本地化价格。
 *
 * - country 由服务端从请求头（如 x-vercel-ip-country）解析后传入；
 *   缺省时不传 address，由 Paddle 按访问者 IP 自动识别。
 * - 返回值只使用 Paddle 已格式化好的 formattedTotals.total，前端不做任何金额计算。
 * - loading 仅表示首次加载；country 变化时保留旧价格直到新价格返回，避免闪烁。
 */
import type {
  Paddle,
  PricePreviewParams,
  PricePreviewResponse,
} from '@paddle/paddle-js';
import { useEffect, useState } from 'react';
import { PricingTiers } from '@/constants/pricing-tiers';

export type PaddlePrices = Record<string, string>;

interface PricesState {
  prices: PaddlePrices;
  loading: boolean;
  error: string | null;
}

function getLineItems(): PricePreviewParams['items'] {
  return PricingTiers.flatMap((tier) =>
    [tier.priceId.month, tier.priceId.year].map((priceId) => ({
      priceId,
      quantity: 1,
    })),
  );
}

function getPriceAmounts(prices: PricePreviewResponse): PaddlePrices {
  return prices.data.details.lineItems.reduce<PaddlePrices>((acc, item) => {
    acc[item.price.id] = item.formattedTotals.total;
    return acc;
  }, {});
}

export function usePaddlePrices(
  paddle: Paddle | undefined,
  country?: string,
): PricesState {
  const [state, setState] = useState<PricesState>({
    prices: {},
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!paddle) return;

    const params: Partial<PricePreviewParams> = {
      items: getLineItems(),
      ...(country && { address: { countryCode: country } }),
    };

    let cancelled = false;
    paddle.PricePreview(params as PricePreviewParams).then(
      (response) => {
        if (cancelled) return;
        setState((prev) => ({
          prices: { ...prev.prices, ...getPriceAmounts(response) },
          loading: false,
          error: null,
        }));
      },
      (e: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
        }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [country, paddle]);

  return state;
}
