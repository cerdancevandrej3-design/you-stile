// Test FLUX.2 Flex and Seedream 4.5 - both with is_moderated: false
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
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1 exactly. The same person wearing an elegant black evening gown with sophisticated neckline, standing in a luxury restaurant with warm candlelight, professional photography, 85mm portrait lens, photorealistic.`
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
    name: '4_swimsuit_pool',
    prompt: `IDENTITY PRESERVATION: The person in image 1 is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in image 1. Do NOT alter the face. EXPRESSION: Match the facial expression from image 1. The same person wearing a tasteful one-piece swimsuit, lounging by a luxury pool, Mediterranean resort atmosphere, professional photography, 85mm portrait lens, photorealistic.`
  }
];

const MODELS = [
  { id: 'black-forest-labs/flux.2-flex', name: 'FLUX.2 Flex', quality: 'high' },
  { id: 'bytedance/seedream-4.5', name: 'Seedream 4.5', quality: 'high' }
];

async function generateImage(model, prompt, referenceUrl, scenarioName, quality) {
  console.log(`\n[${model.name}] ${scenarioName}`);
  const startTime = Date.now();

  try {
    const refResponse = await fetch(referenceUrl);
    const refBuffer = await refResponse.arrayBuffer();
    const refBase64 = Buffer.from(refBuffer).toString('base64');

    let requestBody;
    let endpoint = `${BASE_URL}/media`;

    if (model.id === 'black-forest-labs/flux.2-flex') {
      requestBody = {
        model: model.id,
        input: {
          prompt: prompt,
          aspect_ratio: '3:4',
          image_resolution: '2K',
          output_format: 'png',
          images: [{ type: 'base64', data: refBase64 }],
          quality: quality
        }
      };
    } else if (model.id === 'bytedance/seedream-4.5') {
      requestBody = {
        model: model.id,
        input: {
          prompt: prompt,
          aspect_ratio: '3:4',
          quality: quality,
          output_format: 'png',
          images: [{ type: 'base64', data: refBase64 }]
        }
      };
    }

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
      console.log(`  ❌ Error: ${data.error.message || JSON.stringify(data.error)}`);
      return { success: false, error: data.error, time: elapsed };
    }

    // Extract image
    let imageUrl = null;
    if (data.data && data.data[0] && data.data[0].url) {
      imageUrl = data.data[0].url;
    } else if (data.output) {
      imageUrl = data.output;
    } else if (data.url) {
      imageUrl = data.url;
    }

    if (imageUrl) {
      console.log(`  ✅ ${elapsed}ms`);
      return { success: true, imageUrl, time: elapsed };
    }

    // Async polling
    if (data.id) {
      console.log(`  ⏳ Polling...`);
      const maxWait = 120000;
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxWait) {
        await new Promise(r => setTimeout(r, 3000));
        const pollResp = await fetch(`${BASE_URL}/media/${data.id}`, {
          headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        const pollData = await pollResp.json();

        imageUrl = pollData.data?.[0]?.url || pollData.output || pollData.url;
        if (imageUrl) {
          console.log(`  ✅ ${Date.now() - startTime}ms (async)`);
          return { success: true, imageUrl, time: Date.now() - startTime };
        }
        if (pollData.status === 'failed') {
          console.log(`  ❌ Failed`);
          return { success: false, error: 'failed' };
        }
        console.log(`    ...${Math.round((Date.now() - pollStart)/1000)}s`);
      }
    }

    console.log(`  ⚠️ No image. Response:`, JSON.stringify(data).substring(0, 200));
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
  console.log('NO-CENSORSHIP MODEL TEST');
  console.log('FLUX.2 Flex vs Seedream 4.5');
  console.log('='.repeat(50));

  const results = {};

  for (const model of MODELS) {
    console.log(`\n${'#'.repeat(40)}`);
    console.log(`MODEL: ${model.name}`);
    console.log(`${'#'.repeat(40)}`);

    const modelDir = path.join(OUTPUT_DIR, model.id.replace(/\//g, '_'));
    if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

    results[model.id] = { success: 0, total: scenarios.length, tests: [] };

    for (const scenario of scenarios) {
      const result = await generateImage(model, scenario.prompt, REFERENCE_URL, scenario.name, model.quality);
      results[model.id].tests.push({ scenario: scenario.name, ...result });

      if (result.success) {
        results[model.id].success++;
        await saveImage(result.imageUrl, path.join(modelDir, `${scenario.name}.png`));
      }
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n📊 ${model.name}: ${results[model.id].success}/${scenarios.length}`);
  }

  // Save results
  fs.writeFileSync(path.join(OUTPUT_DIR, 'nocensor-test.json'), JSON.stringify(results, null, 2));

  // Comparison
  console.log(`\n${'='.repeat(50)}`);
  console.log('COMPARISON');
  console.log('='.repeat(50));

  for (const modelId of Object.keys(results)) {
    const r = results[modelId];
    console.log(`\n${modelId}:`);
    console.log(`   ✅ ${r.success}/${r.total}`);
    const failed = r.tests.filter(t => !t.success);
    if (failed.length > 0) {
      console.log(`   ❌ Failed:`);
      failed.forEach(t => console.log(`      - ${t.scenario}: ${JSON.stringify(t.error)}`));
    }
  }

  console.log(`\nImages saved to: ${OUTPUT_DIR}`);
}

run().catch(console.error);
