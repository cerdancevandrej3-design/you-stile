// Test Seedream 4.5 with new reference
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const API_KEY = process.env.POLZA_API_KEY;
const BASE_URL = process.env.POLZA_BASE_URL || 'https://polza.ai/api/v1';
const OUTPUT_DIR = path.join(process.cwd(), 'model-tests');

// New reference from user
const REFERENCE_URL = 'file:///C:/Users/and/Desktop/project/you-stile/you-stile/model-tests/new_reference.jpg';

const scenarios = [
  {
    name: '1_evening_gown',
    prompt: `IDENTITY PRESERVATION: The person in the reference image is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in the reference. Do NOT alter the face. EXPRESSION: Match the facial expression from the reference exactly. The same person wearing an elegant black evening gown with sophisticated neckline, standing in a luxury restaurant with warm candlelight, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '2_red_dress',
    prompt: `IDENTITY PRESERVATION: The person in the reference image is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in the reference. Do NOT alter the face. EXPRESSION: Match the facial expression from the reference exactly. The same person wearing a stunning red cocktail dress, standing in an elegant lounge, soft ambient lighting, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '3_wedding_dress',
    prompt: `IDENTITY PRESERVATION: The person in the reference image is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in the reference. Do NOT alter the face. EXPRESSION: Match the facial expression from the reference exactly. The same person wearing a beautiful white wedding dress, standing in a romantic garden with flowers, soft sunlight, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '4_business_suit',
    prompt: `IDENTITY PRESERVATION: The person in the reference image is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in the reference. Do NOT alter the face. EXPRESSION: Match the facial expression from the reference exactly. The same person wearing a professional business suit with elegant blouse, standing in a modern office, floor-to-ceiling windows, city skyline background, natural daylight, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '5_beach_bikini',
    prompt: `IDENTITY PRESERVATION: The person in the reference image is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in the reference. Do NOT alter the face. EXPRESSION: Match the facial expression from the reference exactly. The same person wearing an elegant tasteful bikini top with sarong, standing on a tropical beach with turquoise water, palm trees, sunset lighting, professional photography, 85mm portrait lens, photorealistic.`
  },
  {
    name: '6_mini_club',
    prompt: `IDENTITY PRESERVATION: The person in the reference image is the same person. Preserve their face, facial features, skin tone, hair color, eye color, jawline, and expression EXACTLY as they appear in the reference. Do NOT alter the face. EXPRESSION: Match the facial expression from the reference exactly. The same person wearing a short black mini dress with elegant neckline, standing in a modern nightclub with neon lights, purple and blue lighting, professional photography, 85mm portrait lens, photorealistic.`
  }
];

async function generateImage(prompt, referencePath, scenarioName) {
  console.log(`\n[Seedream 4.5] ${scenarioName}`);
  const startTime = Date.now();

  try {
    // Load local reference image
    let refBase64;
    if (referencePath.startsWith('file://')) {
      const filePath = referencePath.replace('file://', '');
      const refBuffer = fs.readFileSync(filePath);
      refBase64 = refBuffer.toString('base64');
    } else {
      const refResponse = await fetch(referencePath);
      const refBuffer = await refResponse.arrayBuffer();
      refBase64 = Buffer.from(refBuffer).toString('base64');
    }

    const requestBody = {
      model: 'bytedance/seedream-4.5',
      input: {
        prompt: prompt,
        aspect_ratio: '3:4',
        quality: 'high',
        output_format: 'png',
        images: [{ type: 'base64', data: refBase64 }]
      }
    };

    const response = await fetch(`${BASE_URL}/media`, {
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
    console.log(`  💾 Saved: ${path.basename(outputPath)}`);
    return true;
  } catch (error) {
    console.log(`  ❌ Save failed: ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('='.repeat(50));
  console.log('SEEDREAM 4.5 TEST (New Reference)');
  console.log('='.repeat(50));

  // Create output directory
  const modelDir = path.join(OUTPUT_DIR, 'seedream_new_ref');
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }

  const results = { success: 0, total: scenarios.length, tests: [] };

  for (const scenario of scenarios) {
    const result = await generateImage(scenario.prompt, REFERENCE_URL, scenario.name);
    results.tests.push({ scenario: scenario.name, ...result });

    if (result.success) {
      results.success++;
      await saveImage(result.imageUrl, path.join(modelDir, `${scenario.name}.png`));
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 Seedream 4.5 (new ref):`);
  console.log(`   Success: ${results.success}/${results.total}`);

  const failed = results.tests.filter(t => !t.success);
  if (failed.length > 0) {
    console.log(`   ❌ Failed:`);
    failed.forEach(t => console.log(`      - ${t.scenario}: ${JSON.stringify(t.error)}`));
  }

  fs.writeFileSync(path.join(modelDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`\nCheck: ${modelDir}`);
}

run().catch(console.error);
