// Test Polza.ai - Nano Banana 2 async polling + reference image
const API_KEY = "pza_a1KLxwpw1dPQdKgDSI9N6qCEVLie2d1C";
const BASE_URL = "https://polza.ai/api/v1";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function pollResult(requestId, maxAttempts = 30) {
  console.log(`Polling for requestId: ${requestId}`);
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(3000);
    const response = await fetch(`${BASE_URL}/images/generations/${requestId}`, {
      headers: { "Authorization": `Bearer ${API_KEY}` }
    });
    const text = await response.text();
    console.log(`Attempt ${i+1}, status: ${response.status}, response: ${text.substring(0, 500)}`);
    
    if (response.status === 200) {
      const data = JSON.parse(text);
      return data;
    }
    if (response.status !== 202 && response.status !== 404) {
      console.log("Unexpected status, stopping poll");
      break;
    }
  }
  return null;
}

async function testNanaBanana2WithPoll() {
  console.log("=== Testing Nano Banana 2 - full flow with polling ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    prompt: "A fashion model in a stylish red dress, studio photo, full body shot, fashion editorial",
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
  console.log("Initial status:", response.status);
  console.log("Initial response:", text);
  
  if (response.status === 201 || response.status === 200) {
    const data = JSON.parse(text);
    if (data.requestId) {
      const result = await pollResult(data.requestId);
      console.log("Final result:", JSON.stringify(result, null, 2));
    } else if (data.data) {
      console.log("Immediate result:", JSON.stringify(data, null, 2));
    }
  }
}

async function testNanaBananaWithReference() {
  console.log("\n=== Testing Nano Banana 2 with reference image URL ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    prompt: "The person from the reference image wearing a stylish red dress, studio photo, full body shot, fashion editorial",
    aspect_ratio: "3:4",
    n: 1,
    images: [
      { type: "url", data: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Gatto_europeo4.jpg/220px-Gatto_europeo4.jpg" }
    ]
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
  console.log("Response:", text.substring(0, 500));
  
  if (response.status === 201 || response.status === 200) {
    const data = JSON.parse(text);
    if (data.requestId) {
      const result = await pollResult(data.requestId);
      console.log("Final result:", JSON.stringify(result, null, 2));
    }
  }
}

// Also test what endpoints look like for status check
async function testStatusEndpoints(requestId) {
  const endpoints = [
    `/images/generations/${requestId}`,
    `/images/status/${requestId}`,
    `/requests/${requestId}`,
  ];
  
  for (const ep of endpoints) {
    const r = await fetch(`${BASE_URL}${ep}`, {
      headers: { "Authorization": `Bearer ${API_KEY}` }
    });
    console.log(`GET ${ep} -> ${r.status}: ${(await r.text()).substring(0, 200)}`);
  }
}

(async () => {
  await testNanaBanana2WithPoll();
  await testNanaBananaWithReference();
})();
