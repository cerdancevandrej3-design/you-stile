// Generate images with Seedream 4.5 - from formal to swimsuit
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
  { name: '01_business_suit', prompt: `Photorealistic photo of the same person from the reference image. Professional businesswoman wearing an elegant tailored business suit, standing in a modern corporate office. City skyline through floor-to-ceiling windows. Natural professional lighting. 85mm lens, shallow DOF, sharp focus on face. Natural skin texture. Ultra-realistic photograph.` },
  { name: '02_evening_gown', prompt: `Photorealistic photo of the same person from the reference image. Elegant woman wearing a sophisticated black evening gown with elegant neckline, standing in a luxury hotel lobby. Crystal chandeliers, marble floors. Warm ambient lighting. 85mm lens, shallow DOF, sharp face. Natural skin texture. Ultra-realistic photograph.` },
  { name: '03_cocktail_dress', prompt: `Photorealistic photo of the same person from the reference image. Stylish woman wearing a chic red cocktail dress, sitting at an elegant bar. Moody ambient lighting, bokeh background with city lights. 85mm lens, shallow DOF, sharp face. Natural skin texture. Ultra-realistic photograph.` },
  { name: '04_mini_dress', prompt: `Photorealistic photo of the same person from the reference image. Glamorous woman wearing a short black mini dress with high heels, standing in a modern lounge. Purple and blue neon lighting, stylish interior. 85mm lens, shallow DOF, sharp face. Natural skin texture. Ultra-realistic photograph.` },
  { name: '05_bikini_beach', prompt: `Photorealistic photo of the same person from the reference image. Beautiful woman wearing an elegant bikini top with sarong, standing on a tropical beach. Turquoise ocean, palm trees, golden sunset lighting. 85mm lens, shallow DOF, sharp face. Natural skin texture. Ultra-realistic photograph.` },
  { name: '06_swimsuit_pool', prompt: `Photorealistic photo of the same person from the reference image. Beautiful woman wearing a tasteful one-piece swimsuit, lounging by a luxury pool at a Mediterranean resort. Stone terrace, crystal water, warm sunlight. 85mm lens, shallow DOF, sharp face. Natural skin texture. Ultra-realistic photograph.` },
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

    let imageUrl = data.data?.[0]?.url || data.output || data.url;

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
      console.log(`  ✅ ${Date.now() - startTime}ms`);
      return { success: true, imageUrl };
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
    console.log(`  💾 ${kb} KB`);
    return true;
  } catch (error) {
    console.log(`  ❌ ${error.message}`);
    return false;
  }
}

async function run() {
  console.log('='.repeat(50));
  console.log('SEEDREAM: Formal to Swimsuit');
  console.log('='.repeat(50));

  const outDir = path.join(OUTPUT_DIR, 'formal_to_swimsuit');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  let success = 0;

  for (const s of scenarios) {
    const result = await generateImage(s.prompt, REFERENCE_URL, s.name);

    if (result.success) {
      success++;
      await saveImage(result.imageUrl, path.join(outDir, `${s.name}.png`));
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n📊 Result: ${success}/${scenarios.length}`);
  console.log(`\nCheck: ${outDir}`);
}

run().catch(console.error);
