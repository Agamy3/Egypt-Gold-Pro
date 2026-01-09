/**
 * Test script for iSagha adapter
 * 
 * Run with: npx tsx scripts/test-isagha.ts
 * or: ts-node scripts/test-isagha.ts
 */

import { discoverIsaghaEndpoint, fetchIsaghaPrices } from '../lib/isagha-adapter';

async function main() {
  console.log('='.repeat(70));
  console.log('iSagha Adapter Test');
  console.log('='.repeat(70));
  console.log();
  
  // Test 1: Discover endpoint
  console.log('Step 1: Discovering endpoint...');
  const endpoint = await discoverIsaghaEndpoint();
  
  if (endpoint) {
    console.log('✅ Endpoint discovered:');
    console.log(`   URL: ${endpoint.url}`);
    console.log(`   Method: ${endpoint.method}`);
    console.log(`   Confidence: ${endpoint.confidence}`);
    console.log(`   Discovered at: ${new Date(endpoint.discoveredAt).toISOString()}`);
  } else {
    console.log('❌ Could not discover endpoint');
  }
  
  console.log();
  
  // Test 2: Fetch prices
  console.log('Step 2: Fetching prices...');
  const result = await fetchIsaghaPrices();
  
  console.log();
  console.log('Result:');
  console.log(`   OK: ${result.ok}`);
  console.log(`   Method: ${result.method}`);
  if (result.endpoint) {
    console.log(`   Endpoint: ${result.endpoint}`);
  }
  if (result.httpStatus) {
    console.log(`   HTTP Status: ${result.httpStatus}`);
  }
  if (result.latency) {
    console.log(`   Latency: ${result.latency}ms`);
  }
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  if (result.parseError) {
    console.log(`   Parse Error: ${result.parseError}`);
  }
  
  console.log();
  console.log('Prices:');
  for (const karat of [24, 21, 18, 14] as const) {
    const buy = result.prices[karat].buy;
    const sell = result.prices[karat].sell;
    console.log(`   ${karat}k: Buy=${buy ?? 'N/A'}, Sell=${sell ?? 'N/A'}`);
  }
  
  if (result.jsonSnippet) {
    console.log();
    console.log('JSON Snippet (first 500 chars):');
    console.log(result.jsonSnippet);
  }
  
  console.log();
  console.log('='.repeat(70));
  
  if (result.ok && (result.prices[21].buy !== null || result.prices[24].buy !== null)) {
    console.log('✅ Test PASSED: Valid prices retrieved');
    process.exit(0);
  } else {
    console.log('❌ Test FAILED: No valid prices');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Test error:', error);
  process.exit(1);
});



