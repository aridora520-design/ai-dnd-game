function createItemSystem({ addWorldEvent }) {
  function useItem(player, worldState, index) {
    if (isNaN(index) || index < 0 || index >= player.inventory.length) {
      addWorldEvent(worldState, `${player.name} tries to use an invalid item.`, player.location);
      return;
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
  }

  return { useItem };
}

module.exports = { createItemSystem };