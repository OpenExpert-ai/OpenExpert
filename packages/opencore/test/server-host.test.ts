// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { localServerEnv } from "../src/cli/lib.js";

describe("localServerEnv", () => {
  it("binds the loopback address by default", () => {
    expect(localServerEnv({})).toEqual({ HOST: "127.0.0.1" });
  });

  it("honours OPENEXPERT_HOST when the operator asks for another interface", () => {
    expect(localServerEnv({ OPENEXPERT_HOST: "0.0.0.0" })).toEqual({ HOST: "0.0.0.0" });
  });

  it("keeps a HOST the operator already set, and OPENEXPERT_HOST wins over it", () => {
    expect(localServerEnv({ HOST: "192.168.1.10" })).toEqual({ HOST: "192.168.1.10" });
    expect(localServerEnv({ HOST: "192.168.1.10", OPENEXPERT_HOST: "127.0.0.1" })).toEqual({
      HOST: "127.0.0.1",
    });
  });
});
