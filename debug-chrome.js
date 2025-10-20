#!/usr/bin/env node

const puppeteer = require('puppeteer-core');

async function debugPage() {
  console.log('Connecting to Chrome...');

  // Try to connect to an existing Chrome instance
  // You need to launch Chrome with: chrome --remote-debugging-port=9222
  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null,
    });
    console.log('✓ Connected to existing Chrome instance');
  } catch (err) {
    console.log('No existing Chrome found, launching new instance...');
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--remote-debugging-port=9222'],
      defaultViewport: null,
    });
    console.log('✓ Launched new Chrome instance');
  }

  const pages = await browser.pages();
  let page = pages[0];

  // Listen for console messages
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();

    if (type === 'error') {
      console.error(`❌ [Console Error] ${text}`);
      if (location) {
        console.error(`   Location: ${location.url}:${location.lineNumber}`);
      }
    } else if (type === 'warning') {
      console.warn(`⚠️  [Console Warning] ${text}`);
    } else {
      console.log(`ℹ️  [Console ${type}] ${text}`);
    }
  });

  // Listen for page errors
  page.on('pageerror', error => {
    console.error(`❌ [Page Error] ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
  });

  // Navigate to the problem page
  const taskUrl = 'http://localhost:9992/tasks/0be8aef7-f8a8-4991-99c8-7d6b254997e7';
  console.log(`\nNavigating to: ${taskUrl}\n`);

  try {
    await page.goto(taskUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    console.log('✓ Page loaded');

    // Wait a bit for any async errors
    await page.waitForTimeout(3000);

    // Check for JavaScript errors in the page
    const errors = await page.evaluate(() => {
      return window.__jsErrors || [];
    });

    if (errors.length > 0) {
      console.log('\n📋 JavaScript Errors Found:');
      errors.forEach((err, i) => {
        console.log(`${i + 1}. ${err}`);
      });
    } else {
      console.log('\n✅ No JavaScript errors found!');
    }

    // Get page title
    const title = await page.title();
    console.log(`\n📄 Page Title: ${title}`);

    // Take a screenshot
    const screenshotPath = '/Users/leizhao/Projects/agent/bytebot/debug-screenshot.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved to: ${screenshotPath}`);

  } catch (error) {
    console.error(`\n❌ Failed to load page: ${error.message}`);
  }

  console.log('\n\nPress Ctrl+C to exit or wait for errors...');

  // Keep running to capture any delayed errors
  await new Promise(() => {});
}

debugPage().catch(console.error);
