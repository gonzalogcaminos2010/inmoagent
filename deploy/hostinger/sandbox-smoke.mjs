import { cleanupSandbox } from "./cleanup.mjs";
// Run only in an authorized disposable development Docker environment. Never on VPS.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
if (process.env.INMO_SANDBOX_ACK !== "development-only")
  throw new Error(
    "Requires INMO_SANDBOX_ACK=development-only; never run on VPS",
  );
const temp = mkdtempSync(join(tmpdir(), "inmo-sandbox-"));
const version = process.env.SANDBOX_IMAGE_VERSION ?? "sandbox-96eb247";
const env = {
  ...process.env,
  DOCKER_CONFIG: "/tmp/inmo-build-docker",
  DEMO_VERSION: version,
  DEMO_ORIGIN: "https://demo.example.invalid",
  DEMO_AUTH_FILE: join(temp, "auth"),
  DEMO_LOOPBACK_PORT: "18080",
};
const dc = (args, input) =>
  execFileSync(
    "docker",
    ["compose", "-f", "deploy/hostinger/compose.yaml", ...args],
    {
      env,
      input,
      encoding:
        args.includes("pg_dump") || input instanceof Buffer
          ? undefined
          : "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
const docker = (args) =>
  execFileSync("docker", args, { env, encoding: "utf8" });
const wait = () => new Promise((r) => setTimeout(r, 1000));
const milestones = [];
function passed(value) {
  milestones.push(value);
  console.log("PASS " + value);
}
const password = randomBytes(24).toString("hex");
const hash = execFileSync("openssl", ["passwd", "-apr1", "-stdin"], {
  input: password + "\n",
  encoding: "utf8",
}).trim();
writeFileSync(env.DEMO_AUTH_FILE, "review:" + hash + "\n", { mode: 0o644 });
chmodSync(env.DEMO_AUTH_FILE, 0o644); // Hash-only temporary bind mount readable by nginx UID101.
const authorization =
  "Basic " + Buffer.from("review:" + password).toString("base64");
const origin = env.DEMO_ORIGIN;
let owned = false;
const createdTags = [];
const brokenVersion = "sandbox-broken-" + randomBytes(8).toString("hex");
async function http(path, options = {}, auth = true) {
  return fetch("http://127.0.0.1:18080" + path, {
    ...options,
    headers: { ...(auth ? { authorization } : {}), ...options.headers },
  });
}
async function login(identity = "a-admin") {
  const r = await http("/api/demo/session", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ identity }),
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /Secure/);
  const body = await r.json();
  return {
    cookie: r.headers.get("set-cookie").split(";")[0],
    origin,
    "x-csrf-token": body.csrfToken,
    "content-type": "application/json",
  };
}
async function api(path, headers, payload) {
  const r = await http("/api" + path, {
    method: payload === undefined ? "GET" : "POST",
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  assert.equal(r.status, 200, `${path} ${await r.clone().text()}`);
  return r.json();
}
try {
  for (const [kind, name] of [
    ["network", "inmoagent-review-private"],
    ["network", "inmoagent-review-ingress"],
    ["volume", "inmoagent-review-data"],
  ]) {
    try {
      docker([kind, "inspect", name]);
      assert.fail("Existing resource: " + name);
    } catch (e) {
      if (e.code === "ERR_ASSERTION") throw e;
    }
  }
  assert.equal(
    JSON.parse(dc(["config", "--format", "json"])).services.api.ports[0]
      .host_ip,
    "127.0.0.1",
  );
  owned = true;
  dc(["up", "-d", "--wait", "db"]);
  dc(["--profile", "tools", "run", "--rm", "migrate"]);
  dc(["up", "-d", "--wait", "--no-build", "api", "web"]);
  passed("built images start and healthchecks pass");
  for (const path of [
    "/",
    "/api/health",
    "/api/inquiries",
    "/api/public/chat/sessions/nope",
  ])
    assert.equal((await http(path, {}, false)).status, 401);
  assert.equal(
    (
      await http(
        "/",
        {
          headers: {
            authorization:
              "Basic " + Buffer.from("review:wrong").toString("base64"),
          },
        },
        false,
      )
    ).status,
    401,
  );
  assert.equal((await http("/")).status, 200);
  passed(
    "static, panel, public API and health require gateway credentials; wrong credentials rejected",
  );
  const headers = await login();
  const bad = await http("/api/demo/session", {
    method: "POST",
    headers: {
      origin: "https://wrong.example.invalid",
      "content-type": "application/json",
    },
    body: JSON.stringify({ identity: "a-admin" }),
  });
  assert.equal(bad.status, 403);
  passed("exact HTTPS Origin and Secure session cookie");
  const d = await api("/assistant/drafts", headers, {
    businessName: "Demo ficticia",
    approvedKnowledge: "Atención ficticia coordinada por el equipo.",
    tone: "Cercano",
    hours: "9 a 18",
    handoffRules: "Pedir humano",
    ownerMembershipId: "member-a-admin",
    mode: "simulated",
  });
  const t = await api("/assistant/drafts/" + d.id + "/test", headers, {
    prompt: "Hola",
  });
  const v = await api("/assistant/drafts/" + d.id + "/publish", headers, {
    testId: t.testId,
    idempotencyKey: randomUUID(),
  });
  const s = await api("/chat/sessions", headers, { configId: v.id });
  const receipt = await api("/chat/sessions/" + s.id + "/messages", headers, {
    text: "Consulta ficticia de sandbox",
    clientMessageId: randomUUID(),
  });
  let detail;
  for (let i = 0; i < 20; i++) {
    detail = await api("/inquiries/" + receipt.inquiryId, headers);
    if (detail.messages.some((m) => m.direction === "outgoing")) break;
    await wait();
  }
  assert.ok(
    detail.messages.some(
      (m) => m.direction === "outgoing" && m.mode === "simulated",
    ),
  );
  const b = await login("b-admin");
  assert.equal(
    (await http("/api/inquiries/" + receipt.inquiryId, { headers: b })).status,
    404,
  );
  passed("simulation works and tenants remain isolated through proxy");
  const dbContainer = dc(["ps", "-q", "db"]).trim();
  const dbInfo = JSON.parse(docker(["inspect", dbContainer]))[0];
  assert.equal(Object.keys(dbInfo.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(Object.keys(dbInfo.NetworkSettings.Networks).length, 1);
  const net = JSON.parse(
    docker(["network", "inspect", "inmoagent-review-private"]),
  )[0];
  assert.equal(net.Internal, true);
  assert.equal(
    dbInfo.Mounts.find((m) => m.Type === "volume").Name,
    "inmoagent-review-data",
  );
  passed(
    "DB no host port, one internal dedicated network, own persistent volume",
  );
  dc(["stop", "web", "api", "db"]);
  dc(["up", "-d", "--wait", "--no-build", "db", "api", "web"]);
  const again = await login();
  assert.equal(
    (await api("/inquiries/" + receipt.inquiryId, again)).id,
    receipt.inquiryId,
  );
  passed("data survives full service restart");
  const dump = dc([
    "exec",
    "-T",
    "db",
    "pg_dump",
    "-U",
    "postgres",
    "-Fc",
    "inmoagent",
  ]);
  assert.equal(dump.subarray(0, 5).toString(), "PGDMP");
  dc(["stop", "web", "api"]);
  dc([
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "postgres",
    "-d",
    "inmoagent",
    "-c",
    "UPDATE inquiries SET data=jsonb_set(data,'{nextAction}','\"changed after backup\"'::jsonb);",
  ]);
  dc(
    [
      "exec",
      "-T",
      "db",
      "pg_restore",
      "-U",
      "postgres",
      "--exit-on-error",
      "--clean",
      "--if-exists",
      "-d",
      "inmoagent",
    ],
    dump,
  );
  dc(["up", "-d", "--wait", "--no-build", "api", "web"]);
  const restored = await api("/inquiries/" + receipt.inquiryId, await login());
  assert.equal(restored.nextAction, detail.nextAction);
  assert.equal(restored.messages.length, detail.messages.length);
  passed(
    "consistent dump restores only this demo and recovers inquiry/transcript",
  );
  execFileSync(
    "docker",
    [
      "build",
      "--network=none",
      "-t",
      "inmoagent-review-api:" + brokenVersion,
      "-",
    ],
    {
      env,
      input: `FROM inmoagent-review-api:${version}\nCMD ["node","-e","process.exit(1)"]\n`,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  createdTags.push("inmoagent-review-api:" + brokenVersion);
  docker([
    "tag",
    "inmoagent-review-web:" + version,
    "inmoagent-review-web:" + brokenVersion,
  ]);
  createdTags.push("inmoagent-review-web:" + brokenVersion);
  dc(["stop", "web", "api"]);
  env.DEMO_VERSION = brokenVersion;
  let rejected = false;
  try {
    dc([
      "up",
      "-d",
      "--wait",
      "--wait-timeout",
      "15",
      "--no-build",
      "api",
      "web",
    ]);
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, "Broken image must fail health gate");
  passed("deliberately broken release rejected by health gate");
  env.DEMO_VERSION = version;
  dc(["stop", "web", "api"]);
  dc(["up", "-d", "--wait", "--no-build", "api", "web"]);
  const apiInfo = JSON.parse(
    docker(["inspect", dc(["ps", "-q", "api"]).trim()]),
  )[0];
  assert.equal(apiInfo.Config.Image, "inmoagent-review-api:" + version);
  assert.equal(
    (await api("/inquiries/" + receipt.inquiryId, await login())).id,
    receipt.inquiryId,
  );
  passed(
    "rollback from broken release restores previous healthy images and data (no migration downgrade)",
  );
  console.log(
    JSON.stringify({
      milestones,
      imagesPublished: false,
      tlsOffloadTested: false,
      rollbackMigrationDowngradeTested: false,
    }),
  );
} catch (error) {
  console.error(error.message, error.cause?.code, error.cause?.message);
  if (owned) {
    try {
      console.error(
        dc(["logs", "--tail", "30"]).replaceAll(password, "[redacted]"),
      );
    } catch {
      console.error("Could not collect sandbox logs");
    }
  }
  process.exitCode = 1;
} finally {
  cleanupSandbox({
    owned,
    tags: createdTags,
    down: () => dc(["down"]),
    removeVolume: () => docker(["volume", "rm", "inmoagent-review-data"]),
    removeTag: (tag) => docker(["image", "rm", tag]),
    removeTemp: () => rmSync(temp, { recursive: true, force: true }),
    report: (error) => {
      process.exitCode = 1;
      console.error("Sandbox cleanup incomplete:", error.message);
    },
  });
}
