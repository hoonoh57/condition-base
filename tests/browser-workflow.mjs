import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export async function browserWorkflow(base) {
  const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL??'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base);
    await page.getByText('DB 연결됨',{exact:true}).waitFor();
    await page.locator('#strategy option').nth(1).waitFor({state:'attached'});
    await page.getByRole('button',{name:'+ 새 전략',exact:true}).click();
    await page.locator('[name="name"]').fill('브라우저 검증 전략');
    await page.getByRole('button',{name:'전략 만들기',exact:true}).click();
    await page.locator('#create-dialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelector('#metric-n').textContent!=='—');
    await page.locator('#add').click();
    await page.locator('#condition').selectOption('AMT20_MIN');
    await page.locator('#hyp-statement').fill('거래대금 조건 추가 시 표본의 MFE 품질을 확인한다.');
    await page.locator('#change-submit').click();
    await page.locator('#change-dialog').waitFor({state:'hidden'});
    await page.waitForFunction(()=>document.querySelectorAll('#stack tbody tr').length===2);
    await page.locator('.candidate').first().click();
    await page.locator('#chart canvas').first().waitFor();
    assert.match(await page.locator('#chart-note').textContent(),/조건 성립/);
    const trials=await page.locator('#metric-trials').textContent();
    await page.locator('#win').selectOption('5');
    await page.waitForFunction(()=>document.querySelector('#stack-note').textContent.includes('현재 데이터 탐색'));
    assert.equal(await page.locator('#metric-trials').textContent(),trials);
    await page.locator('.candidate').first().click();
    await page.locator('#chart canvas').first().waitFor();
    await fs.mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
    await page.screenshot({path:new URL('../artifacts/workspace-desktop.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
    await page.locator('[data-tab="history"]').click();
    await page.locator('#trials tbody tr').first().waitFor();
    assert.ok((await page.locator('#trials tbody tr').count())>=1);
    await page.locator('[data-tab="data"]').click();
    await page.locator('#availability tbody tr').first().waitFor();
    assert.equal(await page.locator('#availability tbody tr').count(),18);
    await page.locator('[data-tab="workspace"]').click();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:new URL('../artifacts/workspace-mobile.png',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
}
