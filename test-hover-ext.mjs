import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function testHoverPreview() {
    console.log('=== YouTube Hover Preview Test ===\n');
    
    // Load extension
    const extPath = path.join(__dirname, 'dist');
    
    console.log('1. Launching browser with extension...');
    const browser = await chromium.launch({ 
        headless: false,
        args: [
            `--disable-extensions-except=${extPath}`,
            `--load-extension=${extPath}`
        ]
    });
    
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    console.log('2. Opening YouTube...');
    const page = await context.newPage();
    
    // Capture console messages
    const consoleLogs = [];
    page.on('console', msg => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
    });
    
    await page.goto('https://www.youtube.com/', { timeout: 30000, waitUntil: 'domcontentloaded' });
    
    console.log('3. Waiting for page to stabilize...');
    await page.waitForTimeout(5000);
    
    // Check if extension loaded
    console.log('\n4. Checking extension status...');
    const extensionLoaded = await page.evaluate(() => {
        // Check for any of our extension's DOM elements
        const hasSubscriptionLabel = document.querySelector('.yt-commander-subscription-label') !== null;
        const hasAnyCommanderElement = document.querySelector('[class*="yt-commander"]') !== null;
        return { hasSubscriptionLabel, hasAnyCommanderElement };
    });
    console.log('Extension elements found:', extensionLoaded);
    
    // Check for video cards
    console.log('\n5. Checking for video cards...');
    const cardsInfo = await page.evaluate(() => {
        const cards = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer');
        return {
            count: cards.length,
            firstCardHTML: cards[0]?.outerHTML?.substring(0, 500)
        };
    });
    console.log(`Found ${cardsInfo.count} video cards`);
    if (cardsInfo.firstCardHTML) {
        console.log('First card sample:', cardsInfo.firstCardHTML.substring(0, 200) + '...');
    }
    
    // Check subscription label decoration
    console.log('\n6. Checking subscription label decoration...');
    const labelInfo = await page.evaluate(() => {
        const labels = document.querySelectorAll('.yt-commander-subscription-label');
        const hosts = document.querySelectorAll('.yt-commander-subscription-host');
        return { labelCount: labels.length, hostCount: hosts.length };
    });
    console.log('Subscription labels:', labelInfo);
    
    // Find a thumbnail to hover
    console.log('\n7. Looking for hoverable thumbnails...');
    const thumbInfo = await page.evaluate(() => {
        const thumbs = document.querySelectorAll('#thumbnail, ytd-thumbnail, yt-thumbnail-view-model');
        const hoverable = [];
        
        thumbs.forEach((t, i) => {
            const rect = t.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 50) {
                hoverable.push({
                    index: i,
                    tag: t.tagName,
                    className: t.className.substring(0, 50),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    visible: rect.width > 0 && rect.height > 0
                });
            }
        });
        
        return {
            total: thumbs.length,
            hoverable: hoverable.slice(0, 5)
        };
    });
    console.log(`Total thumbnails: ${thumbInfo.total}`);
    console.log('Hoverable thumbnails:', thumbInfo.hoverable);
    
    // Test hover if we have hoverable thumbnails
    if (thumbInfo.hoverable.length > 0) {
        const thumb = thumbInfo.hoverable[0];
        console.log(`\n8. Hovering over thumbnail at index ${thumb.index}...`);
        
        // Get position
        const position = await page.evaluate((index) => {
            const thumbs = document.querySelectorAll('#thumbnail, ytd-thumbnail, yt-thumbnail-view-model');
            const t = thumbs[index];
            if (t) {
                const rect = t.getBoundingClientRect();
                return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            }
            return null;
        }, thumb.index);
        
        if (position) {
            console.log(`Moving mouse to (${position.x}, ${position.y})`);
            await page.mouse.move(position.x, position.y);
            
            // Check state over time
            console.log('\n9. Observing hover state changes...');
            for (let i = 1; i <= 10; i++) {
                await page.waitForTimeout(500);
                
                const state = await page.evaluate(() => {
                    // Check for preview elements
                    const previews = document.querySelectorAll('[class*="preview"], [id*="preview"], ytd-player-preview');
                    
                    // Check if subscription labels are being modified
                    const labels = document.querySelectorAll('.yt-commander-subscription-label');
                    
                    // Check for any DOM changes in the card
                    const commanderElements = document.querySelectorAll('[class*="yt-commander"]');
                    
                    return {
                        previewCount: previews.length,
                        labelCount: labels.length,
                        commanderCount: commanderElements.length,
                        previewClasses: Array.from(previews).slice(0, 3).map(p => p.className.substring(0, 30))
                    };
                });
                
                console.log(`${i * 0.5}s: previews=${state.previewCount}, labels=${state.labelCount}, commander=${state.commanderCount}`);
            }
        }
    }
    
    // Print console logs
    console.log('\n10. Extension console logs (last 20):');
    const relevantLogs = consoleLogs.filter(l => 
        l.text.includes('YT-Commander') || 
        l.text.includes('SubscriptionLabels') ||
        l.text.includes('subscription')
    );
    relevantLogs.slice(-20).forEach(log => {
        console.log(`  [${log.type}] ${log.text.substring(0, 100)}`);
    });
    
    console.log('\n=== Test Complete ===');
    await browser.close();
}

testHoverPreview().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
