import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceState,
  COMBO_WINDOW_TICKS,
  createInitialState,
  DASH_DRAIN_TICKS,
  ENTITY_TYPES,
  getTickDelay,
  MAP_TYPES,
  queueDirection,
  restartGame,
  setDashing,
  togglePaused
} from "../src/game.js";

test("buffered directions are consumed one tick at a time", () => {
  const queuedState = queueDirection(
    queueDirection(
      createInitialState({
        columns: 12,
        rows: 12,
        obstacles: [],
        wormholes: [],
        entities: [{ id: "food-1", kind: ENTITY_TYPES.FOOD, position: { x: 0, y: 0 }, ttl: null }]
      }),
      "down"
    ),
    "left"
  );

  const afterFirstMove = advanceState(queuedState, () => 0.99);
  const afterSecondMove = advanceState(afterFirstMove, () => 0.99);

  assert.equal(afterFirstMove.direction, "down");
  assert.equal(afterFirstMove.nextDirection, "left");
  assert.equal(afterSecondMove.direction, "left");
});

test("obstacles from map presets never overlap the default snake", () => {
  const state = createInitialState({
    columns: 16,
    rows: 16,
    mapId: MAP_TYPES.RING
  }, () => 0.8);

  for (const segment of state.snake) {
    assert.equal(state.obstacles.some((obstacle) => obstacle.x === segment.x && obstacle.y === segment.y), false);
  }
});

test("wormholes do not spawn when the roll misses", () => {
  const state = createInitialState({
    columns: 12,
    rows: 12,
    obstacles: []
  }, () => 0.99);

  assert.equal(state.wormholes.length, 0);
});

test("wormholes teleport the snake head to the linked exit", () => {
  const state = createInitialState({
    columns: 8,
    rows: 8,
    obstacles: [],
    wormholes: [{ x: 5, y: 3 }, { x: 1, y: 6 }],
    snake: [
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 3 }
    ],
    entities: [{ id: "food-1", kind: ENTITY_TYPES.FOOD, position: { x: 0, y: 0 }, ttl: null }]
  });

  const nextState = advanceState(state, () => 0.99);

  assert.deepEqual(nextState.snake[0], { x: 1, y: 6 });
  assert.equal(nextState.events.some((event) => event.type === "wormhole"), true);
});

test("obstacle collisions end the game", () => {
  const state = createInitialState({
    columns: 8,
    rows: 8,
    obstacles: [{ x: 5, y: 3 }],
    wormholes: [],
    snake: [
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 3 }
    ],
    entities: [{ id: "food-1", kind: ENTITY_TYPES.FOOD, position: { x: 0, y: 0 }, ttl: null }]
  });

  const nextState = advanceState(state, () => 0.99);

  assert.equal(nextState.gameOver, true);
});

test("super food increases score, starts combo, and leaves pending growth", () => {
  const state = createInitialState({
    columns: 10,
    rows: 10,
    obstacles: [],
    wormholes: [],
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 }
    ],
    entities: [{ id: "super-1", kind: ENTITY_TYPES.SUPER_FOOD, position: { x: 6, y: 5 }, ttl: 10 }]
  });

  const nextState = advanceState(state, () => 0.99);

  assert.equal(nextState.score, 5);
  assert.equal(nextState.comboCount, 1);
  assert.equal(nextState.comboWindow, COMBO_WINDOW_TICKS);
  assert.equal(nextState.pendingGrowth, 1);
});

test("special fruit does not roll on every single tick", () => {
  const state = createInitialState({
    columns: 10,
    rows: 10,
    obstacles: [],
    wormholes: [],
    tick: 1,
    entities: [{ id: "food-1", kind: ENTITY_TYPES.FOOD, position: { x: 0, y: 0 }, ttl: null }]
  });

  const nextState = advanceState(state, () => 0);

  assert.equal(nextState.entities.some((entity) => entity.kind === ENTITY_TYPES.SUPER_FOOD), false);
  assert.equal(nextState.entities.some((entity) => entity.kind === ENTITY_TYPES.POISON), false);
});

test("combo chains add bonus score on consecutive food pickups", () => {
  const state = createInitialState({
    columns: 10,
    rows: 10,
    obstacles: [],
    wormholes: [],
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 }
    ],
    entities: [{ id: "food-1", kind: ENTITY_TYPES.FOOD, position: { x: 6, y: 5 }, ttl: null }]
  });

  const afterFirstFood = advanceState(state, () => 0.99);
  const withSecondFood = {
    ...afterFirstFood,
    entities: [{ id: "food-2", kind: ENTITY_TYPES.FOOD, position: { x: 7, y: 5 }, ttl: null }]
  };
  const afterSecondFood = advanceState(withSecondFood, () => 0.99);

  assert.equal(afterSecondFood.score, 3);
  assert.equal(afterSecondFood.comboCount, 2);
  assert.equal(afterSecondFood.events.some((event) => event.type === "combo"), true);
});

test("poison kills the snake immediately at minimum length", () => {
  const state = createInitialState({
    columns: 10,
    rows: 10,
    obstacles: [],
    wormholes: [],
    snake: [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 }
    ],
    entities: [{ id: "poison-1", kind: ENTITY_TYPES.POISON, position: { x: 6, y: 5 }, ttl: 10 }]
  });

  const nextState = advanceState(state, () => 0.99);

  assert.equal(nextState.gameOver, true);
});

test("dash drains score after enough active ticks", () => {
  let state = setDashing(
    createInitialState({
      columns: 12,
      rows: 12,
      obstacles: [],
      wormholes: [],
      score: 4,
      entities: [{ id: "food-1", kind: ENTITY_TYPES.FOOD, position: { x: 0, y: 0 }, ttl: null }]
    }),
    true
  );

  for (let index = 0; index < DASH_DRAIN_TICKS; index += 1) {
    state = advanceState(state, () => 0.99);
  }

  assert.equal(state.score, 3);
});

test("restart clears transient state", () => {
  const state = createInitialState({
    columns: 12,
    rows: 12,
    mapId: MAP_TYPES.CROSS,
    score: 9,
    paused: true,
    dashing: true,
    comboCount: 3,
    comboWindow: 2,
    pendingGrowth: 2,
    inputBuffer: ["down", "left"]
  });

  const nextState = restartGame(state, () => 0.99);

  assert.equal(nextState.score, 0);
  assert.equal(nextState.paused, false);
  assert.equal(nextState.dashing, false);
  assert.equal(nextState.comboCount, 0);
  assert.deepEqual(nextState.inputBuffer, []);
});

test("paused games do not advance until resumed", () => {
  const pausedState = togglePaused(
    createInitialState({
      columns: 10,
      rows: 10,
      obstacles: [],
      wormholes: [],
      entities: [{ id: "food-1", kind: ENTITY_TYPES.FOOD, position: { x: 0, y: 0 }, ttl: null }]
    })
  );

  const nextState = advanceState(pausedState, () => 0.99);

  assert.deepEqual(nextState.snake, pausedState.snake);
  assert.equal(nextState.tick, pausedState.tick);
});

test("tick delay drops with score and halves while dashing", () => {
  assert.equal(getTickDelay(0), 150);
  assert.equal(getTickDelay(10), 110);
  assert.equal(getTickDelay(10, true), 55);
  assert.equal(getTickDelay(40, true), 35);
});
