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
        <ul class="compact-list">
          ${player.inventory.map((item, index) => `
            <li>
              <span>${item}</span>
              <a class="mini-link" href="/use-item/${index}?player=${encodeURIComponent(playerName)}">Use</a>
            </li>
          `).join("")}
        </ul>
      `;

    return `
      <div class="inventory-scroll">
        ${inventoryHtml}
      </div>
      <div class="resource-grid">
        <div><strong>Gold</strong><span>${player.resources?.gold || 0}</span></div>
        <div><strong>Wood</strong><span>${player.resources?.wood || 0}</span></div>
        <div><strong>Stone</strong><span>${player.resources?.stone || 0}</span></div>
      </div>
    `;
  }

  function getOtherPlayersHtml(player) {
    const otherPlayers = getOtherPlayersInSameLocation(player) || [];

    if (otherPlayers.length === 0) return `<p>No one else is here.</p>`;

    return `
      <ul class="compact-list">
        ${otherPlayers.map(other => `
          <li>
            <span><strong>${other.name}</strong><br>HP ${other.hp}/${other.maxHp}</span>
            <small>${other.reputation?.title || "Unknown"}</small>
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
      const flags = locationState.stateFlags || {};

      if (flags.barRepairing) {
        const dayText = flags.barClosedUntilDay != null ? `Day ${flags.barClosedUntilDay}` : "an unknown day";
        const hourText = flags.barClosedUntilHour != null
          ? `${String(flags.barClosedUntilHour).padStart(2, "0")}:00`
          : "unknown time";

        lines.push("The bar is currently closed for repairs.");
        lines.push(`Estimated reopening: ${dayText}, ${hourText}.`);
      }

      if (flags.barDamaged && !flags.barRepairing) lines.push("The bar still shows signs of recent damage.");
      if (flags.barOnFire) lines.push("Flames or smoke still linger here.");
      if (flags.thiefActive) lines.push("There are nervous whispers about a thief in the bar.");
      if (flags.guardsWatchingBar) lines.push("The guards are keeping a close eye on this place.");
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
      <section class="card world-card">
        <h3>World Status</h3>

        <div class="status-line">
          <span>Bar</span>
          <strong>${barState.status || "unknown"}</strong>
        </div>

        <div class="status-line">
          <span>Bar HP</span>
          <strong>${barState.hp ?? "?"}/${barState.maxHp ?? "?"}</strong>
        </div>

        <div class="status-line">
          <span>Guard Alert</span>
          <strong>${worldState.globalState?.guardsAlertLevel || 0}</strong>
        </div>

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
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
        <title>${player.name} — AI Dungeon Game</title>

        <style>
          * {
            box-sizing: border-box;
          }

          html {
            min-height: 100%;
            background: #15110d;
          }

          body {
            min-height: 100%;
            margin: 0;
            background:
              radial-gradient(circle at top, #3a2c20 0%, #17120e 42%, #0f0c09 100%);
            color: #f2eadc;
            font-family: Georgia, serif;
          }

          a {
            color: #f2c46b;
          }

          .game-shell {
            max-width: 1440px;
            min-height: 100vh;
            margin: 0 auto;
            padding: 14px;
            padding-bottom: 24px;
          }

          .top-bar {
            position: sticky;
            top: 0;
            z-index: 20;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            padding: 12px;
            margin-bottom: 12px;
            border: 1px solid rgba(242, 196, 107, 0.35);
            border-radius: 16px;
            background: rgba(25, 19, 14, 0.94);
            backdrop-filter: blur(10px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.28);
          }

          .hero-name {
            margin: 0;
            font-size: 26px;
            letter-spacing: 1px;
          }

          .hero-meta,
          .top-meta p {
            margin: 4px 0 0;
            color: #d5c4a8;
          }

          .top-meta {
            text-align: right;
            font-size: 14px;
          }

          .game-grid {
            display: grid;
            grid-template-columns: minmax(240px, 1fr) minmax(420px, 2fr) minmax(260px, 1fr);
            gap: 14px;
            align-items: start;
          }

          .left-panel,
          .right-panel,
          .main-panel {
            min-width: 0;
          }

          .card,
          .scene-card,
          .action-card,
          .events-card {
            border: 1px solid rgba(242, 196, 107, 0.28);
            border-radius: 16px;
            background: rgba(36, 28, 21, 0.92);
            box-shadow: 0 10px 28px rgba(0,0,0,0.22);
          }

          .card {
            padding: 12px;
            margin-bottom: 12px;
          }

          .scene-card,
          .action-card,
          .events-card {
            padding: 14px;
            margin-bottom: 12px;
          }

          h2,
          h3 {
            margin-top: 0;
            color: #ffd98a;
          }

          p {
            line-height: 1.45;
          }

          .scene-text,
          .event-text {
            white-space: pre-wrap;
          }

          .move-links a,
          .card > a {
            display: block;
            padding: 10px;
            margin: 6px 0;
            border: 1px solid rgba(242, 196, 107, 0.25);
            border-radius: 12px;
            background: rgba(255,255,255,0.05);
            text-decoration: none;
          }

          .move-links a:hover,
          .card > a:hover {
            background: rgba(242, 196, 107, 0.12);
          }

          .action-row {
            display: flex;
            gap: 8px;
          }

          .action-input {
            flex: 1;
            min-width: 0;
            padding: 13px 14px;
            border: 1px solid rgba(242, 196, 107, 0.35);
            border-radius: 12px;
            background: #100c09;
            color: #f2eadc;
            font-size: 16px;
            font-family: Georgia, serif;
          }

          .action-input::placeholder {
            color: #9e8d72;
          }

          .action-button,
          .quick-action-button,
          .quick-action-link,
          .mini-link {
            border: 1px solid rgba(242, 196, 107, 0.42);
            border-radius: 12px;
            background: linear-gradient(180deg, #6a4b20, #372514);
            color: #fff0c9;
            cursor: pointer;
            font-family: Georgia, serif;
            text-decoration: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          }

          .action-button {
            padding: 13px 18px;
            font-size: 16px;
          }

          .quick-actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
            gap: 8px;
            margin-top: 10px;
          }

          .quick-actions form {
            margin: 0;
          }

          .quick-action-button,
          .quick-action-link {
            display: block;
            width: 100%;
            min-height: 44px;
            padding: 11px 10px;
            text-align: center;
            font-size: 15px;
          }

          .quick-action-button:hover,
          .quick-action-link:hover,
          .action-button:hover {
            filter: brightness(1.12);
          }

          .event-list {
            max-height: 340px;
            overflow-y: auto;
            padding: 10px 10px 10px 28px;
            border: 1px solid rgba(242, 196, 107, 0.18);
            border-radius: 12px;
            background: rgba(0,0,0,0.18);
          }

          .event-list li {
            margin-bottom: 10px;
          }

          .event-list pre {
            margin: 0;
            white-space: pre-wrap;
            font-family: Georgia, serif;
          }

          .compact-list {
            list-style: none;
            padding: 0;
            margin: 0;
          }

          .compact-list li {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(242, 196, 107, 0.14);
          }

          .compact-list li:last-child {
            border-bottom: none;
          }

          .mini-link {
            padding: 5px 8px;
            font-size: 13px;
          }

          .resource-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-top: 10px;
          }

          .resource-grid div,
          .stat-grid div {
            padding: 9px;
            border: 1px solid rgba(242, 196, 107, 0.18);
            border-radius: 12px;
            background: rgba(255,255,255,0.05);
            text-align: center;
          }

          .resource-grid strong,
          .resource-grid span,
          .stat-grid strong,
          .stat-grid span {
            display: block;
          }

          .stat-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
          }

          .status-line {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(242, 196, 107, 0.14);
          }

          .status-line:last-child {
            border-bottom: none;
          }

          .danger-box,
          .local-status {
            padding: 10px;
            border: 1px solid rgba(255, 120, 80, 0.45);
            border-radius: 12px;
            background: rgba(90, 31, 20, 0.35);
          }

          .local-status {
            margin-top: 12px;
          }

          .muted {
            color: #c9b895;
          }

          .inventory-scroll {
            max-height: 220px;
            overflow-y: auto;
          }

          .mobile-bottom-action {
            display: none;
          }

          @media (max-width: 900px) {
            .game-shell {
              padding: 10px;
              padding-bottom: 128px;
            }

            .top-bar {
              align-items: flex-start;
              border-radius: 14px;
            }

            .hero-name {
              font-size: 22px;
            }

            .top-meta {
              font-size: 13px;
            }

            .game-grid {
              grid-template-columns: 1fr;
            }

            .left-panel {
              order: 1;
            }

            .main-panel {
              order: 2;
            }

            .right-panel {
              order: 3;
            }

            .scene-card {
              border-color: rgba(255, 217, 138, 0.45);
            }

            .desktop-action-form {
              display: none;
            }

            .mobile-bottom-action {
              position: fixed;
              left: 0;
              right: 0;
              bottom: 0;
              z-index: 50;
              display: block;
              padding: 10px;
              padding-bottom: calc(10px + env(safe-area-inset-bottom));
              border-top: 1px solid rgba(242, 196, 107, 0.35);
              background: rgba(18, 13, 9, 0.96);
              backdrop-filter: blur(10px);
              box-shadow: 0 -10px 24px rgba(0,0,0,0.35);
            }

            .mobile-bottom-action .action-row {
              display: grid;
              grid-template-columns: 1fr auto;
            }

            .action-button {
              min-width: 72px;
            }

            .quick-actions {
              grid-template-columns: repeat(2, 1fr);
            }

            .quick-action-button,
            .quick-action-link {
              min-height: 48px;
              font-size: 15px;
            }

            .event-list {
              max-height: 260px;
            }

            .stat-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }

          @media (min-width: 901px) {
            .desktop-sticky {
              position: sticky;
              top: 92px;
            }
          }

          @media (max-width: 480px) {
            .top-bar {
              display: block;
            }

            .top-meta {
              text-align: left;
              margin-top: 8px;
            }

            .quick-actions {
              grid-template-columns: 1fr;
            }

            .resource-grid {
              grid-template-columns: 1fr;
            }
          }
        </style>

        <div class="top-bar">
          <div>
            <h1 class="hero-name">${player.name.toUpperCase()}</h1>
            <p class="hero-meta"><strong>Location:</strong> ${player.location.toUpperCase()}</p>
          </div>
          <div class="top-meta">
            <p><strong>${isTutorial ? "Dream Time" : "World Time"}:</strong> ${formatWorldTime(worldState)}</p>
            <p><strong>HP:</strong> ${player.hp}/${player.maxHp}</p>
          </div>
        </div>

        ${tutorialBanner}

        <div class="game-grid">
          <aside class="left-panel">
            <div class="desktop-sticky">
              <section class="card">
                <h3>Move</h3>
                <div class="move-links">${links || "<p>No exits.</p>"}</div>
              </section>

              ${!isTutorial || playerName === "Hunt" ? `
                <section class="card">
                  <h3>World Controls</h3>
                  ${!isTutorial ? `<a href="/rest?player=${encodeURIComponent(playerName)}">Rest</a>` : ""}
                  <a href="/reset-world?player=${encodeURIComponent(playerName)}" onclick="return confirm('Reset the whole world?')">Reset World</a>
                </section>
              ` : ""}

              <section class="card">
                <h3>Other Players</h3>
                ${isTutorial ? `<p>This is an old memory. No other real players are here.</p>` : getOtherPlayersHtml(player)}
              </section>

              ${worldStatusHtml}
            </div>
          </aside>

          <main class="main-panel">
            <section class="scene-card">
              <h2>${activeEvent ? "Current Event" : "Scene"}</h2>
              ${
                activeEvent
                  ? `
                    <h3>${activeEvent.title || "Something is happening"}</h3>
                    <p class="scene-text">${activeEvent.text}</p>
                  `
                  : `
                    <p class="scene-text">${location.description}</p>
                    ${localStatusHtml}
                  `
              }
            </section>

            <section class="action-card">
              <h2>What do you do?</h2>

              <form class="desktop-action-form" method="POST" action="/action?player=${encodeURIComponent(playerName)}">
                <div class="action-row">
                  <input
                    class="action-input"
                    type="text"
                    name="action"
                    placeholder="Type your action..."
                    autocomplete="off"
                    autofocus
                  />
                  <button type="submit" class="action-button">Act</button>
                </div>
              </form>

              <p class="muted">Tap a quick action or type your own command.</p>

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

          <aside class="right-panel">
            <div class="desktop-sticky">
              <section class="card">
                <h3>Character</h3>
                <p><strong>Title:</strong> ${player.title}</p>
                <p><strong>Reputation:</strong> ${player.reputation?.title || "Unknown"}</p>
                ${reputationReaction ? `<p><em>${reputationReaction}</em></p>` : ""}

                <div class="stat-grid">
                  <div><strong>STR</strong><span>${player.stats.strength}</span></div>
                  <div><strong>DEX</strong><span>${player.stats.dexterity}</span></div>
                  <div><strong>DEF</strong><span>${player.stats.defense}</span></div>
                  <div><strong>PRE</strong><span>${player.stats.presence}</span></div>
                </div>

                <p><strong>Skills:</strong><br>${player.skills.length > 0 ? player.skills.join(", ") : "None"}</p>
              </section>

              <section class="card">
                <h3>Traits</h3>
                <div class="status-line"><span>Honor</span><strong>${player.traits.honor}</strong></div>
                <div class="status-line"><span>Greed</span><strong>${player.traits.greed}</strong></div>
                <div class="status-line"><span>Fear</span><strong>${player.traits.fear}</strong></div>
                <div class="status-line"><span>Influence</span><strong>${player.traits.influence}</strong></div>
                <div class="status-line"><span>Chaos</span><strong>${player.traits.chaos}</strong></div>
              </section>

              <section class="card">
                <h3>Inventory & Resources</h3>
                ${getInventoryHtml(player, playerName)}
              </section>
            </div>
          </aside>
        </div>

        <form class="mobile-bottom-action" method="POST" action="/action?player=${encodeURIComponent(playerName)}">
          <div class="action-row">
            <input
              class="action-input"
              type="text"
              name="action"
              placeholder="Type action..."
              autocomplete="off"
            />
            <button type="submit" class="action-button">Act</button>
          </div>
        </form>
      </div>
      </html>
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