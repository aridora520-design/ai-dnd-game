function createBaseLocationState() {
  return {
    activeEvent: null,
    recentHistory: [],
    npcs: [],
    stateFlags: {}
  };
}

const world = {
  village: {
    description: "You are in the Village. Paths lead to the Bar and Street.",
    paths: ["bar", "street"]
  },
  bar: {
    description: "You are inside the Bar. It smells like old ale and warm food.",
    paths: ["village"]
  },
  street: {
    description: "You stand on the Street. The forest lies ahead.",
    paths: ["village", "forest"]
  },
  forest: {
    description: "You are in the Forest.",
    paths: ["street"]
  }
};

function createNewWorldState() {
  return {
    goblinAlive: true,
    goblinHp: 40,
    goblinCorpses: 0,
    forestPotionFound: false,
    eventLog: [
      "The world begins. The village waits in silence."
    ],
    locationStates: {
      village: {
        ...createBaseLocationState(),
        npcs: ["Old Villager", "Worried Farmer", "Passing Guard"],
        stateFlags: {
          crowdUneasy: false,
          hunterSavedRumor: false,
          hunterAbandonedRumor: false,
          tavernTroubleRumor: false
        }
      },
      bar: {
        ...createBaseLocationState(),
        npcs: ["Bartender Rowan", "Drunk Patron", "Traveling Merchant", "Hooded Stranger"],
        stateFlags: {
          barDamaged: false,
          bartenderHostileTo: [],
          barOnFire: false,
          thiefActive: false,
          guardsWatchingBar: false
        }
      },
      street: {
        ...createBaseLocationState(),
        npcs: ["Town Guard", "Cart Driver", "Beggar"],
        stateFlags: {
          cartCrashed: false,
          guardsAlert: false
        }
      },
      forest: {
        ...createBaseLocationState(),
        npcs: ["Goblin"],
        stateFlags: {
          woundedHunterPresent: false,
          goblinReinforcementsIncoming: false,
          forestDanger: 0,
          reinforcementAmbushPending: false,
          forestStayCounter: 0,
          forestSpawnCooldown: 0,
          lastForestEventType: null
        }
      }
    },
    globalState: {
      villagersOnEdge: false,
      recentViolence: 0,
      guardsAlertLevel: 0,
      hunterSavedBy: null,
      hunterAbandonedBy: null
    }
  };
}

module.exports = {
  world,
  createBaseLocationState,
  createNewWorldState
};