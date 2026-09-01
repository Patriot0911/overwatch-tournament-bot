# Overwatch Tournament Bot

Discord-бот на NestJS + discord.js з TypeORM/PostgreSQL, за архітектурним підходом проєкту xelar-notify:
кастомний provider для `discord.js` `Client`, реєстрація slash-команд і подій через `DiscoveryService`
(без necord), TypeORM з явним списком entities та окремим `data-source.ts` для CLI/міграцій, ts-node
seed-скрипт, Docker-збірка для бота та окремий one-shot контейнер для міграцій+seed.

## Структура

```
src/
├── config/            # zod-схема env + ConfigModule
├── database/          # TypeOrmModule, data-source.ts, entities/, migrations/
└── modules/discord/   # Client provider, DiscoveryService-based explorer, команди, слухачі подій
scripts/               # migrate.ts, migration-generate.ts, seed.ts
```

## Локальний запуск

1. Скопіювати `.env.example` в `.env` і заповнити `DISCORD_TOKEN`/`DISCORD_CLIENT_ID` та дані БД.
2. Підняти лише інфраструктуру: `docker compose -f docker-compose.dev.yml up -d`.
3. Встановити залежності: `npm install`.
4. Застосувати міграції: `npm run migration:run`.
5. Запустити бота: `npm run start:dev`.

## Міграції

- `npm run migration:generate -- <Name>` — згенерувати міграцію за поточним станом entities.
- `npm run migration:run` / `npm run migration:revert`.
- `npm run seed:run` — ідемпотентний seed-скрипт (`scripts/seed.ts`), розрахований на розширення.

## Docker (повний стек)

```
docker compose up -d --build
```

Піднімає `postgres`, one-shot `migrate` (міграції + seed) і `bot`.
