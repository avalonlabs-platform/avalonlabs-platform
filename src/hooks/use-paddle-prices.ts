"use client";

import { useEffect, useState } from "react";
import type { Paddle, PricePreviewParams, PricePreviewResponse } from "@paddle/paddle-js";
import { pricingTiers } from "@/constants/pricing-tiers";

export type PaddlePrices = Record<string, string>;

function getLineItems(): PricePreviewParams["items"] {
  return pricingTiers
    .flatMap((tier) => [tier.priceId.month, tier.priceId.year])
    .filter(Boolean)
    .map((priceId) => ({ priceId, quantity: 1 }));
}

function getPriceAmounts(prices: PricePreviewResponse): PaddlePrices {
  return prices.data.details.lineItems.reduce<PaddlePrices>((acc, item) => {
    acc[item.price.id] = item.formattedTotals.total;
    return acc;
  }, {});
}

// pricingTiers is static config, so the line items never change at runtime —
// computing this once avoids a new array reference (and effect re-run) every render.
const lineItems = getLineItems();

/**
 * Fetches localized, tax-inclusive prices for every tier at once.
 * `country` of "OTHERS" means "let Paddle infer the market from IP" — see
 * the pricing-pages skill for why that sentinel must not be sent as an address.
 */
export function usePaddlePrices(
  paddle: Paddle | undefined,
  country: string
): { prices: PaddlePrices; loading: boolean } {
  const [prices, setPrices] = useState<PaddlePrices>({});
  const [loading, setLoading] = useState(lineItems.length > 0);

  useEffect(() => {
    if (!paddle || lineItems.length === 0) return;

    const params: Partial<PricePreviewParams> = {
      items: lineItems,
      ...(country !== "OTHERS" && { address: { countryCode: country } }),
    };

    paddle
      .PricePreview(params as PricePreviewParams)
      .then((response) => {
        setPrices((prev) => ({ ...prev, ...getPriceAmounts(response) }));
      })
      .finally(() => setLoading(false));
  }, [country, paddle]);

  return { prices, loading };
}
