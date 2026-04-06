import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  const rootHTML = await page.evaluate(() => document.getElementById('root')?.innerHTML);
  console.log('Root HTML length:', rootHTML?.length);
  if (rootHTML?.length > 0) {
     console.log('Root HTML Snippet:', rootHTML.substring(0, 100));
  }
  await browser.close();
})();
