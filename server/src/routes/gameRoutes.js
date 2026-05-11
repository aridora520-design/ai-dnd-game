const fs = require("fs");
const path = require("path");
const {
  ensureActorProgression,
  recordActorAction,
  recalculateActorProgression
} = require("../systems/actorProgressionSystem");
const {
  startRenameVote,
  submitRenameProposal,
  voteForRename,
  processRenameVotes
} = require("../systems/renameVoteSystem");
const { createTimeSystem } = require("../systems/timeSystem");
const { createActionResolutionSystem } = require("../systems/actionResolutionSystem");
const { createCombatSystem } = require("../systems/combatSystem");
const { createWorldStateManager } = require("../core/worldState");
const { createRenderSystem } = require("../ui/renderSystem");
const { createItemSystem } = require("../systems/itemSystem");
const { createRestSystem } = require("../systems/restSystem");
const { createMovementSystem } = require("../systems/movementSystem");
const { createEventSystem } = require("../systems/eventSystem");
const { randomChoice, rollD20, rollDie } = require("../core/utils");
const { interpretAction } = require("../parsing/interpretAction");
const { classifyReaction } = require("../parsing/classifyReaction");
const { world, createBaseLocationState, createNewWorldState } = require("../config/worldData");
const { ensureLocationHp, damageLocation, repairLocation, isLocationDestroyed } = require("../systems/locationHpSystem");
const { updateReputation, getReputationReaction } = require("../systems/reputationSystem");
const {
  ensureIntroQuest,
  isInIntroQuest,
  handleIntroQuestAction,
  createIntroDisplayWorldState
} = require("../systems/introQuestSystem");
const { loadPlayer, savePlayer, getOtherPlayersInSameLocation } = require("../core/players");

function registerGameRoutes(app) {
  const playersFolder = path.join(__dirname, "../../players");
  const worldFilePath = path.join(__dirname, "../../world.json");

  if (!fs.existsSync(playersFolder)) {
    fs.mkdirSync(playersFolder);
  }

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
  
    player.progression = player.progression || {
      actionCounts: {}
    };
  
    player.title = player.title || "Wanderer";
    player.skills = player.skills || [];
    ensureActorProgression(player);

  }
  
function trackAction(player, actionType) {
  recordActorAction(player, actionType);
}
  
  function syncTimedWorld(worldState) {
  ensureTimeState(worldState);
  processTimedWorldChanges(worldState);

  const renameResults = processRenameVotes(worldState);

  for (const result of renameResults) {
    addWorldEvent(
      worldState,
      result.text,
      result.locationKey
    );
  }
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
  function canReachLocation(player, targetLocation) {
  return (
    player.location === targetLocation ||
    world[player.location]?.paths?.includes(targetLocation)
  );
}
function getReachableActiveRenameVoteLocation(player, worldState) {
  return Object.keys(worldState.locationStates || {}).find(locationKey => {
    const locationState = worldState.locationStates[locationKey];

    return (
      locationState.renameVote?.active &&
      canReachLocation(player, locationKey)
    );
  });
}
function rebuildDestroyedLocation({
  player,
  worldState,
  targetLocation,
  locationState,
  displayName
}) {
  const canReach = canReachLocation(player, targetLocation);

  if (!canReach) {
    addWorldEvent(
      worldState,
      `${player.name} wants to rebuild ${displayName}, but is too far away.`,
      player.location
    );

    return { success: false };
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
      `${player.name} wants to rebuild ${displayName}, but has no usable resources.`,
      player.location
    );

    return { success: false };
  }

 player.resources.gold = 0; 
  player.resources.wood = 0;
  player.resources.stone = 0;

  locationState.hp += progressValue;

  if (locationState.hp >= locationState.maxHp) {
    locationState.hp = locationState.maxHp;
    locationState.status = "stable";
    locationState.rebuildProject = null;

    addWorldEvent(worldState, `${displayName} has been rebuilt.`, targetLocation);
    startRenameVote(worldState, targetLocation, 15);

    addWorldEvent(
      worldState,
      `A public rename vote has started for ${displayName}. Players may now propose a new name.`,
      targetLocation
    );
  } else {
    locationState.status = "rebuilding";

    addWorldEvent(
      worldState,
      `${displayName} rebuild progress: ${locationState.hp}/${locationState.maxHp}`,
      targetLocation
    );
  }

  updateReputation(player, { honor: 2 });

  return { success: true };
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
    getLocationExtra,
    renderGamePage
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
    
    ensureIntroQuest(player);
  
    if (isInIntroQuest(player)) {
      const realWorldState = loadWorldState();
      const tutorialWorldState = createIntroDisplayWorldState(player, realWorldState);
      const tutorialLocation = world[player.location];
  
      const tutorialLinks = tutorialLocation.paths.map((p) =>
        `<a href="/move/${p}?player=${encodeURIComponent(playerName)}">${p}</a>`
      ).join("<br>");
  
      const tutorialEventsHtml = (player.introLog || [])
    .slice(-20)
    .reverse()
    .map(event => `<li><pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${event}</pre></li>`)
    .join("");
      savePlayer(player);
  
      return res.send(renderGamePage({
        player,
        playerName,
        worldState: tutorialWorldState,
        location: tutorialLocation,
        activeEvent: tutorialWorldState.locationStates[player.location]?.activeEvent,
        links: tutorialLinks,
        eventsHtml: tutorialEventsHtml,
        reputationReaction: getReputationReaction(player.reputation),
        formatWorldTime,
        getReputationReaction,
        mode: "tutorial",
       tutorialBanner: `
  <a class="tutorial-skip" href="/skip-tutorial?player=${encodeURIComponent(playerName)}">
    Skip Tutorial
  </a>

  <div class="tutorial-memory">
    <strong>Old Tale / Dream Memory</strong>
    <p>
      You are living through Rowan's grandfather's story. Your choices here teach how the world works,
      but the real shared world begins when you wake.
    </p>
  </div>
`
      }));
    }
  
    const worldState = loadWorldState();
    ensureLocationHp(worldState, "bar");
  
    if (player.location === "bar" && isLocationDestroyed(worldState, "bar")) {
      addWorldEvent(
        worldState,
        `${player.name} arrives at the bar, but it has been destroyed. Only charred remains stand.`,
        "bar"
      );
  
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
    .slice(0, 20)
    .map(event => `<li><pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${event}</pre></li>`)
    .join("");
  
    const reputationReaction = getReputationReaction(player.reputation);
  
    return res.send(renderGamePage({
      player,
      playerName,
      worldState,
      location,
      activeEvent,
      links,
      eventsHtml,
      reputationReaction,
      formatWorldTime,
      getReputationReaction,
      mode: "live"
    }));
  });
  
  app.post("/action", (req, res) => {
    const playerName = req.query.player;
    if (!playerName) return res.redirect("/");
  
    const player = loadPlayer(playerName);
    ensurePlayerProgression(player);
   
    ensureIntroQuest(player);
  
    // =========================
    // INTRO / DREAM TUTORIAL
    // Player-only. Does NOT touch world.json.
    // =========================
    if (isInIntroQuest(player)) {
      const rawAction = req.body.action || "";
      handleIntroQuestAction(player, rawAction);
  
      savePlayer(player);
      return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
    }
  
    const worldState = loadWorldState();
    ensureLocationHp(worldState, "bar");
  
    const rawAction = req.body.action || "";
    const interpreted = interpretAction(rawAction);
    const reaction = classifyReaction(rawAction);
    const lowerAction = rawAction.toLowerCase();
     if (
  lowerAction.startsWith("repair ") ||
  lowerAction.startsWith("rebuild ") ||
  lowerAction.includes("fix ")
) {
  interpreted.type = "repair";

  const targetText = lowerAction
    .replace("repair ", "")
    .replace("rebuild ", "")
    .replace("fix ", "")
    .trim();

  const matchedLocationKey = Object.keys(world).find(locationKey => {
    const locationName = world[locationKey]?.name || locationKey;

    return (
      targetText === locationKey ||
      targetText === locationName.toLowerCase()
    );
  });

  interpreted.target = matchedLocationKey || player.location;
}
  const titleActionMap = {
  "defend village": "title_defend_village",
  "shield ally": "title_shield_ally",
  "burn village": "title_burn_village",

  "execute": "title_execute",
  "charge attack": "title_charge_attack",
  "spare enemy": "title_spare_enemy",

  "threaten crowd": "title_threaten_crowd",
  "intimidate guard": "title_intimidate_guard",
  "protect child": "title_protect_child",

  "flee early": "title_flee_early",
  "hide": "title_hide",
  "stand and fight": "title_stand_and_fight",

  "drink more": "title_drink_more",
  "drunken swing": "title_drunken_swing",
  "sober up": "title_sober_up"
};

if (titleActionMap[lowerAction]) {
  interpreted.type = titleActionMap[lowerAction];
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
      if (lowerAction.startsWith("propose name ")) {
      const proposedName = rawAction
        .replace(/propose name/i, "")
        .trim();

      const result = submitRenameProposal(
        worldState,
        player,
        getReachableActiveRenameVoteLocation(player, worldState) || player.location,
        proposedName
      );

      addWorldEvent(worldState, result.text, player.location);

      advanceAndSync(worldState, 1, "propose-rename", player.location);
      savePlayer(player);
      saveWorldState(worldState);

      return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
    }
      if (lowerAction.startsWith("vote name ")) {

    const proposedName = rawAction
      .replace(/vote name/i, "")
      .trim();

    const result = voteForRename(
      worldState,
      player,
     getReachableActiveRenameVoteLocation(player, worldState) || player.location,
      proposedName
    );

    addWorldEvent(worldState, result.text, player.location);

    advanceAndSync(worldState, 1, "vote-rename", player.location);

    savePlayer(player);
    saveWorldState(worldState);

    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }
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
  const eventId = worldState.locationStates[player.location]?.activeEvent?.id || "";

  if (
    reaction.intent === "help" ||
    reaction.intent === "defend" ||
    lowerAction.includes("put out fire") ||
    lowerAction.includes("stop fire") ||
    lowerAction.includes("fight fire") ||
    lowerAction.includes("catch thief") ||
    lowerAction.includes("stop thief")
  ) {
    trackAction(player, "defend");
  } else if (
    reaction.intent === "talk" ||
    lowerAction.includes("calm") ||
    lowerAction.includes("settle")
  ) {
    trackAction(player, "help");
  } else if (reaction.intent === "attack") {
    trackAction(player, "attack");
  } else if (reaction.intent === "threaten") {
    trackAction(player, "threaten");
  } else if (reaction.intent === "flee") {
    trackAction(player, "run");
  }

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
    
  trackAction(player, "help");

 const currentAlert = worldState.globalState.guardsAlertLevel || 0;

if (currentAlert > 0) {
  worldState.globalState.guardsAlertLevel = Math.max(0, currentAlert - 1);

  addWorldEvent(
    worldState,
    `${player.name} helps calm the situation. The guards lower their suspicion.`,
    player.location
  );
}

  const recoveryActions = getLocationRecoveryActions(worldState, player.location);
  const recoveryHelpText = recoveryActions.length > 0
    ? `\n\nRECOVERY ACTIONS HERE\n- ${recoveryActions.join("\n- ")}`
    : "";

  const helpText = `COMMANDS
- look
- attack
- defend
- run
- search
- rest
- drink
- eat
- threaten
- repair
- rebuild bar

Helping also calms guards when they are on alert.${recoveryHelpText}`;

  addWorldEvent(
    worldState,
    `${player.name} offers help.\n${helpText}`,
    player.location
  );

  advanceAndSync(worldState, 1, "help", player.location);
  
    } else if (interpreted.type === "attack") {
      trackAction(player, "attack");
      handleAttackAction(player, worldState, interpreted, flavor);
      advanceAndSync(worldState, 1, "attack", player.location);
  
    } else if (interpreted.type === "defend") {
        trackAction(player, "defend");
      handleDefendAction(player, worldState);
      advanceAndSync(worldState, 1, "defend", player.location);
  
    } else if (interpreted.type === "run") {
        trackAction(player, "run");
      handleRunAction(player, worldState);
      advanceAndSync(worldState, 1, "run", player.location);
  
    } else if (interpreted.type === "search") {
      trackAction(player, "search");
      
      
     
  
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
      
  
      if (player.location !== "bar") {
        addWorldEvent(worldState, `${player.name} tries to drink, but there's nothing here.`, player.location);
      } else if (isLocationDestroyed(worldState, "bar")) {
        addWorldEvent(worldState, `${player.name} looks for a drink, but the bar is ruins now.`, player.location);
      } else {
        const barState = ensureLocationHp(worldState, "bar");
        const healAmount = barState.hp >= barState.maxHp ? 15 : 10;
  
        player.hp = Math.min(player.maxHp, player.hp + healAmount);
        updateReputation(player, { honor: 1 });
  
        addWorldEvent(
          worldState,
          `${player.name} enjoys a quiet drink.\nRecovers ${healAmount} HP.\nChaos +1.${barState.hp >= barState.maxHp ? "\nFull Bar Bonus: Better supplies improve recovery." : ""}`,
          player.location
        );
  
        maybeTriggerLocationEvent(worldState, player.location, player, "idle");
      }
  
      advanceAndSync(worldState, 1, "drink", player.location);
  
    } else if (interpreted.type === "eat") {
      trackAction(player, "eat");
      
      
      
  
      if (player.location !== "bar") {
        addWorldEvent(worldState, `${player.name} looks for food, but finds nothing.`, player.location);
      } else if (isLocationDestroyed(worldState, "bar")) {
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
      if (player.location !== "bar") {
        addWorldEvent(worldState, `${player.name} looks for trouble, but no one is around.`, player.location);
      } else if (isLocationDestroyed(worldState, "bar")) {
        addWorldEvent(worldState, `${player.name} looks for a bar fight, but the bar is already ruins.`, player.location);
      } else {
        const damage = 8;
        player.hp = Math.max(0, player.hp - damage);
      
        const barDamageResult = damageLocation(worldState, "bar", 25);
        addWorldEvent(worldState, barDamageResult.text, "bar");
  
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
  
        markBartenderHostile(worldState, player.name);
        player.flags.bartenderBarred = true;
  
        addWorldEvent(
          worldState,
          `${player.name} starts a bar fight!\nTakes ${damage} damage.\nChaos rises. Honor may fall if this becomes a habit.\nBartender Rowan has had enough of them.`,
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

  let targetLocation = interpreted.target || player.location;
  const contributionAmount = getRecoveryContributionAmount(interpreted);

  player.resources = player.resources || { gold: 0, wood: 0, stone: 0 };

  const targetState = worldState.locationStates[targetLocation];
  const targetName = world[targetLocation]?.name || targetLocation;

  if (!targetState) {
    addWorldEvent(
      worldState,
      `${player.name} tries to repair ${targetLocation}, but that place does not exist.`,
      player.location
    );

    advanceAndSync(worldState, 1, "repair-invalid-location", player.location);
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  const isDestroyedTarget = targetState.status === "destroyed";

  if (isDestroyedTarget && !targetState.rebuildProject) {
    targetState.rebuildProject = {
      active: true,
      progress: 0,
      required: targetState.maxHp || 100,
      type: `rebuild_${targetLocation}`
    };
  }

  if (isDestroyedTarget) {
    rebuildDestroyedLocation({
      player,
      worldState,
      targetLocation,
      locationState: targetState,
      displayName: targetName
    });

    advanceAndSync(worldState, 1, `rebuild-${targetLocation}`, player.location);
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  if (targetState.hp != null && targetState.maxHp != null && targetState.hp < targetState.maxHp) {
    const canReach = canReachLocation(player, targetLocation);

if (!canReach) {
  addWorldEvent(
    worldState,
    `${player.name} wants to repair ${targetName}, but is too far away.`,
    player.location
  );

  advanceAndSync(worldState, 1, `failed-repair-distance-${targetLocation}`, player.location);
  savePlayer(player);
  saveWorldState(worldState);
  return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
}
    targetState.hp = Math.min(targetState.maxHp, targetState.hp + contributionAmount * 10);

    if (targetState.hp >= targetState.maxHp) {
      targetState.status = "stable";
    } else {
      targetState.status = "damaged";
    }

    addWorldEvent(
      worldState,
      `${player.name} repairs ${targetName}. HP: ${targetState.hp}/${targetState.maxHp}.`,
      player.location
    );

    updateReputation(player, { honor: 1 });

    advanceAndSync(worldState, 1, `repair-${targetLocation}`, player.location);
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
      
    
  
      addWorldEvent(
        worldState,
        `${player.name} waits and watches the world move around them.`,
        player.location
      );
  
      maybeTriggerLocationEvent(worldState, player.location, player, "idle");
      spawnQueuedForestEncounterIfNeeded(worldState, player);
      advanceAndSync(worldState, 1, "wait", player.location);
      } else if (lowerAction.includes("damage outer farms")) {

  const farms = worldState.locationStates.outerfarms;

  farms.hp -= 25;

  if (farms.hp <= 0) {
    farms.hp = 0;
    farms.status = "destroyed";

    addWorldEvent(
      worldState,
      "Outer Farms has been destroyed.",
      "outerfarms"
    );
  } else {
    farms.status = "damaged";

    addWorldEvent(
      worldState,
      `Outer Farms damaged. HP: ${farms.hp}/${farms.maxHp}`,
      "outerfarms"
    );
  }

  advanceAndSync(worldState, 1, "damage-outer-farms", player.location);
  } else if (interpreted.type === "title_defend_village") {
  trackAction(player, "defend");

  worldState.locationStates.village.stateFlags.villageDefended = true;
  worldState.globalState.guardsAlertLevel = Math.max(0, (worldState.globalState.guardsAlertLevel || 0) - 1);

  addWorldEvent(
    worldState,
    `${player.name} rallies villagers and helps defend the village.\nThe village feels safer.\nHonor rises.`,
    "village"
  );

  updateReputation(player, { honor: 2 });
  advanceAndSync(worldState, 2, "defend-village", player.location);

} else if (interpreted.type === "title_burn_village") {
  trackAction(player, "barfight");

  worldState.locationStates.village.stateFlags.villageBurned = true;
  worldState.locationStates.village.stateFlags.crowdUneasy = true;
  worldState.globalState.guardsAlertLevel = (worldState.globalState.guardsAlertLevel || 0) + 5;

  addWorldEvent(
    worldState,
    `${player.name} betrays their guardian image and sets fire to part of the village.\nPanic spreads.\nGuards are now highly alert.`,
    "village"
  );

  updateReputation(player, { chaos: 5, honor: -5, intimidation: 3 });
  advanceAndSync(worldState, 3, "burn-village", player.location);

} else if (interpreted.type === "title_shield_ally") {
  trackAction(player, "defend");

  addWorldEvent(
    worldState,
    `${player.name} steps in front of danger and shields an ally.\nPeople remember the act.`,
    player.location
  );

  updateReputation(player, { honor: 2 });
  advanceAndSync(worldState, 1, "shield-ally", player.location);

} else if (interpreted.type === "title_execute") {
  trackAction(player, "attack");

  addWorldEvent(
    worldState,
    `${player.name} attempts a ruthless execution strike.`,
    player.location
  );

  handleAttackAction(player, worldState, { type: "attack", target: "goblin" }, flavor);
  updateReputation(player, { intimidation: 2, chaos: 1 });
  advanceAndSync(worldState, 1, "execute", player.location);

} else if (interpreted.type === "title_charge_attack") {
  trackAction(player, "attack");

  addWorldEvent(
    worldState,
    `${player.name} charges forward with brutal force.`,
    player.location
  );

  handleAttackAction(player, worldState, { type: "attack", target: "goblin" }, flavor);
  advanceAndSync(worldState, 1, "charge-attack", player.location);

} else if (interpreted.type === "title_spare_enemy") {
  trackAction(player, "defend");

  addWorldEvent(
    worldState,
    `${player.name} chooses mercy and spares an enemy.\nHonor rises.`,
    player.location
  );

  updateReputation(player, { honor: 3, chaos: -1 });
  advanceAndSync(worldState, 1, "spare-enemy", player.location);

} else if (interpreted.type === "title_threaten_crowd") {
  trackAction(player, "threaten");

  worldState.globalState.guardsAlertLevel = (worldState.globalState.guardsAlertLevel || 0) + 2;

  addWorldEvent(
    worldState,
    `${player.name} threatens the crowd.\nPeople back away in fear.\nThe guards take notice.`,
    player.location
  );

  updateReputation(player, { intimidation: 3, chaos: 2, honor: -2 });
  advanceAndSync(worldState, 1, "threaten-crowd", player.location);

} else if (interpreted.type === "title_intimidate_guard") {
  trackAction(player, "threaten");

  worldState.globalState.guardsAlertLevel = (worldState.globalState.guardsAlertLevel || 0) + 3;

  addWorldEvent(
    worldState,
    `${player.name} tries to intimidate a guard.\nThe guard does not forget it.`,
    player.location
  );

  updateReputation(player, { intimidation: 4, chaos: 2, honor: -2 });
  advanceAndSync(worldState, 1, "intimidate-guard", player.location);

} else if (interpreted.type === "title_protect_child") {
  trackAction(player, "defend");

  addWorldEvent(
    worldState,
    `${player.name} protects a frightened child despite their menacing reputation.\nThe crowd is stunned.`,
    player.location
  );

  updateReputation(player, { honor: 4, chaos: -2 });
  advanceAndSync(worldState, 1, "protect-child", player.location);

} else if (interpreted.type === "title_flee_early") {
  trackAction(player, "run");

  addWorldEvent(
    worldState,
    `${player.name} flees before danger fully arrives.`,
    player.location
  );

  handleRunAction(player, worldState);
  advanceAndSync(worldState, 1, "flee-early", player.location);

} else if (interpreted.type === "title_hide") {
  trackAction(player, "run");

  addWorldEvent(
    worldState,
    `${player.name} hides and avoids attention.`,
    player.location
  );

  advanceAndSync(worldState, 1, "hide", player.location);

} else if (interpreted.type === "title_stand_and_fight") {
  trackAction(player, "attack");

  addWorldEvent(
    worldState,
    `${player.name} fights against their fear and stands their ground.`,
    player.location
  );

  updateReputation(player, { honor: 2 });
  handleAttackAction(player, worldState, { type: "attack", target: "goblin" }, flavor);
  advanceAndSync(worldState, 1, "stand-and-fight", player.location);

} else if (interpreted.type === "title_drink_more") {
  trackAction(player, "drink");

  player.hp = Math.min(player.maxHp, player.hp + 5);

  addWorldEvent(
    worldState,
    `${player.name} drinks even more.\nSomehow, they recover 5 HP.`,
    player.location
  );

  updateReputation(player, { chaos: 1 });
  advanceAndSync(worldState, 1, "drink-more", player.location);

} else if (interpreted.type === "title_drunken_swing") {
  trackAction(player, "attack");

  addWorldEvent(
    worldState,
    `${player.name} throws a reckless drunken swing.`,
    player.location
  );

  handleAttackAction(player, worldState, { type: "attack", target: "goblin" }, flavor);
  advanceAndSync(worldState, 1, "drunken-swing", player.location);

} else if (interpreted.type === "title_sober_up") {
  trackAction(player, "defend");

  addWorldEvent(
    worldState,
    `${player.name} forces themselves to sober up and act responsibly.`,
    player.location
  );

  updateReputation(player, { honor: 2, chaos: -2 });
  advanceAndSync(worldState, 1, "sober-up", player.location);
    } else {
      maybeTriggerLocationEvent(worldState, player.location, player, "idle");
      addWorldEvent(worldState, `The Dungeon Master does not understand ${player.name}'s action yet.`, player.location);
      advanceAndSync(worldState, 1, "unknown-action", player.location);
    }
  
    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  });
  
  app.get("/move/:place", (req, res) => {
    const playerName = req.query.player;
    if (!playerName) return res.redirect("/");
  
    const player = loadPlayer(playerName);
    ensurePlayerProgression(player);
    
    
  
  
  ensureIntroQuest(player);
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
    
  
  
  ensureIntroQuest(player);
  
  if (isInIntroQuest(player)) {
    const realWorldState = loadWorldState();
    const tutorialWorldState = createIntroDisplayWorldState(player, realWorldState);
  
    const tutorialLocation = world[player.location];
  
    const tutorialLinks = tutorialLocation.paths.map((p) =>
      `<a href="/move/${p}?player=${encodeURIComponent(playerName)}">${p}</a>`
    ).join("<br>");
  
    const tutorialEventsHtml = (player.introLog || [])
    .slice(-20)
    .reverse()
    .map(event => `<li><pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${event}</pre></li>`)
    .join("");
  
    savePlayer(player);
  
    return res.send(renderGamePage({
      player,
      playerName,
      worldState: tutorialWorldState,
      location: tutorialLocation,
      activeEvent: tutorialWorldState.locationStates[player.location]?.activeEvent,
      links: tutorialLinks,
      eventsHtml: tutorialEventsHtml,
      reputationReaction: getReputationReaction(player.reputation),
      formatWorldTime,
      getReputationReaction,
      mode: "tutorial",
   tutorialBanner: `
  <a class="tutorial-skip" href="/skip-tutorial?player=${encodeURIComponent(playerName)}">
    Skip Tutorial
  </a>

  <div class="tutorial-memory">
    <strong>Old Tale / Dream Memory</strong>
    <p>
      You are living through Rowan's grandfather's story. Your choices here teach how the world works,
      but the real shared world begins when you wake.
    </p>
  </div>
`
    }));
  }
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
    
  
  ensureIntroQuest(player);
  
  if (isInIntroQuest(player)) {
    const realWorldState = loadWorldState();
    const tutorialWorldState = createIntroDisplayWorldState(player, realWorldState);
  
    const tutorialLocation = world[player.location];
  
    const tutorialLinks = tutorialLocation.paths.map((p) =>
      `<a href="/move/${p}?player=${encodeURIComponent(playerName)}">${p}</a>`
    ).join("<br>");
  
    const tutorialEventsHtml = (player.introLog || [])
    .slice(-20)
    .reverse()
    .map(event => `<li><pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${event}</pre></li>`)
    .join("");
  
    savePlayer(player);
  
    return res.send(renderGamePage({
      player,
      playerName,
      worldState: tutorialWorldState,
      location: tutorialLocation,
      activeEvent: tutorialWorldState.locationStates[player.location]?.activeEvent,
      links: tutorialLinks,
      eventsHtml: tutorialEventsHtml,
      reputationReaction: getReputationReaction(player.reputation),
      formatWorldTime,
      getReputationReaction,
      mode: "tutorial",
    tutorialBanner: `
  <a class="tutorial-skip" href="/skip-tutorial?player=${encodeURIComponent(playerName)}">
    Skip Tutorial
  </a>

  <div class="tutorial-memory">
    <strong>Old Tale / Dream Memory</strong>
    <p>
      You are living through Rowan's grandfather's story. Your choices here teach how the world works,
      but the real shared world begins when you wake.
    </p>
  </div>
`
    }));
  }
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
  app.get("/skip-tutorial", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  ensurePlayerProgression(player);

  player.flags = player.flags || {};
  player.flags.completedIntroQuest = true;

  player.instance = null;
  player.introLog = [];
  player.location = "village";

  savePlayer(player);

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
}
module.exports = { registerGameRoutes };