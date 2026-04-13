function createRestSystem({ addWorldEvent }) {
  function restAtBar(player, worldState) {
    if (player.location !== "bar") {
      addWorldEvent(worldState, `${player.name} tries to rest in an unsafe place.`, player.location);
      return;
    }

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
  }

  return { restAtBar };
}

module.exports = { createRestSystem };