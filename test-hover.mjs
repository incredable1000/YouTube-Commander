import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testHoverPreview() {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: false });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    console.log('Opening YouTube...');
    await page.goto('https://www.youtube.com/', { timeout: 15000 });
    console.log('Page loaded');
    
    await page.waitForTimeout(3000);
    
    // Scroll to load thumbnails
    console.log('Scrolling to load thumbnails...');
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(2000);
    
    // Check for visible thumbnails
    const visibleThumbnails = await page.evaluate(() => {
        const thumbs = document.querySelectorAll('#thumbnail, ytd-thumbnail');
        const visible = [];
        thumbs.forEach((t, i) => {
            const rect = t.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                visible.push({
                    index: i,
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left
                });
            }
        });
        return visible;
    });
    console.log(`Visible thumbnails: ${visibleThumbnails.length}`);
    console.log(JSON.stringify(visibleThumbnails, null, 2));
    
    if (visibleThumbnails.length > 0) {
        const first = visibleThumbnails[0];
        console.log(`\nHovering over thumbnail at position (${first.left}, ${first.top})...`);
        
        // Use mouse.move directly
        await page.mouse.move(first.left + first.width / 2, first.top + first.height / 2);
        
        // Check state multiple times
        for (let i = 1; i <= 6; i++) {
            await page.waitForTimeout(500);
            const state = await page.evaluate(() => {
                const allPreviews = document.querySelectorAll('[class*="preview"]');
                const players = document.querySelectorAll('[id*="player"]:not([id*="video"]):not([id*="pip"])');
                return {
                    previewCount: allPreviews.length,
                    previewClasses: Array.from(allPreviews).map(p => p.className).filter(c => !c.includes('storyboard')).slice(0, 3),
                    playerCount: players.length
                };
            });
            console.log(`${i * 0.5}s: previews=${state.previewCount}, players=${state.playerCount}`);
            if (state.previewCount > 0 && !state.previewClasses.every(c => c.includes('storyboard'))) {
                console.log('  Preview classes:', state.previewClasses);
            }
        }
    }

    console.log('\n--- Test complete ---');
    await browser.close();
}

testHoverPreview().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
