import {
  advanceState,
  createInitialState,
  ENTITY_TYPES,
  getTickDelay,
  mapKeyToDirection,
  queueDirection,
  restartGame,
  setDashing,
  togglePaused
} from "./game.js";

const boardSceneElement = document.querySelector("#board-scene");
const boardElement = document.querySelector("#board");
const snakeLayerElement = document.querySelector("#snake-layer");
const fxLayerElement = document.querySelector("#fx-layer");
const comboBannerElement = document.querySelector("#combo-banner");
const overlayElement = document.querySelector("#overlay");
const overlayTitleElement = document.querySelector("#overlay-title");
const overlaySubtitleElement = document.querySelector("#overlay-subtitle");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const comboCountElement = document.querySelector("#combo-count");
const statusElement = document.querySelector("#status");
const pauseButton = document.querySelector("#pause-button");
const restartButton = document.querySelector("#restart-button");
const gameCardElement = document.querySelector(".game-card");
const touchButtons = Array.from(document.querySelectorAll("[data-direction]"));

const BEST_SCORE_STORAGE_KEY = "snake-best-score";

let state = createInitialState();
let bestScore = loadBestScore();
let boardCells = [];
let paintedCellClasses = [];
let tickTimeoutId = null;
let comboBannerTimeoutId = null;

function loadBestScore() {
  try {
    const storedValue = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    const parsedValue = Number.parseInt(storedValue ?? "0", 10);
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0;
  } catch {
    return 0;
  }
}

function persistBestScore(nextBestScore) {
  try {
    window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(nextBestScore));
  } catch {
    // Ignore storage failures and keep the in-memory value.
  }
}

function syncBestScore() {
  if (state.score <= bestScore) {
    return;
  }

  bestScore = state.score;
  persistBestScore(bestScore);
}

function getCellIndex(position) {
  return position.y * state.columns + position.x;
}

function buildBoard() {
  boardElement.style.setProperty("--columns", String(state.columns));
  boardElement.style.setProperty("--rows", String(state.rows));
  boardElement.replaceChildren();

  const cells = [];
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < state.rows; row += 1) {
    for (let column = 0; column < state.columns; column += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      fragment.append(cell);
      cells.push(cell);
    }
  }

  boardElement.append(fragment);
  boardCells = cells;
  paintedCellClasses = [];
}

function getBoardMetrics() {
  const bounds = boardElement.getBoundingClientRect();
  const computedStyles = window.getComputedStyle(boardElement);
  const padding = Number.parseFloat(computedStyles.paddingLeft) || 0;
  const gap = Number.parseFloat(computedStyles.columnGap || computedStyles.gap) || 0;
  const usableWidth = bounds.width - padding * 2;
  const usableHeight = bounds.height - padding * 2;

  return {
    padding,
    gap,
    cellWidth: (usableWidth - gap * (state.columns - 1)) / state.columns,
    cellHeight: (usableHeight - gap * (state.rows - 1)) / state.rows
  };
}

function getCellPixelPosition(position, metrics = getBoardMetrics()) {
  return {
    x: metrics.padding + position.x * (metrics.cellWidth + metrics.gap),
    y: metrics.padding + position.y * (metrics.cellHeight + metrics.gap),
    width: metrics.cellWidth,
    height: metrics.cellHeight
  };
}

function getStatusText() {
  if (state.gameOver) {
    return "Game Over";
  }

  if (state.paused) {
    return "Paused";
  }

  if (state.dashing) {
    return "Dashing";
  }

  return "Running";
}

function renderOverlay() {
  if (state.gameOver) {
    overlayElement.hidden = false;
    overlayTitleElement.textContent = "Game Over";
    overlaySubtitleElement.textContent = "Restart to retry the map.";
    return;
  }

  if (state.paused) {
    overlayElement.hidden = false;
    overlayTitleElement.textContent = "Paused";
    overlaySubtitleElement.textContent = "Press Resume to continue.";
    return;
  }

  overlayElement.hidden = true;
}

function renderBoardBackground() {
  for (const { index, classes } of paintedCellClasses) {
    boardCells[index].classList.remove(...classes);
  }

  const nextPainted = [];

  for (const obstacle of state.obstacles) {
    const index = getCellIndex(obstacle);
    const classes = ["cell-obstacle"];
    boardCells[index].classList.add(...classes);
    nextPainted.push({ index, classes });
  }

  if (state.wormholes[0]) {
    const index = getCellIndex(state.wormholes[0]);
    const classes = ["cell-wormhole-a"];
    boardCells[index].classList.add(...classes);
    nextPainted.push({ index, classes });
  }

  if (state.wormholes[1]) {
    const index = getCellIndex(state.wormholes[1]);
    const classes = ["cell-wormhole-b"];
    boardCells[index].classList.add(...classes);
    nextPainted.push({ index, classes });
  }

  for (const entity of state.entities) {
    const index = getCellIndex(entity.position);
    const classes = [];

    if (entity.kind === ENTITY_TYPES.SUPER_FOOD) {
      classes.push("cell-super-food");
    } else if (entity.kind === ENTITY_TYPES.POISON) {
      classes.push("cell-poison");
    } else {
      classes.push("cell-food");
    }

    boardCells[index].classList.add(...classes);
    nextPainted.push({ index, classes });
  }

  paintedCellClasses = nextPainted;
}

function renderSnake() {
  const metrics = getBoardMetrics();
  snakeLayerElement.style.setProperty("--tick-duration", `${getTickDelay(state.score, state.dashing)}ms`);

  while (snakeLayerElement.children.length < state.snake.length) {
    const segment = document.createElement("div");
    segment.className = "snake-segment";
    snakeLayerElement.append(segment);
  }

  while (snakeLayerElement.children.length > state.snake.length) {
    snakeLayerElement.lastElementChild.remove();
  }

  state.snake.forEach((position, index) => {
    const segment = snakeLayerElement.children[index];
    const pixelPosition = getCellPixelPosition(position, metrics);

    segment.className = index === 0 ? "snake-segment snake-segment-head" : "snake-segment";
    segment.style.width = `${pixelPosition.width}px`;
    segment.style.height = `${pixelPosition.height}px`;
    segment.style.transform = `translate(${pixelPosition.x}px, ${pixelPosition.y}px)`;
  });

  const headPosition = getCellPixelPosition(state.snake[0], metrics);
  boardSceneElement.style.setProperty("--fog-x", `${headPosition.x + headPosition.width / 2}px`);
  boardSceneElement.style.setProperty("--fog-y", `${headPosition.y + headPosition.height / 2}px`);
  boardSceneElement.style.setProperty("--fog-radius", `${Math.max(headPosition.width * 8, 260)}px`);
}

function renderStatus() {
  scoreElement.textContent = String(state.score);
  bestScoreElement.textContent = String(bestScore);
  comboCountElement.textContent = state.comboWindow > 0 ? `x${state.comboCount}` : "x1";
  statusElement.textContent = getStatusText();
  pauseButton.textContent = state.paused ? "Resume" : "Pause";
  pauseButton.disabled = state.gameOver;
  gameCardElement.classList.toggle("is-dashing", state.dashing && !state.paused && !state.gameOver);
}

function render() {
  renderBoardBackground();
  renderSnake();
  renderOverlay();
  renderStatus();
}

function clearTickTimer() {
  if (tickTimeoutId === null) {
    return;
  }

  window.clearTimeout(tickTimeoutId);
  tickTimeoutId = null;
}

function scheduleNextTick() {
  clearTickTimer();

  if (state.paused || state.gameOver) {
    return;
  }

  tickTimeoutId = window.setTimeout(() => {
    handleTick();
  }, getTickDelay(state.score, state.dashing));
}

function restartComboBanner(message) {
  window.clearTimeout(comboBannerTimeoutId);
  comboBannerElement.hidden = false;
  comboBannerElement.textContent = message;
  comboBannerElement.classList.remove("is-visible");
  void comboBannerElement.offsetWidth;
  comboBannerElement.classList.add("is-visible");
  comboBannerTimeoutId = window.setTimeout(() => {
    comboBannerElement.hidden = true;
    comboBannerElement.classList.remove("is-visible");
  }, 900);
}

function spawnFloatingText(event) {
  const metrics = getBoardMetrics();
  const pixelPosition = getCellPixelPosition(event.position, metrics);
  const floatingText = document.createElement("div");

  floatingText.className = `floating-score floating-score-${event.kind}`;
  floatingText.textContent = event.label;
  floatingText.style.left = `${pixelPosition.x + pixelPosition.width / 2}px`;
  floatingText.style.top = `${pixelPosition.y}px`;
  fxLayerElement.append(floatingText);
  floatingText.addEventListener("animationend", () => {
    floatingText.remove();
  });
}

function triggerScreenShake() {
  gameCardElement.classList.remove("is-shaking");
  void gameCardElement.offsetWidth;
  gameCardElement.classList.add("is-shaking");
}

function applyStateEvents() {
  for (const event of state.events) {
    if (event.type === "score-float") {
      spawnFloatingText(event);
      continue;
    }

    if (event.type === "combo") {
      restartComboBanner(`Combo x${event.count}!`);
      continue;
    }

    if (event.type === "game-over") {
      triggerScreenShake();
    }
  }
}

function clearFx() {
  fxLayerElement.replaceChildren();
  comboBannerElement.hidden = true;
  comboBannerElement.classList.remove("is-visible");
}

function updateDirection(direction) {
  state = queueDirection(state, direction);
}

function updateDashState(dashing) {
  state = setDashing(state, dashing);
  renderStatus();
  scheduleNextTick();
}

function handlePauseToggle() {
  state = togglePaused(state);
  render();
  scheduleNextTick();
}

function handleRestart() {
  state = restartGame(state);
  clearFx();
  render();
  scheduleNextTick();
}

function handleTick() {
  state = advanceState(state);
  syncBestScore();
  render();
  applyStateEvents();
  scheduleNextTick();
}

function handleDirectionalInput(event) {
  const direction = mapKeyToDirection(event.key);

  if (!direction) {
    return false;
  }

  event.preventDefault();
  updateDirection(direction);
  return true;
}

window.addEventListener("keydown", (event) => {
  if (handleDirectionalInput(event)) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "shift") {
    updateDashState(true);
    return;
  }

  if (event.key === " " || key === "p") {
    event.preventDefault();
    handlePauseToggle();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key.toLowerCase() === "shift") {
    updateDashState(false);
  }
});

window.addEventListener("blur", () => {
  updateDashState(false);
});

window.addEventListener("resize", () => {
  renderSnake();
});

pauseButton.addEventListener("click", handlePauseToggle);
restartButton.addEventListener("click", handleRestart);

for (const button of touchButtons) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    updateDirection(button.dataset.direction);
  });
}

buildBoard();
syncBestScore();
render();
scheduleNextTick();
