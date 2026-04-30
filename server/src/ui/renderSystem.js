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
     function renderGamePage({
    player,
    playerName,
    worldState,
    location,
    activeEvent,
    links,
    eventsHtml,
    reputationReaction,
    formatWorldTime,
    getReputationReaction,
    mode = "live",
    tutorialBanner = ""
  }) {
    const isTutorial = mode === "tutorial";
    const barState = worldState.locationStates?.bar || {};
    const localStatusHtml = !activeEvent ? getLocationExtra(player, worldState) : "";

    return `
      <div style="max-width:1400px; margin:0 auto; padding:16px; font-family:Georgia, serif;">

        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #222; padding-bottom:10px; margin-bottom:14px;">
          <div>
            <h1 style="margin:0;">${player.name.toUpperCase()}</h1>
            <p style="margin:4px 0 0 0;"><strong>Location:</strong> ${player.location.toUpperCase()}</p>
          </div>
          <div style="text-align:right;">
            <p style="margin:0;"><strong>${isTutorial ? "Dream Time" : "World Time"}:</strong> ${formatWorldTime(worldState)}</p>
            <p style="margin:4px 0 0 0;"><strong>HP:</strong> ${player.hp}/${player.maxHp}</p>
          </div>
        </div>

        ${tutorialBanner}

        <div style="
          display:grid;
          grid-template-columns: 1fr 2fr 1fr;
          gap:16px;
          align-items:start;
        ">

          <!-- LEFT COLUMN -->
          <aside>
            <section style="padding:12px; border:1px solid #aaa; border-radius:10px; background:#f7f7f7; margin-bottom:12px;">
              <h3 style="margin-top:0;">Move</h3>
              ${links || "<p>No exits.</p>"}
            </section>

            <section style="padding:12px; border:1px solid #aaa; border-radius:10px; background:#f7f7f7; margin-bottom:12px;">
              <h3 style="margin-top:0;">Other Players</h3>
              ${isTutorial ? `<p>This is an old memory. No other real players are here.</p>` : getOtherPlayersHtml(player)}
            </section>

            <section style="padding:12px; border:1px solid #aaa; border-radius:10px; background:#f7f7f7; margin-bottom:12px;">
              <h3 style="margin-top:0;">Inventory & Resources</h3>
${getInventoryHtml(player, playerName)}
<hr>
<p>
  <strong>Gold:</strong> ${player.resources?.gold || 0}<br>
  <strong>Wood:</strong> ${player.resources?.wood || 0}<br>
  <strong>Stone:</strong> ${player.resources?.stone || 0}
</p>
            </section>

            ${
              !isTutorial || playerName === "Hunt"
                ? `
                  <section style="padding:12px; border:1px solid #aaa; border-radius:10px; background:#f7f7f7;">
                    <h3 style="margin-top:0;">World Controls</h3>
                    ${!isTutorial ? `<a href="/rest?player=${encodeURIComponent(playerName)}">Rest</a><br>` : ""}
                    <a href="/reset-world?player=${encodeURIComponent(playerName)}" onclick="return confirm('Reset the whole world?')">Reset World</a>
                  </section>
                `
                : ""
            }
          </aside>

          <!-- CENTER COLUMN -->
          <main>
            <section style="padding:14px; border:1px solid #c98; border-radius:10px; background:#fff7f2; margin-bottom:14px;">
              <h2 style="margin-top:0;">${activeEvent ? "Current Event" : "Scene"}</h2>
              ${
                activeEvent
                  ? `
                    <h3 style="margin-bottom:6px;">${activeEvent.title || "Something is happening"}</h3>
                    <p style="white-space:pre-wrap; line-height:1.45;">${activeEvent.text}</p>
                  `
                  : `
                    <p style="line-height:1.45;">${location.description}</p>
                    ${localStatusHtml}
                  `
              }
            </section>

            <section style="padding:14px; border:1px solid #999; border-radius:10px; background:#fafafa; margin-bottom:14px;">
              <h2 style="margin-top:0;">What do you do?</h2>
              <form method="POST" action="/action?player=${encodeURIComponent(playerName)}">
                <input
                  type="text"
                  name="action"
                  placeholder="Type your action..."
                  autocomplete="off"
                  autofocus
                  style="padding:12px; width:70%; max-width:620px; font-size:16px;"
                />
                <button type="submit" style="padding:12px 18px; font-size:16px; margin-left:8px;">
                  Act
                </button>
              </form>
              <p style="color:gray; margin-bottom:0;">
                Try: look, help, attack goblin, defend, run, search, drink, eat, threaten, repair
              </p>
            </section>

            <section style="padding:14px; border:1px solid #bbb; border-radius:10px; background:#fff;">
              <h2 style="margin-top:0;">${isTutorial ? "Dream Events" : "Shared World Events"}</h2>
              <ul style="
                padding-left:22px;
                max-height:320px;
                overflow-y:auto;
                border:1px solid #ddd;
                padding:10px 10px 10px 28px;
                border-radius:8px;
                background:#fafafa;
              ">
                ${eventsHtml || "<li>No events yet.</li>"}
              </ul>
            </section>
          </main>

          <!-- RIGHT COLUMN -->
          <aside>
            <section style="padding:12px; border:1px solid #aaa; border-radius:10px; background:#f7f7f7; margin-bottom:12px;">
              <h3 style="margin-top:0;">Character</h3>
              <p><strong>Title:</strong> ${player.title}</p>
              <p><strong>HP:</strong> ${player.hp}/${player.maxHp}</p>
              <p><strong>Stats:</strong><br>
                STR ${player.stats.strength}<br>
                DEX ${player.stats.dexterity}<br>
                DEF ${player.stats.defense}<br>
                PRE ${player.stats.presence}
              </p>
              <p><strong>Skills:</strong> ${player.skills.length > 0 ? player.skills.join(", ") : "None"}</p>
              <p><strong>Reputation:</strong> ${player.reputation?.title || "Unknown"}</p>
              ${reputationReaction ? `<p><em>${reputationReaction}</em></p>` : ""}
            </section>

            <section style="padding:12px; border:1px solid #aaa; border-radius:10px; background:#f7f7f7; margin-bottom:12px;">
              <h3 style="margin-top:0;">Traits</h3>
              <p>
                Honor ${player.traits.honor}<br>
                Greed ${player.traits.greed}<br>
                Fear ${player.traits.fear}<br>
                Influence ${player.traits.influence}<br>
                Chaos ${player.traits.chaos}
              </p>
            </section>

            <section style="padding:12px; border:1px solid #aaa; border-radius:10px; background:#f7f7f7; margin-bottom:12px;">
              <h3 style="margin-top:0;">World Status</h3>
              <p><strong>Bar:</strong> ${barState.status || "unknown"}<br>
              HP ${barState.hp ?? "?"}/${barState.maxHp ?? "?"}</p>
              <p><strong>Guard Alert:</strong> ${worldState.globalState?.guardsAlertLevel || 0}</p>

              ${
                barState.status === "destroyed"
                  ? `
                    <div style="padding:8px; border:1px solid #b66; border-radius:8px; background:#fff1f1;">
                      <strong>${isTutorial ? "Dream Bar Destroyed" : "Bar Rebuild Required"}</strong>
                      <p style="margin-bottom:0;">${isTutorial ? "In this memory, the old tavern has burned." : "Gather materials and type rebuild bar."}</p>
                    </div>
                  `
                  : ""
              }
            </section>

          
          </aside>

        </div>
      </div>
    `;
  }
    return {
    buildResultBlock,
    buildLookDescription,
    getInventoryHtml,
    getOtherPlayersHtml,
    getLocationExtra,
    renderGamePage
  };
}

module.exports = { createRenderSystem };