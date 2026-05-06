function ensureActorProgression(actor) {
  actor.progression = actor.progression || {};
  actor.progression.actionPoints = actor.progression.actionPoints || actor.progression.actionCounts || {};

  actor.stats = actor.stats || {
    strength: 1,
    dexterity: 1,
    defense: 1,
    presence: 1
  };

  actor.traits = actor.traits || {
    honor: 0,
    greed: 0,
    fear: 0,
    influence: 0,
    chaos: 0
  };

  actor.reputation = actor.reputation || {
    title: "Unknown",
    score: 0
  };

  actor.title = actor.title || "Wanderer";
  actor.skills = actor.skills || [];
}

function recordActorAction(actor, actionType, amount = 1) {
  ensureActorProgression(actor);

  const points = actor.progression.actionPoints;

  points[actionType] = (points[actionType] || 0) + amount;

  // keep old compatibility
  actor.progression.actionCounts = points;

  recalculateActorProgression(actor);
}

function recalculateActorProgression(actor) {
  ensureActorProgression(actor);

  recalculateStats(actor);
  recalculateTraits(actor);
  recalculateReputation(actor);
  recalculateTitle(actor);
  recalculateSkills(actor);
}

function recalculateStats(actor) {
  const p = actor.progression.actionPoints || {};

  const attack = p.attack || 0;
  const defend = p.defend || 0;
  const run = p.run || 0;
  const threaten = p.threaten || 0;
  const search = p.search || 0;
  const barfight = p.barfight || 0;
  const drink = p.drink || 0;
  const repair = p.repair || 0;

  actor.stats = {
    strength: Math.max(
      1,
      2 + Math.floor(attack / 5) + Math.floor(barfight / 3) + Math.floor(threaten / 10)
    ),

    defense: Math.max(
      1,
      1 + Math.floor(defend / 5) + Math.floor(repair / 10) - Math.floor(attack / 20) - Math.floor(barfight / 10)
    ),

    dexterity: Math.max(
      1,
      3 + Math.floor(run / 5) + Math.floor(search / 15)
    ),

    presence: Math.max(
      1,
      2 + Math.floor(threaten / 5) + Math.floor(defend / 20) + Math.floor(drink / 10)
    )
  };
}
function recalculateTraits(actor) {
  const p = actor.progression.actionPoints || {};
const eat = p.eat || 0;
  const attack = p.attack || 0;
  const defend = p.defend || 0;
  const run = p.run || 0;
  const drink = p.drink || 0;
  const threaten = p.threaten || 0;
  const search = p.search || 0;
  const repair = p.repair || 0;
  const help = p.help || 0;
  const barfight = p.barfight || 0;

  actor.traits = {
    honor: Math.max(0, Math.floor(defend / 2) + repair + help + eat - Math.floor(threaten / 2) - barfight),
    greed: Math.max(0, search + Math.floor(drink / 3)),
    fear: Math.max(0, Math.floor(run / 2)),
    influence: Math.max(0, threaten + Math.floor(defend / 3)),
    chaos: Math.max(0, Math.floor(attack / 3) + drink + threaten + barfight * 2 - repair)
  };
}

function recalculateReputation(actor) {
  const stats = actor.stats || {};
  const traits = actor.traits || {};

  const strength = stats.strength || 1;
  const defense = stats.defense || 1;
  const dexterity = stats.dexterity || 1;
  const presence = stats.presence || 1;

  const honor = traits.honor || 0;
  const greed = traits.greed || 0;
  const chaos = traits.chaos || 0;
  const influence = traits.influence || 0;
  const fear = traits.fear || 0;

  const scores = [
    {
      title: "Protector of the Realm",
      score: honor * 2 + defense * 2 + strength - chaos * 2 - greed
    },
    {
      title: "Trusted Voice",
      score: influence * 2 + honor + presence * 2 - greed - chaos
    },
    {
      title: "Known Opportunist",
      score: greed * 2 + dexterity + influence - honor - chaos
    },
    {
      title: "Public Menace",
      score: chaos * 2 + strength + influence - honor * 2 - defense
    },
    {
      title: "Unreliable Coward",
      score: fear * 3 + dexterity - honor - strength
    },
    {
      title: "Unknown Figure",
      score: 5
    }
  ];

  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];

  actor.reputation = {
    title: best.title,
    score: best.score,
    breakdown: scores
  };
}

function recalculateTitle(actor) {
  const p = actor.progression.actionPoints || {};
  const stats = actor.stats || {};
  const traits = actor.traits || {};

  const attack = p.attack || 0;
  const defend = p.defend || 0;
  const run = p.run || 0;
  const drink = p.drink || 0;
  const threaten = p.threaten || 0;

  const strength = stats.strength || 1;
  const defense = stats.defense || 1;
  const dexterity = stats.dexterity || 1;

  const honor = traits.honor || 0;
  const chaos = traits.chaos || 0;

  const candidates = [];

  // 🗡 Slayer
  if (attack >= 20) {
    candidates.push({
      title: "Slayer",
      score: attack * 2 - defense * 2 + chaos
    });
  }

  // 🛡 Guardian
  if (defend >= 15) {
    candidates.push({
      title: "Guardian",
      score: defend * 2 + honor * 2 - chaos
    });
  }

  // 😈 Menace
  if (threaten >= 15) {
    candidates.push({
      title: "Menace",
      score: threaten * 2 + chaos * 2 - honor
    });
  }

  // 🏃 Coward
  if (run >= 15) {
    candidates.push({
      title: "Coward",
      score: run * 2 + dexterity - honor
    });
  }

  // 🍺 Drunk
  if (drink >= 10) {
    candidates.push({
      title: "Drunk",
      score: drink * 2 - dexterity
    });
  }

  // Default fallback
  if (candidates.length === 0) {
    actor.title = "Wanderer";
    return;
  }

  // 🧠 Pick best match
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
actor.titleDebug = candidates;
  actor.title = best.title;
}

function recalculateSkills(actor) {
  const title = actor.title;

  const titleSkills = {
    Wanderer: [],
    Slayer: ["Heavy Strike", "Blood Rush"],
    Guardian: ["Shield Wall", "Stand Ground"],
    Menace: ["Intimidating Glare", "Dirty Threat"],
    Coward: ["Quick Escape", "Panic Sprint"],
    Drunk: ["Liquid Courage", "Drunken Swing"]
  };

  actor.skills = titleSkills[title] || [];
}
function getAvailableActions(actor, baseActions = []) {
  const title = actor.title || "Wanderer";

  const titleActions = {
    Slayer: {
      main: ["Execute", "Charge Attack"],
      opposite: ["Spare Enemy"]
    },

    Guardian: {
      main: ["Defend Village", "Shield Ally"],
      opposite: ["Burn Village"]
    },

    Menace: {
      main: ["Threaten Crowd", "Intimidate Guard"],
      opposite: ["Protect Child"]
    },

    Coward: {
      main: ["Flee Early", "Hide"],
      opposite: ["Stand and Fight"]
    },

    Drunk: {
      main: ["Drink More", "Drunken Swing"],
      opposite: ["Sober Up"]
    },

    Wanderer: {
      main: [],
      opposite: []
    }
  };

  const unlocked = titleActions[title] || titleActions.Wanderer;

  return [
    ...baseActions,
    ...unlocked.main,
    ...unlocked.opposite
  ];
}
module.exports = {
  ensureActorProgression,
  recordActorAction,
  recalculateActorProgression,
  getAvailableActions
};