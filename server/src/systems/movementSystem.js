function createMovementSystem({ addWorldEvent }) {
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

  function canEnterDestination(player, destination, worldState) {
    if (destination === "street" && player.flags.blockedFromStreet) {
      return {
        allowed: false,
        message: `${player.name} tries to head for the street, but the guards have orders to turn them back.`
      };
    }

    if (
      destination === "bar" &&
      worldState &&
      worldState.locationStates.bar.stateFlags.barRepairing
    ) {
      return {
        allowed: false,
        message: "The bar is closed while repairs are underway."
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

  return {
    markBartenderHostile,
    forgiveBartenderIfEarned,
    banPlayerFromGuardZones,
    forgiveGuardRestrictionsIfEarned,
    canEnterDestination
  };
}

module.exports = { createMovementSystem };