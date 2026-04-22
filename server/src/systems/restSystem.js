function createRestSystem({ addWorldEvent }) {
  function restAtBar(player, worldState) {
    if (player.location !== "bar") {
      addWorldEvent(
        worldState,
        `${player.name} tries to rest, but this is not a safe place to do it.`,
        player.location
      );
      return false;
    }

    if (player.flags.bartenderBarred) {
      addWorldEvent(
        worldState,
        `${player.name} is turned away by Bartender Rowan and cannot rest here.`,
        player.location
      );
      return false;
    }

    if (worldState.locationStates.bar.stateFlags.barRepairing) {
      addWorldEvent(
        worldState,
        `The bar is closed for repairs. ${player.name} cannot rest here right now.`,
        player.location
      );
      return false;
    }

    const healAmount = player.maxHp - player.hp;
player.hp = player.maxHp;

if (healAmount > 0) {
  addWorldEvent(
    worldState,
    `${player.name} gets a full rest at the bar and recovers ${healAmount} HP.`,
    player.location
  );
} else {
  addWorldEvent(
    worldState,
    `${player.name} spends some quiet time at the bar, already fully rested.`,
    player.location
  );
}

    addWorldEvent(
      worldState,
      `${player.name} gets a full rest at the bar and recovers ${healAmount} HP.`,
      player.location
    );

    return true;
  }

  return { restAtBar };
}

module.exports = { createRestSystem };