function createRenderSystem({
  world,
  getOtherPlayersInSameLocation
}) {
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

  function buildLookDescription(player, worldState) {
    const location = world[player.location];
    const locState = worldState.locationStates[player.location];
    const rep = player.reputation || { chaos: 0, honor: 0, intimidation: 0 };

    let description = `📍 ${player.location.toUpperCase()}\n`;
    description += `${location.description}\n\n`;

    if (player.location === "bar" || player.location === "village") {
      if (rep.chaos >= 10) {
        description += "People glance at you, then quickly look away. No one wants trouble.\n";
      } else if (rep.honor >= 10) {
        description += "A few locals nod in respect as you enter.\n";
      } else if (rep.intimidation >= 10) {
        description += "The room grows quieter. Conversations fade when you appear.\n";
      }
    }

    if (player.flags.wantedByGuards && (player.location === "village" || player.location === "street" || player.location === "bar")) {
      description += "You can feel the weight of official attention. Guards are watching for you.\n";
    }

    if (locState.activeEvent) {
      description += `\n⚠ ACTIVE EVENT\n- ${locState.activeEvent.name}: ${locState.activeEvent.text}\n`;
    }

    description += "\n👀 You see:\n";

    if (locState.npcs && locState.npcs.length > 0) {
      locState.npcs.forEach(npc => {
        description += `- ${npc} (npc)\n`;
      });
    }

    if (player.location === "forest") {
      if (worldState.goblinAlive) {
        description += "- Goblin (hostile)\n";
      }

      const corpses = worldState.goblinCorpses || 0;
      if (corpses > 0) {
        description += `- ${corpses} Goblin corpse${corpses > 1 ? "s" : ""}\n`;
      }

      if (worldState.locationStates.forest.stateFlags.forestDanger > 0) {
        description += `- Signs of danger in the brush (danger ${worldState.locationStates.forest.stateFlags.forestDanger})\n`;
      }
    }

    const others = getOtherPlayersInSameLocation(player);
    if (others.length > 0) {
      others.forEach(p => {
        description += `- ${p.name} (player)\n`;
      });
    }

    description += "\n🚪 Exits:\n";
    location.paths.forEach(p => {
      description += `- ${p}\n`;
    });

    return description;
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

  function getLocationExtra(player, worldState) {
    const locState = worldState.locationStates[player.location];
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

      const corpses = worldState.goblinCorpses || 0;
      if (corpses === 1) {
        extra += `<p>There is 1 goblin corpse on the ground.</p>`;
      } else if (corpses > 1) {
        extra += `<p>There are ${corpses} goblin corpses on the ground.</p>`;
      }

      if (locState.stateFlags.forestDanger > 0) {
        extra += `<p><strong>Forest Danger:</strong> ${locState.stateFlags.forestDanger}</p>`;
      }
    }

    if (!worldState.goblinAlive) {
      extra += `<p>The longer you remain here, the more likely more goblins are to find you.</p>`;
    }

    if (player.location === "bar") {
      extra += `
        <p>You can rest here and recover your strength.</p>
        <a href="/rest?player=${encodeURIComponent(player.name)}">Rest</a>
        <p>Bar actions to try: drink, eat, barfight, calm someone down, threaten, help, watch</p>
      `;

      if (locState.stateFlags.barDamaged) {
        extra += `<p><strong>The bar still shows damage from earlier chaos.</strong></p>`;
      }

      if (locState.stateFlags.barOnFire) {
        extra += `<p><strong>The bar is on fire.</strong></p>`;
      }

      if (locState.stateFlags.bartenderHostileTo.includes(player.name)) {
        extra += `<p><strong>Bartender Rowan is hostile to you and will not let you rest easily.</strong></p>`;
      }

      if (locState.stateFlags.guardsWatchingBar) {
        extra += `<p><strong>The bar is being watched more closely by the guards.</strong></p>`;
      }
    }

    if (player.location === "street") {
      if (locState.stateFlags.cartCrashed) {
        extra += `<p>Broken wood and spilled cargo clutter parts of the street.</p>`;
      }

      if (locState.stateFlags.guardsAlert) {
        extra += `<p>The town guards are alert here.</p>`;
      }
    }

    if (player.flags.blockedFromStreet) {
      extra += `<p><strong>Guard Restriction:</strong> the guards will block you from entering the street until your reputation improves.</p>`;
    }

    if (player.flags.bartenderBarred) {
      extra += `<p><strong>Bar Restriction:</strong> you are currently barred from easy access or rest at the bar.</p>`;
    }

    if (locState.activeEvent) {
      extra += `
        <div style="border:2px solid #a00; padding:12px; margin:14px 0; background:#fff4f4;">
          <h3>ACTIVE EVENT</h3>
          <p><strong>${locState.activeEvent.name}</strong></p>
          <p>${locState.activeEvent.text}</p>
          <p><em>React in free text.</em></p>
        </div>
      `;
    }

    extra += `
      <p><strong>Type an action:</strong></p>
      <form method="POST" action="/action?player=${encodeURIComponent(player.name)}">
        <input type="text" name="action" placeholder="e.g. say We should run / attack goblin / I calm the drunk down" style="width: 420px;" />
        <button type="submit">Submit Action</button>
      </form>
    `;

    return extra;
  }

  return {
    buildResultBlock,
    buildLookDescription,
    getInventoryHtml,
    getOtherPlayersHtml,
    getLocationExtra
  };
}

module.exports = { createRenderSystem };