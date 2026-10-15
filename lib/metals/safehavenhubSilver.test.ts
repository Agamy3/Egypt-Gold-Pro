import { scrapeEgyptLocalSilverSafeHaven, sourceUsesImagePrices } from './safehavenhubSilver';

test('recognizes image-encoded prices without mistaking decorative metal icons for prices', () => {
  expect(sourceUsesImagePrices('<table class="metal-prices-table"><tr><td>عيار 999</td><td><img src="data:image/png;base64,test" alt="sell price" class="price-cell"></td></tr></table>')).toBe(true);
  expect(sourceUsesImagePrices('<table class="metal-prices-table"><tr><td><img src="silver.png">عيار 999</td><td>100</td><td>99</td></tr></table>')).toBe(false);
});

test('unsupported image prices return an explicit unavailable result, never fabricated rows', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => new Response('<table class="metal-prices-table"><img class="price-cell" src="data:image/png;base64,test"></table>'));
  try {
    const result = await scrapeEgyptLocalSilverSafeHaven();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('numeric feed unavailable');
    expect(result).not.toHaveProperty('rows');
  } finally { globalThis.fetch = originalFetch; }
});

test('the supported numeric table format still parses buy and sell prices', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async () => new Response('<html><body><table class="metal-prices-table"><tr><td>عيار 999</td><td>100</td><td>99</td><td>1</td><td>1%</td></tr></table></body></html>'));
  try {
    const result = await scrapeEgyptLocalSilverSafeHaven();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toEqual([{ karat: 999, buyPrice: 99, sellPrice: 100, changeValue: 1, changePct: 1 }]);
  } finally { globalThis.fetch = originalFetch; }
});
