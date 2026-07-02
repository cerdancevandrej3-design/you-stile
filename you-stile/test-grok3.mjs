// Test x-ai/grok-imagine-image with correct aspect ratios
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const API_KEY = process.env.POLZA_API_KEY;
const BASE_URL = process.env.POLZA_BASE_URL || 'https://polza.ai/api/v1';
const OUTPUT_DIR = path.join(process.cwd(), 'model-tests');

const REFERENCE_URL = 'https://stilist-ai.ru/gallery/gen1.jpg';

const scenarios = [
  {
    name: '1_evening_dress',
    aspect_ratio: '2:3', // Portrait mode
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1 exactly. The same person wearing an elegant black evening gown with sophisticated neckline, standing in a luxury restaurant with warm candlelight, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '2_mini_dress_club',
    aspect_ratio: '2:3',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1 exactly. The same person wearing a short black mini dress, standing in a modern nightclub with neon lights, purple and blue lighting, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '3_beach_bikini',
    aspect_ratio: '2:3',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1. The same person wearing an elegant tasteful bikini top with sarong, standing on a tropical beach with turquoise water, palm trees, sunset lighting, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '4_swimsuit_pool',
    aspect_ratio: '2:3',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1. The same person wearing a tasteful one-piece swimsuit, lounging by a luxury pool, Mediterranean resort atmosphere, professional photography, 85mm portrait lens, photorealistic.`
  }
];

async function generateImage(model, prompt, referenceUrl, scenarioName, aspectRatio) {
  console.log(`\n[${model}] ${scenarioName} (${aspectRatio})`);
  const startTime = Date.now();

  try {
    const refResponse = await fetch(referenceUrl);
    const refBuffer = await refResponse.arrayBuffer();
    const refBase64 = Buffer.from(refBuffer).toString('base64');

    const requestBody = {
      model: model,
      prompt: prompt,
      aspect_ratio: aspectRatio,
      image_resolution: '2K',
      output_format: 'png',
      images: [refBase64],
      quality: 'high'
    };

    const response = await fetch(`${BASE_URL}/images/generations`, {
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
      console.log(`  ❌ Error: ${data.error.message || JSON.stringify(data.error)}`);
      return { success: false, error: data.error, time: elapsed };
    }

    // Extract image
    let imageUrl = null;
    if (data.data && data.data[0]) {
      imageUrl = data.data[0].url || data.data[0].b64_json;
    } else if (data.url) {
      imageUrl = data.url;
    } else if (data.output) {
      imageUrl = data.output;
    }

    if (imageUrl) {
      console.log(`  ✅ ${elapsed}ms`);
      return { success: true, imageUrl, time: elapsed };
    }

    // Async polling
    if (data.requestId) {
      console.log(`  ⏳ Polling...`);
      const maxWait = 180000;
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxWait) {
        await new Promise(r => setTimeout(r, 3000));
        const pollResp = await fetch(`${BASE_URL}/images/generations/${data.requestId}`, {
          headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        const pollData = await pollResp.json();

        imageUrl = pollData.data?.[0]?.url || pollData.data?.[0]?.b64_json || pollData.output;
        if (imageUrl) {
          console.log(`  ✅ ${Date.now() - startTime}ms`);
          return { success: true, imageUrl, time: Date.now() - startTime };
        }
        if (pollData.status === 'failed') {
          console.log(`  ❌ Failed`);
          return { success: false, error: 'failed', time: Date.now() - startTime };
        }
        console.log(`    ...${Math.round((Date.now() - pollStart)/1000)}s`);
      }
    }

    console.log(`  ⚠️ Response:`, JSON.stringify(data).substring(0, 200));
    return { success: false, error: 'No image', time: elapsed };
  } catch (error) {
    console.log(`  ❌ ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function saveImage(imageUrl, outputPath) {
  try {
    let data;
    if (imageUrl.startsWith('data:')) {
      data = Buffer.from(imageUrl.split(',')[1], 'base64');
    } else {
      const resp = await fetch(imageUrl);
      data = Buffer.from(await resp.arrayBuffer());
    }
    fs.writeFileSync(outputPath, data);
    console.log(`  💾 Saved`);
    return true;
  } catch (error) {
    console.log(`  ❌ Save failed: ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('='.repeat(50));
  console.log('GROK IMAGINE TEST (corrected aspect ratios)');
  console.log('='.repeat(50));

  const model = 'x-ai/grok-imagine-image';
  const modelDir = path.join(OUTPUT_DIR, model.replace(/\//g, '_'));
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  const results = { success: 0, total: scenarios.length, tests: [] };

  for (const scenario of scenarios) {
    const result = await generateImage(model, scenario.prompt, REFERENCE_URL, scenario.name, scenario.aspect_ratio);
    results.tests.push({ scenario: scenario.name, ...result });

    if (result.success) {
      results.success++;
      await saveImage(result.imageUrl, path.join(modelDir, `${scenario.name}.png`));
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 ${model}:`);
  console.log(`   Success: ${results.success}/${results.total}`);

  const failed = results.tests.filter(t => !t.success);
  if (failed.length > 0) {
    console.log(`   ❌ Failed:`);
    failed.forEach(t => console.log(`      - ${t.scenario}: ${JSON.stringify(t.error)}`));
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'grok-test2.json'), JSON.stringify(results, null, 2));
  console.log(`\nCheck: ${modelDir}`);
}

run().catch(console.error);
