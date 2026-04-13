const express = require("express");
const fs = require("fs");
const path = require("path");
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
console.log("world import test:", world);
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

if (!fs.existsSync(playersFolder)) {
  fs.mkdirSync(playersFolder);
}


function ensureWorldShape(worldState) {
  if (!worldState.eventLog) {
    worldState.eventLog = ["The world begins. The village waits in silence."];
  }

  if (worldState.goblinAlive === undefined) worldState.goblinAlive = true;
  if (worldState.goblinHp === undefined) worldState.goblinHp = 40;
  if (worldState.goblinCorpses === undefined) worldState.goblinCorpses = 0;
  if (worldState.forestPotionFound === undefined) worldState.forestPotionFound = false;

  if (!worldState.locationStates) {
    worldState.locationStates = {};
  }

  for (const key of Object.keys(world)) {
    if (!worldState.locationStates[key]) {
      worldState.locationStates[key] = createBaseLocationState();
    }

    const loc = worldState.locationStates[key];
    if (!loc.recentHistory) loc.recentHistory = [];
    if (!loc.npcs) loc.npcs = [];
    if (!loc.stateFlags) loc.stateFlags = {};
    if (loc.activeEvent === undefined) loc.activeEvent = null;
  }

  const village = worldState.locationStates.village;
  const bar = worldState.locationStates.bar;
  const street = worldState.locationStates.street;
  const forest = worldState.locationStates.forest;

  if (village.npcs.length === 0) village.npcs = ["Old Villager", "Worried Farmer", "Passing Guard"];
  if (bar.npcs.length === 0) bar.npcs = ["Bartender Rowan", "Drunk Patron", "Traveling Merchant", "Hooded Stranger"];
  if (street.npcs.length === 0) street.npcs = ["Town Guard", "Cart Driver", "Beggar"];
  if (forest.npcs.length === 0) forest.npcs = ["Goblin"];

  if (village.stateFlags.crowdUneasy === undefined) village.stateFlags.crowdUneasy = false;
  if (village.stateFlags.hunterSavedRumor === undefined) village.stateFlags.hunterSavedRumor = false;
  if (village.stateFlags.hunterAbandonedRumor === undefined) village.stateFlags.hunterAbandonedRumor = false;
  if (village.stateFlags.tavernTroubleRumor === undefined) village.stateFlags.tavernTroubleRumor = false;

  if (bar.stateFlags.barDamaged === undefined) bar.stateFlags.barDamaged = false;
  if (bar.stateFlags.barOnFire === undefined) bar.stateFlags.barOnFire = false;
  if (bar.stateFlags.thiefActive === undefined) bar.stateFlags.thiefActive = false;
  if (!Array.isArray(bar.stateFlags.bartenderHostileTo)) bar.stateFlags.bartenderHostileTo = [];
  if (bar.stateFlags.guardsWatchingBar === undefined) bar.stateFlags.guardsWatchingBar = false;

  if (street.stateFlags.cartCrashed === undefined) street.stateFlags.cartCrashed = false;
  if (street.stateFlags.guardsAlert === undefined) street.stateFlags.guardsAlert = false;

 if (forest.stateFlags.woundedHunterPresent === undefined) forest.stateFlags.woundedHunterPresent = false;
if (forest.stateFlags.goblinReinforcementsIncoming === undefined) forest.stateFlags.goblinReinforcementsIncoming = false;
if (forest.stateFlags.forestDanger === undefined) forest.stateFlags.forestDanger = 0;
if (forest.stateFlags.reinforcementAmbushPending === undefined) forest.stateFlags.reinforcementAmbushPending = false;
if (forest.stateFlags.forestStayCounter === undefined) forest.stateFlags.forestStayCounter = 0;
if (forest.stateFlags.forestSpawnCooldown === undefined) forest.stateFlags.forestSpawnCooldown = 0;
if (forest.stateFlags.lastForestEventType === undefined) forest.stateFlags.lastForestEventType = null;

  if (!worldState.globalState) {
    worldState.globalState = {};
  }

  if (worldState.globalState.villagersOnEdge === undefined) worldState.globalState.villagersOnEdge = false;
  if (worldState.globalState.recentViolence === undefined) worldState.globalState.recentViolence = 0;
  if (worldState.globalState.guardsAlertLevel === undefined) worldState.globalState.guardsAlertLevel = 0;
  if (worldState.globalState.hunterSavedBy === undefined) worldState.globalState.hunterSavedBy = null;
  if (worldState.globalState.hunterAbandonedBy === undefined) worldState.globalState.hunterAbandonedBy = null;

  return worldState;
}

function loadWorldState() {
  if (fs.existsSync(worldFilePath)) {
    return ensureWorldShape(JSON.parse(fs.readFileSync(worldFilePath, "utf8")));
  }

  const newWorld = createNewWorldState();
  fs.writeFileSync(worldFilePath, JSON.stringify(newWorld, null, 2));
  return newWorld;
}

function saveWorldState(worldState) {
  fs.writeFileSync(worldFilePath, JSON.stringify(ensureWorldShape(worldState), null, 2));
}

function addWorldEvent(worldState, message, locationKey = null) {
  worldState.eventLog.unshift(message);

  if (worldState.eventLog.length > 40) {
    worldState.eventLog.pop();
  }

  if (locationKey && worldState.locationStates[locationKey]) {
    const history = worldState.locationStates[locationKey].recentHistory;
    history.unshift(message);
    if (history.length > 10) {
      history.pop();
    }
  }

  saveWorldState(worldState);
}


function getAttackFlavor(outcome) {
  const options = {
    hit: [
      "Clean hit. Not elegant, but effective.",
      "That landed with conviction.",
      "The goblin regrets being in range."
    ],
    kill: [
      "The goblin drops. The forest gets quieter for a moment.",
      "Problem solved. Subtlety was not involved.",
      "A decisive finish."
    ],
    miss: [
      "A bold attempt. Accuracy remains theoretical.",
      "You commit fully. The hit does not.",
      "The goblin survives, unfortunately encouraged."
    ]
  };

  const pool = options[outcome] || ["Something happened."];
  return randomChoice(pool);
}


function narrateAttackIntro(style, flavor) {
  if (style === "ranged" && flavor.isTrickShot) {
    if (flavor.mentionsJump && flavor.mentionsSpin) {
      return "You launch yourself into the air and commit to a spinning shot.";
    }
    if (flavor.mentionsNoScope) {
      return "You attempt a ridiculous no-scope shot with more confidence than caution.";
    }
    return "You attempt a reckless trick shot, trusting style and instinct.";
  }

  if (style === "ranged") {
    return randomChoice([
      "You steady yourself and line up a ranged attack.",
      "You draw carefully and prepare to fire.",
      "You shift your footing and aim at the goblin."
    ]);
  }

  if (flavor.mentionsKick) {
    return "You rush in, chambering a kick as you close the distance.";
  }
  if (flavor.mentionsPunch) {
    return "You tighten your fists and drive forward into close combat.";
  }
  if (flavor.mentionsStab) {
    return "You lunge forward, trying to stab through an opening.";
  }
  if (flavor.mentionsSlash) {
    return "You sweep in with a slashing attack.";
  }

  return randomChoice([
    "You rush the goblin and commit to close combat.",
    "You step in hard, ready to strike at melee range.",
    "You close the distance and attack with force."
  ]);
}

function narratePlayerHit(style, damage, flavor) {
  if (style === "ranged" && flavor.isTrickShot) {
    if (flavor.mentionsNoScope) {
      return `Against all reason, your no-scope shot lands for ${damage} damage.`;
    }
    if (flavor.mentionsJump && flavor.mentionsSpin) {
      return `Mid-spin, you release perfectly, and the shot crashes into the goblin for ${damage} damage.`;
    }
    return `Your reckless trick shot somehow connects for ${damage} damage.`;
  }

  if (style === "ranged") {
    return `Your shot strikes the goblin for ${damage} damage.`;
  }

  if (flavor.mentionsKick) {
    return `Your kick slams into the target for ${damage} damage.`;
  }
  if (flavor.mentionsPunch) {
    return `Your punch lands cleanly and deals ${damage} damage.`;
  }
  if (flavor.mentionsStab) {
    return `You drive the stab home and deal ${damage} damage.`;
  }
  if (flavor.mentionsSlash) {
    return `Your slash cuts across the target for ${damage} damage.`;
  }

  return `You strike for ${damage} damage.`;
}

function narratePlayerMiss(style, flavor) {
  if (style === "ranged" && flavor.isTrickShot) {
    return "The trick shot looks spectacular, but fails to connect.";
  }

  if (style === "ranged") {
    return "Your shot misses as the target jerks out of the way.";
  }

  if (flavor.mentionsKick) {
    return "Your kick cuts through empty air.";
  }
  if (flavor.mentionsPunch) {
    return "You throw the punch, but the target slips away.";
  }
  if (flavor.mentionsStab) {
    return "Your stab goes wide.";
  }
  if (flavor.mentionsSlash) {
    return "Your slash misses.";
  }

  return "You miss.";
}

function narrateCriticalHit(style, damage, flavor) {
  if (style === "ranged" && flavor.isTrickShot) {
    return `Somehow, your impossible trick shot becomes a devastating critical hit for ${damage} damage.`;
  }

  return `A critical hit lands for ${damage} damage.`;
}

function narrateCriticalFail(style, flavor) {
  if (style === "ranged" && flavor.isTrickShot) {
    return "Your flashy move collapses into a complete disaster.";
  }

  return "Your attack goes badly wrong.";
}

function narrateGoblinAttackHit(damage) {
  return `The goblin strikes back and hits for ${damage} damage.`;
}

function narrateGoblinAttackMiss() {
  return "The goblin strikes back, but misses.";
}

function narrateDefendSuccess() {
  return "You brace perfectly and turn the attack aside.";
}

function narrateDefendPartial(damage) {
  return `You block most of it, but still lose ${damage} HP.`;
}

function narrateRunSuccess() {
  return "You break away and escape to the street.";
}

function narrateRunFail(damage) {
  return `You fail to escape, and the goblin clips you for ${damage} damage.`;
}

function narrateDeath() {
  return "You collapse as the fight finally overwhelms you.";
}

function narrateRespawn() {
  return "You awaken in the village, restored to full health.";
}

function handlePlayerDeath(player, worldState) {
  addWorldEvent(worldState, `${player.name} falls in battle.`, player.location);
  player.location = "village";
  player.hp = player.maxHp;
  addWorldEvent(worldState, `${player.name} awakens in the village, restored to full health.`, "village");
  savePlayer(player);
  saveWorldState(worldState);
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

function resolveForestHostileEvent(player, worldState, locationKey, eventObj, config) {
  if (reactionIntentIsAttackLike(config.reactionIntent)) {
    const check = resolveCheck({
      bonus: player.stats.strength + player.stats.dexterity,
      dc: config.dc
    });

    if (check.tier === "great" || check.tier === "success") {
      updateReputation(player, { intimidation: config.intimidationReward || 1, chaos: config.chaosReward || 1 });

      finishForestEncounter(worldState, {
        corpses: config.corpsesOnWin || 1,
        dangerDelta: config.dangerRelief !== undefined ? -config.dangerRelief : 0,
        clearReinforcementPending: !!config.clearReinforcementPending,
        cooldownTurns: config.cooldownTurnsOnWin ?? 2
      });

      addWorldEvent(
        worldState,
        `${player.name} ${config.winText}`,
        locationKey
      );

      closeActiveEvent(worldState, locationKey);
      return true;
    }

    const damage = check.tier === "mixed" ? config.damageOnMixed : config.damageOnFail;
    player.hp = Math.max(0, player.hp - damage);

    finishForestEncounter(worldState, {
      dangerDelta: config.dangerRiseOnFail ?? 1,
      clearReinforcementPending: false,
      cooldownTurns: config.cooldownTurnsOnFail ?? 1
    });

    addWorldEvent(
      worldState,
      `${player.name} ${check.tier === "mixed" ? config.mixedText : config.failText} They take ${damage} damage.`,
      locationKey
    );

    if (player.hp <= 0) {
      addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, locationKey);
      handlePlayerDeath(player, worldState);
    }

    closeActiveEvent(worldState, locationKey);
    return true;
  }

  if (config.reactionIntent === "defend" || config.reactionIntent === "help") {
    const check = resolveCheck({
      bonus: player.stats.defense + 2,
      dc: config.defendDc || (config.dc - 1)
    });

    if (check.tier === "great" || check.tier === "success") {
      updateReputation(player, { honor: 2 });

      finishForestEncounter(worldState, {
        dangerDelta: config.defendDangerRelief ? -config.defendDangerRelief : 0,
        clearReinforcementPending: !!config.clearReinforcementPending,
        cooldownTurns: config.cooldownTurnsOnDefend ?? 2
      });

      addWorldEvent(
        worldState,
        `${player.name} ${config.defendWinText}`,
        locationKey
      );

      closeActiveEvent(worldState, locationKey);
      return true;
    }

    const damage = config.damageOnDefendFail ?? 6;
    player.hp = Math.max(0, player.hp - damage);

    finishForestEncounter(worldState, {
      dangerDelta: 1,
      cooldownTurns: 1
    });

    addWorldEvent(
      worldState,
      `${player.name} ${config.defendFailText} They take ${damage} damage.`,
      locationKey
    );

    if (player.hp <= 0) {
      addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, locationKey);
      handlePlayerDeath(player, worldState);
    }

    closeActiveEvent(worldState, locationKey);
    return true;
  }

  if (config.reactionIntent === "flee") {
    const check = resolveCheck({
      bonus: player.stats.dexterity + 1,
      dc: config.fleeDc || 12
    });

    if (check.tier === "great" || check.tier === "success") {
      player.location = "street";

      finishForestEncounter(worldState, {
        clearReinforcementPending: !!config.clearReinforcementPending,
        cooldownTurns: 2
      });

      addWorldEvent(
        worldState,
        `${player.name} ${config.fleeWinText}`,
        "forest"
      );

      closeActiveEvent(worldState, "forest");
      return true;
    }

    const damage = config.damageOnFleeFail ?? 7;
    player.hp = Math.max(0, player.hp - damage);

    finishForestEncounter(worldState, {
      dangerDelta: 1,
      cooldownTurns: 1
    });

    addWorldEvent(
      worldState,
      `${player.name} ${config.fleeFailText} They take ${damage} damage.`,
      locationKey
    );

    if (player.hp <= 0) {
      addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, locationKey);
      handlePlayerDeath(player, worldState);
    }

    closeActiveEvent(worldState, locationKey);
    return true;
  }

  const damage = config.damageOnHesitation ?? 8;
  player.hp = Math.max(0, player.hp - damage);

  finishForestEncounter(worldState, {
    dangerDelta: 1,
    cooldownTurns: 1
  });

  addWorldEvent(
    worldState,
    `${player.name} hesitates and loses the initiative. They take ${damage} damage.`,
    locationKey
  );

  if (player.hp <= 0) {
    addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, locationKey);
    handlePlayerDeath(player, worldState);
  }

  closeActiveEvent(worldState, locationKey);
  return true;
}

function reactionIntentIsAttackLike(intent) {
  return intent === "attack";
}



function resolveCheck({ bonus = 0, dc = 12 }) {
  const roll = rollD20();
  const total = roll + bonus;

  let tier = "fail";
  if (roll === 20 || total >= dc + 5) tier = "great";
  else if (total >= dc) tier = "success";
  else if (total >= dc - 2) tier = "mixed";

  return { roll, total, dc, tier };
}

function handleGuardQuestionCommon(player, worldState, locationKey, eventObj, reaction, flavorText) {
  if (reaction.intent === "talk") {
    const check = resolveCheck({
      bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
      dc: 13
    });

    if (check.tier === "great" || check.tier === "success") {
      updateReputation(player, { honor: 1 });
      worldState.globalState.guardsAlertLevel = Math.max(0, worldState.globalState.guardsAlertLevel - 1);
      addWorldEvent(
        worldState,
        `${player.name} answers steadily. The guard ${flavorText.success}`,
        locationKey
      );
      closeActiveEvent(worldState, locationKey);
      return true;
    }

    if (check.tier === "mixed") {
      worldState.globalState.guardsAlertLevel += 1;
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      addWorldEvent(
        worldState,
        `${player.name} only half-sells the explanation. The guard ${flavorText.mixed}`,
        locationKey
      );
      closeActiveEvent(worldState, locationKey);
      return true;
    }

    worldState.globalState.guardsAlertLevel += 1;
    worldState.locationStates.street.stateFlags.guardsAlert = true;
    banPlayerFromGuardZones(player, worldState, locationKey);
    addWorldEvent(
      worldState,
      `${player.name}'s explanation collapses. The guard ${flavorText.fail}`,
      locationKey
    );
    closeActiveEvent(worldState, locationKey);
    return true;
  }

  if (reaction.intent === "threaten" || reaction.intent === "attack") {
    updateReputation(player, { chaos: 2, intimidation: 2 });
    banPlayerFromGuardZones(player, worldState, locationKey);
    addWorldEvent(
      worldState,
      `${player.name} turns hostile toward the guard. That ends badly for future freedom of movement.`,
      locationKey
    );

    if (locationKey === "bar" || locationKey === "street") {
      player.location = "village";
      addWorldEvent(
        worldState,
        `${player.name} is forced back toward the village under guard pressure.`,
        "village"
      );
    }

    closeActiveEvent(worldState, locationKey);
    return true;
  }

  if (reaction.intent === "observe" || reaction.intent === "flee") {
    worldState.globalState.guardsAlertLevel += 1;
    worldState.locationStates.street.stateFlags.guardsAlert = true;
    addWorldEvent(
      worldState,
      `${player.name} gives the guards exactly the kind of evasive behavior they were worried about.`,
      locationKey
    );
    closeActiveEvent(worldState, locationKey);
    return true;
  }

  addWorldEvent(worldState, `${player.name} hesitates while the guard waits for an answer.`, locationKey);
  return true;
}

function handleActiveEventReaction(player, worldState, rawAction, reaction) {
  const locationKey = player.location;
  const locState = worldState.locationStates[locationKey];
  if (!locState || !locState.activeEvent) return false;

  const eventObj = locState.activeEvent;

  if (eventObj.id === "bar_drunk_accusation") {
    if (reaction.intent === "talk") {
      const check = resolveCheck({
        bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
        dc: 12
      });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });
        addWorldEvent(
          worldState,
          `${player.name} gets between them with a steady voice. The drunk grumbles, but the merchant backs off and the moment cools.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (check.tier === "mixed") {
        updateReputation(player, { honor: 1 });
        addWorldEvent(
          worldState,
          `${player.name} nearly settles it, but the drunk shoves the merchant anyway. The tension snaps.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      updateReputation(player, { chaos: 1 });
      addWorldEvent(
        worldState,
        `${player.name}'s attempt to calm things down fails. The accusation turns ugly fast.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "attack" || reaction.intent === "threaten") {
      updateReputation(player, { chaos: 1, intimidation: 1 });
      markBartenderHostile(worldState, player.name);
      player.flags.bartenderBarred = true;
      addWorldEvent(
        worldState,
        `${player.name} escalates the confrontation. The room tips from argument into violence. Rowan will remember this.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "observe" || reaction.intent === "flee") {
      addWorldEvent(
        worldState,
        `${player.name} hangs back. No one steps in before fists start flying.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    addWorldEvent(worldState, `${player.name} hesitates while the accusation boils over.`, locationKey);
    return true;
  }

  if (eventObj.id === "bar_brawl") {
    if (reaction.intent === "talk") {
      const check = resolveCheck({
        bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
        dc: 13
      });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });
        addWorldEvent(
          worldState,
          `${player.name} cuts through the chaos with a commanding voice. Somehow, the worst of the fight breaks apart.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (check.tier === "mixed") {
        const damage = 4;
        player.hp = Math.max(0, player.hp - damage);
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        updateReputation(player, { honor: 1 });
        addWorldEvent(
          worldState,
          `${player.name} nearly restores order, but catches a bottle for ${damage} damage. The noise spills out into the street.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      worldState.locationStates.bar.stateFlags.barDamaged = true;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      updateReputation(player, { chaos: 1 });
      markBartenderHostile(worldState, player.name);
      player.flags.bartenderBarred = true;

      addWorldEvent(
        worldState,
        `${player.name} fails to calm the brawl. Furniture breaks, people shout, and someone has clearly sent for the guards. Rowan blames ${player.name}.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "attack" || reaction.intent === "defend" || reaction.intent === "help") {
      const bonus =
        reaction.intent === "attack"
          ? player.stats.strength
          : reaction.intent === "defend"
            ? player.stats.defense + 1
            : player.stats.strength;

      const check = resolveCheck({ bonus, dc: 12 });

      if (check.tier === "great" || check.tier === "success") {
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        if (reaction.intent === "attack") {
          updateReputation(player, { intimidation: 2, chaos: 1 });
          markBartenderHostile(worldState, player.name);
          player.flags.bartenderBarred = true;
          addWorldEvent(
            worldState,
            `${player.name} crashes into the melee and forces it to end the hard way. But the bar is wrecked, the street heard everything, and Rowan blames them.`,
            locationKey
          );
        } else {
          updateReputation(player, { honor: 2 });
          addWorldEvent(
            worldState,
            `${player.name} throws themselves into the chaos and keeps it from getting worse, but the damage is already done.`,
            locationKey
          );
        }

        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      const damage = 6;
      player.hp = Math.max(0, player.hp - damage);
      worldState.locationStates.bar.stateFlags.barDamaged = true;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      updateReputation(player, { chaos: 1, intimidation: 1 });
      markBartenderHostile(worldState, player.name);
      player.flags.bartenderBarred = true;

      addWorldEvent(
        worldState,
        `${player.name} gets swallowed by the bar brawl and takes ${damage} damage. The guards are definitely getting involved now, and Rowan is done with them.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "observe" || reaction.intent === "flee") {
      worldState.locationStates.bar.stateFlags.barDamaged = true;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      updateReputation(player, { honor: -1 });
      addWorldEvent(
        worldState,
        `${player.name} backs off while the bar tears itself apart. The disturbance spills toward the street.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    addWorldEvent(worldState, `${player.name} reacts awkwardly, but the fight only grows louder.`, locationKey);
    return true;
  }

  if (eventObj.id === "bar_thief") {
    if (reaction.intent === "attack" || reaction.intent === "help") {
      const statBonus = reaction.intent === "attack" ? player.stats.dexterity : player.stats.dexterity + 1;
      const check = resolveCheck({ bonus: statBonus, dc: 13 });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });
        worldState.locationStates.bar.stateFlags.thiefActive = false;
        addWorldEvent(
          worldState,
          `${player.name} cuts off the thief before they reach the door and recovers the stolen purse.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (check.tier === "mixed") {
        updateReputation(player, { honor: 1 });
        worldState.locationStates.bar.stateFlags.thiefActive = false;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} almost catches the thief, but the chase spills into the street.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      updateReputation(player, { chaos: 1 });
      worldState.locationStates.bar.stateFlags.thiefActive = false;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      addWorldEvent(
        worldState,
        `${player.name} lunges too late. The thief bursts outside into the street.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "talk" || reaction.intent === "threaten") {
      const bonus = reaction.intent === "talk" ? player.stats.presence : player.stats.presence + 1;
      const check = resolveCheck({ bonus, dc: 14 });

      if (check.tier === "great") {
        updateReputation(player, { intimidation: 2 });
        worldState.locationStates.bar.stateFlags.thiefActive = false;
        addWorldEvent(
          worldState,
          `${player.name}'s voice freezes the thief for one fatal second. The purse is recovered.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      addWorldEvent(
        worldState,
        `${player.name} shouts after the thief, but momentum wins. The chase spills outside.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "mixed");
      return true;
    }

    if (reaction.intent === "observe" || reaction.intent === "flee") {
      worldState.locationStates.bar.stateFlags.thiefActive = false;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      updateReputation(player, { honor: -1 });
      addWorldEvent(
        worldState,
        `${player.name} lets the moment pass. The thief escapes into the street.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    addWorldEvent(worldState, `${player.name} hesitates while the thief makes their move.`, locationKey);
    return true;
  }

  if (eventObj.id === "bar_fire") {
    if (reaction.intent === "help" || reaction.intent === "defend") {
      const check = resolveCheck({ bonus: player.stats.defense + 1, dc: 12 });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });
        worldState.locationStates.bar.stateFlags.barOnFire = false;
        addWorldEvent(
          worldState,
          `${player.name} beats down the first flames before they can spread.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (check.tier === "mixed") {
        const damage = 5;
        player.hp = Math.max(0, player.hp - damage);
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} slows the flames, but takes ${damage} damage as the fire spreads farther into the room.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      const damage = 8;
      player.hp = Math.max(0, player.hp - damage);
      worldState.locationStates.bar.stateFlags.barDamaged = true;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
      markBartenderHostile(worldState, player.name);
      player.flags.bartenderBarred = true;

      addWorldEvent(
        worldState,
        `${player.name} rushes the flames and gets burned for ${damage} damage. The fire spreads, and Rowan does not forget the chaos around them.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "observe" || reaction.intent === "flee") {
      worldState.locationStates.bar.stateFlags.barDamaged = true;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
      markBartenderHostile(worldState, player.name);
      player.flags.bartenderBarred = true;

      addWorldEvent(
        worldState,
        `${player.name} backs away as the first flames spread across the bar. Rowan will remember that.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    addWorldEvent(worldState, `${player.name} reacts, but the fire keeps demanding action.`, locationKey);
    return true;
  }

  if (eventObj.id === "bar_fire_spreading") {
    if (reaction.intent === "help" || reaction.intent === "defend") {
      const check = resolveCheck({ bonus: player.stats.defense + 1, dc: 14 });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });
        worldState.locationStates.bar.stateFlags.barOnFire = false;
        worldState.locationStates.bar.stateFlags.barDamaged = true;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} finally gets the spreading fire under control, but the bar is left blackened and damaged.`,
          locationKey
        );
        closeActiveEvent(worldState, locationKey);
        return true;
      }

      worldState.locationStates.bar.stateFlags.barOnFire = false;
      worldState.locationStates.bar.stateFlags.barDamaged = true;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
      markBartenderHostile(worldState, player.name);
      player.flags.bartenderBarred = true;

      addWorldEvent(
        worldState,
        `${player.name} cannot stop the damage in time. The flames are put out eventually, but the bar is left badly damaged and Rowan holds a grudge.`,
        locationKey
      );
      closeActiveEvent(worldState, locationKey);
      return true;
    }

    worldState.locationStates.bar.stateFlags.barOnFire = false;
    worldState.locationStates.bar.stateFlags.barDamaged = true;
    worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
    markBartenderHostile(worldState, player.name);
    player.flags.bartenderBarred = true;

    addWorldEvent(
      worldState,
      `${player.name} fails to act while the fire spreads. The bar survives, but only barely. Rowan does not want them resting here again anytime soon.`,
      locationKey
    );
    closeActiveEvent(worldState, locationKey);
    return true;
  }

  if (eventObj.id === "bar_guard_question") {
    return handleGuardQuestionCommon(player, worldState, locationKey, eventObj, reaction, {
      success: "relaxes slightly and lets the matter go.",
      mixed: "does not arrest you, but definitely makes a note of you.",
      fail: "signals to others. You're now a problem to be managed."
    });
  }

  if (eventObj.id === "street_guard_response") {
    if (reaction.intent === "talk") {
      const check = resolveCheck({
        bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
        dc: 13
      });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 1 });
        addWorldEvent(
          worldState,
          `${player.name} explains the situation well enough that the guards calm down and focus on restoring order.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (check.tier === "mixed") {
        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} only half-convinces the guards. They tighten their grip on the street.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      addWorldEvent(
        worldState,
        `${player.name}'s explanation falls apart. The guards move into crackdown mode.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "threaten" || reaction.intent === "attack") {
      updateReputation(player, { chaos: 2, intimidation: 2 });
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;
      banPlayerFromGuardZones(player, worldState, locationKey);

      addWorldEvent(
        worldState,
        `${player.name} meets the guards with hostility. The whole street locks down, and their access to the street and bar is cut off.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    worldState.locationStates.street.stateFlags.guardsAlert = true;
    worldState.globalState.guardsAlertLevel += 1;
    worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

    addWorldEvent(worldState, `${player.name} hesitates while the guards take control of the scene.`, locationKey);
    advanceEventChain(worldState, locationKey, eventObj, "ignore");
    return true;
  }

  if (eventObj.id === "street_chase") {
    if (reaction.intent === "attack" || reaction.intent === "help") {
      const check = resolveCheck({ bonus: player.stats.dexterity + 1, dc: 13 });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });
        addWorldEvent(
          worldState,
          `${player.name} catches the thief in the street and ends the chase.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (check.tier === "mixed") {
        updateReputation(player, { honor: 1 });
        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;
        worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

        addWorldEvent(
          worldState,
          `${player.name} nearly stops the thief, but the commotion draws guard attention.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      updateReputation(player, { chaos: 1 });
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      addWorldEvent(
        worldState,
        `${player.name} loses the thief in the chaos. A guard steps in to question what happened.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "observe" || reaction.intent === "flee") {
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;
      worldState.locationStates.village.stateFlags.tavernTroubleRumor = true;

      addWorldEvent(
        worldState,
        `${player.name} watches the thief vanish into the street traffic. Guards move in afterward.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    addWorldEvent(worldState, `${player.name} hesitates while the chase slips away.`, locationKey);
    return true;
  }

  if (eventObj.id === "street_cart") {
    if (reaction.intent === "help" || reaction.intent === "defend" || reaction.intent === "attack") {
      const check = resolveCheck({ bonus: player.stats.strength + 1, dc: 13 });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });
        worldState.locationStates.street.stateFlags.cartCrashed = false;
        addWorldEvent(
          worldState,
          `${player.name} gets hold of the runaway cart and drags it off line before it kills someone.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (check.tier === "mixed") {
        const damage = 6;
        player.hp = Math.max(0, player.hp - damage);
        updateReputation(player, { honor: 1 });
        worldState.locationStates.street.stateFlags.cartCrashed = true;

        addWorldEvent(
          worldState,
          `${player.name} slows the cart, but not before taking ${damage} damage and leaving wreckage across the street.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      worldState.locationStates.street.stateFlags.cartCrashed = true;
      addWorldEvent(
        worldState,
        `${player.name} fails to stop the cart. It crashes and litters the street with debris.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    worldState.locationStates.street.stateFlags.cartCrashed = true;
    addWorldEvent(worldState, `${player.name} watches the cart thunder by toward disaster.`, locationKey);
    advanceEventChain(worldState, locationKey, eventObj, "ignore");
    return true;
  }

  if (eventObj.id === "street_debris") {
    worldState.locationStates.street.stateFlags.cartCrashed = true;
    addWorldEvent(
      worldState,
      `${player.name} stands among the aftermath as townsfolk try to clear the wreckage.`,
      locationKey
    );
    closeActiveEvent(worldState, locationKey);
    return true;
  }

  if (eventObj.id === "street_guard_stop") {
    if (reaction.intent === "talk") {
      const check = resolveCheck({
        bonus: player.stats.presence + Math.floor(player.reputation.honor / 5),
        dc: 12
      });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 1 });
        worldState.globalState.guardsAlertLevel = Math.max(0, worldState.globalState.guardsAlertLevel - 1);
        addWorldEvent(
          worldState,
          `${player.name} answers calmly. The guard nods and steps aside.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      if (check.tier === "mixed") {
        worldState.locationStates.street.stateFlags.guardsAlert = true;
        worldState.globalState.guardsAlertLevel += 1;

        addWorldEvent(
          worldState,
          `${player.name} gets through part of the questioning, but the guard remains suspicious.`,
          locationKey
        );
        advanceEventChain(worldState, locationKey, eventObj, "mixed");
        return true;
      }

      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;

      addWorldEvent(
        worldState,
        `${player.name}'s answers only make things worse. The street grows tense.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    if (reaction.intent === "threaten" || reaction.intent === "attack") {
      updateReputation(player, { chaos: 2, intimidation: 2 });
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;
      banPlayerFromGuardZones(player, worldState, locationKey);

      addWorldEvent(
        worldState,
        `${player.name} escalates things with the guard. The street shifts toward crackdown, and access to the street and bar is stripped away.`,
        locationKey
      );
      advanceEventChain(worldState, locationKey, eventObj, "fail");
      return true;
    }

    worldState.locationStates.street.stateFlags.guardsAlert = true;
    worldState.globalState.guardsAlertLevel += 1;

    addWorldEvent(worldState, `${player.name} stalls while the guard studies them.`, locationKey);
    advanceEventChain(worldState, locationKey, eventObj, "ignore");
    return true;
  }

  if (eventObj.id === "street_crackdown") {
    worldState.locationStates.street.stateFlags.guardsAlert = true;
    worldState.globalState.guardsAlertLevel += 1;

    addWorldEvent(
      worldState,
      `${player.name} feels the pressure of the crackdown as guards watch every movement on the street.`,
      locationKey
    );

    if (worldState.globalState.guardsAlertLevel > 0) {
      worldState.globalState.guardsAlertLevel -= 1;
    }

    closeActiveEvent(worldState, locationKey);
    return true;
  }

  if (eventObj.id === "village_guard_question") {
    return handleGuardQuestionCommon(player, worldState, locationKey, eventObj, reaction, {
      success: "decides the answers are good enough for now.",
      mixed: "moves on, but not convinced.",
      fail: "treats you like a growing local problem."
    });
  }

  if (eventObj.id === "forest_horn_signal") {
    worldState.locationStates.forest.stateFlags.forestDanger += 1;
    worldState.locationStates.forest.stateFlags.goblinReinforcementsIncoming = false;
    worldState.locationStates.forest.stateFlags.reinforcementAmbushPending = true;
    worldState.globalState.recentViolence += 1;

    addWorldEvent(
      worldState,
      `${player.name} hears the distant horn answer. The forest feels less empty now, and more hostile.`,
      locationKey
    );

    advanceEventChain(worldState, locationKey, eventObj, "ignore");
    return true;
  }

 if (eventObj.id === "forest_reinforcement_ambush") {
  return resolveForestHostileEvent(player, worldState, locationKey, eventObj, {
    reactionIntent: reaction.intent,
    dc: 14,
    corpsesOnWin: 1,
    dangerRelief: 1,
    clearReinforcementPending: true,
    cooldownTurnsOnWin: 2,
    cooldownTurnsOnFail: 1,
    winText: "meets the ambush head-on and drops the goblin reinforcement before it can do real damage. Another corpse hits the forest floor.",
    mixedText: "tries to turn the ambush into a counterattack, but the fight stays messy.",
    failText: "is caught hard by the reinforcement ambush.",
    defendWinText: "weathers the ambush and forces the reinforcement back into the brush.",
    defendFailText: "partially turns aside the ambush, but cannot fully avoid the blows.",
    fleeWinText: "breaks away from the ambush and escapes back to the street.",
    fleeFailText: "tries to flee the ambush, but gets clipped before getting clear.",
    damageOnMixed: 5,
    damageOnFail: 10,
    damageOnDefendFail: 6,
    damageOnFleeFail: 7,
    damageOnHesitation: 8,
    intimidationReward: 2,
    chaosReward: 1
  });
}
if (eventObj.id === "forest_goblin_patrol") {
  return resolveForestHostileEvent(player, worldState, locationKey, eventObj, {
    reactionIntent: reaction.intent,
    dc: 15,
    corpsesOnWin: 1,
    dangerRelief: 0,
    clearReinforcementPending: false,
    cooldownTurnsOnWin: 2,
    cooldownTurnsOnFail: 1,
    winText: "cuts through the returning patrol and leaves another goblin corpse in the undergrowth.",
    mixedText: "wins the clash, but not cleanly.",
    failText: "gets dragged into a rough patrol skirmish.",
    defendWinText: "holds the patrol off and forces it to scatter.",
    defendFailText: "absorbs part of the patrol’s rush, but still gets tagged.",
    fleeWinText: "slips away from the patrol and gets back to the street.",
    fleeFailText: "tries to flee the patrol, but one goblin lands a parting hit.",
    damageOnMixed: 6,
    damageOnFail: 9,
    damageOnDefendFail: 5,
    damageOnFleeFail: 6,
    damageOnHesitation: 7,
    intimidationReward: 1,
    chaosReward: 1
  });
}

if (eventObj.id === "forest_goblin_hunter") {
  return resolveForestHostileEvent(player, worldState, locationKey, eventObj, {
    reactionIntent: reaction.intent,
    dc: 16,
    corpsesOnWin: 1,
    dangerRelief: 0,
    clearReinforcementPending: false,
    cooldownTurnsOnWin: 2,
    cooldownTurnsOnFail: 1,
    winText: "outplays the goblin hunter and drops it where it stalked from.",
    mixedText: "survives the hunter’s pressure, but takes punishment doing it.",
    failText: "gets outmaneuvered by the hunter in the brush.",
    defendWinText: "reads the hunter’s line and turns the ambush aside.",
    defendFailText: "catches the hunter’s angle too late.",
    fleeWinText: "breaks contact with the hunter and falls back to the street.",
    fleeFailText: "tries to flee the hunter, but the hunter draws blood first.",
    damageOnMixed: 8,
    damageOnFail: 11,
    damageOnDefendFail: 7,
    damageOnFleeFail: 8,
    damageOnHesitation: 9,
    intimidationReward: 2,
    chaosReward: 1
  });
}

if (eventObj.id === "forest_goblin_warband") {
  return resolveForestHostileEvent(player, worldState, locationKey, eventObj, {
    reactionIntent: reaction.intent,
    dc: 17,
    corpsesOnWin: 2,
    dangerRelief: 1,
    clearReinforcementPending: false,
    cooldownTurnsOnWin: 3,
    cooldownTurnsOnFail: 1,
    winText: "breaks the warband’s momentum and leaves multiple goblin corpses behind.",
    mixedText: "manages to survive the warband clash, but only barely keeps control.",
    failText: "gets overwhelmed by the warband surge.",
    defendWinText: "anchors against the warband and forces it to pull back.",
    defendFailText: "holds for a moment, then gets driven backward.",
    fleeWinText: "escapes the warband by abandoning ground and sprinting for the street.",
    fleeFailText: "tries to flee the warband, but gets slashed on the way out.",
    damageOnMixed: 10,
    damageOnFail: 14,
    damageOnDefendFail: 9,
    damageOnFleeFail: 10,
    damageOnHesitation: 11,
    intimidationReward: 3,
    chaosReward: 1
  });
}
  if (eventObj.id === "forest_hunter") {
    if (reaction.intent === "help") {
      const check = resolveCheck({ bonus: player.stats.presence + player.stats.defense, dc: 11 });

      if (check.tier === "great" || check.tier === "success") {
        updateReputation(player, { honor: 2 });
        if (!player.inventory.includes("Health Potion")) {
          player.inventory.push("Health Potion");
        }

        worldState.locationStates.forest.stateFlags.woundedHunterPresent = false;
        worldState.locationStates.village.stateFlags.hunterSavedRumor = true;
        worldState.locationStates.village.stateFlags.hunterAbandonedRumor = false;
        worldState.globalState.hunterSavedBy = player.name;

        addWorldEvent(
          worldState,
          `${player.name} helps the wounded hunter to safety. Before leaving, the hunter presses a Health Potion into ${player.name}'s hand.`,
          locationKey
        );

        advanceEventChain(worldState, locationKey, eventObj, "success");
        return true;
      }

      updateReputation(player, { honor: 1 });
      worldState.locationStates.forest.stateFlags.woundedHunterPresent = false;
      worldState.locationStates.village.stateFlags.hunterSavedRumor = true;
      worldState.globalState.hunterSavedBy = player.name;

      addWorldEvent(
        worldState,
        `${player.name} struggles to help the hunter properly, but the effort still matters and word will likely spread.`,
        locationKey
      );

      advanceEventChain(worldState, locationKey, eventObj, "success");
      return true;
    }

    if (reaction.intent === "observe" || reaction.intent === "flee") {
      updateReputation(player, { honor: -1 });
      worldState.locationStates.forest.stateFlags.woundedHunterPresent = false;
      worldState.locationStates.village.stateFlags.hunterAbandonedRumor = true;
      worldState.locationStates.village.stateFlags.hunterSavedRumor = false;
      worldState.globalState.hunterAbandonedBy = player.name;

      addWorldEvent(
        worldState,
        `${player.name} leaves the wounded hunter behind.`,
        locationKey
      );

      advanceEventChain(worldState, locationKey, eventObj, "ignore");
      return true;
    }

    addWorldEvent(worldState, `${player.name} hesitates while the hunter bleeds into the leaves.`, locationKey);
    return true;
  }

  if (
    eventObj.id === "village_hunter_praise" ||
    eventObj.id === "village_hunter_grumble" ||
    eventObj.id === "village_guard_murmur" ||
    eventObj.id === "village_honor_scene" ||
    eventObj.id === "village_chaos_scene" ||
    eventObj.id === "village_tavern_gossip"
  ) {
    addWorldEvent(
      worldState,
      `${player.name} takes in the village mood: ${eventObj.text}`,
      locationKey
    );

    clearVillageRumorFlagForEvent(worldState, eventObj.id);
    closeActiveEvent(worldState, locationKey);
    return true;
  }

  return false;
}

/* =========================
   ORIGINAL ACTION INTERPRETER
========================= */


/* =========================
   UI HELPERS
========================= */


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
    if (player.location !== "forest" || !worldState.goblinAlive) {
      const resultText = buildResultBlock(
        [
          "Action: Attack",
          "Outcome: Invalid",
          "Target: None"
        ],
        "You swing at nothing and achieve exactly that."
      );

      addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);
    } else {
      addWorldEvent(worldState, `${player.name}: ${narrateAttackIntro(interpreted.style, flavor)}`, player.location);

      const attackRoll = rollD20();
      const total = attackRoll + player.stats.strength;
      const dc = 12;

      if (attackRoll === 20) {
        const damage = 12 + rollDie(6);
        updateReputation(player, { chaos: 2, intimidation: 2 });
        worldState.goblinHp -= damage;

        addWorldEvent(worldState, `${player.name}: ${narrateCriticalHit(interpreted.style, damage, flavor)}`, player.location);

        if (worldState.goblinHp <= 0) {
          worldState.goblinAlive = false;
          worldState.goblinCorpses = (worldState.goblinCorpses || 0) + 1;
          updateReputation(player, { chaos: 3, intimidation: 2 });

          addWorldEvent(worldState, `${player.name} kills the goblin.`, player.location);
          addWorldEvent(worldState, `${player.name} stands over the fallen goblin.\nIntimidation +2.`, player.location);
          addWorldEvent(worldState, "With its dying breath, the goblin blows on a horn and calls for reinforcements.", player.location);

          worldState.locationStates.forest.stateFlags.goblinReinforcementsIncoming = true;
          worldState.locationStates.forest.stateFlags.reinforcementAmbushPending = true;
          worldState.locationStates.forest.stateFlags.forestDanger += 1;
          worldState.globalState.recentViolence += 1;

          const reactionText = getReputationReaction(player.reputation);
          const resultText = buildResultBlock(
            [
              "Action: Attack",
              "Outcome: Kill",
              `Damage: ${damage}`,
              `Goblin Corpses: ${worldState.goblinCorpses}`,
              "Threat: Reinforcements may ambush you deeper in the forest",
              `Reputation: ${player.reputation.title}`,
              reactionText ? `World: ${reactionText}` : null
            ].filter(Boolean),
            "You won the fight decisively, but the forest may not be finished with you."
          );

          addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);

          worldState.goblinHp = 0;
        } else {
          const reactionText = getReputationReaction(player.reputation);
          const resultText = buildResultBlock(
            [
              "Action: Attack",
              "Outcome: Critical Hit",
              `Damage: ${damage}`,
              `Goblin HP: ${Math.max(0, worldState.goblinHp)}`,
              "Threat: Still active",
              `Reputation: ${player.reputation.title}`,
              reactionText ? `World: ${reactionText}` : null
            ].filter(Boolean),
            "That hit was savage."
          );

          addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);
        }
      } else if (attackRoll === 1) {
        updateReputation(player, { chaos: 1 });
        addWorldEvent(worldState, `${player.name}: ${narrateCriticalFail(interpreted.style, flavor)}`, player.location);

        const selfDamage = 3;
        player.hp = Math.max(0, player.hp - selfDamage);
        addWorldEvent(worldState, `${player.name} hurts themselves for ${selfDamage} damage in the failed attack.`, player.location);

        if (player.hp <= 0) {
          addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, player.location);
          handlePlayerDeath(player, worldState);
        }
      } else if (total >= dc) {
        const damage = 6 + rollDie(6);
        updateReputation(player, { chaos: 1, intimidation: 1 });
        worldState.goblinHp -= damage;

        addWorldEvent(worldState, `${player.name}: ${narratePlayerHit(interpreted.style, damage, flavor)}`, player.location);

        if (damage >= 8) {
          updateReputation(player, { intimidation: 1 });
          addWorldEvent(worldState, `${player.name}'s brutal strike shakes the battlefield.\nIntimidation +1.`, player.location);
        }

        if (worldState.goblinHp <= 0) {
          worldState.goblinAlive = false;
          worldState.goblinCorpses = (worldState.goblinCorpses || 0) + 1;
          updateReputation(player, { chaos: 3, intimidation: 2 });

          addWorldEvent(worldState, `${player.name} kills the goblin.`, player.location);
          addWorldEvent(worldState, `${player.name} stands over the fallen goblin.\nIntimidation +2.`, player.location);
          addWorldEvent(worldState, "With its dying breath, the goblin blows on a horn and calls for reinforcements.", player.location);

          worldState.locationStates.forest.stateFlags.goblinReinforcementsIncoming = true;
          worldState.locationStates.forest.stateFlags.reinforcementAmbushPending = true;
          worldState.locationStates.forest.stateFlags.forestDanger += 1;
          worldState.globalState.recentViolence += 1;

          const reactionText = getReputationReaction(player.reputation);
          const resultText = buildResultBlock(
            [
              "Action: Attack",
              "Outcome: Kill",
              `Damage: ${damage}`,
              `Goblin Corpses: ${worldState.goblinCorpses}`,
              "Threat: Reinforcements may ambush you deeper in the forest",
              `Reputation: ${player.reputation.title}`,
              reactionText ? `World: ${reactionText}` : null
            ].filter(Boolean),
            "You won the fight, but the forest may not be finished with you."
          );

          addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);

          worldState.goblinHp = 0;
        } else {
          const reactionText = getReputationReaction(player.reputation);
          const resultText = buildResultBlock(
            [
              "Action: Attack",
              "Outcome: Hit",
              `Damage: ${damage}`,
              `Goblin HP: ${Math.max(0, worldState.goblinHp)}`,
              "Threat: Still active",
              `Reputation: ${player.reputation.title}`,
              reactionText ? `World: ${reactionText}` : null
            ].filter(Boolean),
            getAttackFlavor("hit")
          );

          addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);

          const goblinRoll = rollD20();
          const goblinTotal = goblinRoll + 1;
          const playerDefenseDc = 10 + player.stats.defense;

          if (goblinTotal >= playerDefenseDc) {
            const goblinDamage = 6 + rollDie(4);
            player.hp = Math.max(0, player.hp - goblinDamage);
            addWorldEvent(worldState, `${player.name}: ${narrateGoblinAttackHit(goblinDamage)}`, player.location);
          } else {
            addWorldEvent(worldState, `${player.name}: ${narrateGoblinAttackMiss()}`, player.location);
          }

          if (player.hp <= 0) {
            addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`, player.location);
            player.location = "village";
            player.hp = player.maxHp;
            addWorldEvent(worldState, `${player.name}: ${narrateRespawn()}`, "village");
          }
        }
      } else {
        updateReputation(player, { chaos: 1 });
        addWorldEvent(worldState, `${player.name}: ${narratePlayerMiss(interpreted.style, flavor)}`, player.location);

        const reactionText = getReputationReaction(player.reputation);
        const resultText = buildResultBlock(
          [
            "Action: Attack",
            "Outcome: Miss",
            `Goblin HP: ${worldState.goblinHp}`,
            "Threat: Still active",
            `Reputation: ${player.reputation.title}`,
            reactionText ? `World: ${reactionText}` : null
          ].filter(Boolean),
          getAttackFlavor("miss")
        );

        addWorldEvent(worldState, `${player.name}\n${resultText}`, player.location);
      }
    }
  } else if (interpreted.type === "defend") {
    if (player.location !== "forest" || !worldState.goblinAlive) {
      addWorldEvent(worldState, `${player.name} tries to defend, but nothing threatens them.`, player.location);
    } else {
      const goblinRoll = rollD20();
      const goblinTotal = goblinRoll + 1;
      const defendDc = 14 + player.stats.defense;

      if (goblinTotal >= defendDc) {
        const reducedDamage = 3;
        player.hp = Math.max(0, player.hp - reducedDamage);
        updateReputation(player, { honor: 1 });
        addWorldEvent(worldState, `${player.name}: ${narrateDefendPartial(reducedDamage)}\nHonor +1.`, player.location);
      } else {
        updateReputation(player, { honor: 1 });
        addWorldEvent(worldState, `${player.name}: ${narrateDefendSuccess()}\nHonor +1.`, player.location);
      }

      if (player.hp <= 0) {
        handlePlayerDeath(player, worldState);
      }
    }
  } else if (interpreted.type === "run") {
    if (player.location !== "forest" || !worldState.goblinAlive) {
      addWorldEvent(worldState, `${player.name} tries to run, but there is nothing to flee from.`, player.location);
    } else {
      const roll = rollD20();
      const total = roll + player.stats.dexterity;
      const dc = 11;

      if (total >= dc) {
        player.location = "street";
        updateReputation(player, { honor: 1 });
        addWorldEvent(worldState, `${player.name}: ${narrateRunSuccess()}\nHonor +1.`, "forest");
      } else {
        const goblinDamage = 5;
        player.hp = Math.max(0, player.hp - goblinDamage);
        addWorldEvent(worldState, `${player.name}: ${narrateRunFail(goblinDamage)}`, player.location);
        updateReputation(player, { intimidation: 1 });

        if (player.hp <= 0) {
          handlePlayerDeath(player, worldState);
        }
      }
    }
  } else if (interpreted.type === "search") {
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