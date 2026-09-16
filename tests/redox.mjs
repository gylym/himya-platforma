import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { QUESTIONS, LEVELS, questionsFor, grade } from "../redox-data.js";
import { learningApi } from "../learning-api.js";
test("every level is complete and scores all 27 answer combinations correctly", () => {
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 9);
  for (const level of Object.keys(LEVELS)) {
    const qs = questionsFor(level);
    assert.equal(qs.length, 3);
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        for (let c = 0; c < 3; c++) {
          const answers = [a, b, c];
          assert.equal(
            grade(level, answers).score,
            qs.reduce((n, q, i) => n + (q.answer === answers[i] ? 100 : 0), 0),
          );
        }
  }
});
test("incomplete, unknown, fractional and out-of-range answers cannot score", () => {
  for (const a of [
    [],
    [0, 1],
    [0, 1, 3],
    [0, 1, 1.5],
    [null, 1, 2],
    ["0", 1, 2],
  ])
    assert.throws(() => grade("beginner", a));
  assert.throws(() => grade("unknown", [0, 1, 2]));
});
test("SQL answer keys match the reviewed question bank", () => {
  const sql = readFileSync(
    new URL(
      "../supabase/migrations/202609160001_redox_game.sql",
      import.meta.url,
    ),
    "utf8",
  );
  for (const level of Object.keys(LEVELS))
    assert.ok(
      sql.includes(
        `when '${level}' then '${JSON.stringify(questionsFor(level).map((q) => q.answer))}'::jsonb`,
      ),
    );
  assert.match(
    sql,
    /revoke all on public.game_results from anon,authenticated/,
  );
  assert.match(sql, /user_id=\(select auth.uid\(\)\)/);
});
function mock() {
  const calls = [];
  const store = {
    mode: "supabase",
    validSession: async () => ({
      access_token: "test",
      user: { id: "user-a" },
    }),
    headers: (token) => ({ Authorization: token }),
    request: async (path, options) => {
      calls.push({ path, options });
      return [{ display_name: "New name" }];
    },
  };
  return { store, calls, api: learningApi(store) };
}
test("profile update only sends display_name, never role or another owner", async () => {
  const { api, calls } = mock();
  await api.profile("  New name  ");
  assert.equal(calls[0].path, "/rest/v1/profiles?id=eq.user-a");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    display_name: "New name",
  });
  await assert.rejects(api.profile(" "));
});
test("game saving delegates score and ownership to server", async () => {
  const { api, calls } = mock();
  await api.save("attempt", "beginner", [0, 1, 2]);
  assert.equal(calls[0].path, "/rest/v1/rpc/submit_redox_game");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_id: "attempt",
    p_level: "beginner",
    p_answers: [0, 1, 2],
  });
});
test("guest cannot read results, update profile or change password", async () => {
  const { api, store, calls } = mock();
  store.validSession = async () => null;
  await assert.rejects(api.results());
  await assert.rejects(api.profile("Name"));
  await assert.rejects(api.password("password"));
  assert.equal(calls.length, 0);
});
test("result requests explicitly filter the authenticated owner", async () => {
  const { api, calls } = mock();
  await api.results();
  assert.ok(calls[0].path.includes("user_id=eq.user-a"));
});
test("missing Supabase is reported, never a simulated successful save", async () => {
  const { api, store, calls } = mock();
  store.mode = "local-server";
  await assert.rejects(api.save("id", "beginner", [0, 1, 2]), /Supabase/);
  assert.equal(calls.length, 0);
});
test("expired callback removes token/error fragment before reporting failure", async () => {
  const { api } = mock();
  globalThis.location = { hash: "#error_description=expired", pathname: "/" };
  let removed = false;
  globalThis.history = {
    replaceState: () => {
      removed = true;
    },
  };
  await assert.rejects(api.callback(), /жарамсыз/);
  assert.ok(removed);
});
test("recovery callback verifies identity before persisting session and opens reset route", async () => {
  const { api, store } = mock();
  let saved = null,
    route = null;
  globalThis.document = { baseURI: "https://gylym.github.io/himya-platforma/" };
  globalThis.location = {
    hash: "#access_token=test-token&refresh_token=test-refresh&type=recovery&expires_in=3600",
    pathname: "/himya-platforma/",
  };
  globalThis.history = {
    replaceState: (_a, _b, p) => {
      route = p;
    },
  };
  store.request = async (p) => {
    assert.equal(saved, null);
    assert.equal(p, "/auth/v1/user");
    assert.equal(route, "/himya-platforma/reset-password");
    return { id: "verified-user" };
  };
  store.authVersion = 0;
  store.saveSession = (s) => {
    saved = s;
  };
  await api.callback();
  assert.equal(saved.user.id, "verified-user");
  assert.equal(saved.refresh_token, "test-refresh");
});
test("reset and resend target the repository root callback URL", async () => {
  const { api, calls } = mock();
  globalThis.document = { baseURI: "https://gylym.github.io/himya-platforma/" };
  await api.recover("qa@example.test");
  await api.resend("qa@example.test");
  for (const call of calls) {
    assert.ok(
      call.path.includes(
        "redirect_to=https%3A%2F%2Fgylym.github.io%2Fhimya-platforma%2F",
      ),
    );
    assert.equal(JSON.parse(call.options.body).email, "qa@example.test");
  }
});
