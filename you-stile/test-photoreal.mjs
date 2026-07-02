// Test Seedream 4.5 with photorealistic prompt
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const API_KEY = process.env.POLZA_API_KEY;
const BASE_URL = process.env.POLZA_BASE_URL || 'https://polza.ai/api/v1';
const OUTPUT_DIR = path.join(process.cwd(), 'model-tests');

// Use gallery reference
const REFERENCE_URL = 'https://stilist-ai.ru/gallery/gen1.jpg';

const scenarios = [
  {
    name: '1_photoreal_evening',
    prompt: `Photorealistic portrait photograph of the same person from the reference image. Professional fashion photography. The person is wearing an elegant black evening gown with sophisticated neckline, standing in a luxury restaurant. Studio lighting with warm candlelight ambiance. High-end editorial fashion shoot. 85mm f/1.4 lens, shallow depth of field, sharp focus on face. Natural skin texture with visible pores and details. No makeup or excessive retouching. Ultra-realistic, indistinguishable from a real photograph.`
  },
  {
    name: '2_photoreal_red_dress',
    prompt: `Photorealistic portrait photograph of the same person from the reference image. Professional fashion photography. The person is wearing a stunning red cocktail dress, sitting in an elegant lounge. Soft ambient lighting with bokeh background. High-end editorial fashion shoot. 85mm f/1.4 lens, shallow depth of field, sharp focus on face. Natural skin texture with visible pores and details. Ultra-realistic, indistinguishable from a real photograph.`
  },
  {
    name: '3_photoreal_beach',
    prompt: `Photorealistic portrait photograph of the same person from the reference image. Professional fashion photography. The person is wearing an elegant bikini top with sarong, standing on a tropical beach with turquoise water. Golden hour sunset lighting. High-end fashion editorial. 85mm f/1.4 lens, shallow depth of field. Natural skin texture with visible pores and details. Ultra-realistic, indistinguishable from a real photograph.`
  },
  {
    name: '4_photoreal_mini',
    prompt: `Photorealistic portrait photograph of the same person from the reference image. Professional fashion photography. The person is wearing a short black mini dress, standing in a modern nightclub with neon purple and blue lighting. Dramatic fashion lighting. High-end editorial shoot. 85mm f/1.4 lens, shallow depth of field, sharp focus on face. Natural skin texture. Ultra-realistic, indistinguishable from a real photograph.`
  },
  {
    name: '5_photoreal_pool',
    prompt: `Photorealistic portrait photograph of the same person from the reference image. Professional fashion photography. The person is wearing a tasteful one-piece swimsuit, lounging by a luxury pool at a Mediterranean resort. Natural sunlight with soft shadows. High-end fashion editorial. 85mm f/1.4 lens, shallow depth of field, sharp focus on face. Natural skin texture with visible pores and details. Ultra-realistic, indistinguishable from a real photograph.`
  },
  {
    name: '6_photoreal_wedding',
    prompt: `Photorealistic portrait photograph of the same person from the reference image. Professional fashion photography. The person is wearing a beautiful white wedding dress, standing in a romantic garden with flowers. Soft natural sunlight filtering through trees. High-end bridal editorial. 85mm f/1.4 lens, shallow depth of field, sharp focus on face. Natural skin texture. Ultra-realistic, indistinguishable from a real photograph.`
  }
];

async function generateImage(prompt, referenceUrl, scenarioName) {
  console.log(`\n[Seedream 4.5] ${scenarioName}`);
  const startTime = Date.now();

  try {
    // Download reference
    const refResponse = await fetch(referenceUrl);
    const refBuffer = await refResponse.arrayBuffer();
    const refBase64 = Buffer.from(refBuffer).toString('base64');

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
    const size = Math.round(Buffer.byteLength(data) / 1024);
    console.log(`  💾 Saved: ${path.basename(outputPath)} (${size} KB)`);
    return true;
  } catch (error) {
    console.log(`  ❌ Save failed: ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('SEEDREAM 4.5 - PHOTOREALISTIC TEST');
  console.log('='.repeat(60));

  const modelDir = path.join(OUTPUT_DIR, 'seedream_photoreal');
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

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

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Seedream 4.5 Photorealistic:`);
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
