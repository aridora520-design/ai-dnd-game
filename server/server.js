const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;

app.use(express.urlencoded({ extended: true }));

const playersFolder = path.join(__dirname, "players");
const worldFilePath = path.join(__dirname, "world.json");

if (!fs.existsSync(playersFolder)) {
  fs.mkdirSync(playersFolder);
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
      defense: 1
    },
    reputation: {
      chaos: 0,
      honor: 0,
      intimidation: 0,
      title: "Unknown"
    }
  };
}

function createNewWorldState() {
  return {
    goblinAlive: true,
    goblinHp: 40,
    forestPotionFound: false,
    eventLog: [
      "The world begins. The village waits in silence."
    ]
  };
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

function getPlayerFilePath(playerName) {
  const safeName = playerName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(playersFolder, `${safeName}.json`);
}

function loadWorldState() {
  if (fs.existsSync(worldFilePath)) {
    return JSON.parse(fs.readFileSync(worldFilePath, "utf8"));
  }

  const newWorld = createNewWorldState();
  fs.writeFileSync(worldFilePath, JSON.stringify(newWorld, null, 2));
  return newWorld;
}

function saveWorldState(worldState) {
  fs.writeFileSync(worldFilePath, JSON.stringify(worldState, null, 2));
}

function loadPlayer(playerName) {
  const playerFilePath = getPlayerFilePath(playerName);

  if (fs.existsSync(playerFilePath)) {
    const player = JSON.parse(fs.readFileSync(playerFilePath, "utf8"));

    if (!player.inventory) {
      player.inventory = [];
    }

    if (!player.stats) {
      player.stats = {
        strength: 2,
        dexterity: 3,
        defense: 1
      };
    }

if (!player.reputation) {
  player.reputation = {
    chaos: 0,
    honor: 0,
    intimidation: 0,
    title: "Unknown"
  };
}
    return player;
  }

  const newPlayer = createNewPlayer(playerName);
  savePlayer(newPlayer);
  return newPlayer;
}

function savePlayer(player) {
  const playerFilePath = getPlayerFilePath(player.name);
  fs.writeFileSync(playerFilePath, JSON.stringify(player, null, 2));
}

function loadAllPlayers() {
  if (!fs.existsSync(playersFolder)) {
    return [];
  }

  const files = fs.readdirSync(playersFolder).filter(file => file.endsWith(".json"));

  return files.map(file => {
    const filePath = path.join(playersFolder, file);
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  });
}

function getOtherPlayersInSameLocation(currentPlayer) {
  const allPlayers = loadAllPlayers();

  return allPlayers.filter(player =>
    player.name !== currentPlayer.name &&
    player.location === currentPlayer.location
  );
}

function addWorldEvent(worldState, message) {
  worldState.eventLog.unshift(message);

  if (worldState.eventLog.length > 20) {
    worldState.eventLog.pop();
  }

  saveWorldState(worldState);
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
    return `Your kick slams into the goblin for ${damage} damage.`;
  }
  if (flavor.mentionsPunch) {
    return `Your punch lands cleanly and deals ${damage} damage.`;
  }
  if (flavor.mentionsStab) {
    return `You drive the stab home and deal ${damage} damage.`;
  }
  if (flavor.mentionsSlash) {
    return `Your slash cuts across the goblin for ${damage} damage.`;
  }

  return `You strike the goblin for ${damage} damage.`;
}

function narratePlayerMiss(style, flavor) {
  if (style === "ranged" && flavor.isTrickShot) {
    return "The trick shot looks spectacular, but fails to connect.";
  }

  if (style === "ranged") {
    return "Your shot misses as the goblin jerks out of the way.";
  }

  if (flavor.mentionsKick) {
    return "Your kick cuts through empty air as the goblin skips back.";
  }
  if (flavor.mentionsPunch) {
    return "You throw the punch, but the goblin slips outside your reach.";
  }
  if (flavor.mentionsStab) {
    return "Your stab goes wide as the goblin twists away.";
  }
  if (flavor.mentionsSlash) {
    return "Your slash misses, leaving only a hiss through the air.";
  }

  return "The goblin twists aside and your strike misses.";
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
  return "You brace perfectly and turn the goblin’s attack aside.";
}

function narrateDefendPartial(damage) {
  return `You block most of it, but still lose ${damage} HP.`;
}

function narrateRunSuccess() {
  return "You break away from the goblin and escape to the street.";
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

  player.reputation.title = getReputationTitle(player.reputation);
}

function getReputationTitle(rep) {
  if (rep.chaos > 20 && rep.honor < 5) return "Agent of Chaos";
  if (rep.honor > 20 && rep.chaos < 5) return "Local Hero";
  if (rep.intimidation > 15) return "Feared Presence";
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
      "Problem solved. Subtly was not involved.",
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
  const text = rawText.toLowerCase();

  return {
    mentionsKick: text.includes("kick"),
    mentionsPunch: text.includes("punch"),
    mentionsStab: text.includes("stab"),
    mentionsSlash: text.includes("slash"),
    mentionsShoot: text.includes("shoot") || text.includes("arrow") || text.includes("bow") || text.includes("snipe"),
    mentionsJump: text.includes("jump") || text.includes("leap"),
    mentionsSpin: text.includes("spin") || text.includes("360"),
    mentionsNoScope: text.includes("no scope"),
    isTrickShot:
      text.includes("360") ||
      text.includes("flip") ||
      text.includes("jump") ||
      text.includes("spin") ||
      text.includes("no scope") ||
      text.includes("trick shot")
  };
}

function interpretAction(input) {
  const text = input.toLowerCase().trim();

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

function handlePlayerDeath(player, worldState) {
  addWorldEvent(worldState, `${player.name} falls in battle.`);
  player.location = "village";
  player.hp = player.maxHp;
  addWorldEvent(worldState, `${player.name} awakens in the village, restored to full health.`);
  savePlayer(player);
  saveWorldState(worldState);
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

    <p style="font-size:18px;">
      Type actions like a real adventure.
    </p>

    <p style="color:gray;">
      Example: "I attack the goblin with my sword"
    </p>

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
      Enter your name to begin. Then use the links in the game to move, fight enemies, and interact with other players.
    </p>

    <p style="color:#888;">
      Try: "go to forest", "attack goblin", "rest"
    </p>

  </div>
`);
    return null;
  }

  return playerName;
}

app.get("/", (req, res) => {
  const playerName = requirePlayer(req, res);
  if (!playerName) return;

  const player = loadPlayer(playerName);
  const worldState = loadWorldState();
  const location = world[player.location];

  const links = location.paths.map((p) =>
    `<a href="/move/${p}?player=${encodeURIComponent(playerName)}">${p}</a>`
  ).join("<br>");

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

  // 👇 THIS MUST BE OUTSIDE the goblinAlive check
  const corpses = worldState.goblinCorpses || 0;

  if (corpses === 1) {
    extra += `<p>There is 1 goblin corpse on the ground.</p>`;
  } else if (corpses > 1) {
    extra += `<p>There are ${corpses} goblin corpses on the ground.</p>`;
  }

  }

  if (player.location === "bar") {
    extra += `
      <p>You can rest here and recover your strength.</p>
      <a href="/rest?player=${encodeURIComponent(playerName)}">Rest</a>
    `;
  }

  extra += `
    <p><strong>Type an action:</strong></p>
    <form method="POST" action="/action?player=${encodeURIComponent(playerName)}">
      <input type="text" name="action" placeholder="e.g. say We should run / attack goblin" style="width: 380px;" />
      <button type="submit">Submit Action</button>
    </form>
  `;

  const eventsHtml = worldState.eventLog.map(event => `<li>${event}</li>`).join("");

  res.send(`
    <h1>${player.name.toUpperCase()} — ${player.location.toUpperCase()}</h1>
    <p>${location.description}</p>
    <p><strong>HP:</strong> ${player.hp} / ${player.maxHp}</p>
    <p><strong>Stats:</strong> STR ${player.stats.strength}, DEX ${player.stats.dexterity}, DEF ${player.stats.defense}</p>
    ${extra}
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

  if (interpreted.type === "say") {
    const othersHere = getOtherPlayersInSameLocation(player);

    if (!interpreted.message) {
      addWorldEvent(worldState, `${player.name} opens their mouth, but says nothing.`);
    } else if (othersHere.length === 0) {
      addWorldEvent(worldState, `${player.name} says into the empty ${player.location}: "${interpreted.message}"`);
    } else {
      addWorldEvent(worldState, `${player.name} says: "${interpreted.message}"`);
    }

    savePlayer(player);
    saveWorldState(worldState);
    return res.redirect(`/?player=${encodeURIComponent(playerName)}`);
  }

  addWorldEvent(worldState, `${player.name} attempts: "${rawAction}"`);

  if (interpreted.type === "look") {
  const location = world[player.location];

  let description = `📍 ${player.location.toUpperCase()}\n`;
  description += `${location.description}\n\n`;

  // 👀 Entities
  if (player.location === "forest") {
    if (worldState.goblinAlive) {
      description += "👀 You see:\n- Goblin (hostile)\n";
    }

    const corpses = worldState.goblinCorpses || 0;
    if (corpses > 0) {
      description += `- ${corpses} Goblin corpse${corpses > 1 ? "s" : ""}\n`;
    }
  }

  const others = getOtherPlayersInSameLocation(player);
  if (others.length > 0) {
    others.forEach(p => {
      description += `- ${p.name} (player)\n`;
    });
  }

  // 🚪 Exits
  description += "\n🚪 Exits:\n";
  location.paths.forEach(p => {
    description += `- ${p}\n`;
  });

  addWorldEvent(worldState, `${player.name} looks around.\n${description}`);

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

    addWorldEvent(worldState, `${player.name}\n${resultText}`);
  } else {
    const attackRoll = rollD20();
    const total = attackRoll + player.stats.strength;
    const dc = 12;

    if (total >= dc) {
      const damage = 6 + Math.floor(Math.random() * 6);
      updateReputation(player, { chaos: 1, intimidation: 1 });
      worldState.goblinHp -= damage;

      addWorldEvent(worldState, `${player.name}: ${narratePlayerHit(interpreted.style, damage, flavor)}`);

      if (worldState.goblinHp <= 0) {
        worldState.goblinAlive = false;
        worldState.goblinCorpses = (worldState.goblinCorpses || 0) + 1;
        updateReputation(player, { chaos: 3, intimidation: 2 });

        addWorldEvent(worldState, `${player.name} kills the goblin.`);
        addWorldEvent(worldState, "With its dying breath, the goblin blows on a horn and calls for reinforcements.");
        addWorldEvent(worldState, "Another goblin rushes in!");
        const reaction = getReputationReaction(player.reputation);
        const resultText = buildResultBlock(
          [
            "Action: Attack",
            "Outcome: Kill",
            `Damage: ${damage}`,
            `Goblin Corpses: ${worldState.goblinCorpses}`,
            "Threat: Reinforcements arrived",
             `Reputation: ${player.reputation.title}`, // 👈 ADD
             reaction ? `World: ${reaction}` : null
             ].filter(Boolean),   // 👈 THIS LINE MUST EXIST     // 👈 ADD
          "You solved one problem loudly enough to create another."
        );

        addWorldEvent(worldState, `${player.name}\n${resultText}`);

        worldState.goblinAlive = true;
        worldState.goblinHp = 40;
      } else {
        const reaction = getReputationReaction(player.reputation);
        const resultText = buildResultBlock(
          [
            "Action: Attack",
            "Outcome: Hit",
            `Damage: ${damage}`,
            `Goblin HP: ${Math.max(0, worldState.goblinHp)}`,
            "Threat: Still active",
            `Reputation: ${player.reputation.title}`, // 👈 ADD
            reaction ? `World: ${reaction}` : null     // 👈 ADD
          ].filter(Boolean),   // 👈 THIS LINE MUST EXIST
          getAttackFlavor("hit")
        );

        addWorldEvent(worldState, `${player.name}\n${resultText}`);

        const goblinRoll = rollD20();
        const goblinTotal = goblinRoll + 1;
        const playerDefenseDc = 10 + player.stats.defense;

        if (goblinTotal >= playerDefenseDc) {
          const goblinDamage = 6 + Math.floor(Math.random() * 4);
          player.hp = Math.max(0, player.hp - goblinDamage);
          addWorldEvent(worldState, `${player.name}: ${narrateGoblinAttackHit(goblinDamage)}`);
        } else {
          addWorldEvent(worldState, `${player.name}: ${narrateGoblinAttackMiss()}`);
        }

        if (player.hp <= 0) {
          addWorldEvent(worldState, `${player.name}: ${narrateDeath()}`);
          player.location = "village";
          player.hp = player.maxHp;
          addWorldEvent(worldState, `${player.name}: ${narrateRespawn()}`);
        }
      }
    } else {
      updateReputation(player, { chaos: 1 });
      addWorldEvent(worldState, `${player.name}: ${narratePlayerMiss(interpreted.style, flavor)}`);
      const reaction = getReputationReaction(player.reputation);
      const resultText = buildResultBlock(
        [
          "Action: Attack",
          "Outcome: Miss",
          `Goblin HP: ${worldState.goblinHp}`,
          "Threat: Still active",
           `Reputation: ${player.reputation.title}`,
          reaction ? `World: ${reaction}` : null
          ].filter(Boolean),   // 👈 THIS LINE MUST EXIST
        getAttackFlavor("miss")
      );

      addWorldEvent(worldState, `${player.name}\n${resultText}`);
    }
  }

} else if (interpreted.type === "defend") {
} else if (interpreted.type === "defend") {
  } else if (interpreted.type === "defend") {
    if (player.location !== "forest" || !worldState.goblinAlive) {
      addWorldEvent(worldState, `${player.name} tries to defend, but nothing threatens them.`);
    } else {
      const goblinRoll = rollD20();
      const goblinTotal = goblinRoll + 1;
      const defendDc = 14 + player.stats.defense;

      if (goblinTotal >= defendDc) {
        const reducedDamage = 3;
        player.hp = Math.max(0, player.hp - reducedDamage);
        addWorldEvent(worldState, `${player.name}: ${narrateDefendPartial(reducedDamage)}`);
      } else {
        addWorldEvent(worldState, `${player.name}: ${narrateDefendSuccess()}`);
      }

      if (player.hp <= 0) {
        handlePlayerDeath(player, worldState);
      }
    }
  } else if (interpreted.type === "run") {
    if (player.location !== "forest" || !worldState.goblinAlive) {
      addWorldEvent(worldState, `${player.name} tries to run, but there is nothing to flee from.`);
    } else {
      const roll = rollD20();
      const total = roll + player.stats.dexterity;
      const dc = 11;

      if (total >= dc) {
        player.location = "street";
        addWorldEvent(worldState, `${player.name}: ${narrateRunSuccess()}`);
      } else {
        const goblinDamage = 5;
        player.hp = Math.max(0, player.hp - goblinDamage);
        addWorldEvent(worldState, `${player.name}: ${narrateRunFail(goblinDamage)}`);

        if (player.hp <= 0) {
          handlePlayerDeath(player, worldState);
        }
      }
    }
  } else if (interpreted.type === "search") {
    if (player.location !== "forest") {
      addWorldEvent(worldState, `${player.name} searches around, but finds nothing useful.`);
    } else if (!worldState.forestPotionFound) {
      player.inventory.push("Health Potion");
      worldState.forestPotionFound = true;
      addWorldEvent(worldState, `${player.name} searches the forest and finds a Health Potion.`);
    } else {
      addWorldEvent(worldState, `${player.name} searches the forest, but finds nothing new.`);
    }
  } else {
    addWorldEvent(worldState, `The Dungeon Master does not understand ${player.name}'s action yet.`);
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

  if (location.paths.includes(destination)) {
    player.location = destination;
    addWorldEvent(worldState, `${player.name} travels to ${destination}.`);
  } else {
    addWorldEvent(worldState, `${player.name} cannot reach ${destination} from here.`);
  }

  savePlayer(player);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/rest", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  const worldState = loadWorldState();

  if (player.location === "bar") {
    const healAmount = 20;
    const oldHp = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + healAmount);
    const actualHeal = player.hp - oldHp;

    if (actualHeal > 0) {
      addWorldEvent(worldState, `${player.name} rests in the bar and recovers ${actualHeal} HP.`);
    } else {
      addWorldEvent(worldState, `${player.name} rests in the bar, but is already at full health.`);
    }
  } else {
    addWorldEvent(worldState, `${player.name} tries to rest in an unsafe place.`);
  }

  savePlayer(player);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/use-item/:index", (req, res) => {
  const playerName = req.query.player;
  if (!playerName) return res.redirect("/");

  const player = loadPlayer(playerName);
  const worldState = loadWorldState();
  const index = parseInt(req.params.index, 10);

  if (isNaN(index) || index < 0 || index >= player.inventory.length) {
    addWorldEvent(worldState, `${player.name} tries to use an invalid item.`);
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
      addWorldEvent(worldState, `${player.name} drinks a Health Potion and recovers ${actualHeal} HP.`);
    } else {
      addWorldEvent(worldState, `${player.name} drinks a Health Potion, but gains no further benefit.`);
    }
  } else {
    addWorldEvent(worldState, `${player.name} cannot use ${item}.`);
  }

  savePlayer(player);
  res.redirect(`/?player=${encodeURIComponent(playerName)}`);
});

app.get("/reset-world", (req, res) => {
  const playerName = req.query.player;

  if (playerName !== "Hunt") { // ← your name here
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

app.listen(port, () => {
  console.log(`Game running at http://localhost:${PORT}`);
});