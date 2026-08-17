import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const prepareScript = new URL("../scripts/prepare.mjs", import.meta.url);

test("prepare skips Husky when development dependencies are omitted", () => {
  const result = spawnSync(process.execPath, [prepareScript.pathname], {
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_omit: "dev",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});
