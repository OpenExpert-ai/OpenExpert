// SPDX-License-Identifier: MIT
// La pull request «chore(release): version packages» la empuja
// `changesets/action` con el `GITHUB_TOKEN` del job, así que su actor es
// `github-actions[bot]` y la política de aprobación del repositorio
// (`first_time_contributors`) no lo da por bueno nunca: cada empuje de esa rama
// deja sus tres workflows en `action_required` a 0 s y el PR se queda sin una
// sola comprobación. Medido el 29/10 en el PR #73: 12 ejecuciones aparcadas
// desde el 20/10 y `check-runs` con `total_count` 0 en su head.
//
// Quien aprueba esas ejecuciones es `release.yml` con
// `scripts/approve-parked-runs.mjs`, justo después de empujar la versión. Esta
// prueba fija qué ejecuciones aprueba — solo las de ese PR, en el último
// empuje, desde este mismo repositorio — porque aprobar una ejecución es darle
// secretos y un token con escritura: una condición de más y se abre la puerta a
// las de un fork.

import { describe, expect, it } from "vitest";
import { RELEASE_BRANCH, parkedRunIds, type WorkflowRun } from "../scripts/approve-parked-runs.mjs";

const REPO = "OpenExpert-ai/OpenExpert";
const HEAD = "efc93bc8a5cf0996f79cae786c6a2d4eaa311978";

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: 1,
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_branch: RELEASE_BRANCH,
    head_sha: HEAD,
    head_repository: { full_name: REPO },
    ...overrides,
  };
}

const scope = { repo: REPO, branch: RELEASE_BRANCH, headSha: HEAD };

describe("ejecuciones del PR de versiones que esperan aprobación", () => {
  it("la rama del PR de versiones es la que abre changesets, no una cualquiera", () => {
    expect(RELEASE_BRANCH).toBe("changeset-release/main");
  });

  it("aprueba las ejecuciones aparcadas del head actual, en el orden en que llegan", () => {
    const runs = [run({ id: 40826228458 }), run({ id: 40826228398 }), run({ id: 40826228609 })];
    expect(parkedRunIds(runs, scope)).toEqual([40826228458, 40826228398, 40826228609]);
  });

  it("no aprueba una ejecución que no está esperando aprobación", () => {
    const settled = ["success", "failure", "cancelled", "skipped", "neutral"].map((conclusion, i) =>
      run({ id: i + 1, conclusion }),
    );
    const running = run({ id: 90, status: "in_progress", conclusion: null });
    expect(parkedRunIds([...settled, running], scope)).toEqual([]);
  });

  it("no aprueba una ejecución de otra rama", () => {
    expect(parkedRunIds([run({ head_branch: "auto/T-0384-aprobar-runs" })], scope)).toEqual([]);
  });

  it("no aprueba una ejecución de un empuje anterior: ese head ya no es el del PR", () => {
    expect(
      parkedRunIds([run({ head_sha: "10ddfc9e285bd5279947c4f7dcfc621824e93b2f" })], scope),
    ).toEqual([]);
  });

  it("no aprueba una ejecución de un fork, aunque se llame igual la rama", () => {
    expect(
      parkedRunIds([run({ head_repository: { full_name: "someone-else/OpenExpert" } })], scope),
    ).toEqual([]);
  });

  it("no aprueba una ejecución sin repositorio de cabecera", () => {
    expect(parkedRunIds([run({ head_repository: null })], scope)).toEqual([]);
  });

  it("no aprueba una ejecución de otro evento: solo la del propio pull request", () => {
    expect(parkedRunIds([run({ event: "push" })], scope)).toEqual([]);
  });
});
