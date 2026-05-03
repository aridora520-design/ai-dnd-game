const { getAvailableActions } = require("../systems/actorProgressionSystem");

function createRenderSystem({ world, getOtherPlayersInSameLocation }) {
  function buildResultBlock(title, bodyLines = []) {
    const safeLines = Array.isArray(bodyLines) ? bodyLines : [String(bodyLines)];

    return `
      <div class="card result-card">
        <h3>${title}</h3>
        ${safeLines.map(line => `<p>${line}</p>`).join("")}
      </div>
    `;
  }

  function buildLookDescription(player, worldState) {
    const locationKey = player.location;
    const location = world[locationKey];
    const locationState = worldState.locationStates[locationKey];
    const lines = [];

    if (location?.description) lines.push(location.description);

    const npcText = getNpcDescription(locationState);
    if (npcText) lines.push(npcText);

    const otherPlayers = getOtherPlayersInSameLocation(player) || [];
    lines.push(
      otherPlayers.length > 0
        ? `Other players here: ${otherPlayers.map(p => p.name).join(", ")}.`
        : "No other players are here right now."
    );

    const extra = getLocationExtraText(player, worldState);
    if (extra.length > 0) lines.push(...extra);

    return lines.join("\n");
  }

  function getInventoryHtml(player, playerName) {
    const inventoryHtml = !player.inventory || player.inventory.length === 0
      ? `<p>Your inventory is empty.</p>`
      : `
        <ul>
          ${player.inventory.map((item, index) => `
            <li>
              ${item}
              <a href="/use-item/${index}?player=${encodeURIComponent(playerName)}">Use</a>
            </li>
          `).join("")}
        </ul>
      `;

    return `
      <div class="inventory-scroll">
        ${inventoryHtml}
      </div>
      <hr>
      <p>
        <strong>Gold:</strong> ${player.resources?.gold || 0}<br>
        <strong>Wood:</strong> ${player.resources?.wood || 0}<br>
        <strong>Stone:</strong> ${player.resources?.stone || 0}
      </p>
    `;
  }

  function getOtherPlayersHtml(player) {
    const otherPlayers = getOtherPlayersInSameLocation(player) || [];

    if (otherPlayers.length === 0) return `<p>No one else is here.</p>`;

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
    if (lines.length === 0) return "";

    return `
      <div class="local-status">
        <h3>Local Status</h3>
        ${lines.map(line => `<p>${line}</p>`).join("")}
      </div>
    `;
  }

  function getLocationExtraText(player, worldState) {
    const locationKey = player.location;
    const locationState = worldState.locationStates[locationKey];
    const lines = [];

    if (!locationState) return lines;

    if (locationKey === "bar") {
      const barFlags = locationState.stateFlags || {};

      if (barFlags.barRepairing) {
        const dayText = barFlags.barClosedUntilDay != null ? `Day ${barFlags.barClosedUntilDay}` : "an unknown day";
        const hourText = barFlags.barClosedUntilHour != null
          ? `${String(barFlags.barClosedUntilHour).padStart(2, "0")}:00`
          : "unknown time";

        lines.push("The bar is currently closed for repairs.");
        lines.push(`Estimated reopening: ${dayText}, ${hourText}.`);
      }

      if (barFlags.barDamaged && !barFlags.barRepairing) lines.push("The bar still shows signs of recent damage.");
      if (barFlags.barOnFire) lines.push("Flames or smoke still linger here.");
      if (barFlags.thiefActive) lines.push("There are nervous whispers about a thief in the bar.");
      if (barFlags.guardsWatchingBar) lines.push("The guards are keeping a close eye on this place.");
      if (player.flags?.bartenderBarred) lines.push("Bartender Rowan does not currently welcome you here.");
    }

    if (locationKey === "village") {
      const flags = locationState.stateFlags || {};
      if (flags.crowdUneasy) lines.push("The crowd seems uneasy.");
      if (flags.hunterSavedRumor) lines.push("People are talking about a hunter who was saved.");
      if (flags.hunterAbandonedRumor) lines.push("There are dark rumors about someone abandoning a hunter in need.");
      if (flags.tavernTroubleRumor) lines.push("Word of tavern trouble has spread through the village.");
      if (flags.villageDefended) lines.push("The village feels safer because someone stood up for it.");
      if (flags.villageBurned) lines.push("Smoke and fear hang over the village.");
    }

    if (locationKey === "street") {
      const flags = locationState.stateFlags || {};
      if (flags.cartCrashed) lines.push("A crash has left the street in disarray.");
      if (flags.guardsAlert) lines.push("The guards are on alert here.");
      if (player.flags?.blockedFromStreet) lines.push("You are personally being watched by the guards.");
    }

    if (locationKey === "forest") {
      const flags = locationState.stateFlags || {};

      if (worldState.goblinAlive) {
        lines.push("You sense danger nearby. A goblin is active in the forest.");
      } else if (worldState.goblinCorpses > 0) {
        lines.push(`You see signs of recent violence. Goblin corpses in area: ${worldState.goblinCorpses}.`);
      }

      if (flags.woundedHunterPresent) lines.push("A wounded hunter is somewhere nearby.");
      if (flags.goblinReinforcementsIncoming) lines.push("You hear signs that goblin reinforcements are on the way.");
      if (flags.reinforcementAmbushPending) lines.push("The forest feels wrong. An ambush may be close.");
      if (typeof flags.forestDanger === "number" && flags.forestDanger > 0) {
        lines.push(`Forest danger level: ${flags.forestDanger}.`);
      }
    }

    const recovery = locationState.recovery;
    if (recovery && recovery.status === "repairing" && locationKey !== "bar") {
      const dayText = recovery.repairEndsAtDay != null ? `Day ${recovery.repairEndsAtDay}` : "an unknown day";
      const hourText = recovery.repairEndsAtHour != null
        ? `${String(recovery.repairEndsAtHour).padStart(2, "0")}:00`
        : "unknown time";

      lines.push("Recovery in progress.");
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

  function getQuickActionsHtml(player, worldState, isTutorial) {
    let baseActions = ["look", "help", "search", "wait"];
    const barState = worldState.locationStates?.bar || {};

    if (player.location === "forest") {
      baseActions.push("attack goblin", "defend", "run");
    }

    if (player.location === "bar" && barState.status !== "destroyed") {
      baseActions.push("drink", "eat", "rest", "barfight");
    }

    if (barState.status === "destroyed") {
      baseActions.push("rebuild bar");
    } else if (barState.hp < barState.maxHp) {
      baseActions.push("repair bar");
    }

    baseActions.push("threaten");

    const actions = getAvailableActions(player, baseActions);

    return `
      <div class="quick-actions">
        ${actions.map(action => {
          const label = action.replace(/\b\w/g, c => c.toUpperCase());

          if (action === "rest" && !isTutorial) {
            return `
              <a class="quick-action-link" href="/rest?player=${encodeURIComponent(player.name)}">
                ${label}
              </a>
            `;
          }

          return `
            <form method="POST" action="/action?player=${encodeURIComponent(player.name)}">
              <input type="hidden" name="action" value="${action}">
              <button type="submit" class="quick-action-button">${label}</button>
            </form>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderWorldStatusHtml({ barState, worldState, isTutorial }) {
    return `
      <section class="card">
        <h3>World Status</h3>

        <p>
          <strong>Bar:</strong> ${barState.status || "unknown"}<br>
          HP ${barState.hp ?? "?"}/${barState.maxHp ?? "?"}
        </p>

        <p><strong>Guard Alert:</strong> ${worldState.globalState?.guardsAlertLevel || 0}</p>

        ${barState.status === "destroyed" ? `
          <div class="danger-box">
            <strong>${isTutorial ? "Dream Bar Destroyed" : "Bar Rebuild Required"}</strong>

            <p>
              ${isTutorial
                ? "In this memory, the old tavern has burned."
                : "Gather materials and type <b>rebuild bar</b>."
              }
            </p>

            ${!isTutorial && barState.rebuildProject ? `
              <p><strong>Rebuild Progress:</strong> ${barState.rebuildProject.progress}/${barState.rebuildProject.required}</p>

              <p><strong>Material Value:</strong></p>
              <ul>
                <li>Gold = 3 progress each</li>
                <li>Wood = 2 progress each</li>
                <li>Stone = 4 progress each</li>
              </ul>

              <p class="muted">Type <b>rebuild bar</b> to contribute carried resources.</p>
            ` : ""}
          </div>
        ` : ""}
      </section>
    `;
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
    mode = "live",
    tutorialBanner = ""
  }) {
    const isTutorial = mode === "tutorial";
    const barState = worldState.locationStates?.bar || {};
    const localStatusHtml = !activeEvent ? getLocationExtra(player, worldState) : "";
    const worldStatusHtml = renderWorldStatusHtml({ barState, worldState, isTutorial });
    const quickActionsHtml = getQuickActionsHtml(player, worldState, isTutorial);

    return `
      <div class="game-shell">
        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: #f3efe7;
          }

          .game-shell {
            max-width: 1400px;
            margin: 0 auto;
            padding: 16px;
            font-family: Georgia, serif;
            color: #1d1a16;
          }

          .game-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #222;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }

          .game-header h1 {
            margin: 0;
          }

          .game-header p {
            margin: 4px 0 0 0;
          }

          .game-header-right {
            text-align: right;
          }

          .game-grid {
            display: grid;
            grid-template-columns: 1fr 2fr 1fr;
            gap: 16px;
            align-items: start;
          }

          .card {
            padding: 12px;
            border: 1px solid #aaa;
            border-radius: 10px;
            background: #f7f7f7;
            margin-bottom: 12px;
          }

          .card h2,
          .card h3 {
            margin-top: 0;
          }

          .scene-card {
            padding: 14px;
            border: 1px solid #c98;
            border-radius: 10px;
            background: #fff7f2;
            margin-bottom: 14px;
          }

          .action-card {
            padding: 14px;
            border: 1px solid #999;
            border-radius: 10px;
            background: #fafafa;
            margin-bottom: 14px;
          }

          .events-card {
            padding: 14px;
            border: 1px solid #bbb;
            border-radius: 10px;
            background: #fff;
          }

          .event-list {
            padding-left: 22px;
            max-height: 320px;
            overflow-y: auto;
            border: 1px solid #ddd;
            padding: 10px 10px 10px 28px;
            border-radius: 8px;
            background: #fafafa;
          }

          .action-input {
            padding: 12px;
            width: 70%;
            max-width: 620px;
            font-size: 16px;
          }

          .action-button {
            padding: 12px 18px;
            font-size: 16px;
            margin-left: 8px;
          }

          .quick-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
          }

          .quick-actions form {
            margin: 0;
          }

          .quick-action-button,
          .quick-action-link {
            display: inline-block;
            padding: 8px 10px;
            border: 1px solid #999;
            border-radius: 8px;
            background: #f1f1f1;
            color: #111;
            text-decoration: none;
            cursor: pointer;
            font-family: Georgia, serif;
            font-size: 14px;
          }

          .quick-action-button:hover,
          .quick-action-link:hover {
            background: #e4e4e4;
          }

          .danger-box {
            padding: 10px;
            border: 1px solid #d99;
            border-radius: 8px;
            background: #fff5f2;
          }

          .local-status {
            margin: 12px 0;
            padding: 10px;
            border: 1px solid #bbb;
            border-radius: 8px;
            background: #fcfcfc;
          }

          .local-status p,
          .result-card p {
            margin: 6px 0;
          }

          .muted {
            color: #555;
          }

          .inventory-scroll {
            max-height: 220px;
            overflow-y: auto;
          }

          @media (max-width: 800px) {
            .game-shell {
              padding: 10px;
            }

            .game-header {
              display: block;
              text-align: left;
            }

            .game-header-right {
              text-align: left;
              margin-top: 8px;
            }

            .game-grid {
              grid-template-columns: 1fr;
            }

            .action-input {
              width: 100%;
              max-width: none;
              margin-bottom: 8px;
            }

            .action-button {
              width: 100%;
              margin-left: 0;
            }

            .quick-actions {
              display: grid;
              grid-template-columns: 1fr 1fr;
            }

            .quick-action-button,
            .quick-action-link {
              width: 100%;
              text-align: center;
            }

            .event-list {
              max-height: 260px;
            }
          }
        </style>

        <div class="game-header">
          <div>
            <h1>${player.name.toUpperCase()}</h1>
            <p><strong>Location:</strong> ${player.location.toUpperCase()}</p>
          </div>
          <div class="game-header-right">
            <p><strong>${isTutorial ? "Dream Time" : "World Time"}:</strong> ${formatWorldTime(worldState)}</p>
            <p><strong>HP:</strong> ${player.hp}/${player.maxHp}</p>
          </div>
        </div>

        ${tutorialBanner}

        <div class="game-grid">
          <aside>
            <section class="card">
              <h3>Move</h3>
              ${links || "<p>No exits.</p>"}
            </section>

            ${!isTutorial || playerName === "Hunt" ? `
              <section class="card">
                <h3>World Controls</h3>
                ${!isTutorial ? `<a href="/rest?player=${encodeURIComponent(playerName)}">Rest</a><br>` : ""}
                <a href="/reset-world?player=${encodeURIComponent(playerName)}" onclick="return confirm('Reset the whole world?')">Reset World</a>
              </section>
            ` : ""}

            <section class="card">
              <h3>Other Players</h3>
              ${isTutorial ? `<p>This is an old memory. No other real players are here.</p>` : getOtherPlayersHtml(player)}
            </section>

            ${worldStatusHtml}
          </aside>

          <main>
            <section class="scene-card">
              <h2>${activeEvent ? "Current Event" : "Scene"}</h2>
              ${
                activeEvent
                  ? `
                    <h3>${activeEvent.title || "Something is happening"}</h3>
                    <p style="white-space:pre-wrap; line-height:1.45;">${activeEvent.text}</p>
                  `
                  : `
                    <p style="line-height:1.45;">${location.description}</p>
                    ${localStatusHtml}
                  `
              }
            </section>

            <section class="action-card">
              <h2>What do you do?</h2>

              <form method="POST" action="/action?player=${encodeURIComponent(playerName)}">
                <input
                  class="action-input"
                  type="text"
                  name="action"
                  placeholder="Type your action..."
                  autocomplete="off"
                  autofocus
                />
                <button type="submit" class="action-button">Act</button>
              </form>

              <p class="muted">
                Try: look, help, attack goblin, defend, run, search, drink, eat, threaten, repair
              </p>

              <h3>Quick Actions</h3>
              ${quickActionsHtml}
            </section>

            <section class="events-card">
              <h2>${isTutorial ? "Dream Events" : "Shared World Events"}</h2>
              <ul class="event-list">
                ${eventsHtml || "<li>No events yet.</li>"}
              </ul>
            </section>
          </main>

          <aside>
            <section class="card">
              <h3>Character</h3>
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

            <section class="card">
              <h3>Traits</h3>
              <p>
                Honor ${player.traits.honor}<br>
                Greed ${player.traits.greed}<br>
                Fear ${player.traits.fear}<br>
                Influence ${player.traits.influence}<br>
                Chaos ${player.traits.chaos}
              </p>
            </section>

            <section class="card">
              <h3>Inventory & Resources</h3>
              ${getInventoryHtml(player, playerName)}
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