const express = require("express");
const fs = require("fs");
const path = require("path");
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
const { parseFlavor } = require("./src/parsing/flavorParser");
const { world, createBaseLocationState, createNewWorldState } = require("./src/config/worldData");
const {
  updateReputation,
  getReputationTitle,
  getReputationReaction
} = require("./src/systems/reputationSystem");
const {
  loadPlayer,
  savePlayer,
  loadAllPlayers,
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
  ensureWorldShape,
  loadWorldState,
  saveWorldState,
  addWorldEvent
} = worldStateManager;
if (!fs.existsSync(playersFolder)) {
  fs.mkdirSync(playersFolder);
}

/* =========================
   NEW SYSTEM HELPERS
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

/* =========================
   EVENT ENGINE
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
  }

  if (options.cooldownTurns !== undefined) {
    beginForestCooldown(worldState, options.cooldownTurns);
  }
}

/* =========================
   ORIGINAL ACTION INTERPRETER
========================= */


/* =========================
   UI HELPERS
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
  shouldSpawnForestEscalation
});

const {
  createEventTemplate,
  clearExpiredEventIfNeeded,
  resolveExpiredEvent,
  closeActiveEvent,
  getNextChainTarget,
  advanceEventChain,
  clearVillageRumorFlagForEvent,
  getLocationEventPool,
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
  resolveCheck,
  reactionIntentIsAttackLike,
  resolveForestHostileEvent,
  handleGuardQuestionCommon,
  handleActiveEventReaction
} = actionResolutionSystem;
/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  const playerName = requirePlayer(req, res);
  if (!playerName) return;

  const player = loadPlayer(playerName);
  const worldState = loadWorldState();
  const location = world[player.location];

  forgiveBartenderIfEarned(worldState, player);
  forgiveGuardRestrictionsIfEarned(player, worldState);

  clearExpiredEventIfNeeded(worldState, player.location);
  maybeTriggerLocationEvent(worldState, player.location, player, "idle");
  savePlayer(player);
  saveWorldState(worldState);

  const links = location.paths.map((p) =>
    `<a href="/move/${p}?player=${encodeURIComponent(playerName)}">${p}</a>`
  ).join("<br>");

  const eventsHtml = worldState.eventLog
    .map(event => `<li><pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${event}</pre></li>`)
    .join("");

  res.send(`
    <h1>${player.name.toUpperCase()} — ${player.location.toUpperCase()}</h1>
    <p>${location.description}</p>
    <p><strong>HP:</strong> ${player.hp} / ${player.maxHp}</p>
    <p><strong>Stats:</strong> STR ${player.stats.strength}, DEX ${player.stats.dexterity}, DEF ${player.stats.defense}, PRE ${player.stats.presence}</p>
    <p><strong>Reputation:</strong> ${player.reputation.title} | Honor ${player.reputation.honor} | Chaos ${player.reputation.chaos} | Intimidation ${player.reputation.intimidation}</p>
    <p><strong>Guard Alert Level:</strong> ${worldState.globalState.guardsAlertLevel}</p>
    ${getLocationExtra(player, worldState)}
    <h3>Other Players Here</h3>
    ${getOtherPlayersHtml(player)}
    <h3>Move to:</h3>
    ${links}
    <h3>Inventory</h3>
    ${getInventoryHtml(player, playerName)}
    <h3>World Controls</h3>
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
  const worldState = loadWorldState();
  const rawAction = req.body.action || "";
  const interpreted = interpretAction(rawAction);
  const reaction = classifyReaction(rawAction);
  const lowerAction = rawAction.toLowerCase();

  const flavor = {
    mentionsJump: lowerAction.includes("jump"),
    mentionsSpin: lowerAction.includes("spin") || lowerAction.includes("360"),
    mentionsNoScope: lowerAction.includes("no scope") || lowerAction.includes("noscope"),
    mentionsKick: lowerAction.includes("kick"),
    mentionsPunch: lowerAction.includes("punch"),
    mentionsStab: lowerAction.includes("stab"),
    mentionsSlash: lowerAction.includes("slash")
  };

  forgiveBartenderIfEarned(worldState, player);
  forgiveGuardRestrictionsIfEarned(player, worldState);

  clearExpiredEventIfNeeded(worldState, player.location);

  if (interpreted.type === "say") {
    const othersHere = getOtherPlayersInSameLocation(player);

    if (!interpreted.message) {
      addWorldEvent(worldState, `${player.name} opens their mouth, but says nothing.`, player.location);
    } else if (othersHere.length === 0) {
      addWorldEvent(worldState, `${player.name} says into the empty ${player.location}: "${interpreted.message}"`, player.location);
    } else {
      addWorldEvent(worldState, `${player.name} says: "${interpreted.message}"`, player.location);
    }

    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  const handledByEvent = handleActiveEventReaction(player, worldState, rawAction, reaction);
  if (handledByEvent) {
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  addWorldEvent(worldState, `${player.name} attempts: "${rawAction}"`, player.location);

  if (interpreted.type === "look") {
    const description = buildLookDescription(player, worldState);
    addWorldEvent(worldState, `${player.name} looks around.\n${description}`, player.location);
    maybeTriggerLocationEvent(worldState, player.location, player, "look");
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  if (interpreted.type === "help") {
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

NEW EVENT LOOP
- enter a place
- something may happen
- react in free text
- your reaction changes the world

TRY
- I calm the drunk down
- I tackle the thief
- I stamp out the fire
- I stop the cart
- I help the hunter`;

    addWorldEvent(worldState, `${player.name} asks for guidance.\n${helpText}`, player.location);
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  if (interpreted.type === "attack") {
  handleAttackAction(player, worldState, interpreted, flavor);}
 else if (interpreted.type === "defend") {
  handleDefendAction(player, worldState);
}
  else if (interpreted.type === "run") {
  handleRunAction(player, worldState);
}
    else if (interpreted.type === "search") {
    if (player.location !== "forest") {
      addWorldEvent(worldState, `${player.name} searches around, but finds nothing useful.`, player.location);
    } else if (!worldState.forestPotionFound) {
      player.inventory.push("Health Potion");
      worldState.forestPotionFound = true;
      addWorldEvent(worldState, `${player.name} searches the forest and finds a Health Potion.`, player.location);
    } else {
      addWorldEvent(worldState, `${player.name} searches the forest, but finds nothing new.`, player.location);
    }

    maybeTriggerLocationEvent(worldState, player.location, player, "idle");
  } else if (interpreted.type === "drink") {
    if (player.location !== "bar") {
      addWorldEvent(worldState, `${player.name} tries to drink, but there's nothing here.`, player.location);
    } else {
      const healAmount = 10;
      player.hp = Math.min(player.maxHp, player.hp + healAmount);
      updateReputation(player, { honor: 1 });

      addWorldEvent(
        worldState,
        `${player.name} enjoys a quiet drink.\nRecovers ${healAmount} HP.\nHonor +1.`,
        player.location
      );

      maybeTriggerLocationEvent(worldState, player.location, player, "idle");
    }
  } else if (interpreted.type === "eat") {
    if (player.location !== "bar") {
      addWorldEvent(worldState, `${player.name} looks for food, but finds nothing.`, player.location);
    } else {
      const healAmount = 12;
      player.hp = Math.min(player.maxHp, player.hp + healAmount);
      updateReputation(player, { honor: 1 });

      addWorldEvent(
        worldState,
        `${player.name} eats a warm meal.\nRecovers ${healAmount} HP.\nHonor +1.`,
        player.location
      );

      maybeTriggerLocationEvent(worldState, player.location, player, "idle");
    }
  } else if (interpreted.type === "threaten") {
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
  } else if (interpreted.type === "barfight") {
    if (player.location !== "bar") {
      addWorldEvent(worldState, `${player.name} looks for trouble, but no one is around.`, player.location);
    } else {
      const damage = 8;
      player.hp = Math.max(0, player.hp - damage);
      updateReputation(player, { honor: -2, chaos: 2, intimidation: 2 });

      worldState.locationStates.bar.stateFlags.barDamaged = true;
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
  } else {
    maybeTriggerLocationEvent(worldState, player.location, player, "idle");
    addWorldEvent(worldState, `The Dungeon Master does not understand ${player.name}'s action yet.`, player.location);
  }

  savePlayer(player);
  saveWorldState(worldState);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/move/:place", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  const worldState = loadWorldState();
  const destination = req.params.place;
  const location = world[player.location];

  forgiveBartenderIfEarned(worldState, player);
  forgiveGuardRestrictionsIfEarned(player, worldState);

  if (location.paths.includes(destination)) {
    const moveCheck = canEnterDestination(player, destination);

    if (!moveCheck.allowed) {
      addWorldEvent(worldState, moveCheck.message, player.location);
    } else {
      player.location = destination;
      if (destination !== "forest") {
  worldState.locationStates.forest.stateFlags.forestStayCounter = 0;
}
      addWorldEvent(worldState, `${player.name} travels to ${destination}.`, destination);
      maybeTriggerLocationEvent(worldState, destination, player, "enter");
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
  const worldState = loadWorldState();

  forgiveBartenderIfEarned(worldState, player);
  forgiveGuardRestrictionsIfEarned(player, worldState);

 restAtBar(player, worldState);

  savePlayer(player);
  saveWorldState(worldState);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/use-item/:index", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  const worldState = loadWorldState();
  const index = parseInt(req.params.index, 10);

useItem(player, worldState, index);
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