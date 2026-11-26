import { arr, bool, int, num, obj, str } from '../schema.ts'
import type { BlockSpec } from '../schema.ts'

export const spec: BlockSpec = {
  id: 'system-sim',
  version: '1.0.0',
  engine: '^1.0.0',
  summary: 'A load simulation of an architecture (rate limits, caches, queues, scaling, outages) where the learner picks settings to meet goals.',
  schema: {
    instruction: str,
    duration: int,
    costUnit: str,
    sources: arr(obj({
      id: str, label: str, rate: num, burstSize: num, burstEvery: int, burstOffset: int, burstLength: int, limited: bool,
      phases: arr(obj({ from: int, to: int, rate: num })),
    })),
    nodes: arr(obj({
      id: str,
      label: str,
      kind: { type: 'string', enum: ['limiter', 'cache', 'service', 'queue', 'store'] },
      capacity: num,
      instances: int,
      latencyMs: num,
      hitRate: num,
      maxQueue: num,
      algorithm: { type: 'string', enum: ['', 'fixed', 'sliding', 'token', 'leaky'] },
      limit: num,
      window: int,
      burst: num,
      copies: int,
      store: str,
      failMode: { type: 'string', enum: ['', 'open', 'closed', 'local'] },
    })),
    path: arr(str),
    failures: arr(obj({ node: str, from: int, to: int, label: str })),
    controls: arr(obj({
      label: str,
      options: arr(obj({ label: str, detail: str, cost: num, set: arr(obj({ node: str, param: str, value: str })) })),
    })),
    goals: arr(obj({
      label: str,
      metric: { type: 'string', enum: ['errorRate', 'latency', 'passedPerWindow', 'utilization', 'cost'] },
      target: str,
      op: { type: 'string', enum: ['<=', '>='] },
      value: num,
      window: int,
      hint: str,
    })),
  },
  instructions: `for choosing settings and seeing their impact under load or outages in architecture, rate limits, caching, queues, scaling and fault tolerance. The app simulates each second and calculates charts and goals. Describe the scenario only:
- "duration" is 120–900 seconds. "costUnit" names a cost unit (e.g. "Redis nodes") or "".
- "sources": 1–4 traffic classes. "rate" is steady requests/s. Optional bursts: "burstSize" requests/s for "burstLength" seconds every "burstEvery" seconds starting at "burstOffset" (0 means none). "phases" are intervals of alternate rates [{from, to, rate}]. "limited": true means one key subject to limiting, false means many keys checked but never rejected.
- "nodes": 2–6 nodes. "path" contains node IDs in flow order, excluding "store". Node types: "limiter" ("algorithm": fixed | sliding | token | leaky, "limit" requests per "window" seconds, "burst" token allowance or leaky queue size, "copies" independent counters when "store" is "", "store" shared counter node ID, "failMode": open | closed | local during store outage); "cache" ("hitRate" 0–1, pass-through during outage); "service"/"queue" ("capacity" requests/s per instance × "instances", "maxQueue" waiting slots, excess rejected, "latencyMs" rises with load); "store" (one operation per limit check, overload increases check time). Use 0 or "" for unused fields.
- "failures": 0–2 outages [{node, from, to, label}].
- "controls": 2–4 controls with 2–4 options each. Each option has "set" [{node, param, value}] with text values (e.g. {"node":"gw","param":"algorithm","value":"sliding"}). Set "store" to "" to disable shared counting. "cost" is the option cost. The all-first-options configuration must fail at least one goal. Limit the total to 512 combinations.
- "goals": 2–4. Supported "metric" values: errorRate (percent of rejected requests for traffic class "target"), latency (worst mean response time of the class in ms), passedPerWindow (maximum requests served in any "window" seconds), utilization (highest load of node "target" in percent), and cost (sum of option costs, "target" = ""). "op" is usually "<=". "hint" points to what to inspect without revealing the option.
- Work out 1–2 winning combinations, with wrong choices missing different goals. The app checks every combination and rejects unsolvable scenarios. Account for token bucket bursts, fixed windows admitting nearly 2× the limit at boundaries, and independent counters multiplying the limit by "copies".
- Follow a "system-sim" card with an "open" exercise asking the learner to justify their settings and trade-offs. Put criteria in "keyPoints".`,
}
