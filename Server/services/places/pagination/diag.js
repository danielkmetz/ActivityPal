function createDiag() {
  return {
    counts: Object.create(null),

    // keep small samples so debug payloads don’t explode
    excludedClose: [],
    addedClose: [],

    fetch: {
      googleCalls: 0,
      resultsSeen: 0,
      combosCount: 0,
      pagesFetchedTotal: 0,
      stoppedBecause: null,
    },

    bump(key) {
      this.counts[key] = (this.counts[key] || 0) + 1;
    },

    sampleExcluded(item) {
      if (this.excludedClose.length < 25) this.excludedClose.push(item);
    },

    sampleAdded(item) {
      if (this.addedClose.length < 25) this.addedClose.push(item);
    },
  };
}

module.exports = { createDiag };
