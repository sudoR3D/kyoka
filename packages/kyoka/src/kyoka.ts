import * as admin from "./admin.js";
import { runCheck } from "./check.js";
import { applyBillingEvent } from "./events.js";
import { createHandler } from "./handler.js";
import { ensureSubject } from "./subjects.js";
import type { KyokaInstance, KyokaOptions } from "./types.js";

export function kyoka(options: KyokaOptions): KyokaInstance {
  if (!options.database) {
    throw new Error("Kyoka: database adapter is required");
  }
  if (!options.defaultPlan) {
    throw new Error("Kyoka: defaultPlan is required");
  }
  if (options.planStore !== "config" && options.planStore !== "database") {
    throw new Error('Kyoka: planStore must be "config" or "database"');
  }
  if (options.planStore === "config" && !options.plans) {
    throw new Error('Kyoka: planStore "config" requires plans');
  }

  const instance: KyokaInstance = {
    options,
    api: {
      check: (input) => runCheck(options, input),
      applyBillingEvent: (input) => applyBillingEvent(options, input),
      plans: {
        list: () => admin.listPlans(options),
        get: (slug) => admin.getPlan(options, slug),
        upsert: (input) => admin.upsertPlan(options, input),
        delete: (slug) => admin.deletePlan(options, slug),
      },
      subjects: {
        ensure: (input) => ensureSubject(options, input),
        get: (subjectOrAlias) => admin.getSubject(options, subjectOrAlias),
        setOverride: (input) => admin.setOverride(options, input),
        clearOverride: (input) => admin.clearOverride(options, input),
      },
      aliases: {
        add: (input) => admin.addAlias(options, input),
        remove: (input) => admin.removeAlias(options, input),
      },
    },
    handler: async () => new Response("not ready"),
  };

  instance.handler = createHandler(options, instance);
  return instance;
}
