const REENTER_LIMIT = 76;

const state = {
  config: null,
  tables: [],
  activeTableId: null,
  nextTableId: 1,
};

const dashboardPage = document.querySelector("#dashboardPage");
const tablePage = document.querySelector("#tablePage");
const setupForm = document.querySelector("#setupForm");
const playerInputs = document.querySelector("#playerInputs");
const formError = document.querySelector("#formError");
const totalScoreInput = document.querySelector("#totalScore");
const kampuScoreInput = document.querySelector("#kampuScore");
const midPackScoreInput = document.querySelector("#midPackScore");
const betMoneyInput = document.querySelector("#betMoney");
const gameStats = document.querySelector("#gameStats");
const tableTabs = document.querySelector("#tableTabs");
const tablesHost = document.querySelector("#tablesHost");
const modalLayer = document.querySelector("#modalLayer");

const initialPlayers = ["Player 1", "Player 2"];

function clampNumber(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function makePlayer(name) {
  return {
    name,
    baseScore: 0,
    isOut: false,
    hasReentered: false,
    reenterScore: null,
  };
}

function makeTable() {
  const id = state.nextTableId++;
  return {
    id,
    title: `Game ${id}`,
    players: state.config.players.map(makePlayer),
    rows: [makeGameRow(1)],
    historyRows: [],
    editingCell: null,
    betMoney: state.config.betMoney,
    isEnded: false,
    payouts: state.config.players.map(() => 0),
  };
}

function makeGameRow(number) {
  return {
    id: crypto.randomUUID(),
    label: `Round ${number}`,
    scores: state.config.players.map(() => 0),
  };
}

function renderPlayerInputs(names = initialPlayers) {
  playerInputs.innerHTML = "";
  names.forEach((name, index) => addPlayerInput(name, index < 2));
}

function addPlayerInput(value = "", locked = false) {
  const row = document.createElement("div");
  row.className = "player-row";

  const label = document.createElement("label");
  label.className = "player-field";
  label.textContent = `Player ${playerInputs.children.length + 1}`;

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = "Player name";
  input.required = true;

  const remove = document.createElement("button");
  remove.className = "remove-player";
  remove.type = "button";
  remove.textContent = "x";
  remove.ariaLabel = "Remove player";
  remove.disabled = locked;
  remove.addEventListener("click", () => {
    row.remove();
    renumberPlayers();
  });

  label.append(input);
  row.append(label, remove);
  playerInputs.append(row);
}

function renumberPlayers() {
  [...playerInputs.querySelectorAll(".player-field")].forEach((label, index) => {
    label.firstChild.textContent = `Player ${index + 1}`;
  });
}

function readConfig() {
  const totalScore = clampNumber(totalScoreInput.value, 1, 9999);
  const kampuScore = clampNumber(kampuScoreInput.value, 1, totalScore);
  const midPackScore = clampNumber(midPackScoreInput.value, 1, totalScore);
  const betMoney = clampNumber(betMoneyInput.value, 0, 999999);
  const players = [...playerInputs.querySelectorAll("input")]
    .map((input) => input.value.trim())
    .filter(Boolean);

  totalScoreInput.value = totalScore;
  kampuScoreInput.value = kampuScore;
  midPackScoreInput.value = midPackScore;
  betMoneyInput.value = betMoney;

  if (players.length < 2) {
    return { error: "Add at least two players to start a game." };
  }

  const uniqueNames = new Set(players.map((player) => player.toLowerCase()));
  if (uniqueNames.size !== players.length) {
    return { error: "Player names must be unique." };
  }

  return {
    totalScore,
    kampuScore,
    midPackScore,
    betMoney,
    players,
  };
}

function startGame(event) {
  event.preventDefault();
  const config = readConfig();
  if (config.error) {
    formError.textContent = config.error;
    return;
  }

  formError.textContent = "";
  state.config = config;
  state.tables = [makeTable()];
  state.activeTableId = state.tables[0].id;
  dashboardPage.classList.add("hidden");
  tablePage.classList.remove("hidden");
  renderApp();
}

function renderApp() {
  renderStats();
  renderTabs();
  renderTables();
}

function renderStats() {
  gameStats.innerHTML = "";
  [
    ["Total Game Score", state.config.totalScore],
    ["Kampu Score", state.config.kampuScore],
    ["Mid Pack Score", state.config.midPackScore],
    ["Bet Money", formatMoney(state.config.betMoney)],
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    gameStats.append(card);
  });
}

function renderTabs() {
  tableTabs.innerHTML = "";
  state.tables.forEach((table) => {
    const button = document.createElement("button");
    button.className = `tab-button ${table.id === state.activeTableId ? "active" : ""}`;
    button.type = "button";
    button.role = "tab";
    button.textContent = table.title;
    button.addEventListener("click", () => {
      state.activeTableId = table.id;
      renderApp();
    });
    tableTabs.append(button);
  });
}

function renderTables() {
  tablesHost.innerHTML = "";
  const table = getActiveTable();
  const board = document.createElement("article");
  board.className = "score-board";
  board.innerHTML = `
    <div class="table-toolbar">
      <div class="table-title">
        <p class="eyebrow">Current table</p>
        <h2>${table.title}</h2>
        <span class="pot-label">Pot ${formatMoney(getTablePot(table))}</span>
      </div>
      <div class="table-actions">
        <button class="ghost-button" type="button" data-action="end-game">${table.isEnded ? "Game Ended" : "End Game"}</button>
        <button class="ghost-button" type="button" data-action="add-row">+ New Round</button>
      </div>
    </div>
    <div class="table-wrap"></div>
  `;

  const addRowButton = board.querySelector("[data-action='add-row']");
  const endGameButton = board.querySelector("[data-action='end-game']");

  addRowButton.disabled = table.isEnded;
  endGameButton.disabled = table.isEnded;

  addRowButton.addEventListener("click", () => {
    table.rows.push(makeGameRow(table.rows.length + 1));
    renderTables();
  });

  endGameButton.addEventListener("click", () => showEndGameModal(table));

  board.querySelector(".table-wrap").append(buildScoreTable(table));
  tablesHost.append(board);
}

function buildScoreTable(table) {
  const scoreTable = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");
  const tfoot = document.createElement("tfoot");
  const headerRow = document.createElement("tr");

  headerRow.append(makeCell("th", "Round"));
  table.players.forEach((player, playerIndex) => {
    const total = getPlayerTotal(table, playerIndex);
    const th = makeCell("th");
    th.className = getColumnClass(table, playerIndex);
    th.append(buildPlayerHeader(table, player, playerIndex, total));
    headerRow.append(th);
  });
  thead.append(headerRow);

  table.historyRows.forEach((historyRow) => tbody.append(buildHistoryRow(table, historyRow)));
  table.rows.forEach((row) => tbody.append(buildGameRow(table, row)));

  const totalRow = document.createElement("tr");
  totalRow.append(makeCell("td", "Total", "total-cell"));
  table.players.forEach((_, playerIndex) => {
    totalRow.append(makeCell("td", getPlayerTotal(table, playerIndex), `total-cell ${getColumnClass(table, playerIndex)}`));
  });
  tfoot.append(totalRow);

  if (table.isEnded) {
    const profitRow = document.createElement("tr");
    profitRow.append(makeCell("td", "Profit / Loss", "profit-label"));
    table.players.forEach((_, playerIndex) => {
      const profit = getPlayerProfit(table, playerIndex);
      const className = profit >= 0 ? "profit-cell profit-positive" : "profit-cell profit-negative";
      profitRow.append(makeCell("td", formatSignedMoney(profit), className));
    });
    tfoot.append(profitRow);
  }

  scoreTable.append(thead, tbody, tfoot);
  return scoreTable;
}

function buildPlayerHeader(table, player, playerIndex, total) {
  const wrapper = document.createElement("div");
  wrapper.className = "player-status";
  const name = document.createElement("div");
  name.className = "player-name";

  const isOverLimit = total >= state.config.totalScore;
  const nameText = document.createElement("span");
  nameText.className = (player.isOut || isOverLimit) ? "out-name" : "";
  nameText.textContent = player.name;
  name.append(nameText);

  const thresholdBadge = getThresholdBadge(total);
  if (thresholdBadge) {
    const badge = document.createElement("span");
    badge.className = `threshold-badge ${thresholdBadge.className}`;
    badge.textContent = thresholdBadge.label;
    name.append(badge);
  }

  if (player.hasReentered) {
    const badge = document.createElement("span");
    badge.className = "reentry-badge";
    badge.title = "Re-entered";
    badge.textContent = "RE";
    name.append(badge);
  }

  const actions = document.createElement("div");
  actions.className = "status-actions";

  if (!table.isEnded && total >= state.config.totalScore && !player.isOut) {
    actions.append(makeActionButton("OUT", "danger", () => markOut(table, playerIndex)));
  }

  if (!table.isEnded && player.isOut) {
    const reenterScore = getReenterScore(table, playerIndex);
    const tooltip = document.createElement("span");
    tooltip.className = "tooltip";
    tooltip.tabIndex = 0;
    tooltip.textContent = "?";
    tooltip.dataset.tip = `You are OUT!!! Want to re-enter the game ? If yes, your re-enter score is ${reenterScore}`;
    actions.append(tooltip);

    if (reenterScore < REENTER_LIMIT) {
      actions.append(makeActionButton("RE-ENTER", "", () => reenterPlayer(table, playerIndex, reenterScore)));
    }
  }

  wrapper.append(name, actions);
  return wrapper;
}

function getThresholdBadge(total) {
  if (total > state.config.kampuScore) {
    return { label: "IN KAMPU", className: "kampu-badge" };
  }

  if (total > state.config.midPackScore) {
    return { label: "NO MID PACK", className: "mid-pack-badge" };
  }

  return null;
}

function buildHistoryRow(table, historyRow) {
  const tr = document.createElement("tr");
  tr.className = "history-row";
  tr.append(makeCell("td", historyRow.label, "history-note"));
  table.players.forEach((_, playerIndex) => {
    const value = historyRow.values[playerIndex] ?? "";
    tr.append(makeCell("td", value, getColumnClass(table, playerIndex)));
  });
  return tr;
}

function buildGameRow(table, row) {
  const tr = document.createElement("tr");
  tr.append(makeCell("td", row.label));

  row.scores.forEach((score, playerIndex) => {
    const td = makeCell("td");
    td.className = getColumnClass(table, playerIndex);
    td.append(buildScoreCell(table, row, playerIndex, score));
    tr.append(td);
  });

  return tr;
}

function buildScoreCell(table, row, playerIndex, score) {
  const wrapper = document.createElement("div");
  wrapper.className = "cell-editor";
  const player = table.players[playerIndex];
  const total = getPlayerTotal(table, playerIndex);
  const totalWithoutCell = getPlayerTotalWithoutRow(table, row, playerIndex);
  const canEdit =
    !table.isEnded && !player.isOut && total < state.config.totalScore && totalWithoutCell < state.config.totalScore;
  const isEditing =
    canEdit && table.editingCell?.rowId === row.id && table.editingCell?.playerIndex === playerIndex;

  if (isEditing) {
    const input = document.createElement("input");
    input.className = "score-input";
    input.type = "text";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    input.value = score;
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
      // if (totalWithoutCell + Number(input.value || 0) > state.config.totalScore) {
      //   input.value = "0";
      // } comented as total player score can cross state.config.totalScore. but can have below logic 
      if (Number(input.value || 0) > 80) {
        input.value = "0";
      }
    });

    const save = makeActionButton("Save", "", () => {
      row.scores[playerIndex] = normalizeScoreForTotal(table, row, playerIndex, input.value);
      table.editingCell = null;
      settleTableForSingleWinner(table);
      if (!table.isEnded) {
        renderTables();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") save.click();
    });
    wrapper.append(input, save);
    setTimeout(() => input.focus(), 0);
    return wrapper;
  }

  const value = document.createElement("span");
  value.className = "score-value";
  value.textContent = score;
  wrapper.append(value);

  if (!canEdit) {
    return wrapper;
  }

  const edit = makeActionButton("Edit", "", () => {
    table.editingCell = { rowId: row.id, playerIndex };
    renderTables();
  });
  edit.title = "Edit score";
  wrapper.append(edit);
  return wrapper;
}

function makeActionButton(label, variant, onClick) {
  const button = document.createElement("button");
  button.className = `tiny-button ${variant || ""}`;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function makeCell(tag, text = "", className = "") {
  const cell = document.createElement(tag);
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function getActiveTable() {
  return state.tables.find((table) => table.id === state.activeTableId);
}

function getPlayerTotal(table, playerIndex) {
  const player = table.players[playerIndex];
  return table.rows.reduce((sum, row) => sum + row.scores[playerIndex], player.baseScore);
}

function getPlayerTotalWithoutRow(table, currentRow, playerIndex) {
  const player = table.players[playerIndex];
  return table.rows.reduce((sum, row) => {
    if (row.id === currentRow.id) return sum;
    return sum + row.scores[playerIndex];
  }, player.baseScore);
}

function normalizeScoreForTotal(table, row, playerIndex, value) {
  const score = clampNumber(value, 0, state.config.totalScore);
  const totalWithoutCell = getPlayerTotalWithoutRow(table, row, playerIndex);
  // return totalWithoutCell + score > state.config.totalScore ? 0 : score; commenting this as player total score go beyond total score
  return score;
}

function getTablePot(table) {
  return table.betMoney * table.players.length;
}

function getPlayerProfit(table, playerIndex) {
  return (table.payouts[playerIndex] || 0) - table.betMoney;
}

function getActivePlayerIndexes(table) {
  return table.players
    .map((player, index) => ({ 
      player, 
      index, 
      total: getPlayerTotal(table, index) 
    }))
    .filter(({ player, total }) => !player.isOut && total < state.config.totalScore)
    .map(({ index }) => index);
}

function settleTable(table, payouts) {
  table.payouts = payouts.map((payout) => clampNumber(payout, 0, getTablePot(table)));
  table.isEnded = true;
  table.editingCell = null;
  renderApp();
}

function settleTableForSingleWinner(table) {
  if (table.isEnded) return;
  const activeIndexes = getActivePlayerIndexes(table);
  if (activeIndexes.length !== 1) return;

  const payouts = table.players.map(() => 0);
  payouts[activeIndexes[0]] = getTablePot(table);
  settleTable(table, payouts);
}

function showEndGameModal(table) {
  if (table.isEnded) return;
  const activeIndexes = getActivePlayerIndexes(table);

  // If only one player is still active, they are the automatic winner.
  // Skip the split modal entirely and directly settle the game.
  if (activeIndexes.length === 1) {
    const payouts = table.players.map(() => 0);
    payouts[activeIndexes[0]] = getTablePot(table);
    settleTable(table, payouts);
    return;
  }

  const splitIndexes = activeIndexes.length ? activeIndexes : table.players.map((_, index) => index);
  const pot = getTablePot(table);
  const defaultPayouts = table.players.map(() => 0);

  const content = document.createElement("div");
  content.className = "modal-card";

  const title = document.createElement("h2");
  title.textContent = `End ${table.title}`;
  const note = document.createElement("p");
  note.className = "modal-note";
  note.textContent = `Pot: ${formatMoney(pot)}. Enter split amounts for remaining players. Total split must equal the pot.`;

  const splitList = document.createElement("div");
  splitList.className = "split-list";
  const splitHead = document.createElement("div");
  splitHead.className = "split-head";
  splitHead.innerHTML = "<span>Player</span><span>Split</span>";
  splitList.append(splitHead);
  splitIndexes.forEach((playerIndex) => {
    const row = document.createElement("label");
    row.className = "split-row";
    const name = document.createElement("span");
    name.textContent = table.players[playerIndex].name;
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    input.dataset.playerIndex = String(playerIndex);
    input.value = defaultPayouts[playerIndex] ? String(defaultPayouts[playerIndex]) : "";
    input.placeholder = "0";
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
    });
    row.append(name, input);
    splitList.append(row);
  });

  const error = document.createElement("p");
  error.className = "form-error modal-error";
  error.role = "alert";

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.append(
    makeModalButton("Cancel", "ghost-button", closeModal),
    makeModalButton("Finish Game", "primary-button compact", () => {
      const payouts = table.players.map(() => 0);
      splitList.querySelectorAll("input").forEach((input) => {
        payouts[Number(input.dataset.playerIndex)] = clampNumber(input.value || "0", 0, pot);
      });

      const splitTotal = payouts.reduce((sum, payout) => sum + payout, 0);
      if (splitTotal !== pot) {
        error.textContent = `Split total must equal ${formatMoney(pot)}. Current split is ${formatMoney(splitTotal)}.`;
        return;
      }

      closeModal();
      settleTable(table, payouts);
    }),
  );

  content.append(title, note, splitList, error, actions);
  openModal(content);
}

function showCheckoutModal() {
  const totals = state.config.players.map((name, playerIndex) => ({
    name,
    amount: state.tables.reduce((sum, table) => {
      if (!table.isEnded) return sum;
      return sum + getPlayerProfit(table, playerIndex);
    }, 0),
  }));
  const unfinishedCount = state.tables.filter((table) => !table.isEnded).length;

  const content = document.createElement("div");
  content.className = "modal-card";

  const title = document.createElement("h2");
  title.textContent = "Checkout Game";
  const note = document.createElement("p");
  note.className = "modal-note";
  note.textContent = unfinishedCount
    ? `${unfinishedCount} table${unfinishedCount === 1 ? " is" : "s are"} still running. Totals below include ended tables only.`
    : "Final profit and loss across all ended tables.";

  const list = document.createElement("div");
  list.className = "checkout-list";
  totals.forEach(({ name, amount }) => {
    const row = document.createElement("div");
    row.className = "checkout-row";
    const nameEl = document.createElement("span");
    nameEl.textContent = name;
    const amountEl = document.createElement("strong");
    amountEl.className = amount >= 0 ? "profit-positive" : "profit-negative";
    amountEl.textContent = formatSignedMoney(amount);
    row.append(nameEl, amountEl);
    list.append(row);
  });

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  actions.append(
    makeModalButton("📥 Download Report", "ghost-button", () => downloadProfitLossReport(totals)),
    makeModalButton("Cancel", "ghost-button", closeModal),
    makeModalButton("Checkout", "primary-button compact", () => {
      closeModal();
      tablePage.classList.add("hidden");
      dashboardPage.classList.remove("hidden");
    }),
  );

  content.append(title, note, list, actions);
  openModal(content);
}

function makeModalButton(label, className, onClick) {
  const button = document.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function downloadProfitLossReport(totals) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const lines = [];
  lines.push("═══════════════════════════════════════════");
  lines.push("       GAMBLING SCORE TRACKER - REPORT     ");
  lines.push("═══════════════════════════════════════════");
  lines.push(`Date: ${dateStr}  |  Time: ${timeStr}`);
  lines.push(`Total Game Score: ${state.config.totalScore}  |  Bet Money: ${formatMoney(state.config.betMoney)}`);
  lines.push(`Kampu Score: ${state.config.kampuScore}  |  Mid Pack Score: ${state.config.midPackScore}`);
  lines.push(`Players: ${state.config.players.join(", ")}`);
  lines.push("");

  // Per-table breakdown
  state.tables.forEach((table) => {
    const status = table.isEnded ? "ENDED" : "RUNNING";
    lines.push("───────────────────────────────────────────");
    lines.push(`${table.title}  [${status}]  |  Pot: ${formatMoney(getTablePot(table))}`);
    lines.push("───────────────────────────────────────────");

    const nameWidth = Math.max(...state.config.players.map((n) => n.length), 10);

    // Header
    lines.push(
      `  ${"Player".padEnd(nameWidth)}  |  ${"Score".padStart(6)}  |  ${"Payout".padStart(8)}  |  ${"Profit/Loss".padStart(12)}`
    );
    lines.push(`  ${"─".repeat(nameWidth)}──┼──${"─".repeat(6)}──┼──${"─".repeat(8)}──┼──${"─".repeat(12)}`);

    table.players.forEach((player, playerIndex) => {
      const total = getPlayerTotal(table, playerIndex);
      const payout = table.isEnded ? (table.payouts[playerIndex] || 0) : "—";
      const profit = table.isEnded ? getPlayerProfit(table, playerIndex) : "—";
      const outTag = player.isOut || total >= state.config.totalScore ? " (OUT)" : "";

      lines.push(
        `  ${(player.name + outTag).padEnd(nameWidth)}  |  ${String(total).padStart(6)}  |  ${
          table.isEnded ? formatMoney(payout).padStart(8) : "—".padStart(8)
        }  |  ${table.isEnded ? formatSignedMoney(profit).padStart(12) : "—".padStart(12)}`
      );
    });
    lines.push("");
  });

  // Overall summary
  lines.push("═══════════════════════════════════════════");
  lines.push("             OVERALL SUMMARY               ");
  lines.push("═══════════════════════════════════════════");

  const nameWidth = Math.max(...totals.map((t) => t.name.length), 10);
  lines.push(`  ${"Player".padEnd(nameWidth)}  |  ${"Total Profit/Loss".padStart(18)}`);
  lines.push(`  ${"─".repeat(nameWidth)}──┼──${"─".repeat(18)}`);

  totals.forEach(({ name, amount }) => {
    lines.push(`  ${name.padEnd(nameWidth)}  |  ${formatSignedMoney(amount).padStart(18)}`);
  });

  lines.push("");
  lines.push("═══════════════════════════════════════════");
  lines.push(`Generated by Gambling Score Tracker`);
  lines.push("═══════════════════════════════════════════");

  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `GST_Report_${now.toISOString().slice(0, 10)}.txt`;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openModal(content) {
  modalLayer.innerHTML = "";
  modalLayer.append(content);
  modalLayer.classList.remove("hidden");
}

function closeModal() {
  modalLayer.classList.add("hidden");
  modalLayer.innerHTML = "";
}

function formatMoney(amount) {
  return `Rs ${amount}`;
}

function formatSignedMoney(amount) {
  if (amount === 0) return "Rs 0";
  return `${amount > 0 ? "+" : "-"}Rs ${Math.abs(amount)}`;
}

function getColumnClass(table, playerIndex) {
  const player = table.players[playerIndex];
  const total = getPlayerTotal(table, playerIndex);
  const classes = [];

  if (total > state.config.midPackScore) classes.push("mid-pack");
  if (total > state.config.kampuScore) classes.push("kampu");
  if (player.hasReentered) classes.push("reentered");
  if (total >= state.config.totalScore) classes.push("out-player");
  if (player.isOut) classes.push("out-player");

  return classes.join(" ");
}

function getReenterScore(table, playerIndex) {
  const activeTotals = table.players
    .map((player, index) => ({ player, index, total: getPlayerTotal(table, index) }))
    .filter(({ player, index }) => index !== playerIndex && !player.isOut)
    .map(({ total }) => total);

  if (!activeTotals.length) return state.config.totalScore;
  return Math.max(...activeTotals) + 1;
}

function markOut(table, playerIndex) {
  table.players[playerIndex].isOut = true;
  table.editingCell = null;
  settleTableForSingleWinner(table);
  if (!table.isEnded) {
    renderTables();
  }
}

function reenterPlayer(table, playerIndex, reenterScore) {
  const player = table.players[playerIndex];
  const previousTotal = getPlayerTotal(table, playerIndex);
  const values = table.players.map((_, index) => (index === playerIndex ? previousTotal : ""));
  table.historyRows.push({
    id: crypto.randomUUID(),
    label: `${player.name} Re-entered`,
    values,
  });

  player.baseScore = reenterScore;
  player.isOut = false;
  player.hasReentered = true;
  player.reenterScore = reenterScore;
  table.rows.forEach((row) => {
    row.scores[playerIndex] = 0;
  });
  renderTables();
}

function createNewTable() {
  const table = makeTable();
  state.tables.push(table);
  state.activeTableId = table.id;
  renderApp();
}

document.querySelector("#addPlayerBtn").addEventListener("click", () => addPlayerInput());
document.querySelector("#newTableBtn").addEventListener("click", createNewTable);
document.querySelector("#checkoutBtn").addEventListener("click", showCheckoutModal);
document.querySelector("#backBtn").addEventListener("click", () => {
  tablePage.classList.add("hidden");
  dashboardPage.classList.remove("hidden");
});
setupForm.addEventListener("submit", startGame);

[totalScoreInput, kampuScoreInput, midPackScoreInput, betMoneyInput].forEach((input) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "");
  });
});

modalLayer.addEventListener("click", (event) => {
  if (event.target === modalLayer) {
    closeModal();
  }
});

renderPlayerInputs();
