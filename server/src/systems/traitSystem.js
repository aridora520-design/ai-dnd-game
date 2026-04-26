function updateTraits(player, changes) {
  player.traits = player.traits || {
    honor: 0,
    greed: 0,
    fear: 0,
    influence: 0,
    chaos: 0
  };

  for (const [trait, delta] of Object.entries(changes || {})) {
    if (typeof player.traits[trait] !== "number") {
      player.traits[trait] = 0;
    }

    player.traits[trait] += delta;

    if (player.traits[trait] < 0) {
      player.traits[trait] = 0;
    }
  }
}

function getDominantTrait(player) {
  const traits = player.traits || {};
  const entries = Object.entries(traits);

  if (entries.length === 0) return "honor";

  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

module.exports = { updateTraits, getDominantTrait };