const fs = require("fs");

function createWorldStateManager({
  world,
  worldFilePath,
  createBaseLocationState,
  createNewWorldState
}) {
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

  return {
    ensureWorldShape,
    loadWorldState,
    saveWorldState,
    addWorldEvent
  };
}

module.exports = { createWorldStateManager };