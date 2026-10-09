# You-Stile — AI Стилист

Веб-приложение для персонализированных стилистических рекомендаций с использованием AI.

Сайт: https://stilist-ai.ru

## Запуск локально

**Требования:** Node.js 18+

1. Установите зависимости:
   ```bash
   npm install
   ```

2. Создайте `.env` файл с ключами:
   ```
   POLZA_API_KEY=your_polza_api_key
   POLZA_BASE_URL=https://polza.ai/api/v1
   ```

3. Запустите dev-сервер:
   ```bash
   npm run dev
   ```
   
   Приложение откроется на `http://localhost:3001`

## Модели AI

Проект использует [Polza.ai API](https://polza.ai) для доступа к моделям:

- **Анализ фото:** `google/gemini-3.8-flash` (Google Gemini 3.8 Flash - новейшая модель с лучшим визуальным анализом)
- **Генерация изображений:** `google/gemini-nano-banana-2.1`

## Скрипты

```bash
npm run dev      # Dev-сервер (Express + Vite) на порту 3001
npm run build    # Production сборка (Vite → dist/)
npm run lint     # Проверка типов TypeScript
```

## Деплой

Production сервер:
- SSH: `root@186.246.31.126`
- Путь: `/var/www/you-stile/you-stile`
- pm2 процесс: `stilist`
