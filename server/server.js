const express = require("express");
const fs = require("fs");
const path = require("path");

const { updatePlayerSkills } = require("./src/systems/skillSystem");
const { updateTraits } = require("./src/systems/traitSystem");
const { updatePlayerTitle } = require("./src/systems/titleSystem");
const { applyStatGrowth } = require("./src/systems/statSystem");
const { createTimeSystem } = require("./src/systems/timeSystem");
const { createActionResolutionSystem } = require("./src/systems/actionResolutionSystem");
const { createCombatSystem } = require("./src/systems/combatSystem");
const { createWorldStateManager } = require("./src/core/worldState");
const { createRenderSystem } = require("./src/ui/renderSystem");
const { createItemSystem } = require("./src/systems/itemSystem");
const { createRestSystem } = require("./src/systems/restSystem");
const { createMovementSystem } = require("./src/systems/movementSystem");
const { createEventSystem } = require("./src/systems/eventSystem");

const { randomChoice, rollD20, rollDie } = require("./src/core/utils");
const { interpretAction } = require("./src/parsing/interpretAction");
const { classifyReaction } = require("./src/parsing/classifyReaction");
const { world, createBaseLocationState, createNewWorldState } = require("./src/config/worldData");
const {
  ensureLocationHp,
  damageLocation,
  repairLocation,
  isLocationDestroyed
} = require("./src/systems/locationHpSystem");
const {
  updateReputation,
  getReputationReaction
} = require("./src/systems/reputationSystem");

const {
  loadPlayer,
  savePlayer,
  getOtherPlayersInSameLocation
} = require("./src/core/players");

const app = express();
app.use(express.urlencoded({ extended: true }));

const playersFolder = path.join(__dirname, "players");
const worldFilePath = path.join(__dirname, "world.json");

const worldStateManager = createWorldStateManager({
  world,
  worldFilePath,
  createBaseLocationState,
  createNewWorldState
});

const {
  loadWorldState,
  saveWorldState,
  addWorldEvent
} = worldStateManager;

const timeSystem = createTimeSystem({ addWorldEvent });

const {
  ensureTimeState,
  formatWorldTime,
  advanceWorldTime,
  processTimedWorldChanges,
  scheduleBarRepair,
  getLocationRecoveryActions,
  contributeToRecovery
} = timeSystem;

if (!fs.existsSync(playersFolder)) {
  fs.mkdirSync(playersFolder);
}

/* =========================
   HELPERS
========================= */

function requirePlayer(req, res) {
  const playerName = req.query.player;

  if (!playerName) {
    res.send(`
      <div style="text-align:center; padding:40px; font-family:sans-serif;">
        <h1>AI Dungeon Game</h1>
        <p style="font-size:18px;">Type actions like a real adventure.</p>
        <p style="color:gray;">Examples: "I attack the goblin with my sword", "I calm the drunk down", "I tackle the thief"</p>
        <form method="GET" action="/" style="margin-top:20px;">
          <input
            type="text"
            name="player"
            placeholder="Enter your name"
            style="padding:10px; font-size:16px; width:200px;"
          />
          <br><br>
          <button
            type="submit"
            style="padding:10px 20px; font-size:16px;"
          >
            Start Game
          </button>
        </form>
        <p style="margin-top:30px; color:gray;">
          Enter your name to begin. Unexpected things may happen around you. React in free text.
        </p>
      </div>
    `);
    return null;
  }

  return playerName;
}

function ensurePlayerProgression(player) {
  player.resources = player.resources || {
  gold: 0,
  wood: 0,
  stone: 0
};
  player.traits = player.traits || {
    honor: 0,
    greed: 0,
    fear: 0,
    influence: 0,
    chaos: 0
  };

  player.progression = player.progression || {
    actionCounts: {}
  };

  player.title = player.title || "Wanderer";
  player.skills = player.skills || [];
}

function trackAction(player, actionType) {
  ensurePlayerProgression(player);

  if (!player.progression.actionCounts[actionType]) {
    player.progression.actionCounts[actionType] = 0;
  }

  player.progression.actionCounts[actionType] += 1;
}

function syncTimedWorld(worldState) {
  ensureTimeState(worldState);
  processTimedWorldChanges(worldState);
}

function advanceAndSync(worldState, hours, reason, location) {
  advanceWorldTime(worldState, hours, reason, location);
  processTimedWorldChanges(worldState);
  processBarCrisisDamage(worldState);
}
function processBarCrisisDamage(worldState) {
  ensureLocationHp(worldState, "bar");

  const barState = worldState.locationStates.bar;
  const activeEvent = barState.activeEvent;

  if (!activeEvent) return;
  if (barState.status === "destroyed") return;

  const eventId = activeEvent.id || "";
  const eventText = `${activeEvent.title || ""} ${activeEvent.text || ""}`.toLowerCase();

  let damage = 0;

  if (eventId === "bar_fire" || eventText.includes("fire") || eventText.includes("flame")) {
    damage = 35;
  } else if (eventId === "bar_brawl" || eventText.includes("brawl") || eventText.includes("fight")) {
    damage = 15;
  }

  if (damage <= 0) return;

  const result = damageLocation(worldState, "bar", damage);
  addWorldEvent(worldState, result.text, "bar");

  if (result.destroyed) {
    barState.activeEvent = null;
    barState.stateFlags.barDamaged = false;
    barState.stateFlags.barRepairing = false;

    addWorldEvent(
      worldState,
      "The old bar is gone. The only options now are to clear the ruins or rebuild something new.",
      "bar"
    );
  }
}
function getRecoveryContributionAmount(interpreted) {
  switch (interpreted.recoveryAction) {
    case "donate-wood":
      return 2;
    case "donate-supplies":
      return 2;
    case "organize-repairs":
      return 2;
    case "clear-rubble":
      return 1;
    case "labor":
    default:
      return 1;
  }
}

function spawnQueuedForestEncounterIfNeeded(worldState, player) {
  const forestFlags = worldState.locationStates?.forest?.stateFlags;
  if (!forestFlags) return;
  if (player.location !== "forest") return;
  if (!forestFlags.pendingForestEncounter) return;
  if (worldState.goblinAlive) return;

  const danger = forestFlags.forestDanger || 0;

  let nextGoblin;
  if (danger >= 6) {
    nextGoblin = { type: "Goblin Brute", hp: 24 };
  } else if (danger >= 4) {
    nextGoblin = { type: "Goblin Hunter", hp: 20 };
  } else {
    nextGoblin = { type: "Goblin Scout", hp: 12 };
  }

  forestFlags.pendingForestEncounter = false;
  worldState.goblinAlive = true;
  worldState.goblinType = nextGoblin.type;
  worldState.goblinHp = nextGoblin.hp;

  addWorldEvent(
    worldState,
    `Branches snap in the dark. A ${nextGoblin.type} emerges from deeper in the forest.\nEnemy HP: ${nextGoblin.hp}.`,
    "forest"
  );
}

/* =========================
   EVENT ENGINE HELPERS
========================= */

function getForestEscalationEventId(forestFlags) {
  if (forestFlags.forestDanger >= 6) {
    return "forest_goblin_warband";
  }

  if (forestFlags.forestDanger >= 4) {
    return "forest_goblin_hunter";
  }

  return "forest_goblin_patrol";
}

function updateForestPressure(worldState, reason) {
  const forestFlags = worldState.locationStates.forest.stateFlags;

  if (reason === "idle" || reason === "look") {
    forestFlags.forestStayCounter += 1;
  }

  if (reason === "enter") {
    forestFlags.forestStayCounter += 0;
  }

  if (forestFlags.forestSpawnCooldown > 0 && (reason === "idle" || reason === "look" || reason === "enter")) {
    forestFlags.forestSpawnCooldown -= 1;
  }
}

function shouldSpawnForestEscalation(worldState, reason) {
  const forestFlags = worldState.locationStates.forest.stateFlags;

  if (worldState.goblinAlive) return false;
  if (forestFlags.goblinReinforcementsIncoming) return false;
  if (forestFlags.reinforcementAmbushPending) return false;
  if (forestFlags.pendingForestEncounter) return false;
  if (forestFlags.forestSpawnCooldown > 0) return false;
  if (forestFlags.forestStayCounter < 2) return false;

  let chance = 0.20;
  chance += Math.min(0.30, forestFlags.forestDanger * 0.06);
  chance += Math.min(0.25, Math.max(0, forestFlags.forestStayCounter - 2) * 0.10);

  if (reason === "look") chance += 0.05;
  if (reason === "idle") chance += 0.10;

  chance = Math.min(0.80, chance);

  return Math.random() < chance;
}

function beginForestCooldown(worldState, turns = 2) {
  const forestFlags = worldState.locationStates.forest.stateFlags;
  forestFlags.forestSpawnCooldown = turns;
  forestFlags.forestStayCounter = 0;
}

function finishForestEncounter(worldState, options = {}) {
  const forestFlags = worldState.locationStates.forest.stateFlags;

  if (options.corpses) {
    worldState.goblinCorpses = (worldState.goblinCorpses || 0) + options.corpses;
  }

  if (options.dangerDelta) {
    forestFlags.forestDanger = Math.max(0, forestFlags.forestDanger + options.dangerDelta);
  }

  if (options.clearReinforcementPending) {
    forestFlags.reinforcementAmbushPending = false;
    forestFlags.goblinReinforcementsIncoming = false;
    forestFlags.pendingForestEncounter = false;
  }

  if (options.cooldownTurns !== undefined) {
    beginForestCooldown(worldState, options.cooldownTurns);
  }
}

/* =========================
   SYSTEMS
========================= */

const movementSystem = createMovementSystem({ addWorldEvent });

const {
  markBartenderHostile,
  forgiveBartenderIfEarned,
  banPlayerFromGuardZones,
  forgiveGuardRestrictionsIfEarned,
  canEnterDestination
} = movementSystem;

const itemSystem = createItemSystem({ addWorldEvent });
const { useItem } = itemSystem;

const restSystem = createRestSystem({ addWorldEvent });
const { restAtBar } = restSystem;

const renderSystem = createRenderSystem({
  world,
  getOtherPlayersInSameLocation
});

const {
  buildResultBlock,
  buildLookDescription,
  getInventoryHtml,
  getOtherPlayersHtml,
  getLocationExtra
} = renderSystem;

const combatSystem = createCombatSystem({
  randomChoice,
  rollD20,
  rollDie,
  addWorldEvent,
  updateReputation,
  getReputationReaction,
  buildResultBlock,
  savePlayer,
  saveWorldState
});

const {
  narrateDeath,
  handlePlayerDeath,
  handleAttackAction,
  handleDefendAction,
  handleRunAction
} = combatSystem;

const eventSystem = createEventSystem({
  world,
  randomChoice,
  createBaseLocationState,
  addWorldEvent,
  updateReputation,
  narrateDeath,
  handlePlayerDeath,
  getForestEscalationEventId,
  updateForestPressure,
  shouldSpawnForestEscalation,
  scheduleBarRepair
});

const {
  createEventTemplate,
  clearExpiredEventIfNeeded,
  closeActiveEvent,
  advanceEventChain,
  clearVillageRumorFlagForEvent,
  maybeTriggerLocationEvent
} = eventSystem;

const actionResolutionSystem = createActionResolutionSystem({
  rollD20,
  addWorldEvent,
  updateReputation,
  narrateDeath,
  handlePlayerDeath,
  banPlayerFromGuardZones,
  markBartenderHostile,
  advanceEventChain,
  closeActiveEvent,
  clearVillageRumorFlagForEvent,
  finishForestEncounter
});

const {
  handleActiveEventReaction
} = actionResolutionSystem;

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  const playerName = requirePlayer(req, res);
  if (!playerName) return;

  const player = loadPlayer(playerName);
  ensurePlayerProgression(player);
  updatePlayerSkills(player);

  const worldState = loadWorldState();
  ensureLocationHp(worldState, "bar");

if (player.location === "bar" && isLocationDestroyed(worldState, "bar")) {
  addWorldEvent(
    worldState,
    `${player.name} arrives at the bar, but it has been destroyed. Only charred remains stand.`,
    "bar"
  );

  // 🔥 MOVE PLAYER OUT
  player.location = "street";

  savePlayer(player);
  saveWorldState(worldState);

  return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
}
 
  const location = world[player.location];
  const activeEvent = worldState.locationStates[player.location]?.activeEvent;

  syncTimedWorld(worldState);

  forgiveBartenderIfEarned(worldState, player);
  forgiveGuardRestrictionsIfEarned(player, worldState);

  clearExpiredEventIfNeeded(worldState, player.location);

  savePlayer(player);
  saveWorldState(worldState);

  const links = location.paths.map((p) =>
    `<a href="/move/${p}?player=${encodeURIComponent(playerName)}">${p}</a>`
  ).join("<br>");

  const eventsHtml = worldState.eventLog
    .map(event => `<li><pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${event}</pre></li>`)
    .join("");

  const reputationReaction = getReputationReaction(player.reputation);

  res.send(`
  <h1>${player.name.toUpperCase()} — ${player.location.toUpperCase()}</h1>

  <div style="padding:10px; border:1px solid #bbb; border-radius:8px; background:#f5f5f5; margin-bottom:16px;">
    <strong>World Time:</strong> ${formatWorldTime(worldState)}
  </div>
<div style="padding:10px; border:1px solid #f00; border-radius:8px; background:#fee; margin-bottom:16px;">
  <strong>Bar Status:</strong> Destroyed

  ${
    worldState.locationStates.bar.rebuildProject
      ? `<p><strong>Rebuild Progress:</strong> ${worldState.locationStates.bar.rebuildProject.progress}/${worldState.locationStates.bar.rebuildProject.required}</p>`
      : ""
  }
</div>
  <p><strong>Bar Status:</strong> ${worldState.locationStates.bar.status} | HP ${worldState.locationStates.bar.hp}/${worldState.locationStates.bar.maxHp}</p>
  ${worldState.locationStates.bar.status === "destroyed" ? `
  <div style="padding:10px; border:1px solid #b66; border-radius:8px; background:#fff1f1; margin-bottom:12px;">
    <h3>Bar Rebuild Required</h3>
    <p>The old bar has collapsed. Players must gather materials before it can be rebuilt.</p>
    <p><strong>Rebuild progress: Gold = 3 points, Wood = 2 points, Stone = 4 points 
    <p><strong>Your resources:</strong> Gold ${player.resources?.gold || 0} | Wood ${player.resources?.wood || 0} | Stone ${player.resources?.stone || 0}</p>
    <p><strong>How to rebuild:</strong> Type <code>rebuild bar</code> or <code>repair bar</code>.</p>
    <p><strong>How to gather:</strong> Kill goblins for gold. Search the forest for wood and stone.</p>
  </div>
` : ""}
  <p>${location.description}</p>
  <p><strong>HP:</strong> ${player.hp} / ${player.maxHp}</p>
  <p><strong>Stats:</strong> STR ${player.stats.strength}, DEX ${player.stats.dexterity}, DEF ${player.stats.defense}, PRE ${player.stats.presence}</p>
  <p><strong>Title:</strong> ${player.title}</p>
  <p><strong>Skills:</strong> ${player.skills.length > 0 ? player.skills.join(", ") : "None"}</p>
  <p><strong>Traits:</strong> Honor ${player.traits.honor} | Greed ${player.traits.greed} | Fear ${player.traits.fear} | Influence ${player.traits.influence} | Chaos ${player.traits.chaos}</p>
  <p><strong>Reputation:</strong> ${player.reputation.title}</p>
  ${reputationReaction ? `<p><em>${reputationReaction}</em></p>` : ""}
  <p><strong>Guard Alert Level:</strong> ${worldState.globalState.guardsAlertLevel}</p>

  ${activeEvent ? `
    <div style="margin:12px 0; padding:12px; border:1px solid #c98; border-radius:8px; background:#fff7f2;">
      <h3 style="margin-top:0;">Current Event</h3>
      <p style="margin:6px 0;"><strong>${activeEvent.title || "Something is happening"}</strong></p>
      <p style="margin:6px 0; white-space:pre-wrap;">${activeEvent.text}</p>
    </div>
  ` : ""}

  ${!activeEvent ? getLocationExtra(player, worldState) : ""}

  <h3>Action</h3>
  <form method="POST" action="/action?player=${encodeURIComponent(playerName)}" style="margin-bottom:20px;">
    <input
      type="text"
      name="action"
      placeholder="Type your action..."
      autocomplete="off"
      style="padding:10px; width:420px; max-width:90%; font-size:16px;"
    />
    <button type="submit" style="padding:10px 16px; font-size:16px; margin-left:8px;">
      Act
    </button>
  </form>

  <p style="color:gray;">
    Examples: look, help, attack goblin, defend, run, search, drink, eat, threaten, repair, clear rubble
  </p>

  <h3>Other Players Here</h3>
  ${getOtherPlayersHtml(player)}

  <h3>Move to:</h3>
  ${links}

  <h3>Inventory</h3>
  ${getInventoryHtml(player, playerName)}
  <h3>Resources</h3>
<p>Gold: ${player.resources?.gold || 0} | Wood: ${player.resources?.wood || 0} | Stone: ${player.resources?.stone || 0}</p>

  <h3>World Controls</h3>
  <a href="/rest?player=${encodeURIComponent(playerName)}">Rest</a>
  <br>
  <a href="/reset-world?player=${encodeURIComponent(playerName)}" onclick="return confirm('Reset the whole world?')">Reset World</a>

  <h3>Shared World Events</h3>
  <ul>
    ${eventsHtml}
  </ul>
`);
});

app.post("/action", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  ensurePlayerProgression(player);
  updatePlayerSkills(player);

  const worldState = loadWorldState();
  ensureLocationHp(worldState, "bar");
  const rawAction = req.body.action || "";
const interpreted = interpretAction(rawAction);
const reaction = classifyReaction(rawAction);
const lowerAction = rawAction.toLowerCase();

if (
  lowerAction.includes("repair bar") ||
  lowerAction.includes("rebuild bar") ||
  lowerAction.includes("fix bar") ||
  lowerAction.includes("repair tavern") ||
  lowerAction.includes("rebuild tavern")
) {
  interpreted.type = "repair";
  interpreted.target = "bar";
}
 

  syncTimedWorld(worldState);

  forgiveBartenderIfEarned(worldState, player);
  forgiveGuardRestrictionsIfEarned(player, worldState);

  clearExpiredEventIfNeeded(worldState, player.location);

  const flavor = {
    mentionsJump: lowerAction.includes("jump"),
    mentionsSpin: lowerAction.includes("spin") || lowerAction.includes("360"),
    mentionsNoScope: lowerAction.includes("no scope") || lowerAction.includes("noscope"),
    mentionsKick: lowerAction.includes("kick"),
    mentionsPunch: lowerAction.includes("punch"),
    mentionsStab: lowerAction.includes("stab"),
    mentionsSlash: lowerAction.includes("slash")
  };

  if (interpreted.type === "say") {
    const othersHere = getOtherPlayersInSameLocation(player);

    if (!interpreted.message) {
      addWorldEvent(worldState, `${player.name} opens their mouth, but says nothing.`, player.location);
    } else if (othersHere.length === 0) {
      addWorldEvent(worldState, `${player.name} says into the empty ${player.location}: "${interpreted.message}"`, player.location);
    } else {
      addWorldEvent(worldState, `${player.name} says: "${interpreted.message}"`, player.location);
    }

    advanceAndSync(worldState, 1, "say", player.location);
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  const handledByEvent = handleActiveEventReaction(player, worldState, rawAction, reaction);
  if (handledByEvent) {
    advanceAndSync(worldState, 1, "event-reaction", player.location);
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  addWorldEvent(worldState, `${player.name} attempts: "${rawAction}"`, player.location);

  if (interpreted.type === "look") {
    const description = buildLookDescription(player, worldState);
    addWorldEvent(worldState, `${player.name} looks around.\n${description}`, player.location);
    maybeTriggerLocationEvent(worldState, player.location, player, "look");
    advanceAndSync(worldState, 1, "look", player.location);

  } else if (interpreted.type === "help") {
    const recoveryActions = getLocationRecoveryActions(worldState, player.location);
    const recoveryHelpText = recoveryActions.length > 0
      ? `\n\nRECOVERY ACTIONS HERE\n- ${recoveryActions.join("\n- ")}`
      : "";

    const helpText = `COMMANDS
- look: inspect your surroundings
- attack goblin / shoot goblin: attack in combat
- defend: reduce incoming damage and build honor
- run: try to escape combat
- search: search the area
- rest: recover HP in the bar
- drink: have a drink in the bar
- eat: have a meal in the bar
- barfight: start trouble in the bar
- say hello: speak to nearby players
- threaten: intimidate others in the right setting
- repair / help repair / donate wood / clear rubble: special recovery actions when a place is damaged
- rebuild bar: contribute to rebuilding the destroyed bar

NEW EVENT LOOP
- enter a place
- something may happen
- react in free text
- your reaction changes the world${recoveryHelpText}`;

    addWorldEvent(worldState, `${player.name} asks for guidance.\n${helpText}`, player.location);
    advanceAndSync(worldState, 1, "help", player.location);

  } else if (interpreted.type === "attack") {
    handleAttackAction(player, worldState, interpreted, flavor);
    advanceAndSync(worldState, 1, "attack", player.location);

  } else if (interpreted.type === "defend") {
    handleDefendAction(player, worldState);
    advanceAndSync(worldState, 1, "defend", player.location);

  } else if (interpreted.type === "run") {
    handleRunAction(player, worldState);
    advanceAndSync(worldState, 1, "run", player.location);

  } else if (interpreted.type === "search") {
  trackAction(player, "search");
  updateTraits(player, { greed: 1 });
  updatePlayerTitle(player);
  updatePlayerSkills(player);

  if (player.location !== "forest") {
    addWorldEvent(worldState, `${player.name} searches around, but finds nothing useful.`, player.location);
  } else if (!worldState.forestPotionFound) {
    player.inventory.push("Health Potion");
    worldState.forestPotionFound = true;
    addWorldEvent(worldState, `${player.name} searches the forest and finds a Health Potion.`, player.location);
  } else {
  const foundWood = Math.floor(Math.random() * 3) + 1;
  const foundStone = Math.random() < 0.5 ? 1 : 0;

  player.resources.wood += foundWood;
  player.resources.stone += foundStone;

  addWorldEvent(
    worldState,
    `${player.name} searches the forest and gathers ${foundWood} wood${foundStone > 0 ? ` and ${foundStone} stone` : ""}.`,
    player.location
  );
}

  maybeTriggerLocationEvent(worldState, player.location, player, "idle");
  spawnQueuedForestEncounterIfNeeded(worldState, player);
  advanceAndSync(worldState, 1, "search", player.location);

  } else if (interpreted.type === "drink") {
  trackAction(player, "drink");
  updateTraits(player, { chaos: 1, honor: -1 });
  applyStatGrowth(player, "drink");
  updatePlayerTitle(player);
  updatePlayerSkills(player);

  if (player.location !== "bar") {
    addWorldEvent(worldState, `${player.name} tries to drink, but there's nothing here.`, player.location);
   }  else if (player.location === "bar" && isLocationDestroyed(worldState, "bar")) {
  addWorldEvent(worldState, `${player.name} looks for a drink, but the bar is ruins now.`, player.location);
  } else {
    const barState = ensureLocationHp(worldState, "bar");
const healAmount = barState.hp >= barState.maxHp ? 15 : 10;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    updateReputation(player, { honor: 1 });

    addWorldEvent(
      worldState,
      `${player.name} enjoys a quiet drink.\nRecovers ${healAmount} HP.\nHonor +1.${barState.hp >= barState.maxHp ? "\nFull Bar Bonus: Better supplies improve recovery." : ""}`,
      player.location
    );

    maybeTriggerLocationEvent(worldState, player.location, player, "idle");
  }

  advanceAndSync(worldState, 1, "drink", player.location);

 } else if (interpreted.type === "eat") {
  trackAction(player, "eat");
  updateTraits(player, { honor: 1 });
  updatePlayerTitle(player);
  updatePlayerSkills(player);

  if (player.location !== "bar") {
    addWorldEvent(worldState, `${player.name} looks for food, but finds nothing.`, player.location);
    } else if (player.location === "bar" && isLocationDestroyed(worldState, "bar")) {
  addWorldEvent(worldState, `${player.name} looks for food, but the bar is ruins now.`, player.location);
  } else {
   const barState = ensureLocationHp(worldState, "bar");
const healAmount = barState.hp >= barState.maxHp ? 18 : 12;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    updateReputation(player, { honor: 1 });

    addWorldEvent(
      worldState,
      `${player.name} eats a warm meal.\nRecovers ${healAmount} HP.\nHonor +1.${barState.hp >= barState.maxHp ? "\nFull Bar Bonus: The kitchen is fully restored." : ""}`,
      player.location
    );

    maybeTriggerLocationEvent(worldState, player.location, player, "idle");
  }

  advanceAndSync(worldState, 1, "eat", player.location);

 } else if (interpreted.type === "threaten") {
  trackAction(player, "threaten");
  updateTraits(player, { influence: 1, chaos: 1, honor: -1 });
  applyStatGrowth(player, "threaten");
  updatePlayerTitle(player);
  updatePlayerSkills(player);

  if (player.location === "forest") {
    updateReputation(player, { intimidation: 1 });

    addWorldEvent(
      worldState,
      `${player.name} lets out a terrifying threat into the forest.\nIntimidation +1.`,
      player.location
    );
  } else if (player.location === "bar") {
    updateReputation(player, { intimidation: 1, chaos: 1 });
    markBartenderHostile(worldState, player.name);
    player.flags.bartenderBarred = true;

    addWorldEvent(
      worldState,
      `${player.name} makes a chilling threat in the bar.\nPeople go silent.\nIntimidation +1. Chaos +1.\nBartender Rowan will remember this.`,
      player.location
    );

    maybeTriggerLocationEvent(worldState, player.location, player, "idle");
  } else {
    addWorldEvent(
      worldState,
      `${player.name} tries to act intimidating, but nothing really happens.`,
      player.location
    );
  }

  advanceAndSync(worldState, 1, "threaten", player.location);

} else if (interpreted.type === "barfight") {
  trackAction(player, "barfight");
  updateTraits(player, { chaos: 2, honor: -1 });
  updatePlayerTitle(player);
  updatePlayerSkills(player);

  if (player.location !== "bar") {
    addWorldEvent(worldState, `${player.name} looks for trouble, but no one is around.`, player.location);
    } else if (isLocationDestroyed(worldState, "bar")) {
  addWorldEvent(worldState, `${player.name} looks for a bar fight, but the bar is already ruins.`, player.location);
  } else {
    const damage = 8;
    player.hp = Math.max(0, player.hp - damage);
    updateReputation(player, { honor: -2, chaos: 2, intimidation: 2 });
    
const barDamageResult = damageLocation(worldState, "bar", 25);
addWorldEvent(worldState, barDamageResult.text, "bar");
    
    
    worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
   
    markBartenderHostile(worldState, player.name);
    player.flags.bartenderBarred = true;

    addWorldEvent(
      worldState,
      `${player.name} starts a bar fight!\nTakes ${damage} damage.\nHonor -2.\nChaos +2.\nBartender Rowan has had enough of them.`,
      player.location
    );

    if (!worldState.locationStates.bar.activeEvent) {
      worldState.locationStates.bar.activeEvent = createEventTemplate("bar_brawl", "bar");
      addWorldEvent(worldState, `[EVENT — BAR] ${worldState.locationStates.bar.activeEvent.text}`, "bar");
    }
  }

  advanceAndSync(worldState, 1, "barfight", player.location);

} else if (interpreted.type === "repair") {
  trackAction(player, "repair");
  updateTraits(player, { honor: 1, chaos: -1 });
  updatePlayerTitle(player);
  updatePlayerSkills(player);

  let targetLocation = interpreted.target || player.location;

  if (
    rawAction.toLowerCase().includes("bar") ||
    rawAction.toLowerCase().includes("tavern")
  ) {
    targetLocation = "bar";
  }

  const contributionAmount = getRecoveryContributionAmount(interpreted);

  player.resources = player.resources || { gold: 0, wood: 0, stone: 0 };

  const barState = ensureLocationHp(worldState, "bar");
  const isDestroyedBar = targetLocation === "bar" && barState.status === "destroyed";
  if (isDestroyedBar && !barState.rebuildProject) {
  barState.rebuildProject = {
    active: true,
    progress: 0,
    required: 100,
    type: "rebuild_bar"
  };
}

  if (isDestroyedBar) {
  const canReachBar =
    player.location === "bar" ||
    world[player.location]?.paths?.includes("bar");

  if (!canReachBar) {
    addWorldEvent(
      worldState,
      `${player.name} wants to rebuild the bar, but they are too far away. Move adjacent to the bar first.`,
      player.location
    );

    advanceAndSync(worldState, 1, "failed-rebuild-distance", player.location);
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  const goldUsed = player.resources.gold || 0;
  const woodUsed = player.resources.wood || 0;
  const stoneUsed = player.resources.stone || 0;

  const progressValue =
    goldUsed * 3 +
    woodUsed * 2 +
    stoneUsed * 4;

  if (progressValue <= 0) {
    addWorldEvent(
      worldState,
      `${player.name} wants to rebuild the bar, but has no usable resources.\nGather gold from goblins, and wood or stone from the forest.`,
      player.location
    );

    advanceAndSync(worldState, 1, "failed-rebuild-no-resources", player.location);
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  player.resources.gold = 0;
  player.resources.wood = 0;
  player.resources.stone = 0;

  const hpRepairResult = repairLocation(worldState, "bar", progressValue);

  addWorldEvent(
    worldState,
    `${player.name} pours everything they have into rebuilding the bar.\nUsed: ${goldUsed} gold, ${woodUsed} wood, ${stoneUsed} stone.\nRebuild progress added: ${progressValue}.\n${hpRepairResult.text}`,
    player.location
  );

  updateReputation(player, { honor: 2 });

  if (hpRepairResult.rebuilt) {
    worldState.locationStates.bar.stateFlags.barDamaged = false;
    worldState.locationStates.bar.stateFlags.barRepairing = false;
    worldState.locationStates.village.stateFlags.tavernTroubleRumor = false;

    addWorldEvent(
      worldState,
      `${player.name}'s contribution completes the rebuild. The bar stands again.`,
      "bar"
    );
  }

  advanceAndSync(worldState, 1, "rebuild-bar", player.location);
  savePlayer(player);
  saveWorldState(worldState);
  return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
}

  if (targetLocation === "bar" && barState.hp < barState.maxHp) {
    const hpRepairResult = repairLocation(worldState, "bar", contributionAmount * 10);
    addWorldEvent(worldState, hpRepairResult.text, player.location);
    updateReputation(player, { honor: 1 });

    advanceAndSync(worldState, 1, "repair-bar", player.location);
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  const repairResult = contributeToRecovery(worldState, targetLocation, {
    actor: player.name,
    amount: contributionAmount,
    type: interpreted.recoveryAction || "labor"
  });

  addWorldEvent(worldState, repairResult.text, player.location);

  if (repairResult.success) {
    updateReputation(player, { honor: 1 });
  }

  advanceAndSync(worldState, 1, "repair", player.location);
    } else if (interpreted.type === "inspect-recovery") {
    trackAction(player, "inspect-recovery");
    updatePlayerTitle(player);
    updatePlayerSkills(player);

    const targetLocation = interpreted.target || player.location;
    const actions = getLocationRecoveryActions(worldState, targetLocation);

    if (actions.length === 0) {
      addWorldEvent(
        worldState,
        `${player.name} inspects the area, but there is no active recovery work here.`,
        player.location
      );
    } else {
      addWorldEvent(
        worldState,
        `${player.name} inspects the recovery effort.\nAvailable actions: ${actions.join(", ")}.`,
        player.location
      );
    }

    advanceAndSync(worldState, 1, "inspect-recovery", player.location);

  } else if (interpreted.type === "wait") {
    trackAction(player, "wait");
    updatePlayerTitle(player);
    updatePlayerSkills(player);

    addWorldEvent(
      worldState,
      `${player.name} waits and watches the world move around them.`,
      player.location
    );

    maybeTriggerLocationEvent(worldState, player.location, player, "idle");
    spawnQueuedForestEncounterIfNeeded(worldState, player);
    advanceAndSync(worldState, 1, "wait", player.location);

  } else {
    maybeTriggerLocationEvent(worldState, player.location, player, "idle");
    addWorldEvent(worldState, `The Dungeon Master does not understand ${player.name}'s action yet.`, player.location);
    advanceAndSync(worldState, 1, "unknown-action", player.location);
  }

  savePlayer(player);
  saveWorldState(worldState);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/move/:place", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  ensurePlayerProgression(player);
  updatePlayerSkills(player);

  const worldState = loadWorldState();
  ensureLocationHp(worldState, "bar");
  const destination = req.params.place;
  const location = world[player.location];

  syncTimedWorld(worldState);

  forgiveBartenderIfEarned(worldState, player);
  forgiveGuardRestrictionsIfEarned(player, worldState);

  if (location.paths.includes(destination)) {
    const moveCheck = canEnterDestination(player, destination, worldState);

    if (!moveCheck.allowed) {
      addWorldEvent(worldState, moveCheck.message, player.location);
    } else {
      player.location = destination;

      if (destination !== "forest") {
        worldState.locationStates.forest.stateFlags.forestStayCounter = 0;
      }

      addWorldEvent(worldState, `${player.name} travels to ${destination}.`, destination);
      maybeTriggerLocationEvent(worldState, destination, player, "enter");

      advanceAndSync(worldState, 1, "move", destination);
    }
  } else {
    addWorldEvent(worldState, `${player.name} cannot reach ${destination} from here.`, player.location);
  }

  savePlayer(player);
  saveWorldState(worldState);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/rest", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  ensurePlayerProgression(player);
  updatePlayerSkills(player);

  const worldState = loadWorldState();
ensureLocationHp(worldState, "bar");

  syncTimedWorld(worldState);

  forgiveBartenderIfEarned(worldState, player);
  forgiveGuardRestrictionsIfEarned(player, worldState);

  const restedSuccessfully = restAtBar(player, worldState);

  if (restedSuccessfully) {
    advanceAndSync(worldState, 8, "rest", player.location);
  } else {
    advanceAndSync(worldState, 1, "failed-rest", player.location);
  }

  savePlayer(player);
  saveWorldState(worldState);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/use-item/:index", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  ensurePlayerProgression(player);
  updatePlayerSkills(player);

  const worldState = loadWorldState();
  ensureLocationHp(worldState, "bar");
  const index = parseInt(req.params.index, 10);

  syncTimedWorld(worldState);

  useItem(player, worldState, index);

  processTimedWorldChanges(worldState);

  savePlayer(player);
  saveWorldState(worldState);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/reset-world", (req, res) => {
  const playerName = req.query.player;

  if (playerName !== "Hunt") {
    return res.send("You are not allowed to reset the world.");
  }

  const newWorld = createNewWorldState();
  saveWorldState(newWorld);

  const playerFiles = fs.readdirSync(playersFolder);
  for (const file of playerFiles) {
    const filePath = path.join(playersFolder, file);
    fs.unlinkSync(filePath);
  }

  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Game running at http://localhost:${PORT}`);
});