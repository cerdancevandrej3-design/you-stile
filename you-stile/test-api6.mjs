// Test correct Media API flow: POST /v1/media -> GET /v1/media/{id}
// And POST /v2/images/generations
const API_KEY = "pza_a1KLxwpw1dPQdKgDSI9N6qCEVLie2d1C";
const BASE_URL = "https://polza.ai/api/v1";
const BASE_URL_V2 = "https://polza.ai/api/v2";

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: POST /v1/media with Nano Banana 2 (image model)
async function testMediaAPI() {
  console.log("=== Test 1: POST /v1/media with Nano Banana 2 ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    input: {
      prompt: "A fashion model in a stylish blue dress, studio photo, full body shot, fashion editorial photography",
      aspect_ratio: "3:4",
    }
  };
  
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
  console.log("Response:", text.substring(0, 500));
  
  if (response.ok) {
    const data = JSON.parse(text);
    const id = data.id || data.requestId;
    if (id) {
      console.log("Got ID:", id);
      // Poll GET /v1/media/{id}
      for (let i = 0; i < 20; i++) {
        await sleep(3000);
        const pollResp = await fetch(`${BASE_URL}/media/${id}`, {
          headers: { "Authorization": `Bearer ${API_KEY}` }
        });
        const pollText = await pollResp.text();
        console.log(`Poll ${i+1}: status=${pollResp.status}, body=${pollText.substring(0, 300)}`);
        
        if (pollResp.ok) {
          const pollData = JSON.parse(pollText);
          if (pollData.status === 'completed' || pollData.data) {
            console.log("COMPLETED! Full data:", JSON.stringify(pollData, null, 2).substring(0, 1000));
            return;
          }
        }
      }
    }
  }
}

// Test 2: POST /v2/images/generations with Flux 2 Pro
async function testV2ImagesFlux() {
  console.log("\n=== Test 2: POST /v2/images/generations with Flux 2 Pro ===");
  const body = {
    model: "black-forest-labs/flux.2-pro",
    prompt: "A fashion model in a stylish blue dress, studio photo, full body shot",
    aspect_ratio: "3:4",
    n: 1
  };
  
  const response = await fetch(`${BASE_URL_V2}/images/generations`, {
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

// Test 3: POST /v2/images/generations with Nano Banana 2
async function testV2ImagesNanaBanana() {
  console.log("\n=== Test 3: POST /v2/images/generations with Nano Banana 2 ===");
  const body = {
    model: "google/gemini-3.1-flash-image-preview",
    prompt: "A fashion model in a stylish red dress, studio photo, full body shot",
    aspect_ratio: "3:4",
    n: 1
  };
  
  const response = await fetch(`${BASE_URL_V2}/images/generations`, {
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
  
  if (response.ok || response.status === 201) {
    try {
      const data = JSON.parse(text);
      const id = data.id || data.requestId;
      if (id) {
        console.log("Got ID:", id, "- polling GET /v1/media/{id}");
        for (let i = 0; i < 15; i++) {
          await sleep(3000);
          const pollResp = await fetch(`${BASE_URL}/media/${id}`, {
            headers: { "Authorization": `Bearer ${API_KEY}` }
          });
          const pollText = await pollResp.text();
          console.log(`Poll ${i+1}: status=${pollResp.status}, body=${pollText.substring(0, 300)}`);
          if (pollResp.ok) {
            const pollData = JSON.parse(pollText);
            if (pollData.status === 'completed' || (pollData.data && pollData.data !== '<unknown>')) {
              console.log("COMPLETED!", JSON.stringify(pollData).substring(0, 500));
              return;
            }
          }
        }
      } else if (data.data) {
        console.log("Immediate result:", JSON.stringify(data.data).substring(0, 500));
      }
    } catch(e) {}
  }
}

(async () => {
  await testMediaAPI();
  await testV2ImagesFlux();
  await testV2ImagesNanaBanana();
})();
