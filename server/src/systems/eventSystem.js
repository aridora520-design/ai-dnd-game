function createEventSystem({
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
}) {
  function createEventTemplate(eventId, location, data = {}) {
    const now = Date.now();

    const templates = {
      bar_drunk_accusation: {
        id: "bar_drunk_accusation",
        name: "Drunk Accusation",
        chainId: "tavern_trouble",
        phase: 1,
        location,
        phaseLabel: "accusation",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A drunk patron slams his mug down and accuses a traveling merchant of cheating him.",
        involvedNpc: ["Drunk Patron", "Traveling Merchant", "Bartender Rowan"],
        tags: ["social", "bar"],
        nextOnSuccess: null,
        nextOnMixed: { eventId: "bar_brawl", location: "bar" },
        nextOnFail: { eventId: "bar_brawl", location: "bar" },
        nextOnIgnore: { eventId: "bar_brawl", location: "bar" }
      },

      bar_brawl: {
        id: "bar_brawl",
        name: "Bar Brawl",
        chainId: "tavern_trouble",
        phase: 2,
        location,
        phaseLabel: "fight",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "The argument explodes. A stool flips, someone swings, and the whole room jolts into chaos.",
        involvedNpc: ["Drunk Patron", "Traveling Merchant", "Bartender Rowan"],
        tags: ["violence", "bar"],
        nextOnSuccess: null,
        nextOnMixed: { eventId: "street_guard_response", location: "street" },
        nextOnFail: { eventId: "street_guard_response", location: "street" },
        nextOnIgnore: { eventId: "street_guard_response", location: "street" }
      },

      bar_thief: {
        id: "bar_thief",
        name: "Thief Incident",
        chainId: "thief_chain",
        phase: 1,
        location,
        phaseLabel: "snatch",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A quick-handed thief snatches a coin purse and bolts toward the door.",
        involvedNpc: ["Unknown Thief", "Traveling Merchant"],
        tags: ["crime", "bar"],
        nextOnSuccess: null,
        nextOnMixed: { eventId: "street_chase", location: "street" },
        nextOnFail: { eventId: "street_chase", location: "street" },
        nextOnIgnore: { eventId: "street_chase", location: "street" }
      },

      bar_fire: {
        id: "bar_fire",
        name: "Lantern Fire",
        chainId: "bar_fire_chain",
        phase: 1,
        location,
        phaseLabel: "spark",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A hanging lantern crashes and oil splashes across the floor. Fire starts licking up a table leg.",
        involvedNpc: ["Bartender Rowan"],
        tags: ["environment", "bar", "danger"],
        nextOnSuccess: null,
        nextOnMixed: { eventId: "bar_fire_spreading", location: "bar" },
        nextOnFail: { eventId: "bar_fire_spreading", location: "bar" },
        nextOnIgnore: { eventId: "bar_fire_spreading", location: "bar" }
      },

      bar_fire_spreading: {
        id: "bar_fire_spreading",
        name: "Fire Spreading",
        chainId: "bar_fire_chain",
        phase: 2,
        location,
        phaseLabel: "spreading",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "The flames spread across spilled alcohol and crawl up the wall. Panic starts to ripple through the bar.",
        involvedNpc: ["Bartender Rowan"],
        tags: ["environment", "bar", "danger"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      bar_guard_question: {
        id: "bar_guard_question",
        name: "Guard Questioning",
        chainId: "guard_pressure",
        phase: 1,
        location,
        phaseLabel: "questioning",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A town guard steps into the bar, scans the room, and fixes attention on you. \"You. Explain yourself.\"",
        involvedNpc: ["Town Guard", "Bartender Rowan"],
        tags: ["bar", "guard"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      street_guard_response: {
        id: "street_guard_response",
        name: "Guard Response",
        chainId: "tavern_trouble",
        phase: 3,
        location,
        phaseLabel: "response",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "Boots pound outside. Town guards push toward the bar entrance, demanding to know who started the trouble.",
        involvedNpc: ["Town Guard"],
        tags: ["street", "guard"],
        nextOnSuccess: null,
        nextOnMixed: { eventId: "street_crackdown", location: "street" },
        nextOnFail: { eventId: "street_crackdown", location: "street" },
        nextOnIgnore: { eventId: "street_crackdown", location: "street" }
      },

      street_chase: {
        id: "street_chase",
        name: "Street Chase",
        chainId: "thief_chain",
        phase: 2,
        location,
        phaseLabel: "chase",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "The chase spills into the street. The thief darts between carts and townsfolk, trying to disappear.",
        involvedNpc: ["Unknown Thief", "Town Guard"],
        tags: ["street", "crime"],
        nextOnSuccess: null,
        nextOnMixed: { eventId: "street_guard_stop", location: "street" },
        nextOnFail: { eventId: "street_guard_stop", location: "street" },
        nextOnIgnore: { eventId: "street_guard_stop", location: "street" }
      },

      street_cart: {
        id: "street_cart",
        name: "Runaway Cart",
        chainId: "cart_chain",
        phase: 1,
        location,
        phaseLabel: "runaway",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A horse panics. A loaded cart jerks loose and barrels down the street.",
        involvedNpc: ["Cart Driver", "Town Guard"],
        tags: ["environment", "street"],
        nextOnSuccess: null,
        nextOnMixed: { eventId: "street_debris", location: "street" },
        nextOnFail: { eventId: "street_debris", location: "street" },
        nextOnIgnore: { eventId: "street_debris", location: "street" }
      },

      street_debris: {
        id: "street_debris",
        name: "Street Debris",
        chainId: "cart_chain",
        phase: 2,
        location,
        phaseLabel: "aftermath",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "Broken wood, spilled goods, and frightened townsfolk clog the street after the crash.",
        involvedNpc: ["Cart Driver"],
        tags: ["street", "aftermath"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      street_guard_stop: {
        id: "street_guard_stop",
        name: "Guard Confrontation",
        chainId: "guard_pressure",
        phase: 1,
        location,
        phaseLabel: "stop",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A town guard plants a spear in your path and demands to know what you’re up to.",
        involvedNpc: ["Town Guard"],
        tags: ["social", "street"],
        nextOnSuccess: null,
        nextOnMixed: { eventId: "street_crackdown", location: "street" },
        nextOnFail: { eventId: "street_crackdown", location: "street" },
        nextOnIgnore: { eventId: "street_crackdown", location: "street" }
      },

      street_crackdown: {
        id: "street_crackdown",
        name: "Street Crackdown",
        chainId: "guard_pressure",
        phase: 2,
        location,
        phaseLabel: "crackdown",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "The guards tighten control of the street. People back away, and every sudden move draws attention.",
        involvedNpc: ["Town Guard"],
        tags: ["street", "guard", "aftermath"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      village_guard_question: {
        id: "village_guard_question",
        name: "Village Questioning",
        chainId: "guard_pressure",
        phase: 1,
        location,
        phaseLabel: "questioning",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A passing guard changes course, stops in front of you, and asks a little too calmly where you've been and why.",
        involvedNpc: ["Passing Guard"],
        tags: ["village", "guard"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      forest_horn_signal: {
        id: "forest_horn_signal",
        name: "Horn Signal",
        chainId: "goblin_pressure",
        phase: 2,
        location,
        phaseLabel: "signal",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A distant horn answers from deeper in the forest. Something heard the goblin's last call.",
        involvedNpc: ["Distant Goblins"],
        tags: ["forest", "danger"],
        nextOnSuccess: { eventId: "forest_reinforcement_ambush", location: "forest" },
        nextOnMixed: { eventId: "forest_reinforcement_ambush", location: "forest" },
        nextOnFail: { eventId: "forest_reinforcement_ambush", location: "forest" },
        nextOnIgnore: { eventId: "forest_reinforcement_ambush", location: "forest" }
      },

      forest_reinforcement_ambush: {
        id: "forest_reinforcement_ambush",
        name: "Reinforcement Ambush",
        chainId: "goblin_pressure",
        phase: 3,
        location,
        phaseLabel: "ambush",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A goblin reinforcement bursts from the brush with a shriek. The horn brought company.",
        involvedNpc: ["Goblin Reinforcement"],
        tags: ["forest", "combat", "danger"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      forest_goblin_patrol: {
        id: "forest_goblin_patrol",
        name: "Goblin Patrol",
        chainId: "forest_escalation",
        phase: 4,
        location,
        phaseLabel: "patrol",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A goblin patrol circles back through the trees, drawn by the scent of blood and noise.",
        involvedNpc: ["Goblin Patrol"],
        tags: ["forest", "combat", "danger"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      forest_goblin_hunter: {
        id: "forest_goblin_hunter",
        name: "Goblin Hunter",
        chainId: "forest_escalation",
        phase: 5,
        location,
        phaseLabel: "hunter",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A lean goblin hunter slips between the trees with deliberate patience. This one is not charging blindly.",
        involvedNpc: ["Goblin Hunter"],
        tags: ["forest", "combat", "danger"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      forest_goblin_warband: {
        id: "forest_goblin_warband",
        name: "Goblin Warband",
        chainId: "forest_escalation",
        phase: 6,
        location,
        phaseLabel: "warband",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "Branches snap on both sides. A small goblin warband closes in, testing whether the forest still belongs to you.",
        involvedNpc: ["Goblin Warband"],
        tags: ["forest", "combat", "danger"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      forest_hunter: {
        id: "forest_hunter",
        name: "Wounded Hunter",
        chainId: "hunter_chain",
        phase: 1,
        location,
        phaseLabel: "wounded",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "Behind a fallen log, a wounded hunter calls weakly for help.",
        involvedNpc: ["Wounded Hunter"],
        tags: ["forest", "aid"],
        nextOnSuccess: { eventId: "village_hunter_praise", location: "village" },
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: { eventId: "village_hunter_grumble", location: "village" }
      },

      village_hunter_praise: {
        id: "village_hunter_praise",
        name: "Hunter Praise",
        chainId: "hunter_chain",
        phase: 2,
        location,
        phaseLabel: "rumor",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "Word reaches the village that someone brought a wounded hunter back alive. People are talking.",
        involvedNpc: ["Old Villager", "Worried Farmer"],
        tags: ["village", "rumor", "honor"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      village_hunter_grumble: {
        id: "village_hunter_grumble",
        name: "Hunter Grumble",
        chainId: "hunter_chain",
        phase: 2,
        location,
        phaseLabel: "rumor",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A bitter rumor spreads through the village: someone left a wounded hunter in the forest.",
        involvedNpc: ["Old Villager", "Passing Guard"],
        tags: ["village", "rumor", "dishonor"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      village_guard_murmur: {
        id: "village_guard_murmur",
        name: "Guard Murmur",
        chainId: "village_consequence",
        phase: 1,
        location,
        phaseLabel: "murmur",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A pair of villagers lower their voices when they see a guard pass nearby. The street troubles are being discussed.",
        involvedNpc: ["Old Villager", "Passing Guard"],
        tags: ["village", "guard", "rumor"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      village_honor_scene: {
        id: "village_honor_scene",
        name: "Village Respect",
        chainId: "village_consequence",
        phase: 1,
        location,
        phaseLabel: "respect",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A villager recognizes you and gives a small nod of respect. Your actions are starting to travel faster than you do.",
        involvedNpc: ["Old Villager"],
        tags: ["village", "honor"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      village_chaos_scene: {
        id: "village_chaos_scene",
        name: "Village Unease",
        chainId: "village_consequence",
        phase: 1,
        location,
        phaseLabel: "fear",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "A hush passes through the village as people notice you. No one wants to be close if trouble starts.",
        involvedNpc: ["Old Villager", "Worried Farmer"],
        tags: ["village", "chaos"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      },

      village_tavern_gossip: {
        id: "village_tavern_gossip",
        name: "Tavern Gossip",
        chainId: "village_consequence",
        phase: 1,
        location,
        phaseLabel: "gossip",
        createdAt: now,
        expiresInMs: 10 * 60 * 1000,
        text: "The villagers are already gossiping about the damage at the bar. Apparently no one agrees on who was most to blame.",
        involvedNpc: ["Old Villager", "Worried Farmer"],
        tags: ["village", "gossip"],
        nextOnSuccess: null,
        nextOnMixed: null,
        nextOnFail: null,
        nextOnIgnore: null
      }
    };

    return templates[eventId] || null;
  }

  function clearExpiredEventIfNeeded(worldState, locationKey) {
    const locState = worldState.locationStates[locationKey];
    if (!locState || !locState.activeEvent) return;

    const eventObj = locState.activeEvent;
    const expired = Date.now() > eventObj.createdAt + eventObj.expiresInMs;

    if (!expired) return;

    resolveExpiredEvent(worldState, locationKey, eventObj);
    locState.activeEvent = null;
  }

  function resolveExpiredEvent(worldState, locationKey, eventObj) {
    if (eventObj.id === "bar_brawl") {
      worldState.locationStates.bar.stateFlags.barDamaged = true;
      addWorldEvent(
        worldState,
        "No one stops the fight in time. Tables splinter, mugs shatter, and the bar is left damaged.",
        locationKey
      );
    } else if (eventObj.id === "bar_thief") {
      worldState.locationStates.bar.stateFlags.thiefActive = false;
      addWorldEvent(
        worldState,
        "No one reacts fast enough. The thief disappears into the night with the purse.",
        locationKey
      );
    } else if (eventObj.id === "bar_fire") {
      worldState.locationStates.bar.stateFlags.barDamaged = true;
      worldState.locationStates.bar.stateFlags.barOnFire = false;
      addWorldEvent(
        worldState,
        "The fire spreads before anyone gets control of it. Smoke stains the ceiling and part of the bar is ruined.",
        locationKey
      );
    } else if (eventObj.id === "street_cart") {
      worldState.locationStates.street.stateFlags.cartCrashed = true;
      addWorldEvent(
        worldState,
        "The runaway cart smashes into the street corner in a burst of wood and cargo.",
        locationKey
      );
    } else if (
      eventObj.id === "street_guard_stop" ||
      eventObj.id === "bar_guard_question" ||
      eventObj.id === "village_guard_question"
    ) {
      worldState.locationStates.street.stateFlags.guardsAlert = true;
      worldState.globalState.guardsAlertLevel += 1;
      addWorldEvent(
        worldState,
        "The guards interpret the silence as guilt and grow even more suspicious.",
        locationKey
      );
    } else if (eventObj.id === "forest_hunter") {
      worldState.locationStates.forest.stateFlags.woundedHunterPresent = false;
      addWorldEvent(
        worldState,
        "The wounded hunter is left behind. By the time anyone checks again, they are gone.",
        locationKey
      );
    } else if (eventObj.id === "forest_reinforcement_ambush") {
      worldState.locationStates.forest.stateFlags.forestDanger += 1;
      addWorldEvent(
        worldState,
        "The unseen reinforcement never fully reveals itself, but the forest grows more dangerous around you.",
        locationKey
      );
    }
  }

  function closeActiveEvent(worldState, locationKey) {
    if (worldState.locationStates[locationKey]) {
      worldState.locationStates[locationKey].activeEvent = null;
    }
  }

  function getNextChainTarget(currentEvent, outcome) {
    if (!currentEvent) return null;

    if (outcome === "success") return currentEvent.nextOnSuccess || null;
    if (outcome === "mixed") return currentEvent.nextOnMixed || null;
    if (outcome === "fail") return currentEvent.nextOnFail || null;
    if (outcome === "ignore") return currentEvent.nextOnIgnore || null;

    return null;
  }

  function advanceEventChain(worldState, currentLocationKey, currentEvent, outcome) {
    const nextTarget = getNextChainTarget(currentEvent, outcome);

    closeActiveEvent(worldState, currentLocationKey);

    if (!nextTarget || !nextTarget.eventId) {
      return null;
    }

    const nextLocation = nextTarget.location || currentLocationKey;
    const nextEvent = createEventTemplate(nextTarget.eventId, nextLocation);

    if (!nextEvent) {
      return null;
    }

    worldState.locationStates[nextLocation].activeEvent = nextEvent;
    addWorldEvent(
      worldState,
      `[CHAIN EVENT — ${nextLocation.toUpperCase()}] ${nextEvent.text}`,
      nextLocation
    );

    return nextEvent;
  }

  function clearVillageRumorFlagForEvent(worldState, eventId) {
    const villageFlags = worldState.locationStates.village.stateFlags;

    if (eventId === "village_hunter_praise") {
      villageFlags.hunterSavedRumor = false;
    }

    if (eventId === "village_hunter_grumble") {
      villageFlags.hunterAbandonedRumor = false;
    }

    if (eventId === "village_tavern_gossip") {
      villageFlags.tavernTroubleRumor = false;
    }
  }

  function getLocationEventPool(locationKey, worldState, player) {
    if (locationKey === "bar") {
      const pool = ["bar_drunk_accusation", "bar_thief"];

      if (!worldState.locationStates.bar.stateFlags.barOnFire) {
        pool.push("bar_fire");
      }

      if (worldState.globalState.guardsAlertLevel >= 2) {
        pool.push("bar_guard_question");
      }

      return pool;
    }

    if (locationKey === "street") {
      const pool = ["street_cart", "street_guard_stop"];

      if (worldState.globalState.guardsAlertLevel >= 2) {
        pool.push("street_guard_stop");
      }

      return pool;
    }

    if (locationKey === "forest") {
      const pool = [];
      const forestFlags = worldState.locationStates.forest.stateFlags;

      if (forestFlags.goblinReinforcementsIncoming) {
        pool.push("forest_horn_signal");
        return pool;
      }

      if (forestFlags.reinforcementAmbushPending) {
        pool.push("forest_reinforcement_ambush");
        return pool;
      }

      if (!worldState.goblinAlive) {
        if (forestFlags.forestSpawnCooldown <= 0 && forestFlags.forestStayCounter >= 2) {
          pool.push(getForestEscalationEventId(forestFlags));
          return pool;
        }

        pool.push("forest_hunter");
      }

      return pool;
    }

    if (locationKey === "village") {
      const pool = [];
      const villageFlags = worldState.locationStates.village.stateFlags;

      if (villageFlags.hunterSavedRumor) pool.push("village_hunter_praise");
      if (villageFlags.hunterAbandonedRumor) pool.push("village_hunter_grumble");
      if (villageFlags.tavernTroubleRumor) pool.push("village_tavern_gossip");
      if (worldState.locationStates.street.stateFlags.guardsAlert || worldState.globalState.guardsAlertLevel > 0) {
        pool.push("village_guard_murmur");
      }
      if (player.reputation.honor >= 8) pool.push("village_honor_scene");
      if (player.reputation.chaos >= 8) pool.push("village_chaos_scene");
      if (worldState.globalState.guardsAlertLevel >= 2) pool.push("village_guard_question");

      return pool;
    }

    return [];
  }

  function maybeTriggerLocationEvent(worldState, locationKey, player, reason = "ambient") {
    const locState = worldState.locationStates[locationKey];
    if (!locState) return null;

    clearExpiredEventIfNeeded(worldState, locationKey);

    if (locState.activeEvent) {
      return locState.activeEvent;
    }

    if (locationKey === "forest") {
      updateForestPressure(worldState, reason);
    }

    if (locationKey === "forest" && worldState.goblinAlive) {
      return null;
    }

    let chance = 0;
    if (reason === "enter") chance = 0.45;
    if (reason === "look") chance = 0.20;
    if (reason === "idle") chance = 0.15;

    if (
      worldState.globalState.guardsAlertLevel >= 2 &&
      (locationKey === "village" || locationKey === "street" || locationKey === "bar")
    ) {
      chance += 0.20;
    }

    if (locationKey === "forest") {
      const forestFlags = worldState.locationStates.forest.stateFlags;

      if (forestFlags.reinforcementAmbushPending) {
        chance = Math.max(chance, 0.70);
      } else if (shouldSpawnForestEscalation(worldState, reason)) {
        chance = 1.0;
      } else if (forestFlags.forestSpawnCooldown > 0) {
        chance = Math.min(chance, 0.10);
      }
    }

    if (Math.random() > chance) {
      return null;
    }

    const pool = getLocationEventPool(locationKey, worldState, player);
    if (pool.length === 0) return null;

    const eventId = randomChoice(pool);
    const eventObj = createEventTemplate(eventId, locationKey);

    locState.activeEvent = eventObj;

    if (eventId === "bar_thief") {
      worldState.locationStates.bar.stateFlags.thiefActive = true;
    }

    if (eventId === "bar_fire") {
      worldState.locationStates.bar.stateFlags.barOnFire = true;
    }

    if (eventId === "forest_hunter") {
      worldState.locationStates.forest.stateFlags.woundedHunterPresent = true;
    }

    if (locationKey === "forest") {
      worldState.locationStates.forest.stateFlags.lastForestEventType = eventId;
    }

    addWorldEvent(worldState, `[EVENT — ${locationKey.toUpperCase()}] ${eventObj.text}`, locationKey);
    return eventObj;
  }

  return {
    createEventTemplate,
    clearExpiredEventIfNeeded,
    resolveExpiredEvent,
    closeActiveEvent,
    getNextChainTarget,
    advanceEventChain,
    clearVillageRumorFlagForEvent,
    getLocationEventPool,
    maybeTriggerLocationEvent
  };
}

module.exports = { createEventSystem };