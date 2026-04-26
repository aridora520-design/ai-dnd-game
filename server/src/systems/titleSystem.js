function updatePlayerTitle(player) {
  const counts = player.progression?.actionCounts || {};

  const attack = counts.attack || 0;
  const defend = counts.defend || 0;
  const run = counts.run || 0;
  const drink = counts.drink || 0;
  const threaten = counts.threaten || 0;

  if (attack >= 20) {
    player.title = "Slayer";
  } else if (defend >= 20) {
    player.title = "Guardian";
  } else if (threaten >= 15) {
    player.title = "Menace";
  } else if (run >= 15) {
    player.title = "Coward";
  } else if (drink >= 10) {
    player.title = "Drunk";
  } else {
    player.title = "Wanderer";
  }
}

module.exports = { updatePlayerTitle };