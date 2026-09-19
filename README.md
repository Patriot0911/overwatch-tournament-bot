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

## Тести балансувальника

`npm test` — запускає всі тести (вбудований `node:test`, без додаткових залежностей; ~45 с).

```
test/balancer/
  scenarios/*.json     # JSON-сценарії: гравці + опції + очікування (85+ кейсів)
  scenarios.spec.ts    # виконавець: читає кожен JSON і перевіряє всі алгоритми
  schema.spec.ts       # формати рейтингів, схеми гравців/опцій, експорт-імпорт JSON
  rank-parser.spec.ts  # парсинг і форматування рангів
  core.spec.ts         # угорський алгоритм, сегментація ролей, оцінка, канонічний ключ
  variety.spec.ts      # режим Varied/Wide, звірка з brute-force оракулом
  properties.spec.ts   # випадкові JSON-пули + метаморфічні властивості
  helpers/             # незалежний оракул перевірки результату, генератор пулів
```

Новий кейс — це об'єкт у файлі `test/balancer/scenarios/*.json`:

```json
{
  "name": "my-case",
  "description": "що саме перевіряємо",
  "options": { "teamCount": 2, "composition": { "tank": 1, "damage": 2, "support": 2 }, "roleWeights": { "tank": 1.6 } },
  "algorithms": ["greedy", "simulated-annealing"],
  "expect": { "forcedRoles": { "t1": "tank" }, "perfect": false },
  "players": [ { "discordId": "t1", "username": "t1", "tank": "Gold 3" } ]
}
```

Підтримувані очікування (`expect`): `schemaError` (JSON гравців відхиляється), `optionsError` (опції відхиляються), `error` (балансування кидає помилку з цим текстом), `forcedRoles` (гравці мусять бути на цих ролях), `perfect` (найкращий склад має score 0), `annealingOptimal` (SA дорівнює перебору). Для кожного успішного кейсу перевіряються загальні інваріанти (кожен гравець рівно раз, лише на ролях, які він грає, метрики перераховуються незалежно).

## Міграції

- `npm run migration:generate -- <Name>` — згенерувати міграцію за поточним станом entities.
- `npm run migration:run` / `npm run migration:revert`.
- `npm run seed:run` — ідемпотентний seed-скрипт (`scripts/seed.ts`), розрахований на розширення.

## Docker (повний стек)

```
docker compose up -d --build
```

Піднімає `postgres`, one-shot `migrate` (міграції + seed) і `bot`.
