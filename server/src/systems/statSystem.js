// src/systems/statSystem.js
function applyStatGrowth(player, actionType) {
  const counts = player.progression?.actionCounts || {};

  if (actionType === "attack" && counts.attack % 5 === 0) {
    player.stats.strength += 1;
  }

  if (actionType === "run" && counts.run % 5 === 0) {
    player.stats.dexterity += 1;
  }

  if (actionType === "drink" && counts.drink % 5 === 0) {
    player.hp = Math.max(1, player.hp - 1);
  }

  if (actionType === "defend" && counts.defend % 5 === 0) {
    player.stats.defense += 1;
  }

  if (actionType === "threaten" && counts.threaten % 5 === 0) {
    player.stats.presence += 1;
  }
}

module.exports = { applyStatGrowth };