const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: true }));

const playersFolder = path.join(__dirname, "players");
const worldFilePath = path.join(__dirname, "world.json");

if (!fs.existsSync(playersFolder)) {
  fs.mkdirSync(playersFolder);
}

const world = {
  village: {
    description: "You are in the Village. Paths lead to the Bar and Street.",
    paths: ["bar", "street"]
  },
  bar: {
    description: "You are inside the Bar. It smells like old ale and warm food.",
    paths: ["village"]
  },
  street: {
    description: "You stand on the Street. The forest lies ahead.",
    paths: ["village", "forest"]
  },
  forest: {
    description: "You are in the Forest.",
    paths: ["street"]
  }
};

function randomChoice(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function getPlayerFilePath(playerName) {
  const safeName = playerName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(playersFolder, `${safeName}.json`);
}

function createNewPlayer(name) {
  return {
    name,
    location: "village",
    hp: 100,
    maxHp: 100,
    inventory: [],
    stats: {
      strength: 2,
      dexterity: 3,
      defense: 1,
      presence: 2
    },
    reputation: {
      chaos: 0,
      honor: 0,
      intimidation: 0,
      title: "Unknown"
    },
    flags: {
      knownTroublemaker: false,
      helpedTownsfolk: false,
      bartenderBarred: false,
      blockedFromStreet: false,
      wantedByGuards: false
    }
  };
}

function createBaseLocationState() {
  return {
    activeEvent: null,
    recentHistory: [],
    npcs: [],
    stateFlags: {}
  };
}

function createNewWorldState() {
  return {
    goblinAlive: true,
    goblinHp: 40,
    goblinCorpses: 0,
    forestPotionFound: false,
    eventLog: [
      "The world begins. The village waits in silence."
    ],
    locationStates: {
      village: {
        ...createBaseLocationState(),
        npcs: ["Old Villager", "Worried Farmer", "Passing Guard"],
        stateFlags: {
          crowdUneasy: false,
          hunterSavedRumor: false,
          hunterAbandonedRumor: false,
          tavernTroubleRumor: false
        }
      },
      bar: {
        ...createBaseLocationState(),
        npcs: ["Bartender Rowan", "Drunk Patron", "Traveling Merchant", "Hooded Stranger"],
        stateFlags: {
          barDamaged: false,
          bartenderHostileTo: [],
          barOnFire: false,
          thiefActive: false,
          guardsWatchingBar: false
        }
      },
      street: {
        ...createBaseLocationState(),
        npcs: ["Town Guard", "Cart Driver", "Beggar"],
        stateFlags: {
          cartCrashed: false,
          guardsAlert: false
        }
      },
    forest: {
  ...createBaseLocationState(),
  npcs: ["Goblin"],
  stateFlags: {
    woundedHunterPresent: false,
    goblinReinforcementsIncoming: false,
    forestDanger: 0,
    reinforcementAmbushPending: false,
    forestStayCounter: 0,
    forestSpawnCooldown: 0,
    lastForestEventType: null
  }
}
    },
    globalState: {
      villagersOnEdge: false,
      recentViolence: 0,
      guardsAlertLevel: 0,
      hunterSavedBy: null,
      hunterAbandonedBy: null
    }
  };
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

function ensurePlayerShape(player) {
  if (!player.inventory) {
    player.inventory = [];
  }

  if (!player.stats) {
    player.stats = {
      strength: 2,
      dexterity: 3,
      defense: 1,
      presence: 2
    };
  }

  if (player.stats.presence === undefined) player.stats.presence = 2;

  if (!player.reputation) {
    player.reputation = {
      chaos: 0,
      honor: 0,
      intimidation: 0,
      title: "Unknown"
    };
  }

  if (!player.flags) {
    player.flags = {
      knownTroublemaker: false,
      helpedTownsfolk: false,
      bartenderBarred: false,
      blockedFromStreet: false,
      wantedByGuards: false
    };
  }

  if (player.flags.knownTroublemaker === undefined) player.flags.knownTroublemaker = false;
  if (player.flags.helpedTownsfolk === undefined) player.flags.helpedTownsfolk = false;
  if (player.flags.bartenderBarred === undefined) player.flags.bartenderBarred = false;
  if (player.flags.blockedFromStreet === undefined) player.flags.blockedFromStreet = false;
  if (player.flags.wantedByGuards === undefined) player.flags.wantedByGuards = false;

  return player;
}

function loadPlayer(playerName) {
  const playerFilePath = getPlayerFilePath(playerName);

  if (fs.existsSync(playerFilePath)) {
    const player = JSON.parse(fs.readFileSync(playerFilePath, "utf8"));
    return ensurePlayerShape(player);
  }

  const newPlayer = createNewPlayer(playerName);
  savePlayer(newPlayer);
  return newPlayer;
}

function savePlayer(player) {
  const playerFilePath = getPlayerFilePath(player.name);
  fs.writeFileSync(playerFilePath, JSON.stringify(ensurePlayerShape(player), null, 2));
}

function loadAllPlayers() {
  if (!fs.existsSync(playersFolder)) {
    return [];
  }

  const files = fs.readdirSync(playersFolder).filter(file => file.endsWith(".json"));

  return files.map(file => {
    const filePath = path.join(playersFolder, file);
    return ensurePlayerShape(JSON.parse(fs.readFileSync(filePath, "utf8")));
  });
}

function getOtherPlayersInSameLocation(currentPlayer) {
  const allPlayers = loadAllPlayers();

  return allPlayers.filter(player =>
    player.name !== currentPlayer.name &&
    player.location === currentPlayer.location
  );
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

function buildResultBlock(lines, flavor) {
  let result = "RESULT\n";

  lines.forEach(line => {
    result += `- ${line}\n`;
  });

  if (flavor) {
    result += `\n${flavor}`;
  }

  return result;
}

function updateReputation(player, changes) {
  for (const key in changes) {
    if (player.reputation[key] !== undefined) {
      player.reputation[key] += changes[key];
    }
  }

  if (player.reputation.chaos >= 10) {
    player.flags.knownTroublemaker = true;
  }

  if (player.reputation.honor >= 10) {
    player.flags.helpedTownsfolk = true;
  }

  player.reputation.title = getReputationTitle(player.reputation);
}

function getReputationTitle(rep) {
  if (rep.chaos > 20 && rep.honor < 5) return "Agent of Chaos";
  if (rep.honor >= 20 && rep.chaos < 5) return "Paragon of Order";
  if (rep.honor >= 10 && rep.chaos < 10) return "Honored Guardian";
  if (rep.honor >= 5 && rep.chaos < 10) return "Trusted Soul";
  if (rep.intimidation >= 20) return "Warlord";
  if (rep.intimidation >= 10) return "Enforcer";
  if (rep.intimidation >= 5) return "Menacing Figure";
  if (rep.chaos > 10 && rep.honor > 10) return "Unpredictable Force";

  return "Unknown Figure";
}

function getReputationReaction(rep) {
  if (rep.chaos > 15) {
    return "Word spreads: you are not to be trusted with stability.";
  }

  if (rep.honor > 15) {
    return "The locals speak well of you.";
  }

  if (rep.intimidation > 15) {
    return "People step aside when you approach.";
  }

  if (rep.chaos > 8 && rep.honor > 8) {
    return "No one is quite sure what you’ll do next.";
  }

  return null;
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

function parseFlavor(rawText) {
  const text = (rawText || "").toLowerCase();

  return {
    mentionsKick: text.includes("kick"),
    mentionsPunch: text.includes("punch"),
    mentionsStab: text.includes("stab"),
    mentionsSlash: text.includes("slash"),
    mentionsShoot: text.includes("shoot") || text.includes("arrow") || text.includes("bow") || text.includes("snipe"),
    mentionsJump: text.includes("jump") || text.includes("leap"),
    mentionsSpin: text.includes("spin") || text.includes("360"),
    mentionsNoScope: text.includes("no scope") || text.includes("noscope"),
    isTrickShot:
      text.includes("360") ||
      text.includes("flip") ||
      text.includes("jump") ||
      text.includes("spin") ||
      text.includes("no scope") ||
      text.includes("trick shot")
  };
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

function markBartenderHostile(worldState, playerName) {
  const hostileList = worldState.locationStates.bar.stateFlags.bartenderHostileTo;
  if (!hostileList.includes(playerName)) {
    hostileList.push(playerName);
  }
}

function forgiveBartenderIfEarned(worldState, player) {
  const hostileList = worldState.locationStates.bar.stateFlags.bartenderHostileTo;
  if (
    hostileList.includes(player.name) &&
    player.reputation.honor >= 8 &&
    player.reputation.honor >= player.reputation.chaos
  ) {
    worldState.locationStates.bar.stateFlags.bartenderHostileTo =
      hostileList.filter(name => name !== player.name);
    player.flags.bartenderBarred = false;
    addWorldEvent(
      worldState,
      `Bartender Rowan finally relents toward ${player.name}. "Fine. Maybe you're trying to do better after all."`,
      "bar"
    );
  }
}

function banPlayerFromGuardZones(player, worldState, sourceLocation = null) {
  player.flags.blockedFromStreet = true;
  player.flags.bartenderBarred = true;
  player.flags.wantedByGuards = true;

  markBartenderHostile(worldState, player.name);

  worldState.globalState.guardsAlertLevel = Math.min(worldState.globalState.guardsAlertLevel + 2, 6);
  worldState.locationStates.street.stateFlags.guardsAlert = true;
  worldState.locationStates.bar.stateFlags.guardsWatchingBar = true;

  if (sourceLocation) {
    addWorldEvent(
      worldState,
      `${player.name} is marked as trouble by the guards. Word spreads fast: the street is closed to them, and the bar wants no part of them.`,
      sourceLocation
    );
  }
}

function forgiveGuardRestrictionsIfEarned(player, worldState) {
  if (
    player.flags.wantedByGuards &&
    player.reputation.honor >= 12 &&
    player.reputation.chaos <= 6 &&
    worldState.globalState.guardsAlertLevel <= 1
  ) {
    player.flags.blockedFromStreet = false;
    player.flags.wantedByGuards = false;

    addWorldEvent(
      worldState,
      `${player.name} has rebuilt enough trust that the guards stop actively blocking their path.`,
      "village"
    );
  }

  if (
    player.flags.bartenderBarred &&
    player.reputation.honor >= 8 &&
    player.reputation.honor >= player.reputation.chaos
  ) {
    player.flags.bartenderBarred = false;
  }
}

function canEnterDestination(player, destination) {
  if (destination === "street" && player.flags.blockedFromStreet) {
    return {
      allowed: false,
      message: `${player.name} tries to head for the street, but the guards have orders to turn them back.`
    };
  }

  if (destination === "bar" && player.flags.bartenderBarred) {
    return {
      allowed: false,
      message: `${player.name} approaches the bar, but word has already reached Rowan. The door stays closed.`
    };
  }

  return { allowed: true };
}

function getInventoryHtml(player, playerName) {
  if (player.inventory.length === 0) {
    return "<p>Your inventory is empty.</p>";
  }

  return `
    <ul>
      ${player.inventory.map((item, index) => `
        <li>
          ${item}
          ${item === "Health Potion" ? ` <a href="/use-item/${index}?player=${encodeURIComponent(playerName)}">Use</a>` : ""}
        </li>
      `).join("")}
    </ul>
  `;
}

function getOtherPlayersHtml(currentPlayer) {
  const others = getOtherPlayersInSameLocation(currentPlayer);

  if (others.length === 0) {
    return "<p>No other players are here.</p>";
  }

  return `
    <ul>
      ${others.map(player => `<li>${player.name}</li>`).join("")}
    </ul>
  `;
}

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
  } else if (eventObj.id === "street_guard_stop" || eventObj.id === "bar_guard_question" || eventObj.id === "village_guard_question") {
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

function classifyReaction(rawText) {
  const text = (rawText || "").toLowerCase().trim();
  const flavor = parseFlavor(text);

  if (!text) {
    return { intent: "unknown", text, flavor };
  }

  if (text.startsWith("say ")) {
    return { intent: "say", text, message: rawText.slice(4).trim(), flavor };
  }

  if (
    text.includes("attack") ||
    text.includes("hit") ||
    text.includes("strike") ||
    text.includes("kick") ||
    text.includes("punch") ||
    text.includes("stab") ||
    text.includes("slash") ||
    text.includes("shoot") ||
    text.includes("arrow") ||
    text.includes("bow") ||
    text.includes("snipe") ||
    text.includes("tackle")
  ) {
    return {
      intent: "attack",
      style: (text.includes("shoot") || text.includes("arrow") || text.includes("bow") || text.includes("snipe")) ? "ranged" : "melee",
      text,
      flavor
    };
  }

  if (
    text.includes("defend") ||
    text.includes("block") ||
    text.includes("brace") ||
    text.includes("protect") ||
    text.includes("shield")
  ) {
    return { intent: "defend", text, flavor };
  }

  if (
    text.includes("help") ||
    text.includes("save") ||
    text.includes("drag") ||
    text.includes("carry") ||
    text.includes("bandage") ||
    text.includes("stamp out") ||
    text.includes("put out") ||
    text.includes("kick the lantern")
  ) {
    return { intent: "help", text, flavor };
  }

  if (
    text.includes("talk") ||
    text.includes("calm") ||
    text.includes("convince") ||
    text.includes("persuade") ||
    text.includes("reason") ||
    text.includes("order") ||
    text.includes("shout") ||
    text.includes("explain")
  ) {
    return { intent: "talk", text, flavor };
  }

  if (text.includes("threaten") || text.includes("intimidate")) {
    return { intent: "threaten", text, flavor };
  }

  if (
    text.includes("run") ||
    text.includes("flee") ||
    text.includes("escape") ||
    text.includes("back away") ||
    text.includes("retreat")
  ) {
    return { intent: "flee", text, flavor };
  }

  if (
    text.includes("hide") ||
    text.includes("watch") ||
    text.includes("observe") ||
    text.includes("wait") ||
    text.includes("stand back")
  ) {
    return { intent: "observe", text, flavor };
  }

  return { intent: "unknown", text, flavor };
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

function interpretAction(input) {
  const text = (input || "").toLowerCase().trim();

  if (text.includes("threaten") || text.includes("intimidate")) {
    return { type: "threaten" };
  }

  if (text === "help") {
    return { type: "help" };
  }

  if (text === "look" || text.includes("look")) {
    return { type: "look" };
  }

  if (!text) {
    return { type: "unknown" };
  }

  if (text.startsWith("say ")) {
    return { type: "say", message: input.slice(4).trim() };
  }

  if (text === "say") {
    return { type: "say", message: "" };
  }

  if (text.includes("run") || text.includes("flee") || text.includes("escape")) {
    return { type: "run" };
  }

  if (text.includes("defend") || text.includes("block") || text.includes("brace")) {
    return { type: "defend" };
  }

  if (text.includes("drink") || text.includes("ale") || text.includes("beer")) {
    return { type: "drink" };
  }

  if (text.includes("eat") || text.includes("meal") || text.includes("food")) {
    return { type: "eat" };
  }

  if (
    text.includes("bar fight") ||
    text.includes("barfight") ||
    text.includes("start a fight") ||
    text.includes("punch someone in the bar") ||
    text.includes("fight in the bar")
  ) {
    return { type: "barfight" };
  }

  if (text.includes("search") || text.includes("look around") || text.includes("inspect")) {
    return { type: "search" };
  }

  if (
    text.includes("shoot") ||
    text.includes("arrow") ||
    text.includes("bow") ||
    text.includes("snipe")
  ) {
    return { type: "attack", style: "ranged", rawText: input };
  }

  if (
    text.includes("stab") ||
    text.includes("slash") ||
    text.includes("hit") ||
    text.includes("attack") ||
    text.includes("strike") ||
    text.includes("kick") ||
    text.includes("punch")
  ) {
    return { type: "attack", style: "melee", rawText: input };
  }

  return { type: "unknown", rawText: input };
}

/* =========================
   UI HELPERS
========================= */

function buildLookDescription(player, worldState) {
  const location = world[player.location];
  const locState = worldState.locationStates[player.location];
  const rep = player.reputation || { chaos: 0, honor: 0, intimidation: 0 };

  let description = `📍 ${player.location.toUpperCase()}\n`;
  description += `${location.description}\n\n`;

  if (player.location === "bar" || player.location === "village") {
    if (rep.chaos >= 10) {
      description += "People glance at you, then quickly look away. No one wants trouble.\n";
    } else if (rep.honor >= 10) {
      description += "A few locals nod in respect as you enter.\n";
    } else if (rep.intimidation >= 10) {
      description += "The room grows quieter. Conversations fade when you appear.\n";
    }
  }

  if (player.flags.wantedByGuards && (player.location === "village" || player.location === "street" || player.location === "bar")) {
    description += "You can feel the weight of official attention. Guards are watching for you.\n";
  }

  if (locState.activeEvent) {
    description += `\n⚠ ACTIVE EVENT\n- ${locState.activeEvent.name}: ${locState.activeEvent.text}\n`;
  }

  description += "\n👀 You see:\n";

  if (locState.npcs && locState.npcs.length > 0) {
    locState.npcs.forEach(npc => {
      description += `- ${npc} (npc)\n`;
    });
  }

  if (player.location === "forest") {
    if (worldState.goblinAlive) {
      description += "- Goblin (hostile)\n";
    }

    const corpses = worldState.goblinCorpses || 0;
    if (corpses > 0) {
      description += `- ${corpses} Goblin corpse${corpses > 1 ? "s" : ""}\n`;
    }

    if (worldState.locationStates.forest.stateFlags.forestDanger > 0) {
      description += `- Signs of danger in the brush (danger ${worldState.locationStates.forest.stateFlags.forestDanger})\n`;
    }
  }

  const others = getOtherPlayersInSameLocation(player);
  if (others.length > 0) {
    others.forEach(p => {
      description += `- ${p.name} (player)\n`;
    });
  }

  description += "\n🚪 Exits:\n";
  location.paths.forEach(p => {
    description += `- ${p}\n`;
  });

  return description;
}

function getLocationExtra(player, worldState) {
  const locState = worldState.locationStates[player.location];
  let extra = "";

  if (player.location === "forest") {
    if (worldState.goblinAlive) {
      extra += `
        <p>A goblin is lurking here.</p>
        <p><strong>Goblin HP:</strong> ${worldState.goblinHp}</p>
      `;
    } else {
      extra += `<p>The forest is eerily quiet...</p>`;
    }

    const corpses = worldState.goblinCorpses || 0;
    if (corpses === 1) {
      extra += `<p>There is 1 goblin corpse on the ground.</p>`;
    } else if (corpses > 1) {
      extra += `<p>There are ${corpses} goblin corpses on the ground.</p>`;
    }

    if (locState.stateFlags.forestDanger > 0) {
      extra += `<p><strong>Forest Danger:</strong> ${locState.stateFlags.forestDanger}</p>`;
    }
  }
if (!worldState.goblinAlive) {
  extra += `<p>The longer you remain here, the more likely more goblins are to find you.</p>`;
}
  if (player.location === "bar") {
    extra += `
      <p>You can rest here and recover your strength.</p>
      <a href="/rest?player=${encodeURIComponent(player.name)}">Rest</a>
      <p>Bar actions to try: drink, eat, barfight, calm someone down, threaten, help, watch</p>
    `;

    if (locState.stateFlags.barDamaged) {
      extra += `<p><strong>The bar still shows damage from earlier chaos.</strong></p>`;
    }

    if (locState.stateFlags.barOnFire) {
      extra += `<p><strong>The bar is on fire.</strong></p>`;
    }

    if (locState.stateFlags.bartenderHostileTo.includes(player.name)) {
      extra += `<p><strong>Bartender Rowan is hostile to you and will not let you rest easily.</strong></p>`;
    }

    if (locState.stateFlags.guardsWatchingBar) {
      extra += `<p><strong>The bar is being watched more closely by the guards.</strong></p>`;
    }
  }

  if (player.location === "street") {
    if (locState.stateFlags.cartCrashed) {
      extra += `<p>Broken wood and spilled cargo clutter parts of the street.</p>`;
    }

    if (locState.stateFlags.guardsAlert) {
      extra += `<p>The town guards are alert here.</p>`;
    }
  }

  if (player.flags.blockedFromStreet) {
    extra += `<p><strong>Guard Restriction:</strong> the guards will block you from entering the street until your reputation improves.</p>`;
  }

  if (player.flags.bartenderBarred) {
    extra += `<p><strong>Bar Restriction:</strong> you are currently barred from easy access or rest at the bar.</p>`;
  }

  if (locState.activeEvent) {
    extra += `
      <div style="border:2px solid #a00; padding:12px; margin:14px 0; background:#fff4f4;">
        <h3>ACTIVE EVENT</h3>
        <p><strong>${locState.activeEvent.name}</strong></p>
        <p>${locState.activeEvent.text}</p>
        <p><em>React in free text.</em></p>
      </div>
    `;
  }

  extra += `
    <p><strong>Type an action:</strong></p>
    <form method="POST" action="/action?player=${encodeURIComponent(player.name)}">
      <input type="text" name="action" placeholder="e.g. say We should run / attack goblin / I calm the drunk down" style="width: 420px;" />
      <button type="submit">Submit Action</button>
    </form>
  `;

  return extra;
}

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

  if (player.location === "bar") {
    const rep = player.reputation || { chaos: 0, honor: 0, intimidation: 0 };
    const barFlags = worldState.locationStates.bar.stateFlags;

    if (barFlags.barOnFire) {
      addWorldEvent(
        worldState,
        `${player.name} tries to rest, but the tavern is actively on fire.`,
        "bar"
      );
    } else if (barFlags.bartenderHostileTo.includes(player.name) || player.flags.bartenderBarred || rep.chaos >= 10) {
      addWorldEvent(
        worldState,
        `${player.name} tries to rest, but the bartender blocks the way.\n"Not after what you've been doing. Earn your way back first."`,
        "bar"
      );
    } else if (rep.honor >= 10) {
      const healAmount = 30;
      player.hp = Math.min(player.maxHp, player.hp + healAmount);

      addWorldEvent(
        worldState,
        `${player.name} is welcomed warmly by the tavern.\n"You've earned this."\nRecovers ${healAmount} HP.`,
        "bar"
      );
    } else if (rep.intimidation >= 10) {
      const healAmount = 20;
      player.hp = Math.min(player.maxHp, player.hp + healAmount);

      addWorldEvent(
        worldState,
        `${player.name} sits down. The room goes quiet.\nNo one dares approach.\nRecovers ${healAmount} HP.`,
        "bar"
      );
    } else {
      const healAmount = 20;
      player.hp = Math.min(player.maxHp, player.hp + healAmount);

      addWorldEvent(
        worldState,
        `${player.name} rests at the tavern and recovers ${healAmount} HP.`,
        "bar"
      );
    }
  } else {
    addWorldEvent(worldState, `${player.name} tries to rest in an unsafe place.`, player.location);
  }

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

  if (isNaN(index) || index < 0 || index >= player.inventory.length) {
    addWorldEvent(worldState, `${player.name} tries to use an invalid item.`, player.location);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  const item = player.inventory[index];

  if (item === "Health Potion") {
    const healAmount = 25;
    const oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    const actualHeal = player.hp - oldHp;
    player.inventory.splice(index, 1);

    if (actualHeal > 0) {
      addWorldEvent(worldState, `${player.name} drinks a Health Potion and recovers ${actualHeal} HP.`, player.location);
    } else {
      addWorldEvent(worldState, `${player.name} drinks a Health Potion, but gains no further benefit.`, player.location);
    }
  } else {
    addWorldEvent(worldState, `${player.name} cannot use ${item}.`, player.location);
  }

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