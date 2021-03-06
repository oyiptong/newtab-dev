/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test that we get a "TimeStamp" marker.
 */

const TIME_CLOSE_TO = 10000;

function* spawnTest () {
  let { target, front } = yield initBackend(SIMPLE_URL);
  loadFrameScripts();
  let markers = [];

  front.on("timeline-data", handler);
  let model = yield front.startRecording({ withTicks: true });

  consoleMethod("timeStamp");
  consoleMethod("timeStamp", "myLabel");
  yield waitUntil(() => { return markers.length === 2; }, 100);

  front.off("timeline-data", handler);
  yield front.stopRecording(model);

  info(`Got ${markers.length} markers.`);

  let maxMarkerTime = model._timelineStartTime + model.getDuration() + TIME_CLOSE_TO;

  ok(markers.every(({stack}) => typeof stack === "number"), "All markers have stack references.");
  ok(markers.every(({name}) => name === "TimeStamp"), "All markers found are TimeStamp markers");
  ok(markers.length === 2, "found 2 TimeStamp markers");
  ok(markers.every(({start, end}) => typeof start === "number" && start === end),
    "All markers have equal start and end times");
  is(markers[0].causeName, void 0, "Unlabeled timestamps have an empty causeName");
  is(markers[1].causeName, "myLabel", "Labeled timestamps have correct causeName");

  // Destroy the front before removing tab to ensure no
  // lingering requests
  yield front.destroy();
  yield removeTab(target.tab);
  finish();

  function handler (name, data) {
    if (name === "markers") {
      markers = markers.concat(data.markers.filter(marker => marker.name === "TimeStamp"));
    }
  }
}
