import dotenv from "dotenv";
dotenv.config();

const POLZA_API_KEY = process.env.POLZA_API_KEY;
const POLZA_BASE_URL = process.env.POLZA_BASE_URL || "https://polza.ai/api/v1";

const models = [
  { id: "anthropic/claude-haiku-5.5", name: "Claude Haiku 5.5" },
  { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash" },
  { id: "google/gemini-3.1-flash", name: "Gemini 3.1 Flash" },
];

const testPrompt = `Проанализируй одежду и создай поисковые запросы для маркетплейсов.
Контекст: черное вечернее платье, длинное, с открытыми плечами, туфли на каблуке.
Верни JSON:
{"items":[{"name":"название","searchQuery":"запрос","color":"цвет"}]}`;

async function testModel(modelId, modelName) {
  console.log(`\n🧪 ${modelName} (${modelId})`);
  const start = Date.now();
  
  try {
    const res = await fetch(`${POLZA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${POLZA_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: "Эксперт по моде. Создавай точные поисковые запросы." },
          { role: "user", content: testPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    const duration = Date.now() - start;

    if (!res.ok) {
      console.log(`❌ Ошибка ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices[0]?.message?.content || "";
    
    console.log(`✅ ${duration}ms, ${content.length} символов`);
    
    try {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const count = parsed.items?.length || 0;
        console.log(`✅ JSON: ${count} товаров`);
        if (count > 0) console.log(`   "${parsed.items[0].searchQuery}"`);
        return { model: modelName, duration, count };
      }
      console.log(`❌ JSON не найден`);
    } catch (e) {
      console.log(`❌ Невалидный JSON`);
    }
    return null;
  } catch (err) {
    console.log(`❌ ${err.message}`);
    return null;
  }
}

console.log("🚀 Сравнение Google Gemini vs Claude\n");

(async () => {
  const results = [];
  for (const m of models) {
    const r = await testModel(m.id, m.name);
    if (r) results.push(r);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  
  if (results.length > 0) {
    console.log("\n" + "=".repeat(60));
    results.sort((a, b) => a.duration - b.duration);
    console.log("🏆 Самая быстрая:", results[0].model, `(${results[0].duration}ms)`);
    const best = results.reduce((max, r) => r.count > max.count ? r : max);
    console.log("🎯 Больше товаров:", best.model, `(${best.count} шт)`);
  }
})();
