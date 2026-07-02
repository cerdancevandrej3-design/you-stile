// Generate multiple images with Seedream 4.5 using reference
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const API_KEY = process.env.POLZA_API_KEY;
const BASE_URL = process.env.POLZA_BASE_URL || 'https://polza.ai/api/v1';
const OUTPUT_DIR = path.join(process.cwd(), 'model-tests');

// Reference from gallery
const REFERENCE_URL = 'https://stilist-ai.ru/gallery/gen1.jpg';

const scenarios = [
  { name: '01_beach_sunset', prompt: `Photorealistic photo of the same person from the reference image. Professional fashion photography. Elegant woman wearing a stylish beach outfit - flowing maxi dress in coral or turquoise colors, standing on a tropical beach at golden hour sunset. Turquoise ocean water, palm trees, warm sunlight. 85mm lens, shallow DOF, sharp face. Natural skin texture. Ultra-realistic photograph.` },
  { name: '02_city_street', prompt: `Photorealistic photo of the same person from the reference image. Professional fashion photography. Stylish woman wearing a chic urban outfit - designer coat, boots, carrying a luxury handbag, standing on a fashionable city street with autumn leaves. Natural daylight, bokeh background. 85mm lens. Natural skin texture. Ultra-realistic photograph.` },
  { name: '03_restaurant', prompt: `Photorealistic photo of the same person from the reference image. Professional fashion photography. Elegant woman wearing a sophisticated black evening dress with elegant neckline, sitting at a luxury restaurant table. Warm candlelight, elegant interior, wine glasses in background. 85mm lens, shallow DOF, sharp face. Natural skin texture. Ultra-realistic photograph.` },
  { name: '04_garden', prompt: `Photorealistic photo of the same person from the reference image. Professional fashion photography. Beautiful woman wearing a romantic floral dress, standing in a blooming garden with roses and flowers. Soft spring sunlight, butterflies. 85mm lens, shallow DOF, sharp face. Natural skin texture. Ultra-realistic photograph.` },
  { name: '05_office', prompt: `Photorealistic photo of the same person from the reference image. Professional fashion photography. Confident business woman wearing a tailored power suit in navy or cream color, standing in a modern glass office with city skyline through floor-to-ceiling windows. Natural business lighting. 85mm lens. Natural skin texture. Ultra-realistic photograph.` },
  { name: '06_nightclub', prompt: `Photorealistic photo of the same person from the reference image. Professional fashion photography. Glamorous woman wearing a sparkly short party dress with high heels, standing in a luxury nightclub with purple and blue neon lights. Dramatic lighting, bokeh disco lights in background. 85mm lens. Natural skin texture. Ultra-realistic photograph.` },
  { name: '07_pool_luxury', prompt: `Photorealistic photo of the same person from the reference image. Professional fashion photography. Beautiful woman wearing an elegant one-piece swimsuit or bikini, lounging on a sunbed by a luxury infinity pool at a Mediterranean resort. Crystal clear water, stone terrace, sunlight. 85mm lens, shallow DOF. Natural skin texture. Ultra-realistic photograph.` },
  { name: '08_cafe_paris', prompt: `Photorealistic photo of the same person from the reference image. Professional fashion photography. Stylish woman wearing a chic Parisian outfit - beret, trench coat, sitting at a cozy sidewalk cafe in Paris. Croissants, espresso, Eiffel Tower in distance. Warm morning light. 85mm lens. Natural skin texture. Ultra-realistic photograph.` },
];

async function generateImage(prompt, referenceUrl, scenarioName) {
  console.log(`[Seedream] ${scenarioName}`);
  const startTime = Date.now();

  try {
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

    if (data.error) {
      console.log(`  ❌ ${data.error.message}`);
      return { success: false, error: data.error };
    }

    // Check for sync result
    let imageUrl = data.data?.[0]?.url || data.output || data.url;

    // Poll if async
    if (data.id && !imageUrl) {
      console.log(`  ⏳ Polling...`);
      const maxWait = 120000;
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxWait) {
        await new Promise(r => setTimeout(r, 3000));
        const pollResp = await fetch(`${BASE_URL}/media/${data.id}`, {
          headers: { 'Authorization': `Bearer ${API_KEY}` }
        });
        const pollData = await pollResp.json();

        imageUrl = pollData.data?.[0]?.url || pollData.output;
        if (imageUrl) break;
        if (pollData.status === 'failed') break;
      }
    }

    if (imageUrl) {
      const elapsed = Date.now() - startTime;
      console.log(`  ✅ ${elapsed}ms`);
      return { success: true, imageUrl, time: elapsed };
    }

    console.log(`  ⚠️ No image`);
    return { success: false };
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
    const kb = Math.round(Buffer.byteLength(data) / 1024);
    console.log(`  💾 ${path.basename(outputPath)} (${kb} KB)`);
    return true;
  } catch (error) {
    console.log(`  ❌ ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('='.repeat(50));
  console.log('SEEDREAM 4.5 - DIFFERENT LOCATIONS');
  console.log('='.repeat(50));

  const outDir = path.join(OUTPUT_DIR, 'seedream_locations');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let success = 0;
  const results = [];

  for (const s of scenarios) {
    const result = await generateImage(s.prompt, REFERENCE_URL, s.name);
    results.push({ ...s, ...result });

    if (result.success) {
      success++;
      await saveImage(result.imageUrl, path.join(outDir, `${s.name}.png`));
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n📊 Result: ${success}/${scenarios.length}`);
  console.log(`\nCheck: ${outDir}`);

  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
}

run().catch(console.error);
