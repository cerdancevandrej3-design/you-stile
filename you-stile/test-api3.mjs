// Test different status endpoints for Nano Banana 2
const API_KEY = "pza_a1KLxwpw1dPQdKgDSI9N6qCEVLie2d1C";
const BASE_URL = "https://polza.ai/api/v1";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// First create a new request
async function createRequest() {
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
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
  
  const data = await response.json();
  console.log("Created request:", data);
  return data.requestId || data.id;
}

async function testAllStatusEndpoints(requestId) {
  console.log(`\nTesting status endpoints for: ${requestId}`);
  
  const endpoints = [
    `/images/generations/${requestId}`,
    `/images/status/${requestId}`,
    `/requests/${requestId}`,
    `/generation/${requestId}`,
    `/status/${requestId}`,
    `/tasks/${requestId}`,
  ];
  
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${BASE_URL}${ep}`, {
        headers: { "Authorization": `Bearer ${API_KEY}` }
      });
      const text = await r.text();
      console.log(`GET ${ep} -> ${r.status}: ${text.substring(0, 300)}`);
    } catch(e) {
      console.log(`GET ${ep} -> ERROR: ${e.message}`);
    }
  }
}

// Also try the polza.ai main domain (not api subdomain)
async function testPolzaMainDomain(requestId) {
  console.log(`\nTesting polza.ai main domain endpoints for: ${requestId}`);
  
  const endpoints = [
    `https://polza.ai/api/v1/images/generations/${requestId}`,
    `https://polza.ai/api/v1/requests/${requestId}`,
  ];
  
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        headers: { "Authorization": `Bearer ${API_KEY}` }
      });
      const text = await r.text();
      console.log(`GET ${ep} -> ${r.status}: ${text.substring(0, 300)}`);
    } catch(e) {
      console.log(`GET ${ep} -> ERROR: ${e.message}`);
    }
  }
}

// Try synchronous mode - maybe we need to wait longer or use different params
async function testSyncMode() {
  console.log("\n=== Testing synchronous-like request (no n param) ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    prompt: "A fashion model in a stylish green dress, studio photo, full body shot",
    aspect_ratio: "1:1",
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
  console.log("Headers:", JSON.stringify(Object.fromEntries(response.headers.entries())));
  console.log("Response:", text.substring(0, 1000));
}

(async () => {
  const requestId = await createRequest();
  await sleep(5000); // wait 5 seconds
  await testAllStatusEndpoints(requestId);
  await testPolzaMainDomain(requestId);
  await testSyncMode();
})();
