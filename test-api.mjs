// Test Polza.ai API endpoints
const API_KEY = "pza_a1KLxwpw1dPQdKgDSI9N6qCEVLie2d1C";
const BASE_URL = "https://polza.ai/api/v1";

async function testFlux() {
  console.log("=== Testing Flux 2 Pro via /images/generations ===");
  const body = {
    model: "black-forest-labs/flux.2-pro",
    prompt: "A fashion model in a white dress, studio photo, full body shot",
    aspect_ratio: "3:4",
    n: 1
  };
  console.log("Request body:", JSON.stringify(body, null, 2));
  
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

async function testFluxMedia() {
  console.log("\n=== Testing Flux 2 Pro via /media (with input wrapper) ===");
  const body = {
    model: "black-forest-labs/flux.2-pro",
    input: {
      prompt: "A fashion model in a white dress, studio photo, full body shot",
      aspect_ratio: "3:4",
    }
  };
  console.log("Request body:", JSON.stringify(body, null, 2));
  
  const response = await fetch(`${BASE_URL}/media`, {
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

async function testNanaBanana() {
  console.log("\n=== Testing Nano Banana 2 via /images/generations ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    prompt: "A fashion model in a white dress, studio photo, full body shot",
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

async function testGeminiChat() {
  console.log("\n=== Testing Gemini 3.1 Flash Lite via /chat/completions ===");
  const body = {
    model: "google/gemini-3.1-flash-lite-preview",
    messages: [
      { role: "system", content: "You are a helpful assistant. Respond in JSON." },
      { role: "user", content: "Say hello in JSON format: {\"greeting\": \"...\"}" }
    ],
    max_tokens: 100,
    response_format: { type: "json_object" }
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
  console.log("Response:", text.substring(0, 500));
}

async function testYandexGPT() {
  console.log("\n=== Testing YandexGPT 5.1 Pro via /chat/completions ===");
  const body = {
    model: "yandex/yandexgpt-5.1-pro",
    messages: [
      { role: "system", content: "You are a helpful assistant. Respond in JSON." },
      { role: "user", content: "Say hello in JSON format: {\"greeting\": \"...\"}" }
    ],
    max_tokens: 100,
    response_format: { type: "json_object" }
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
  console.log("Response:", text.substring(0, 500));
}

// Run all tests
(async () => {
  try { await testGeminiChat(); } catch(e) { console.error("Gemini chat error:", e.message); }
  try { await testYandexGPT(); } catch(e) { console.error("YandexGPT error:", e.message); }
  try { await testFlux(); } catch(e) { console.error("Flux images/generations error:", e.message); }
  try { await testFluxMedia(); } catch(e) { console.error("Flux media error:", e.message); }
  try { await testNanaBanana(); } catch(e) { console.error("Nano Banana error:", e.message); }
})();
