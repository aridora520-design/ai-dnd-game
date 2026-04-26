const titleSkills = {
  Wanderer: [],
  Slayer: ["power_strike", "battle_hardened"],
  Guardian: ["stand_ground", "shield_wall"],
  Menace: ["intimidating_presence", "reckless_swing"],
  Coward: ["quick_escape"],
  Drunk: ["liquid_courage", "unpredictable_stagger"]
};

function updatePlayerSkills(player) {
  const title = player.title || "Wanderer";
  player.skills = titleSkills[title] || [];
}

module.exports = { updatePlayerSkills, titleSkills };