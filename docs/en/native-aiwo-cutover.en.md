# Native AIWO provider cutover

Date: 2026-10-13 · Decision: **native primary / external compatibility fallback**.

Spec-007's `spec007-native-aiwo` runtime is now the only manifest-declared
primary AI runtime. It owns policy evaluation, Digit model observations,
AIWO cognition, FANO heartbeats, and chunked scaling admission.

Ollama, qstar HTTP, k3serve, remote Ollama, and Agent Zero remain preserved
as compatibility and rollback paths. They are not deleted, but their manifest
role is `compatibility-fallback` and `primary:false`. They may not issue
binding orders or bypass the native policy gate.

## Cutover evidence

- native AIWO parity: 18/18 before chunk/DHT extension; current scale parity
  includes chunk admission, execution, and checkpoint/resume
- native Digit q4 path: 750 tensors indexed/uploaded; six-step ReleaseFast
  path matched the supplied first three Digit parity IDs
- native FANO: 136-byte heartbeats
- native DHT: signed per-chunk records, three replicas, verified through the
  existing DHT query surface
- governance: 48/48
- team sweep: zero OPEN findings
- publish-check: green

External providers remain available only for rollback, feature comparison,
and capabilities not yet native (for example general chat/provider-specific
schema behavior). This is retirement of external authority, not deletion of
passing compatibility software.
