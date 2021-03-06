/**
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

var testGenerator = testSteps();

function testSteps()
{
  let uri = Cc["@mozilla.org/network/io-service;1"].
            getService(Ci.nsIIOService).
            newURI("https://www.example.com", null, null);
  let principal = Cc["@mozilla.org/scriptsecuritymanager;1"].
                  getService(Ci.nsIScriptSecurityManager).
                  getNoAppCodebasePrincipal(uri);

  info("Setting permissions");

  let permMgr =
    Cc["@mozilla.org/permissionmanager;1"].getService(Ci.nsIPermissionManager);
  permMgr.add(uri, "indexedDB", Ci.nsIPermissionManager.ALLOW_ACTION);

  info("Setting idle preferences to prevent real 'idle-daily' notification");

  let prefs =
    Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
  prefs.setIntPref("idle.lastDailyNotification", (Date.now() / 1000) - 10);

  info("Activating real idle service");

  do_get_idle();

  info("Creating databases");

  let quotaManager =
    Cc["@mozilla.org/dom/quota/manager;1"].getService(Ci.nsIQuotaManager);

  let dbCount = 0;

  for (let persistence of ["persistent", "temporary", "default"]) {
    for (let i = 1; i <= 5; i++) {
      let dbName = "foo-" + i;
      let dbPersistence = persistence;
      let req = indexedDB.openForPrincipal(principal,
                                           dbName,
                                           { version: 1,
                                             storage: dbPersistence });
      req.onerror = event => {
        if (dbPersistence != "persistent") {
          errorHandler(event);
          return;
        }

        // Explicit persistence is currently blocked on mobile.
        info("Failed to create persistent database '" + dbPersistence + "/" +
             dbName + "', hopefully this is on mobile!");

        event.preventDefault();

        if (!(--dbCount)) {
          continueToNextStep();
        }
      };
      req.onupgradeneeded = event => {
        let db = event.target.result;
        let objectStore = db.createObjectStore("foo");

        // Add lots of data...
        for (let j = 0; j < 100; j++) {
          objectStore.add("abcdefghijklmnopqrstuvwxyz0123456789", j);
        }

        // And then clear it so that maintenance has some space to reclaim.
        objectStore.clear();
      };
      req.onsuccess = event => {
        let db = event.target.result;
        ok(db, "Created database '" + dbPersistence + "/" + dbName + "'");

        db.close();

        if (!(--dbCount)) {
          continueToNextStep();
        }
      };
      dbCount++;
    }
  }
  yield undefined;

  info("Getting usage before maintenance");

  let usageBeforeMaintenance;

  quotaManager.getUsageForPrincipal(principal, (principal, usage) => {
    ok(usage > 0, "Usage is non-zero");
    usageBeforeMaintenance = usage;
    continueToNextStep();
  });
  yield undefined;

  info("Sending fake 'idle-daily' notification to QuotaManager");

  let observer = quotaManager.QueryInterface(Ci.nsIObserver);
  observer.observe(null, "idle-daily", "");

  info("Waiting for maintenance to start");

  // This time is totally arbitrary. Most likely directory scanning will have
  // completed, QuotaManager locks will be acquired, and  maintenance tasks will
  // be scheduled before this time has elapsed, so we will be testing the
  // maintenance code. However, if something is slow then this will test
  // shutting down in the middle of maintenance.
  setTimeout(continueToNextStep, 10000);
  yield undefined;

  info("Getting usage after maintenance");

  let usageAfterMaintenance;

  quotaManager.getUsageForPrincipal(principal, (principal, usage) => {
    ok(usage > 0, "Usage is non-zero");
    usageAfterMaintenance = usage;
    continueToNextStep();
  });
  yield undefined;

  info("Usage before: " + usageBeforeMaintenance + ". " +
       "Usage after: " + usageAfterMaintenance);

  ok(usageAfterMaintenance <= usageBeforeMaintenance,
     "Maintenance decreased file sizes or left them the same");

  finishTest();
  yield undefined;
}
