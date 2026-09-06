import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeQuota} from '../src/account/quota.js';
import {resetCreditsLabel,resetCreditsTooltip} from '../src/renderer/reset-credits.js';

test('normalizes available reset cards separately from currency balance and excludes used cards',()=>{
 const c={id:'a',status:'available',resetType:'codexRateLimits',expiresAt:1791081723};
 const result=normalizeQuota({rateLimits:{credits:{balance:'181.6'}},rateLimitResetCredits:{availableCount:2,credits:[{...c,id:'b',expiresAt:1791174031},c,c,{...c,id:'used',status:'redeemed'},{...c,id:'other',resetType:'other'}]}}).resetCredits;
 assert.deepEqual(result,{availableCount:2,credits:[{expiresAt:1791081723},{expiresAt:1791174031}]});assert.equal(resetCreditsLabel(result),'卡 2 张');
 const tooltip=resetCreditsTooltip(result);assert.match(tooltip,/2026\/10\/04 12:42/);assert.match(tooltip,/2026\/10\/05 14:20/);assert.match(tooltip,/UTC\+10/);assert.doesNotMatch(tooltip,/181|RateLimitResetCredit/);
});
test('missing cards, zero cards, missing expiries and stale responses remain distinct',()=>{
 assert.equal(normalizeQuota({}).resetCredits,undefined);assert.equal(resetCreditsLabel(undefined),'卡 — 张');
 const unknown=normalizeQuota({rateLimitResetCredits:{availableCount:'2',credits:[{status:'available',resetType:'codexRateLimits',expiresAt:'1791081723'}]}}).resetCredits;assert.deepEqual(unknown,{availableCount:null,credits:[{expiresAt:null}]});assert.match(resetCreditsTooltip(unknown),/未提供有效期/);
 const zero=normalizeQuota({rateLimitResetCredits:{availableCount:0,credits:[]}}).resetCredits;assert.match(resetCreditsTooltip(zero),/没有可用/);assert.equal(resetCreditsLabel(zero),'卡 0 张');
 assert.match(resetCreditsTooltip({availableCount:2,credits:[]},true,true),/等待刷新/);assert.match(resetCreditsTooltip({availableCount:2,credits:[]}),/有效期暂时无法读取/);
});
