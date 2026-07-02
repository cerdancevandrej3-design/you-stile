// Test script for comparing image generation models
// Tests: black-forest-labs/flux.2-pro, openai/gpt-5.4-image-2, x-ai/grok-imagine-image
// Polza.ai API with async support

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const API_KEY = process.env.POLZA_API_KEY;
const BASE_URL = process.env.POLZA_BASE_URL || 'https://polza.ai/api/v1';
const OUTPUT_DIR = path.join(process.cwd(), 'model-tests');

// Models to test
const MODELS = [
  'black-forest-labs/flux.2-pro',
  'openai/gpt-5.4-image-2',
  'x-ai/grok-imagine-image'
];

// Test scenarios - different locations and outfits
const TEST_SCENARIOS = [
  {
    name: '1_evening_dress',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1 exactly. The same person wearing an elegant black evening gown with sophisticated neckline, standing in a luxury restaurant with warm candlelight, professional photography, 85mm portrait lens, photorealistic, natural skin texture.`
  },
  {
    name: '2_mini_dress_club',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1 exactly. The same person wearing a short black mini dress, standing in a modern nightclub with neon lights, purple and blue lighting, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '3_beach_bikini',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1. The same person wearing an elegant tasteful bikini top with sarong, standing on a tropical beach with turquoise water, palm trees, sunset lighting, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '4_red_gala',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1. The same person wearing a stunning red floor-length gown with elegant neckline, standing on a red carpet at a gala event, professional event photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '5_swimsuit_pool',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1. The same person wearing a tasteful one-piece swimsuit, lounging by a luxury pool, Mediterranean resort atmosphere, professional photography, 85mm portrait lens, photorealistic.`
  }
];

// Reference image from gallery
const REFERENCE_URL = 'https://stilist-ai.ru/gallery/gen1.jpg';

// Extract image URL from response
function extractImageUrl(data) {
  // FLUX.2 Pro format
  if (data.data && data.data[0] && data.data[0].url) {
    return data.data[0].url;
  }

  // GPT Image format
  if (data.data && data.data[0] && data.data[0].b64_json) {
    return 'data:image/png;base64,' + data.data[0].b64_json;
  }

  // Direct output
  if (data.output) {
    return data.output;
  }

  // Result format
  if (data.result && data.result.images && data.result.images[0]) {
    return data.result.images[0];
  }

  // s3 URL directly
  if (data.url) {
    return data.url;
  }

  return null;
}

async function generateImage(model, prompt, referenceUrl, scenarioName) {
  console.log(`\n[${model}] Generating: ${scenarioName}`);

  const startTime = Date.now();

  try {
    // Upload reference image first
    console.log(`  📤 Uploading reference image...`);
    const refResponse = await fetch(referenceUrl);
    const refBuffer = await refResponse.arrayBuffer();
    const refBase64 = Buffer.from(refBuffer).toString('base64');

    // Format request based on model
    let requestBody;
    let endpoint = `${BASE_URL}/images/generations`;

    if (model === 'black-forest-labs/flux.2-pro') {
      // FLUX.2 Pro format - uses /v1/media endpoint
      endpoint = `${BASE_URL}/media`;
      requestBody = {
        model: model,
        input: {
          prompt: prompt,
          aspect_ratio: '3:4',
          image_resolution: '2K',
          output_format: 'png',
          images: [{ type: 'base64', data: refBase64 }],
          quality: 'high'
        }
      };
    } else {
      // OpenAI-compatible format
      requestBody = {
        model: model,
        prompt: prompt,
        aspect_ratio: '3:4',
        image_resolution: '2K',
        output_format: 'png',
        images: [refBase64],
        quality: 'high'
      };
    }

    console.log(`  📡 Endpoint: ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    const elapsed = Date.now() - startTime;

    if (data.error) {
      console.log(`  ❌ API Error: ${data.error.message || JSON.stringify(data.error)}`);
      return { success: false, error: data.error, time: elapsed };
    }

    // Try to extract URL immediately
    let imageUrl = extractImageUrl(data);

    if (imageUrl) {
      console.log(`  ✅ Generated in ${elapsed}ms (sync)`);
      return {
        success: true,
        imageUrl,
        time: elapsed,
        model,
        scenario: scenarioName
      };
    }

    // Handle async responses
    let requestId = null;
    if (data.id) requestId = data.id;
    if (data.requestId) requestId = data.requestId;

    if (requestId && data.status !== 'completed') {
      console.log(`  ⏳ Async mode - polling for result...`);

      // Poll
      const pollInterval = 2000;
      const maxWait = 180000;
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxWait) {
        await new Promise(r => setTimeout(r, pollInterval));

        const pollEndpoint = model === 'black-forest-labs/flux.2-pro'
          ? `${BASE_URL}/media/${requestId}`
          : `${BASE_URL}/images/generations/${requestId}`;

        const pollResponse = await fetch(pollEndpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${API_KEY}`
          }
        });

        const pollData = await pollResponse.json();

        imageUrl = extractImageUrl(pollData);

        if (imageUrl) {
          const totalElapsed = Date.now() - startTime;
          console.log(`  ✅ Generated in ${totalElapsed}ms`);
          return {
            success: true,
            imageUrl,
            time: totalElapsed,
            model,
            scenario: scenarioName
          };
        }

        if (pollData.status === 'failed') {
          console.log(`  ❌ Generation failed`);
          return { success: false, error: pollData.error, time: Date.now() - startTime };
        }

        console.log(`    ⏳ Waiting... (${Math.round((Date.now() - pollStart) / 1000)}s)`);
      }

      console.log(`  ❌ Timeout`);
      return { success: false, error: 'Timeout', time: Date.now() - startTime };
    }

    console.log(`  ⚠️  No image found. Response:`, JSON.stringify(data).substring(0, 300));
    return { success: false, error: 'No image in response', time: elapsed, rawResponse: data };

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`  ❌ Exception: ${error.message}`);
    return { success: false, error: error.message, time: elapsed };
  }
}

async function saveImage(imageUrl, outputPath) {
  try {
    let imageData;

    if (imageUrl.startsWith('data:')) {
      const base64Data = imageUrl.split(',')[1];
      imageData = Buffer.from(base64Data, 'base64');
    } else {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }
      imageData = Buffer.from(await response.arrayBuffer());
    }

    fs.writeFileSync(outputPath, imageData);
    console.log(`  💾 Saved: ${outputPath}`);
    return true;
  } catch (error) {
    console.log(`  ❌ Failed to save: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('='.repeat(60));
  console.log('MODEL COMPARISON TEST');
  console.log('FLUX.2 Pro vs GPT Image vs Grok Imagine');
  console.log('='.repeat(60));
  console.log(`API: ${BASE_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Reference: ${REFERENCE_URL}`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = {
    timestamp: new Date().toISOString(),
    models: {},
    scenarios: []
  };

  for (const model of MODELS) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`TESTING MODEL: ${model}`);
    console.log(`${'#'.repeat(60)}`);

    results.models[model] = {
      tests: [],
      successCount: 0,
      totalTime: 0
    };

    const modelDir = path.join(OUTPUT_DIR, model.replace(/\//g, '_'));
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    for (const scenario of TEST_SCENARIOS) {
      const result = await generateImage(model, scenario.prompt, REFERENCE_URL, scenario.name);

      results.models[model].tests.push({
        scenario: scenario.name,
        ...result
      });

      if (result.success) {
        results.models[model].successCount++;
        results.models[model].totalTime += result.time;

        const imagePath = path.join(modelDir, `${scenario.name}.png`);
        await saveImage(result.imageUrl, imagePath);
      }

      await new Promise(r => setTimeout(r, 2000));
    }

    const modelStats = results.models[model];
    console.log(`\n📊 ${model} Summary:`);
    console.log(`   Success: ${modelStats.successCount}/${TEST_SCENARIOS.length}`);
    if (modelStats.successCount > 0) {
      console.log(`   Avg time: ${Math.round(modelStats.totalTime / modelStats.successCount)}ms`);
    }
  }

  const resultsPath = path.join(OUTPUT_DIR, 'test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved: ${resultsPath}`);

  // Comparison
  console.log(`\n${'='.repeat(60)}`);
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(60));

  for (const model of MODELS) {
    const stats = results.models[model];
    console.log(`\n${model}:`);
    console.log(`  ✅ Success rate: ${stats.successCount}/${TEST_SCENARIOS.length}`);

    if (stats.successCount > 0) {
      const avgTime = stats.totalTime / stats.successCount;
      console.log(`  ⏱️  Avg time: ${Math.round(avgTime)}ms`);
    }

    const failed = stats.tests.filter(t => !t.success);
    if (failed.length > 0) {
      console.log(`  ❌ Failed:`);
      failed.forEach(t => {
        console.log(`     - ${t.scenario}: ${JSON.stringify(t.error)}`);
      });
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('Test complete!');
  console.log('='.repeat(60));

  return results;
}

runTests().catch(console.error);

export { runTests };
