# stilist-ai.ru — Карта проекта

## Активная директория
```
C:\Users\and\Desktop\project\you-stile\you-stile\
```

## Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `server.ts` | Express сервер + все API + AI логика |
| `src/App.tsx` | Весь React фронтенд |
| `src/system-prompt.txt` | Системный промпт AI стилиста |
| `src/fashion-knowledge-base.txt` | База знаний мод 2026 |
| `deploy.py` | Деплой на VPS (единственный скрипт) |
| `promo-codes.json` | База промокодов (на VPS) |
| `data/stats.json` | Статистика продаж |
| `.env` | Секреты (не в git) |

## Команды

```bash
npm run dev      # Разработка → http://localhost:3001
npm run build    # Сборка → dist/
python deploy.py # Деплой на stilist-ai.ru
```

## VPS
- **Сайт:** https://stilist-ai.ru
- **Сервер:** 186.246.31.126
- **Путь:** /var/www/you-stile/you-stile/
- **PM2:** процесс `stilist`

## Тарифы
- **Стандарт 100₽** — 1 фото + рост/вес → 3 случайных образа
- **Премиум 200₽** — до 3 фото + поводы + бюджет + астро → до 5 образов
- **Оцени стиль (бесплатно)** — 2 фото → оценка 1-10 + разбор гардероба

## Галерея
- `public/gallery/gen1.jpg` .. `gen12.jpg` — 12 фото работ стилиста

## Восстановление
1. `npm install`
2. Создать `.env` (ключи в memory Claude)
3. `npm run build && python deploy.py`
