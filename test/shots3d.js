const { open } = require('./smoke'); const path = require('path');
(async () => {
  const { browser, page, errors } = await open();
  await page.evaluate(() => HM.actions.enterDemo()); await page.waitForTimeout(500);
  await page.evaluate(() => { HM.go('huset', { mode: 'split' }); }); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(__dirname, 'shots/split.png') });
  await page.evaluate(() => { HM.go('huset', { mode: '3d' }); }); await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(__dirname, 'shots/3d.png') });
  await page.evaluate(() => HM.workspace.st.v3.startWalk(HM.plan().rooms[0].id)); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(__dirname, 'shots/walk.png') });
  await page.evaluate(() => HM.actions.compareVersion({ dataset: { id: HM.state.versions[1].id } })); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(__dirname, 'shots/compare.png') });
  console.log(errors.join('\n') || 'Ingen feil');
  await browser.close();
})();
