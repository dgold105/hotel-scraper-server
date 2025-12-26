const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const sources = {
    kiwi: {
        name: 'Kiwi Collection',
        searchURL: (query) => `https://www.kiwicollection.com/search?keyword=${encodeURIComponent(query)}`,
        scraper: scrapeKiwi
    },
    virtuoso: {
        name: 'Virtuoso',
        searchURL: (query) => `https://www.virtuoso.com/travel/luxury-hotels/search?searchText=${encodeURIComponent(query)}`,
        scraper: scrapeVirtuoso
    },
    michelin: {
        name: 'Michelin Guide',
        searchURL: (query) => `https://guide.michelin.com/en/hotels-stays?q=${encodeURIComponent(query)}`,
        scraper: scrapeMichelin
    },
    mrAndMrsSmith: {
        name: 'Mr & Mrs Smith',
        searchURL: (query) => `https://www.mrandmrssmith.com/search?q=${encodeURIComponent(query)}`,
        scraper: scrapeMrAndMrsSmith
    }
};

app.get('/search', async (req, res) => {
    const { query, sourcesParam } = req.query;
    
    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const requestedSources = sourcesParam ? sourcesParam.split(',') : Object.keys(sources);
    
    console.log(`Searching for: ${query}`);
    
    let browser;
    try {
        browser = await puppeteer.launch({
                headless: 'new',
    executablePath: '/usr/bin/google-chrome-stable',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});
        
        const allHotels = [];
        
        for (const sourceKey of requestedSources) {
            if (sources[sourceKey]) {
                try {
                    console.log(`Scraping ${sources[sourceKey].name}...`);
                    const hotels = await sources[sourceKey].scraper(browser, query);
                    allHotels.push(...hotels);
                    console.log(`Found ${hotels.length} hotels from ${sources[sourceKey].name}`);
                } catch (error) {
                    console.error(`Error scraping ${sourceKey}:`, error.message);
                }
            }
        }
        
        res.json({ hotels: allHotels, count: allHotels.length });
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    } finally {
        if (browser) await browser.close();
    }
});

async function scrapeKiwi(browser, query) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    try {
        await page.goto(sources.kiwi.searchURL(query), { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('.hotel-card, .property-card, [class*="hotel"]', { timeout: 10000 }).catch(() => {});
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('.hotel-card, .property-card, [class*="HotelCard"], [class*="property"]');
            
            cards.forEach(card => {
                const name = card.querySelector('h2, h3, [class*="name"], [class*="title"]')?.textContent?.trim();
                const location = card.querySelector('[class*="location"], [class*="city"]')?.textContent?.trim();
                const description = card.querySelector('[class*="description"], p')?.textContent?.trim();
                const link = card.querySelector('a')?.href;
                const image = card.querySelector('img')?.src;
                
                if (name) {
                    results.push({ name, location: location || '', description: description || '', websiteURL: link || '', imageURL: image || '', source: 'kiwi' });
                }
            });
            return results;
        });
        
        return hotels.map(h => parseHotelLocation(h, query));
    } finally {
        await page.close();
    }
}

async function scrapeVirtuoso(browser, query) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    try {
        await page.goto(sources.virtuoso.searchURL(query), { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('[class*="hotel"], [class*="property"], [class*="card"]', { timeout: 10000 }).catch(() => {});
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[class*="hotel-card"], [class*="property"], [class*="SearchResult"], [class*="card"]');
            
            cards.forEach(card => {
                const name = card.querySelector('h2, h3, [class*="name"], [class*="title"]')?.textContent?.trim();
                const location = card.querySelector('[class*="location"], [class*="destination"]')?.textContent?.trim();
                const description = card.querySelector('[class*="description"], [class*="summary"]')?.textContent?.trim();
                const link = card.querySelector('a')?.href;
                const image = card.querySelector('img')?.src;
                
                if (name) {
                    results.push({ name, location: location || '', description: description || '', websiteURL: link || '', imageURL: image || '', source: 'virtuoso' });
                }
            });
            return results;
        });
        
        return hotels.map(h => parseHotelLocation(h, query));
    } finally {
        await page.close();
    }
}

async function scrapeMichelin(browser, query) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    try {
        await page.goto(sources.michelin.searchURL(query), { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('[class*="card"], [class*="hotel"]', { timeout: 10000 }).catch(() => {});
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[class*="card"], [class*="poi-card"], [class*="hotel"]');
            
            cards.forEach(card => {
                const name = card.querySelector('h2, h3, [class*="title"], [class*="name"]')?.textContent?.trim();
                const location = card.querySelector('[class*="location"], [class*="address"]')?.textContent?.trim();
                const description = card.querySelector('[class*="description"]')?.textContent?.trim();
                const link = card.querySelector('a')?.href;
                const image = card.querySelector('img')?.src || card.querySelector('img')?.dataset?.src;
                
                if (name) {
                    results.push({ name, location: location || '', description: description || '', websiteURL: link || '', imageURL: image || '', source: 'michelin' });
                }
            });
            return results;
        });
        
        return hotels.map(h => parseHotelLocation(h, query));
    } finally {
        await page.close();
    }
}

async function scrapeMrAndMrsSmith(browser, query) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    
    try {
        await page.goto(sources.mrAndMrsSmith.searchURL(query), { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForSelector('[class*="hotel"], [class*="property"]', { timeout: 10000 }).catch(() => {});
        
        const hotels = await page.evaluate(() => {
            const results = [];
            const cards = document.querySelectorAll('[class*="hotel-card"], [class*="property"], article, [class*="card"]');
            
            cards.forEach(card => {
                const name = card.querySelector('h2, h3, [class*="name"], [class*="title"]')?.textContent?.trim();
                const location = card.querySelector('[class*="location"], [class*="destination"]')?.textContent?.trim();
                const description = card.querySelector('[class*="description"], [class*="tagline"]')?.textContent?.trim();
                const link = card.querySelector('a')?.href;
                const image = card.querySelector('img')?.src;
                
                if (name) {
                    results.push({ name, location: location || '', description: description || '', websiteURL: link || '', imageURL: image || '', source: 'mrAndMrsSmith' });
                }
            });
            return results;
        });
        
        return hotels.map(h => parseHotelLocation(h, query));
    } finally {
        await page.close();
    }
}

function parseHotelLocation(hotel, query) {
    const parts = hotel.location.split(',').map(s => s.trim());
    return {
        ...hotel,
        city: parts[0] || query,
        country: parts[parts.length - 1] || '',
        sourceURL: sources[hotel.source].searchURL(query)
    };
}

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Hotel scraper server running on port ${PORT}`);
});
