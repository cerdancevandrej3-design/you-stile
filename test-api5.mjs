// Test Gemini image generation via chat/completions - get actual image data
const API_KEY = "pza_a1KLxwpw1dPQdKgDSI9N6qCEVLie2d1C";
const BASE_URL = "https://polza.ai/api/v1";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Gemini 3.1 Flash Image via chat with modalities
async function testGeminiImageChat1() {
  console.log("=== Test 1: Gemini 3.1 Flash Image - with response_modalities ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    messages: [
      { role: "user", content: "Generate an image of a fashion model in a stylish blue dress, studio photo, full body shot. Return the image." }
    ],
    max_tokens: 8192,
    response_modalities: ["IMAGE", "TEXT"],
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
  // Print full response to see structure
  try {
    const data = JSON.parse(text);
    console.log("Keys:", Object.keys(data));
    if (data.choices) {
      const msg = data.choices[0].message;
      console.log("Message role:", msg.role);
      console.log("Content type:", typeof msg.content);
      if (Array.isArray(msg.content)) {
        console.log("Content array length:", msg.content.length);
        msg.content.forEach((item, i) => {
          console.log(`Content[${i}]:`, JSON.stringify(item).substring(0, 200));
        });
      } else {
        console.log("Content:", String(msg.content).substring(0, 500));
      }
    }
    console.log("Usage:", JSON.stringify(data.usage));
  } catch(e) {
    console.log("Raw response:", text.substring(0, 2000));
  }
}

// Test 2: Gemini 3.1 Flash Image - with image_generation_config
async function testGeminiImageChat2() {
  console.log("\n=== Test 2: Gemini 3.1 Flash Image - with image_generation_config ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    messages: [
      { role: "user", content: "Generate an image of a fashion model in a stylish blue dress, studio photo, full body shot." }
    ],
    max_tokens: 8192,
    image_generation_config: {
      number_of_images: 1,
      aspect_ratio: "3:4",
    }
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
  try {
    const data = JSON.parse(text);
    if (data.choices) {
      const msg = data.choices[0].message;
      if (Array.isArray(msg.content)) {
        msg.content.forEach((item, i) => {
          if (item.type === 'image_url') {
            console.log(`Image URL found! Length: ${JSON.stringify(item).length}`);
            console.log("Image data prefix:", JSON.stringify(item).substring(0, 300));
          } else {
            console.log(`Content[${i}]:`, JSON.stringify(item).substring(0, 200));
          }
        });
      } else {
        console.log("Content:", String(msg.content).substring(0, 500));
      }
    }
    console.log("Usage:", JSON.stringify(data.usage));
  } catch(e) {
    console.log("Raw response:", text.substring(0, 2000));
  }
}

// Test 3: Poll the requestId from /images/generations using SSE
async function testSSEPolling() {
  console.log("\n=== Test 3: Create image request and try SSE polling ===");
  
  // Create request
  const createBody = {
    model: "google/gemini-3.1-flash-image-preview",
    prompt: "A fashion model in a stylish blue dress, studio photo, full body shot",
    aspect_ratio: "3:4",
    n: 1
  };
  
  const createResp = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(createBody),
  });
  
  const createData = await createResp.json();
  const requestId = createData.requestId;
  console.log("Created requestId:", requestId);
  
  // Try SSE endpoint
  await sleep(2000);
  
  const sseEndpoints = [
    `${BASE_URL}/images/generations/stream/${requestId}`,
    `${BASE_URL}/stream/${requestId}`,
    `${BASE_URL}/events/${requestId}`,
  ];
  
  for (const ep of sseEndpoints) {
    try {
      const r = await fetch(ep, {
        headers: { 
          "Authorization": `Bearer ${API_KEY}`,
          "Accept": "text/event-stream"
        }
      });
      const text = await r.text();
      console.log(`SSE ${ep} -> ${r.status}: ${text.substring(0, 300)}`);
    } catch(e) {
      console.log(`SSE ${ep} -> ERROR: ${e.message}`);
    }
  }
  
  // Try with Accept: application/json after delay
  await sleep(10000);
  console.log("Trying after 10s delay...");
  const r = await fetch(`${BASE_URL}/images/generations/${requestId}`, {
    headers: { "Authorization": `Bearer ${API_KEY}` }
  });
  const text = await r.text();
  console.log(`GET after 10s -> ${r.status}: ${text.substring(0, 500)}`);
}

(async () => {
  await testGeminiImageChat1();
  await testGeminiImageChat2();
  await testSSEPolling();
})();
