function parseFlavor(rawText) {
  const text = (rawText || "").toLowerCase();

  return {
    mentionsKick: text.includes("kick"),
    mentionsPunch: text.includes("punch"),
    mentionsStab: text.includes("stab"),
    mentionsSlash: text.includes("slash"),
    mentionsShoot: text.includes("shoot") || text.includes("arrow") || text.includes("bow") || text.includes("snipe"),
    mentionsJump: text.includes("jump") || text.includes("leap"),
    mentionsSpin: text.includes("spin") || text.includes("360"),
    mentionsNoScope: text.includes("no scope") || text.includes("noscope"),
    isTrickShot:
      text.includes("360") ||
      text.includes("flip") ||
      text.includes("jump") ||
      text.includes("spin") ||
      text.includes("no scope") ||
      text.includes("trick shot")
  };
}

module.exports = { parseFlavor };