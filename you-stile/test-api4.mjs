// Test Polza.ai - try WebSocket and SSE for image result
const API_KEY = "pza_a1KLxwpw1dPQdKgDSI9N6qCEVLie2d1C";
const BASE_URL = "https://polza.ai/api/v1";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Try using Gemini 2.5 Flash Image (Nano Banana) - maybe it's synchronous
async function testGemini25FlashImage() {
  console.log("=== Testing Gemini 2.5 Flash Image (Nano Banana) ===");
  const body = {
    model: "google/gemini-2.5-flash-image",
    prompt: "A fashion model in a stylish blue dress, studio photo, full body shot",
    aspect_ratio: "3:4",
    n: 1
  };
  
  const response = await fetch(`${BASE_URL}/images/generations`, {
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

// Try using Gemini 3.1 Flash Image via chat/completions with image output
async function testGeminiImageViaChat() {
  console.log("\n=== Testing Gemini 3.1 Flash Image via chat/completions ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    messages: [
      { role: "user", content: "Generate an image of a fashion model in a stylish blue dress, studio photo, full body shot" }
    ],
    max_tokens: 1000,
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

// Try Flux 2 Pro with size parameter instead of aspect_ratio
async function testFluxWithSize() {
  console.log("\n=== Testing Flux 2 Pro with size param ===");
  const body = {
    model: "black-forest-labs/flux.2-pro",
    prompt: "A fashion model in a stylish blue dress, studio photo, full body shot",
    size: "1024x1792",
    n: 1
  };
  
  const response = await fetch(`${BASE_URL}/images/generations`, {
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

// Try Flux 2 Flex (maybe it works differently)
async function testFluxFlex() {
  console.log("\n=== Testing Flux 2 Flex ===");
  const body = {
    model: "black-forest-labs/flux.2-flex",
    prompt: "A fashion model in a stylish blue dress, studio photo, full body shot",
    aspect_ratio: "3:4",
    n: 1
  };
  
  const response = await fetch(`${BASE_URL}/images/generations`, {
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

// Try YandexArt
async function testYandexArt() {
  console.log("\n=== Testing YandexArt ===");
  const body = {
    model: "yandex/yandex-art",
    prompt: "A fashion model in a stylish blue dress, studio photo, full body shot",
    aspect_ratio: "3:4",
    n: 1
  };
  
  const response = await fetch(`${BASE_URL}/images/generations`, {
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

// Try polling with different requestId format (without gen_ prefix)
async function testPollingVariants() {
  // Use the requestId from previous test
  const requestId = "gen_2159498874370265089";
  const shortId = requestId.replace("gen_", "");
  
  console.log("\n=== Testing polling variants ===");
  const endpoints = [
    `${BASE_URL}/images/generations/${shortId}`,
    `${BASE_URL}/queue/${requestId}`,
    `${BASE_URL}/queue/${shortId}`,
    `https://polza.ai/api/queue/${requestId}`,
    `https://polza.ai/queue/${requestId}`,
  ];
  
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        headers: { "Authorization": `Bearer ${API_KEY}` }
      });
      const text = await r.text();
      console.log(`GET ${ep} -> ${r.status}: ${text.substring(0, 200)}`);
    } catch(e) {
      console.log(`GET ${ep} -> ERROR: ${e.message}`);
    }
  }
}

(async () => {
  await testGemini25FlashImage();
  await testGeminiImageViaChat();
  await testFluxWithSize();
  await testFluxFlex();
  await testYandexArt();
  await testPollingVariants();
})();
