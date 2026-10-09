import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const compose = "deploy/hostinger/compose.yaml";
const env = {
  ...process.env,
  DEMO_VERSION: "test-only",
  DEMO_ORIGIN: "https://demo.example.invalid",
  DEMO_AUTH_FILE: "/tmp/absent-demo-auth",
};
const config = JSON.parse(
  execFileSync(
    "docker",
    ["compose", "-f", compose, "config", "--format", "json"],
    { env, encoding: "utf8" },
  ),
);
assert.equal(config.name, "inmoagent-review");
assert.equal(config.networks.demo_private.internal, true);
assert.equal(config.networks.demo_ingress.name, "inmoagent-review-ingress");
assert.deepEqual(Object.keys(config.services.api.networks).sort(), [
  "demo_ingress",
  "demo_private",
]);
assert.equal(config.volumes.demo_db.name, "inmoagent-review-data");
assert.equal(config.services.db.ports, undefined);
assert.deepEqual(config.services.db.networks, { demo_private: null });
assert.equal(config.services.web.network_mode, "service:api");
assert.equal(config.services.api.environment.HOST, "127.0.0.1");
assert.equal(config.services.api.ports[0].host_ip, "127.0.0.1");
assert.equal(config.services.api.ports[0].target, 8080);
assert.equal(config.services.api.read_only, true);
assert.equal(config.services.web.read_only, true);
for (const service of Object.values(config.services))
  assert.ok(service.mem_limit && service.cpus && service.pids_limit);
const nginx = readFileSync("deploy/hostinger/nginx.conf", "utf8");
assert.match(nginx, /auth_basic_user_file \/run\/secrets\/demo_auth/);
assert.doesNotMatch(nginx, /auth_basic off/);
assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3001\//);
assert.match(nginx, /listen 127\.0\.0\.1:8081/);
try {
  execFileSync("bash", ["deploy/hostinger/check.sh"], { env, stdio: "pipe" });
  assert.fail("missing protection accepted");
} catch (error) {
  assert.match(String(error.stdout), /Protection file missing/);
}
try {
  execFileSync("docker", ["compose", "-f", compose, "config", "--quiet"], {
    env: { ...env, DEMO_AUTH_FILE: "" },
    stdio: "pipe",
  });
  assert.fail("empty protection accepted");
} catch (error) {
  assert.match(String(error.stderr), /Protection required/);
}
console.log(
  "PASS: isolated topology, no DB host port, loopback ingress, protection required, bounded resources. No containers started.",
);
