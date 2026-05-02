// Test YandexGPT with response_format json_object
const API_KEY = "pza_a1KLxwpw1dPQdKgDSI9N6qCEVLie2d1C";
const BASE_URL = "https://polza.ai/api/v1";

async function testYandexWithJsonFormat() {
  console.log("=== Testing YandexGPT 5.1 Pro with response_format json_object ===");
  const body = {
    model: "yandex/yandexgpt-5.1-pro",
    messages: [
      { role: "system", content: "You are a helpful assistant. Always respond in JSON format." },
      { role: "user", content: "Find 2 fashion items. Return JSON array with name and price fields." }
    ],
    temperature: 0.5,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  };
  
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  
  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Response:", text.substring(0, 1000));
}

async function testYandexWithWebSearch() {
  console.log("\n=== Testing YandexGPT 5.1 Pro with web search plugin ===");
  const body = {
    model: "yandex/yandexgpt-5.1-pro",
    messages: [
      { role: "system", content: "You are a shopping assistant. Find real products on Russian marketplaces. Always respond in JSON." },
      { role: "user", content: "Find: белая льняная рубашка мужская. Return JSON with: {\"name\": \"...\", \"price\": 2500, \"currency\": \"руб.\", \"marketplace\": \"Wildberries\", \"productUrl\": \"https://...\"}" }
    ],
    temperature: 0.3,
    max_tokens: 2000,
  };
  
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  
  const text = await response.text();
  console.log("Status:", response.status);
  console.log("Response:", text.substring(0, 2000));
}

(async () => {
  await testYandexWithJsonFormat();
  await testYandexWithWebSearch();
})();
