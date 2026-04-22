function createRenderSystem({ world, getOtherPlayersInSameLocation }) {
  function buildResultBlock(title, bodyLines = []) {
    const safeLines = Array.isArray(bodyLines) ? bodyLines : [String(bodyLines)];

    return `
      <div style="border:1px solid #444; padding:12px; margin:12px 0; border-radius:8px; background:#f8f8f8;">
        <h3 style="margin-top:0;">${title}</h3>
        ${safeLines.map(line => `<p style="margin:6px 0;">${line}</p>`).join("")}
      </div>
    `;
  }

  function buildLookDescription(player, worldState) {
    const locationKey = player.location;
    const location = world[locationKey];
    const locationState = worldState.locationStates[locationKey];
    const lines = [];

    if (location && location.description) {
      lines.push(location.description);
    }

    const npcText = getNpcDescription(locationState);
    if (npcText) {
      lines.push(npcText);
    }

    const otherPlayers = getOtherPlayersInSameLocation(player) || [];
    if (otherPlayers.length > 0) {
      lines.push(`Other players here: ${otherPlayers.map(p => p.name).join(", ")}.`);
    } else {
      lines.push("No other players are here right now.");
    }

    const locationExtraText = getLocationExtraText(player, worldState);
    if (locationExtraText.length > 0) {
      lines.push(...locationExtraText);
    }

    return lines.join("\n");
  }

  function getInventoryHtml(player, playerName) {
    if (!player.inventory || player.inventory.length === 0) {
      return `<p>Your inventory is empty.</p>`;
    }

    return `
      <ul>
        ${player.inventory.map((item, index) => `
          <li>
            ${item}
            <a href="/use-item/${index}?player=${encodeURIComponent(playerName)}" style="margin-left:8px;">
              Use
            </a>
          </li>
        `).join("")}
      </ul>
    `;
  }

  function getOtherPlayersHtml(player) {
    const otherPlayers = getOtherPlayersInSameLocation(player) || [];

    if (otherPlayers.length === 0) {
      return `<p>No one else is here.</p>`;
    }

    return `
      <ul>
        ${otherPlayers.map(other => `
          <li>
            <strong>${other.name}</strong>
            — HP ${other.hp}/${other.maxHp}
            — Reputation: ${other.reputation?.title || "Unknown"}
          </li>
        `).join("")}
      </ul>
    `;
  }

  function getLocationExtra(player, worldState) {
    const lines = getLocationExtraText(player, worldState);

    if (lines.length === 0) {
      return "";
    }

    return `
      <div style="margin:12px 0; padding:10px; border:1px solid #bbb; border-radius:8px; background:#fcfcfc;">
        <h3 style="margin-top:0;">Local Status</h3>
        ${lines.map(line => `<p style="margin:6px 0;">${line}</p>`).join("")}
      </div>
    `;
  }

  function getLocationExtraText(player, worldState) {
    const locationKey = player.location;
    const locationState = worldState.locationStates[locationKey];
    const lines = [];

    if (!locationState) {
      return lines;
    }

    if (locationKey === "bar") {
      const barFlags = locationState.stateFlags || {};

      if (barFlags.barRepairing) {
        const dayText = barFlags.barClosedUntilDay != null ? `Day ${barFlags.barClosedUntilDay}` : "an unknown day";
        const hourText =
          barFlags.barClosedUntilHour != null
            ? `${String(barFlags.barClosedUntilHour).padStart(2, "0")}:00`
            : "unknown time";

        lines.push(`The bar is currently closed for repairs.`);
        lines.push(`Estimated reopening: ${dayText}, ${hourText}.`);
      }

      if (barFlags.barDamaged && !barFlags.barRepairing) {
        lines.push(`The bar still shows signs of recent damage.`);
      }

      if (barFlags.barOnFire) {
        lines.push(`Flames or smoke still linger here.`);
      }

      if (barFlags.thiefActive) {
        lines.push(`There are nervous whispers about a thief in the bar.`);
      }

      if (barFlags.guardsWatchingBar) {
        lines.push(`The guards are keeping a close eye on this place.`);
      }

      if (player.flags?.bartenderBarred) {
        lines.push(`Bartender Rowan does not currently welcome you here.`);
      }
    }

    if (locationKey === "village") {
      const villageFlags = locationState.stateFlags || {};

      if (villageFlags.crowdUneasy) {
        lines.push(`The crowd seems uneasy.`);
      }

      if (villageFlags.hunterSavedRumor) {
        lines.push(`People are talking about a hunter who was saved.`);
      }

      if (villageFlags.hunterAbandonedRumor) {
        lines.push(`There are dark rumors about someone abandoning a hunter in need.`);
      }

      if (villageFlags.tavernTroubleRumor) {
        lines.push(`Word of tavern trouble has spread through the village.`);
      }
    }

    if (locationKey === "street") {
      const streetFlags = locationState.stateFlags || {};

      if (streetFlags.cartCrashed) {
        lines.push(`A crash has left the street in disarray.`);
      }

      if (streetFlags.guardsAlert) {
        lines.push(`The guards are on alert here.`);
      }

      if (player.flags?.blockedFromStreet) {
        lines.push(`You are personally being watched by the guards.`);
      }
    }

    if (locationKey === "forest") {
      const forestFlags = locationState.stateFlags || {};

      if (worldState.goblinAlive) {
        lines.push(`You sense danger nearby. A goblin is active in the forest.`);
      } else if (worldState.goblinCorpses > 0) {
        lines.push(`You see signs of recent violence. Goblin corpses in area: ${worldState.goblinCorpses}.`);
      }

      if (forestFlags.woundedHunterPresent) {
        lines.push(`A wounded hunter is somewhere nearby.`);
      }

      if (forestFlags.goblinReinforcementsIncoming) {
        lines.push(`You hear signs that goblin reinforcements are on the way.`);
      }

      if (forestFlags.reinforcementAmbushPending) {
        lines.push(`The forest feels wrong. An ambush may be close.`);
      }

      if (typeof forestFlags.forestDanger === "number" && forestFlags.forestDanger > 0) {
        lines.push(`Forest danger level: ${forestFlags.forestDanger}.`);
      }
    }

    const recovery = locationState.recovery;
    if (recovery && recovery.status === "repairing" && locationKey !== "bar") {
      const dayText =
        recovery.repairEndsAtDay != null ? `Day ${recovery.repairEndsAtDay}` : "an unknown day";
      const hourText =
        recovery.repairEndsAtHour != null
          ? `${String(recovery.repairEndsAtHour).padStart(2, "0")}:00`
          : "unknown time";

      lines.push(`Recovery in progress.`);
      lines.push(`Expected completion: ${dayText}, ${hourText}.`);
    }

    return lines;
  }

  function getNpcDescription(locationState) {
    if (!locationState || !Array.isArray(locationState.npcs) || locationState.npcs.length === 0) {
      return "No notable figures stand out here.";
    }

    return `You notice: ${locationState.npcs.join(", ")}.`;
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