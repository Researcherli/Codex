export const BOARD_COLUMNS = 24;
export const BOARD_ROWS = 24;
export const TICK_MS = 150;
export const MIN_TICK_MS = 65;
export const INPUT_BUFFER_LIMIT = 3;
export const MIN_SNAKE_LENGTH = 3;
export const COMBO_WINDOW_TICKS = 8;
export const SUPER_FOOD_LIFETIME = 30;
export const POISON_LIFETIME = 26;
export const SUPER_FOOD_CHANCE = 0.05;
export const POISON_CHANCE = 0.035;
export const SPECIAL_SPAWN_INTERVAL = 6;
export const WORMHOLE_PAIR_CHANCE = 0.28;
export const DASH_DRAIN_TICKS = 4;
export const DASH_SCORE_DRAIN = 1;

export const ENTITY_TYPES = Object.freeze({
  FOOD: "food",
  SUPER_FOOD: "superFood",
  POISON: "poison"
});

export const MAP_TYPES = Object.freeze({
  CROSS: "cross",
  RING: "ring"
});

export const DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
});

export const KEY_DIRECTION_MAP = Object.freeze({
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  W: "up",
  a: "left",
  A: "left",
  s: "down",
  S: "down",
  d: "right",
  D: "right"
});

function clonePosition(position) {
  return { x: position.x, y: position.y };
}

function cloneSnake(snake) {
  return snake.map(clonePosition);
}

function clonePositions(positions) {
  return positions.map(clonePosition);
}

function normalizeEntities(entities) {
  return entities.map((entity) => ({
    ...entity,
    position: clonePosition(entity.position),
    ttl: entity.ttl ?? null
  }));
}

function createPositionKey(position) {
  return `${position.x}:${position.y}`;
}

function areSamePosition(left, right) {
  return left.x === right.x && left.y === right.y;
}

function clampScore(score) {
  return Math.max(0, score);
}

function applyScoreDelta(score, delta) {
  const nextScore = clampScore(score + delta);
  return {
    score: nextScore,
    appliedDelta: nextScore - score
  };
}

function createCrossObstacles(columns, rows) {
  const positions = [];
  const centerX = Math.floor(columns / 2);
  const centerY = Math.floor(rows / 2);

  for (let y = 4; y < rows - 4; y += 2) {
    if (Math.abs(y - centerY) > 3) {
      positions.push({ x: centerX, y });
    }
  }

  for (let x = 4; x < columns - 4; x += 2) {
    if (Math.abs(x - centerX) > 3) {
      positions.push({ x, y: centerY });
    }
  }

  return positions;
}

function createRingObstacles(columns, rows) {
  const positions = [];
  const left = 6;
  const right = columns - 7;
  const top = 6;
  const bottom = rows - 7;
  const gapX = Math.floor(columns / 2);
  const gapY = Math.floor(rows / 2);

  for (let x = left; x <= right; x += 2) {
    if (Math.abs(x - gapX) > 2) {
      positions.push({ x, y: top });
      positions.push({ x, y: bottom });
    }
  }

  for (let y = top + 2; y < bottom; y += 2) {
    if (Math.abs(y - gapY) > 2) {
      positions.push({ x: left, y });
      positions.push({ x: right, y });
    }
  }

  return positions;
}

function createMapPreset(mapId, columns, rows) {
  if (mapId === MAP_TYPES.RING) {
    return createRingObstacles(columns, rows);
  }

  return createCrossObstacles(columns, rows);
}

function pickMapId(requestedMapId, random) {
  if (requestedMapId) {
    return requestedMapId;
  }

  const mapIds = Object.values(MAP_TYPES);
  return mapIds[Math.floor(random() * mapIds.length)] ?? MAP_TYPES.CROSS;
}

function createBlockedSet({ snake = [], obstacles = [], wormholes = [], entities = [] }) {
  const blocked = new Set();

  for (const position of snake) {
    blocked.add(createPositionKey(position));
  }

  for (const position of obstacles) {
    blocked.add(createPositionKey(position));
  }

  for (const position of wormholes) {
    blocked.add(createPositionKey(position));
  }

  for (const entity of entities) {
    blocked.add(createPositionKey(entity.position));
  }

  return blocked;
}

function listFreeCells(columns, rows, blocked) {
  const freeCells = [];

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const position = { x, y };

      if (!blocked.has(createPositionKey(position))) {
        freeCells.push(position);
      }
    }
  }

  return freeCells;
}

function pickFreeCell(columns, rows, blocked, random) {
  const freeCells = listFreeCells(columns, rows, blocked);

  if (freeCells.length === 0) {
    return null;
  }

  const index = Math.min(freeCells.length - 1, Math.floor(random() * freeCells.length));
  return freeCells[index];
}

function createDefaultSnake(columns, rows, obstacles) {
  const blocked = new Set(obstacles.map(createPositionKey));
  const centerX = Math.floor(columns / 2);
  const centerY = Math.floor(rows / 2);
  const candidateRows = [];

  for (let offset = 0; offset < rows; offset += 1) {
    const above = centerY - offset;
    const below = centerY + offset;

    if (above >= 0) {
      candidateRows.push(above);
    }

    if (below < rows && below !== above) {
      candidateRows.push(below);
    }
  }

  const candidateSnakes = [];

  for (const row of candidateRows) {
    for (let headX = 2; headX < columns; headX += 1) {
      const snake = [
        { x: headX, y: row },
        { x: headX - 1, y: row },
        { x: headX - 2, y: row }
      ];
      const isValid = snake.every((segment) => !blocked.has(createPositionKey(segment)));

      if (isValid) {
        candidateSnakes.push(snake);
      }
    }
  }

  candidateSnakes.sort((left, right) => {
    const leftHead = left[0];
    const rightHead = right[0];
    const leftDistance = Math.abs(leftHead.x - centerX) + Math.abs(leftHead.y - centerY);
    const rightDistance = Math.abs(rightHead.x - centerX) + Math.abs(rightHead.y - centerY);
    return leftDistance - rightDistance;
  });

  return candidateSnakes[0] ?? [
    { x: 2, y: 1 },
    { x: 1, y: 1 },
    { x: 0, y: 1 }
  ];
}

function createEntity(kind, position, ttl, id) {
  return {
    id,
    kind,
    position: clonePosition(position),
    ttl
  };
}

function createFoodEntity(position, nextEntityId) {
  return {
    entity: createEntity(ENTITY_TYPES.FOOD, position, null, `food-${nextEntityId}`),
    nextEntityId: nextEntityId + 1
  };
}

function createTimedEntity(kind, position, ttl, nextEntityId) {
  return {
    entity: createEntity(kind, position, ttl, `${kind}-${nextEntityId}`),
    nextEntityId: nextEntityId + 1
  };
}

function findEntityByKind(entities, kind) {
  return entities.find((entity) => entity.kind === kind) ?? null;
}

function createWormholes({ columns, rows, snake, obstacles }, random) {
  if (random() >= WORMHOLE_PAIR_CHANCE) {
    return [];
  }

  const blocked = createBlockedSet({ snake, obstacles });
  const first = pickFreeCell(columns, rows, blocked, random);

  if (!first) {
    return [];
  }

  blocked.add(createPositionKey(first));
  const second = pickFreeCell(columns, rows, blocked, random);

  if (!second) {
    return [];
  }

  return [first, second];
}

function spawnEntityIfNeeded(kind, ttl, chance, stateLike, entities, nextEntityId, random) {
  if (findEntityByKind(entities, kind) || random() >= chance) {
    return { entities, nextEntityId };
  }

  const blocked = createBlockedSet({
    snake: stateLike.snake,
    obstacles: stateLike.obstacles,
    wormholes: stateLike.wormholes,
    entities
  });
  const position = pickFreeCell(stateLike.columns, stateLike.rows, blocked, random);

  if (!position) {
    return { entities, nextEntityId };
  }

  const created = createTimedEntity(kind, position, ttl, nextEntityId);
  return {
    entities: [...entities, created.entity],
    nextEntityId: created.nextEntityId
  };
}

function createInitialEntities(stateLike, random, nextEntityId) {
  const blocked = createBlockedSet({
    snake: stateLike.snake,
    obstacles: stateLike.obstacles,
    wormholes: stateLike.wormholes
  });
  const foodPosition = pickFreeCell(stateLike.columns, stateLike.rows, blocked, random);
  let entities = [];
  let entityId = nextEntityId;

  if (foodPosition) {
    const createdFood = createFoodEntity(foodPosition, entityId);
    entities.push(createdFood.entity);
    entityId = createdFood.nextEntityId;
  }

  return {
    entities,
    nextEntityId: entityId
  };
}

function getInputBuffer(state) {
  return state.inputBuffer ?? [];
}

function getLastQueuedDirection(state) {
  const inputBuffer = getInputBuffer(state);
  return inputBuffer[inputBuffer.length - 1] ?? state.direction;
}

function hitsWall(position, state) {
  return (
    position.x < 0 ||
    position.y < 0 ||
    position.x >= state.columns ||
    position.y >= state.rows
  );
}

function hitsObstacle(position, obstacles) {
  return obstacles.some((obstacle) => areSamePosition(obstacle, position));
}

function hitsSnake(position, snake) {
  return snake.some((segment) => areSamePosition(segment, position));
}

function resolveWormholeExit(position, wormholes) {
  if (wormholes.length !== 2) {
    return null;
  }

  if (areSamePosition(position, wormholes[0])) {
    return wormholes[1];
  }

  if (areSamePosition(position, wormholes[1])) {
    return wormholes[0];
  }

  return null;
}

function getEntityEffect(entity) {
  if (!entity) {
    return {
      scoreDelta: 0,
      growthDelta: 0,
      comboEligible: false,
      kind: null
    };
  }

  if (entity.kind === ENTITY_TYPES.SUPER_FOOD) {
    return {
      scoreDelta: 5,
      growthDelta: 2,
      comboEligible: true,
      kind: entity.kind
    };
  }

  if (entity.kind === ENTITY_TYPES.POISON) {
    return {
      scoreDelta: -2,
      growthDelta: -1,
      comboEligible: false,
      kind: entity.kind
    };
  }

  return {
    scoreDelta: 1,
    growthDelta: 1,
    comboEligible: true,
    kind: entity.kind
  };
}

function createScoreEvent(appliedDelta, position, kind) {
  if (appliedDelta === 0) {
    return null;
  }

  return {
    type: "score-float",
    label: appliedDelta > 0 ? `+${appliedDelta}` : String(appliedDelta),
    kind,
    position: clonePosition(position)
  };
}

function createGameOverState(state, nextValues, events) {
  return {
    ...state,
    ...nextValues,
    comboCount: 0,
    comboWindow: 0,
    inputBuffer: [],
    nextDirection: nextValues.direction,
    gameOver: true,
    events: [...events, { type: "game-over" }]
  };
}

export function isOppositeDirection(currentDirection, nextDirection) {
  if (!DIRECTIONS[currentDirection] || !DIRECTIONS[nextDirection]) {
    return false;
  }

  return (
    DIRECTIONS[currentDirection].x + DIRECTIONS[nextDirection].x === 0 &&
    DIRECTIONS[currentDirection].y + DIRECTIONS[nextDirection].y === 0
  );
}

export function mapKeyToDirection(key) {
  return KEY_DIRECTION_MAP[key] ?? null;
}

export function createInitialState(config = {}, random = Math.random) {
  const columns = config.columns ?? BOARD_COLUMNS;
  const rows = config.rows ?? BOARD_ROWS;
  const mapId = config.obstacles ? (config.mapId ?? "custom") : pickMapId(config.mapId, random);
  const obstacles = config.obstacles ? clonePositions(config.obstacles) : createMapPreset(mapId, columns, rows);
  const snake = cloneSnake(config.snake ?? createDefaultSnake(columns, rows, obstacles));
  const wormholes = config.wormholes ? clonePositions(config.wormholes) : createWormholes({ columns, rows, snake, obstacles }, random);
  const direction = config.direction ?? "right";
  const inputBuffer = [...(config.inputBuffer ?? [])];
  const entitiesResult = config.entities
    ? {
        entities: normalizeEntities(config.entities),
        nextEntityId: config.nextEntityId ?? config.entities.length + 1
      }
    : createInitialEntities({ columns, rows, snake, obstacles, wormholes }, random, config.nextEntityId ?? 1);

  return {
    columns,
    rows,
    mapId,
    snake,
    direction,
    nextDirection: config.nextDirection ?? inputBuffer[0] ?? direction,
    inputBuffer,
    obstacles,
    wormholes,
    entities: entitiesResult.entities,
    nextEntityId: entitiesResult.nextEntityId,
    score: config.score ?? 0,
    pendingGrowth: config.pendingGrowth ?? 0,
    comboCount: config.comboCount ?? 0,
    comboWindow: config.comboWindow ?? 0,
    dashDrainCounter: config.dashDrainCounter ?? 0,
    dashing: config.dashing ?? false,
    paused: config.paused ?? false,
    gameOver: config.gameOver ?? false,
    tick: config.tick ?? 0,
    events: [...(config.events ?? [])]
  };
}

export function queueDirection(state, requestedDirection) {
  const inputBuffer = getInputBuffer(state);
  const lastQueuedDirection = getLastQueuedDirection(state);

  if (
    state.gameOver ||
    !DIRECTIONS[requestedDirection] ||
    inputBuffer.length >= INPUT_BUFFER_LIMIT ||
    requestedDirection === lastQueuedDirection ||
    isOppositeDirection(lastQueuedDirection, requestedDirection)
  ) {
    return state;
  }

  const nextBuffer = [...inputBuffer, requestedDirection];

  return {
    ...state,
    inputBuffer: nextBuffer,
    nextDirection: nextBuffer[0] ?? state.direction
  };
}

export function setDashing(state, dashing) {
  if (state.gameOver) {
    return state;
  }

  return {
    ...state,
    dashing
  };
}

export function togglePaused(state) {
  if (state.gameOver) {
    return state;
  }

  return {
    ...state,
    paused: !state.paused
  };
}

export function getTickDelay(score, dashing = false) {
  const baseDelay = Math.max(MIN_TICK_MS, TICK_MS - score * 4);
  return dashing ? Math.max(35, Math.floor(baseDelay / 2)) : baseDelay;
}

export function advanceState(state, random = Math.random) {
  if (state.gameOver || state.paused) {
    return state;
  }

  const events = [];
  const inputBuffer = [...getInputBuffer(state)];
  const direction = inputBuffer.shift() ?? state.direction;
  const vector = DIRECTIONS[direction];
  const currentHead = state.snake[0];
  let nextHead = {
    x: currentHead.x + vector.x,
    y: currentHead.y + vector.y
  };
  let score = state.score;
  let pendingGrowth = state.pendingGrowth;
  let comboCount = state.comboWindow > 0 ? state.comboCount : 0;
  let comboWindow = state.comboWindow > 0 ? state.comboWindow - 1 : 0;
  let dashDrainCounter = state.dashing ? state.dashDrainCounter + 1 : 0;

  const wormholeExit = resolveWormholeExit(nextHead, state.wormholes);

  if (wormholeExit) {
    events.push({
      type: "wormhole",
      from: clonePosition(nextHead),
      to: clonePosition(wormholeExit)
    });
    nextHead = clonePosition(wormholeExit);
  }

  if (hitsWall(nextHead, state) || hitsObstacle(nextHead, state.obstacles)) {
    return createGameOverState(
      state,
      {
        direction,
        dashDrainCounter,
        dashing: state.dashing,
        tick: state.tick + 1
      },
      events
    );
  }

  const consumedEntity = state.entities.find((entity) => areSamePosition(entity.position, nextHead)) ?? null;
  const effect = getEntityEffect(consumedEntity);

  if (effect.kind === ENTITY_TYPES.POISON && state.snake.length <= MIN_SNAKE_LENGTH) {
    const poisonScore = applyScoreDelta(score, effect.scoreDelta);
    const poisonEvent = createScoreEvent(poisonScore.appliedDelta, nextHead, "negative");

    if (poisonEvent) {
      events.push(poisonEvent);
    }

    return createGameOverState(
      state,
      {
        direction,
        score: poisonScore.score,
        dashDrainCounter,
        dashing: state.dashing,
        tick: state.tick + 1
      },
      events
    );
  }

  const effectiveGrowth = pendingGrowth + effect.growthDelta;
  const collisionSnake = effectiveGrowth > 0 ? state.snake : state.snake.slice(0, -1);

  if (hitsSnake(nextHead, collisionSnake)) {
    return createGameOverState(
      state,
      {
        direction,
        dashDrainCounter,
        dashing: state.dashing,
        tick: state.tick + 1
      },
      events
    );
  }

  if (consumedEntity) {
    const scoreResult = applyScoreDelta(score, effect.scoreDelta);
    score = scoreResult.score;
    pendingGrowth += effect.growthDelta;

    const scoreEvent = createScoreEvent(
      scoreResult.appliedDelta,
      nextHead,
      effect.kind === ENTITY_TYPES.POISON ? "negative" : effect.kind === ENTITY_TYPES.SUPER_FOOD ? "bonus" : "positive"
    );

    if (scoreEvent) {
      events.push(scoreEvent);
    }

    if (effect.comboEligible) {
      comboCount = comboWindow > 0 ? comboCount + 1 : 1;
      comboWindow = COMBO_WINDOW_TICKS;

      if (comboCount > 1) {
        const comboBonus = comboCount - 1;
        const comboScore = applyScoreDelta(score, comboBonus);
        score = comboScore.score;
        const comboEvent = createScoreEvent(comboScore.appliedDelta, nextHead, "combo");

        if (comboEvent) {
          events.push(comboEvent);
        }

        events.push({
          type: "combo",
          count: comboCount
        });
      }
    }
  }

  if (state.dashing && dashDrainCounter >= DASH_DRAIN_TICKS) {
    dashDrainCounter = 0;
    const dashResult = applyScoreDelta(score, -DASH_SCORE_DRAIN);
    score = dashResult.score;
    const dashEvent = createScoreEvent(dashResult.appliedDelta, nextHead, "dash");

    if (dashEvent) {
      events.push(dashEvent);
    }
  }

  const movedSnake = [nextHead, ...state.snake];

  if (pendingGrowth > 0) {
    pendingGrowth -= 1;
  } else {
    movedSnake.pop();
  }

  while (pendingGrowth < 0 && movedSnake.length > MIN_SNAKE_LENGTH) {
    movedSnake.pop();
    pendingGrowth += 1;
  }

  let entities = state.entities
    .filter((entity) => (consumedEntity ? entity.id !== consumedEntity.id : true))
    .map((entity) => {
      if (entity.ttl == null) {
        return entity;
      }

      return {
        ...entity,
        ttl: entity.ttl - 1
      };
    })
    .filter((entity) => entity.ttl == null || entity.ttl > 0);
  let nextEntityId = state.nextEntityId;
  const nextStateLike = {
    columns: state.columns,
    rows: state.rows,
    snake: movedSnake,
    obstacles: state.obstacles,
    wormholes: state.wormholes
  };
  const shouldRollSpecialSpawn =
    consumedEntity != null ||
    (state.tick + 1) % SPECIAL_SPAWN_INTERVAL === 0;

  if (!findEntityByKind(entities, ENTITY_TYPES.FOOD)) {
    const blocked = createBlockedSet({
      snake: movedSnake,
      obstacles: state.obstacles,
      wormholes: state.wormholes,
      entities
    });
    const foodPosition = pickFreeCell(state.columns, state.rows, blocked, random);

    if (foodPosition) {
      const createdFood = createFoodEntity(foodPosition, nextEntityId);
      entities = [...entities, createdFood.entity];
      nextEntityId = createdFood.nextEntityId;
    }
  }

  if (shouldRollSpecialSpawn) {
    const superSpawn = spawnEntityIfNeeded(
      ENTITY_TYPES.SUPER_FOOD,
      SUPER_FOOD_LIFETIME,
      SUPER_FOOD_CHANCE,
      nextStateLike,
      entities,
      nextEntityId,
      random
    );
    entities = superSpawn.entities;
    nextEntityId = superSpawn.nextEntityId;

    const poisonSpawn = spawnEntityIfNeeded(
      ENTITY_TYPES.POISON,
      POISON_LIFETIME,
      POISON_CHANCE,
      nextStateLike,
      entities,
      nextEntityId,
      random
    );
    entities = poisonSpawn.entities;
    nextEntityId = poisonSpawn.nextEntityId;
  }

  return {
    ...state,
    snake: movedSnake,
    direction,
    nextDirection: inputBuffer[0] ?? direction,
    inputBuffer,
    entities,
    nextEntityId,
    score,
    pendingGrowth,
    comboCount,
    comboWindow,
    dashDrainCounter,
    tick: state.tick + 1,
    events
  };
}

export function restartGame(state, random = Math.random) {
  return createInitialState(
    {
      columns: state.columns,
      rows: state.rows,
      mapId: state.mapId && state.mapId !== "custom" ? state.mapId : undefined
    },
    random
  );
}
