function finishIntroAction(player, events) {
  player.introLog = player.introLog || [];
  player.introLog.push(...events);

  if (player.introLog.length > 100) {
    player.introLog = player.introLog.slice(-100);
  }

  return { handled: true, events };
}

function ensureIntroQuest(player) {
  player.flags = player.flags || {};
  player.introLog = player.introLog || [];

  if (player.flags.completedIntroQuest) return;

  player.location = "bar";

  if (!player.instance || player.instance.id !== "bar_fire_intro") {
    player.instance = {
      active: true,
      id: "bar_fire_intro",
      stage: "bartender_intro",
      barHp: 100,
      villageHp: 100,
      goblinHp: 20,
      warbandHp: 45,
      bossHp: 70,
      fireResolved: false,
      rewardGiven: false,
      completed: false
    };
  }
}

function isInIntroQuest(player) {
  return player.instance?.active === true && player.instance.id === "bar_fire_intro";
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function introAttack(player, enemyName, enemyHpKey, q) {
  const roll = rollD20();
  const str = player.stats?.strength || 0;
  const damageBase = Math.floor(Math.random() * 6) + 1 + str;

  let damage = damageBase;
  let text;

  if (roll === 20) {
    damage *= 2;
    text = `Critical hit! ${player.name} rolls 20 and strikes ${enemyName} for ${damage} damage.`;
  } else if (roll >= 10) {
    text = `${player.name} rolls ${roll} and hits ${enemyName} for ${damage} damage.`;
  } else {
    damage = 0;
    text = `${player.name} rolls ${roll} and misses ${enemyName}.`;
  }

  q[enemyHpKey] = Math.max(0, q[enemyHpKey] - damage);
  return { roll, damage, text };
}

function introEnemyCounterattack(player, enemyName, damage = 6) {
  const roll = rollD20();

  if (roll >= 10) {
    player.hp = Math.max(0, player.hp - damage);
    return `${enemyName} rolls ${roll} and hits ${player.name} for ${damage} damage. ${player.name} HP: ${player.hp}/${player.maxHp}.`;
  }

  return `${enemyName} rolls ${roll} and misses ${player.name}.`;
}

function completeIntroQuest(player, events, endingText) {
  const q = player.instance;
  if (!q) return;

  q.stage = "wake";
  q.completed = true;

  if (!q.rewardGiven) {
    player.resources = player.resources || { gold: 0, wood: 0, stone: 0 };
    player.resources.gold += 5;
    player.title = q.villageHp <= 0 ? "Witness of the Fall" : "Survivor of the Old Tale";
    q.rewardGiven = true;
  }

  events.push(endingText);
  events.push(`The dream starts to come apart. Rain becomes tavern noise. Smoke becomes candlelight.`);
  events.push(`Rowan's voice cuts through the darkness: "...and that's how my grandpa told the history of this village."`);
  events.push(`Type "wake up" or "continue" to return to the real Crooked Lantern.`);
}

function resolveIntroDownedPlayer(player, q, events) {
  if (player.hp > 0) return false;

  events.push(`${player.name} is severely wounded and collapses into the mud.`);
  events.push(`As ${player.name} lies there, barely conscious, the battle continues without them.`);

  const heroesWin = Math.random() < 0.5;

  if (heroesWin) {
    q.villageHp = Math.max(1, q.villageHp);
    events.push(`Through a terrible price, Mara, Captain Vey, and the remaining villagers beat the goblins back.`);
    events.push(`Black Hollow survives, but the old village is never whole again.`);
    completeIntroQuest(player, events, `The old tale ends with survival, grief, and a village that remembers the cost.`);
  } else {
    q.villageHp = 0;
    events.push(`Before passing out, ${player.name} watches in horror as the goblins wipe out the village.`);
    events.push(`Years later, a band of heroes destroys the goblins, but they come far too late.`);
    completeIntroQuest(player, events, `The old tale ends in ruin. Black Hollow becomes a warning whispered through generations.`);
  }

  player.hp = Math.max(1, Math.floor(player.maxHp / 2));
  return true;
}

function createIntroDisplayWorldState(player, realWorldState) {
  const q = player.instance;
  const clone = JSON.parse(JSON.stringify(realWorldState));

  clone.eventLog = player.introLog || [];

  clone.globalState = clone.globalState || {};
  clone.globalState.guardsAlertLevel = q?.guardsAlertLevel || 0;

  clone.locationStates = clone.locationStates || {};
  clone.locationStates.bar = clone.locationStates.bar || {};
  clone.locationStates.street = clone.locationStates.street || {};
  clone.locationStates.forest = clone.locationStates.forest || {};
  clone.locationStates.village = clone.locationStates.village || {};

  clone.locationStates.bar.status = q?.barHp <= 0 ? "destroyed" : q?.barHp < 100 ? "damaged" : "normal";
  clone.locationStates.bar.hp = q?.barHp ?? 100;
  clone.locationStates.bar.maxHp = 100;
  clone.locationStates.bar.stateFlags = clone.locationStates.bar.stateFlags || {};
  clone.locationStates.bar.stateFlags.barDamaged = q?.barHp < 100;
  clone.locationStates.bar.stateFlags.barOnFire = q?.stage === "goblin_window";

  clone.locationStates.village.hp = q?.villageHp ?? 100;
  clone.locationStates.village.maxHp = 100;
  clone.locationStates.village.status = q?.villageHp <= 0 ? "destroyed" : "threatened";
  clone.locationStates.village.stateFlags = clone.locationStates.village.stateFlags || {};
  clone.locationStates.village.stateFlags.crowdUneasy = true;

  clone.locationStates.street.stateFlags = clone.locationStates.street.stateFlags || {};
  clone.locationStates.street.stateFlags.guardsAlert = ["street_cart", "forest_tracks", "goblin_fight", "warband", "boss", "wake"].includes(q?.stage);
  clone.locationStates.street.stateFlags.cartCrashed = ["forest_tracks", "goblin_fight", "warband", "boss", "wake"].includes(q?.stage);

  clone.locationStates.forest.stateFlags = clone.locationStates.forest.stateFlags || {};
  clone.locationStates.forest.stateFlags.forestDanger =
    q?.stage === "boss" ? 8 :
    q?.stage === "warband" ? 6 :
    q?.stage === "goblin_fight" ? 3 :
    0;

  clone.goblinAlive = ["goblin_fight", "warband", "boss"].includes(q?.stage);
  clone.goblinType =
    q?.stage === "boss" ? "Goblin Leader" :
    q?.stage === "warband" ? "Goblin Warband" :
    q?.stage === "goblin_fight" ? "Goblin Scout" :
    null;

  clone.goblinHp =
    q?.stage === "boss" ? q.bossHp :
    q?.stage === "warband" ? q.warbandHp :
    q?.stage === "goblin_fight" ? q.goblinHp :
    0;

  clone.locationStates[player.location] = clone.locationStates[player.location] || {};
  clone.locationStates[player.location].activeEvent = getIntroActiveEvent(player);

  return clone;
}

function getIntroActiveEvent(player) {
  const q = player.instance;
  if (!q) return null;

  const events = {
    bartender_intro: {
      title: "The Crooked Lantern, Before the Fire",
      text: `Rain lashes against the windows of the Crooked Lantern.

Rowan stands behind the bar, older than his years, polishing the same mug again and again. His father built this tavern from salvaged beams. His grandfather, Aldren Rowan, survived the old war beneath the forest.

He looks at you like he already knows how this night ends.

"So here's an old tale my grandfather used to tell me," Rowan says.

Type "listen".`
    },

    bartender_story: {
      title: "Rowan's Grandfather",
      text: `Rowan lowers his voice.

"Back then, Black Hollow was barely a village. A tavern. A guard post. Six houses. A muddy road. People came here because land was cheap and nobody asked too many questions."

"There was Mara, the innkeeper's daughter. Sharp tongue. Faster hands. She could throw a mug harder than most men could swing a club."

"Captain Vey kept the guard post with three tired soldiers and a bad knee. He had lost one son to the forest already."

"And my grandfather, Aldren Rowan, was just a boy hiding under the tavern stairs, listening to adults pretend they weren't afraid."

Outside, thunder rolls.

"On a rainy night not so different from this one, rumors were spreading. People had gone missing near the forest."

Type anything to continue.`
    },

    goblin_window: {
      title: "A Green Face at the Window",
      text: `The tavern door bursts open.

A farmer named Tomas stumbles inside, soaked through, shaking so badly he can barely speak.

"Green faces," he gasps. "Teeth in the trees. They took Elira."

No one laughs.

Then Mara points at the window.

A small green face is pressed against the rain-streaked glass. Yellow eyes. Pointed ears. A cruel grin.

Someone screams. A chair crashes. A lantern smashes against the floor. Oil spreads. Fire crawls across the boards.

The Crooked Lantern is burning.

Choose: "put out fire", "help", "wait", "run", or anything else.`
    },

    street_cart: {
      title: "Smoke in the Street",
      text: q.barHp <= 0
        ? `Everyone spills into the muddy street.

Behind you, the Crooked Lantern burns. Flames eat through the roof beams. Smoke pours from shattered windows. Somewhere inside, people are still screaming.

Captain Vey arrives with the village guard, demanding answers.

Before anyone can speak clearly, a supply cart breaks loose at the top of the hill and rolls toward the crowd.`
        : `Everyone rushes into the muddy street, coughing through smoke.

The fire is beaten back, but the Crooked Lantern is blackened and scarred. Mara stares at the damage like something inside her has cracked.

Captain Vey arrives with the village guard, demanding answers.

Before anyone can speak clearly, a supply cart breaks loose at the top of the hill and rolls toward the crowd.`
    },

    forest_tracks: {
      title: "Tracks in the Mud",
      text: `The cart is stopped.

In the mud beneath it, Captain Vey finds clawed tracks. Small. Deep. Fresh.

They lead toward the forest.

Then someone sees movement between the trees.

The same goblin from the window is dragging a struggling girl — Elira — into the dark.`
    },

    goblin_fight: {
      title: "The First Goblin",
      text: `You rush into the forest.

The goblin turns, snarling, one claw locked around Elira's sleeve. It is small, but its eyes are bright with malice.

Mara grabs a broken branch. Captain Vey raises his old sword.

Goblin HP: ${q.goblinHp}.

Use real commands: attack goblin, defend, run, help Elira.`
    },

    warband: {
      title: "The Bone Whistle",
      text: `The goblin falls back.

Before it drops, it raises a bone whistle to its mouth.

The sound cuts through the forest.

More goblins emerge from the trees — scouts, cutters, torch-bearers, all wearing scraps of stolen village cloth.

The village is under attack.

Warband HP: ${q.warbandHp}.
Village HP: ${q.villageHp}.`
    },

    boss: {
      title: "Grusk, the Ash-Mouth",
      text: `The warband breaks.

Then the forest goes quiet.

A larger goblin steps forward. His jaw is marked with old burn scars. His blade is made from a broken guard sword.

Captain Vey whispers the name like a curse:

"Grusk."

The goblin leader smiles.

"Black Hollow burns tonight."

Boss HP: ${q.bossHp}.
Village HP: ${q.villageHp}.`
    },

    wake: {
      title: "Waking From the Old Tale",
      text: `The dream-memory fades.

Rain becomes tavern noise.
Smoke becomes candlelight.
Screams become distant laughter.

You are no longer in old Black Hollow.

Type "wake up" or "continue" to return to the real world.`
    }
  };

  return events[q.stage] || null;
}

function handleIntroQuestAction(player, rawAction) {
  const action = (rawAction || "").toLowerCase();
  const q = player.instance;
  const events = [];

  if (!q) return { handled: false, events };

  if (q.stage === "wake") {
    player.flags.completedIntroQuest = true;
    player.instance = null;
    player.introLog = [];
    player.location = "bar";

    events.push(`${player.name} wakes in the real Crooked Lantern. The village stands rebuilt on old scars.`);
    return finishIntroAction(player, events);
  }

  if (q.stage === "bartender_intro") {
    if (action.includes("listen")) {
      q.stage = "bartender_story";
      events.push(`${player.name} listens as Rowan begins the old tale.`);
    } else {
      events.push(`Rowan taps the counter. "Listen first. This story matters."`);
    }

    return finishIntroAction(player, events);
  }

  if (q.stage === "bartender_story") {
    q.stage = "goblin_window";
    events.push(`Rowan's story pulls ${player.name} into the rainy night old Black Hollow first saw the goblin at the window.`);
    return finishIntroAction(player, events);
  }

  if (q.stage === "goblin_window") {
    if (
      action.includes("put out") ||
      action.includes("water") ||
      action.includes("extinguish") ||
      action.includes("smother") ||
      action.includes("help")
    ) {
      q.barHp = Math.max(40, q.barHp - 35);
      events.push(`${player.name} throws themselves into the chaos and helps put out the fire.`);
      events.push(`Mara shouts orders. Villagers form a bucket line. The flames are beaten back, but the Crooked Lantern is scarred. Bar HP: ${q.barHp}/100.`);
    } else {
      q.barHp = 0;
      events.push(`${player.name} waits too long as panic takes over.`);
      events.push(`Everyone spills into the street. Behind them, the Crooked Lantern burns. Smoke pours from the windows, and screams echo from inside. Bar HP: 0/100.`);
    }

    q.fireResolved = true;
    q.stage = "street_cart";
    player.location = "street";
    return finishIntroAction(player, events);
  }

  if (q.stage === "street_cart") {
    if (
      action.includes("stop") ||
      action.includes("cart") ||
      action.includes("block") ||
      action.includes("grab") ||
      action.includes("help")
    ) {
      q.villageHp = Math.max(0, q.villageHp - 5);
      events.push(`${player.name} helps stop the runaway cart before it crushes the crowd.`);
      events.push(`Captain Vey notices. "Good. You can act under pressure."`);
    } else {
      q.villageHp = Math.max(0, q.villageHp - 15);
      events.push(`${player.name} fails to stop the cart cleanly. It crashes through the street, scattering villagers.`);
    }

    events.push(`The guards investigate the cart and find clawed tracks in the mud.`);
    q.stage = "forest_tracks";
    return finishIntroAction(player, events);
  }

  if (q.stage === "forest_tracks") {
    events.push(`${player.name} follows the tracks into the forest.`);
    events.push(`Ahead, the goblin from the window drags Elira between the trees.`);
    player.location = "forest";
    q.stage = "goblin_fight";
    return finishIntroAction(player, events);
  }

  if (q.stage === "goblin_fight") {
    if (
      action.includes("attack") ||
      action.includes("hit") ||
      action.includes("fight") ||
      action.includes("stab") ||
      action.includes("slash")
    ) {
      const result = introAttack(player, "the goblin scout", "goblinHp", q);
      events.push(result.text);
      events.push(`Goblin HP: ${q.goblinHp}.`);

      if (q.goblinHp > 0) {
        events.push(introEnemyCounterattack(player, "The goblin scout", 5));
        if (resolveIntroDownedPlayer(player, q, events)) {
          return finishIntroAction(player, events);
        }
      }
    } else if (action.includes("defend") || action.includes("protect") || action.includes("girl") || action.includes("elira")) {
      q.goblinHp = Math.max(0, q.goblinHp - 6);
      events.push(`${player.name} protects Elira and forces the goblin back. Goblin HP: ${q.goblinHp}.`);
    } else {
      events.push(`${player.name} hesitates. The goblin uses the moment to lash out.`);
      events.push(introEnemyCounterattack(player, "The goblin scout", 5));

      if (resolveIntroDownedPlayer(player, q, events)) {
        return finishIntroAction(player, events);
      }
    }

    if (q.goblinHp <= 0) {
      events.push(`The goblin collapses — but not before blowing a sharp bone whistle.`);
      q.stage = "warband";
    }

    return finishIntroAction(player, events);
  }

  if (q.stage === "warband") {
    if (
      action.includes("attack") ||
      action.includes("fight") ||
      action.includes("defend") ||
      action.includes("protect")
    ) {
      const result = introAttack(player, "the goblin warband", "warbandHp", q);
      events.push(result.text);

      q.villageHp = Math.max(0, q.villageHp - 8);
      events.push(`Warband HP: ${q.warbandHp}. Village HP: ${q.villageHp}.`);

      if (q.warbandHp > 0) {
        events.push(introEnemyCounterattack(player, "The warband", 8));

        if (resolveIntroDownedPlayer(player, q, events)) {
          return finishIntroAction(player, events);
        }
      }
    } else {
      q.villageHp = Math.max(0, q.villageHp - 20);
      events.push(`${player.name} gives the goblins too much ground. Village HP: ${q.villageHp}.`);
      events.push(introEnemyCounterattack(player, "The warband", 8));

      if (resolveIntroDownedPlayer(player, q, events)) {
        return finishIntroAction(player, events);
      }
    }

    if (q.villageHp <= 0) {
      q.villageHp = 1;
      events.push(`The warband nearly breaks the village, but Captain Vey plants his sword in the mud and refuses to retreat.`);
      events.push(`Through blood, mud, and desperate courage, Black Hollow fights the warband off.`);
      q.warbandHp = 0;
      q.stage = "boss";
    } else if (q.warbandHp <= 0) {
      events.push(`The warband breaks. Then the goblin leader steps forward.`);
      q.stage = "boss";
    }

    return finishIntroAction(player, events);
  }

  if (q.stage === "boss") {
    if (
      action.includes("attack") ||
      action.includes("fight") ||
      action.includes("defend") ||
      action.includes("strike")
    ) {
      const result = introAttack(player, "Grusk, the goblin leader", "bossHp", q);
      events.push(result.text);

      q.villageHp = Math.max(0, q.villageHp - 5);
      events.push(`Boss HP: ${q.bossHp}. Village HP: ${q.villageHp}.`);

      if (q.bossHp > 0) {
        events.push(introEnemyCounterattack(player, "Grusk", 10));

        if (resolveIntroDownedPlayer(player, q, events)) {
          return finishIntroAction(player, events);
        }
      }
    } else {
      q.villageHp = Math.max(0, q.villageHp - 20);
      events.push(`${player.name} loses ground against Grusk. Village HP: ${q.villageHp}.`);
      events.push(introEnemyCounterattack(player, "Grusk", 10));

      if (resolveIntroDownedPlayer(player, q, events)) {
        return finishIntroAction(player, events);
      }
    }

    if (q.bossHp <= 0 || q.villageHp <= 0) {
      const playersWin = Math.random() < 0.5;

      if (playersWin) {
        q.bossHp = 0;
        q.villageHp = Math.max(1, q.villageHp);

        completeIntroQuest(
          player,
          events,
          `${player.name}, Mara, Captain Vey, and the villagers defeat Grusk. Black Hollow survives, scarred but standing.`
        );
      } else {
        q.villageHp = 0;

        completeIntroQuest(
          player,
          events,
          `Grusk escapes death and overwhelms the defenders. The old Black Hollow falls into fire and silence.`
        );
      }
    }

    return finishIntroAction(player, events);
  }

  return { handled: false, events };
}

module.exports = {
  ensureIntroQuest,
  isInIntroQuest,
  handleIntroQuestAction,
  createIntroDisplayWorldState
};