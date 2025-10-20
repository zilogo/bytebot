#!/usr/bin/env node

const puppeteer = require('puppeteer-core');

async function checkPageErrors() {
  console.log('🚀 Starting Chrome to check for errors...\n');

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1920,1080',
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
  });

  const page = await browser.newPage();

  const consoleErrors = [];
  const consoleWarnings = [];
  const pageErrors = [];

  // Capture console messages
  page.on('console', async msg => {
    const type = msg.type();
    try {
      const args = await Promise.all(
        msg.args().map(arg => arg.jsonValue().catch(() => arg.toString()))
      );
      const text = args.join(' ');

      if (type === 'error') {
        consoleErrors.push({
          text,
          location: msg.location(),
        });
        console.error(`❌ [Console Error] ${text}`);
        if (msg.location().url) {
          console.error(`   at ${msg.location().url}:${msg.location().lineNumber}`);
        }
      } else if (type === 'warning') {
        consoleWarnings.push(text);
        console.warn(`⚠️  [Warning] ${text}`);
      }
    } catch (e) {
      // Ignore serialization errors
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    pageErrors.push({
      message: error.message,
      stack: error.stack,
    });
    console.error(`\n❌ [Page Error]`);
    console.error(`   Message: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack:\n${error.stack.split('\n').slice(0, 5).join('\n')}`);
    }
  });

  // Capture failed requests
  page.on('requestfailed', request => {
    console.warn(`⚠️  [Request Failed] ${request.url()}`);
  });

  const taskUrl = 'http://localhost:9992/tasks/0be8aef7-f8a8-4991-99c8-7d6b254997e7';
  console.log(`📄 Loading: ${taskUrl}\n`);

  try {
    await page.goto(taskUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    console.log('\n✓ Page loaded, waiting for any delayed errors...\n');

    // Wait for potential async errors
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Take screenshot
    const screenshotPath = '/Users/leizhao/Projects/agent/bytebot/page-state.png';
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`\n📸 Screenshot saved: ${screenshotPath}`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 ERROR SUMMARY');
    console.log('='.repeat(60));
    console.log(`Console Errors: ${consoleErrors.length}`);
    console.log(`Console Warnings: ${consoleWarnings.length}`);
    console.log(`Page Errors: ${pageErrors.length}`);

    if (consoleErrors.length === 0 && pageErrors.length === 0) {
      console.log('\n✅ SUCCESS! No JavaScript errors found on the page!');
      console.log('   The forEach fix appears to be working correctly.');
    } else {
      console.log('\n❌ FAILED! Errors still present:');
      if (consoleErrors.length > 0) {
        console.log('\nConsole Errors:');
        consoleErrors.forEach((err, i) => {
          console.log(`  ${i + 1}. ${err.text}`);
          if (err.location.url) {
            console.log(`     ${err.location.url}:${err.location.lineNumber}`);
          }
        });
      }
      if (pageErrors.length > 0) {
        console.log('\nPage Errors:');
        pageErrors.forEach((err, i) => {
          console.log(`  ${i + 1}. ${err.message}`);
        });
      }
    }

    console.log('\n👁️  Browser window will stay open for 10 seconds...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));

  } catch (error) {
    console.error(`\n❌ Failed to load page: ${error.message}`);
  } finally {
    await browser.close();
    console.log('🏁 Done!');
  }

  process.exit(consoleErrors.length + pageErrors.length);
}

checkPageErrors().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
