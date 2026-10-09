// Test Wildberries Public API - Alternative endpoints
async function searchWildberriesV1(query) {
  try {
    const url = `https://search.wb.ru/exactmatch/ru/common/v4/search?query=${encodeURIComponent(query)}&resultset=catalog&limit=10&sort=popular`;
    console.log(`🔍 Method 1: V4 Search API`);
    console.log(`URL: ${url}\n`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://www.wildberries.ru',
        'Referer': 'https://www.wildberries.ru/',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      }
    });
    
    console.log(`Status: ${response.status}`);
    if (!response.ok) {
      console.error(`❌ Failed with status ${response.status}\n`);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Error:', error.message, '\n');
    return null;
  }
}

async function searchWildberriesV2(query) {
  try {
    // Alternative endpoint - catalog search
    const url = `https://catalog.wb.ru/catalog/common_v2/search?query=${encodeURIComponent(query)}&limit=10`;
    console.log(`🔍 Method 2: Catalog V2 API`);
    console.log(`URL: ${url}\n`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.wildberries.ru/',
      }
    });
    
    console.log(`Status: ${response.status}`);
    if (!response.ok) {
      console.error(`❌ Failed with status ${response.status}\n`);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Error:', error.message, '\n');
    return null;
  }
}

async function searchWildberriesV3(query) {
  try {
    // Try mobile API
    const url = `https://wbx-content-v2.wbstatic.net/ru/common/v4/search?query=${encodeURIComponent(query)}&resultset=catalog&limit=10`;
    console.log(`🔍 Method 3: Mobile/Static API`);
    console.log(`URL: ${url}\n`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WildberriesApp/1.0',
        'Accept': 'application/json',
      }
    });
    
    console.log(`Status: ${response.status}`);
    if (!response.ok) {
      console.error(`❌ Failed with status ${response.status}\n`);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ Error:', error.message, '\n');
    return null;
  }
}

// Test all methods
const testQuery = 'черное платье';

console.log('🧪 Testing Wildberries API - Multiple Methods\n');
console.log('='.repeat(60) + '\n');
console.log(`Test query: "${testQuery}"\n`);
console.log('='.repeat(60) + '\n\n');

const result1 = await searchWildberriesV1(testQuery);
if (result1) {
  console.log('✅ Method 1 SUCCESS!');
  console.log('Sample data:', JSON.stringify(result1, null, 2).substring(0, 500));
} else {
  console.log('❌ Method 1 FAILED');
}

console.log('\n' + '-'.repeat(60) + '\n\n');

const result2 = await searchWildberriesV2(testQuery);
if (result2) {
  console.log('✅ Method 2 SUCCESS!');
  console.log('Sample data:', JSON.stringify(result2, null, 2).substring(0, 500));
} else {
  console.log('❌ Method 2 FAILED');
}

console.log('\n' + '-'.repeat(60) + '\n\n');

const result3 = await searchWildberriesV3(testQuery);
if (result3) {
  console.log('✅ Method 3 SUCCESS!');
  console.log('Sample data:', JSON.stringify(result3, null, 2).substring(0, 500));
} else {
  console.log('❌ Method 3 FAILED');
}

console.log('\n' + '='.repeat(60) + '\n');
console.log('🏁 All methods tested!');

