import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
const owner = "11111111-1111-4111-8111-111111111111",
  editor = "22222222-2222-4222-8222-222222222222",
  session = "33333333-3333-4333-8333-333333333333",
  version = "44444444-4444-4444-8444-444444444444",
  request = "55555555-5555-4555-8555-555555555555";
test("PostgreSQL isolation: anonymous, MFA, membership, sessions, immutable snapshots, state/audit and publication concurrency", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid);create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;grant usage on schema auth to authenticated;grant execute on all functions in schema auth to authenticated;insert into auth.users values('${owner}'),('${editor}');insert into auth.sessions values('${session}','${owner}');`,
    );
    const files = await readdir("supabase/migrations");
    for (const f of files.filter((f) => f.endsWith(".sql")).sort())
      await db.exec(await readFile("supabase/migrations/" + f, "utf8"));
    await db.exec(
      `insert into public.quote_admins values('${owner}','owner',true),('${editor}','editor',true);insert into public.quote_versions(id,config)values('${version}','{"services":[],"commercial":{},"transport":{}}');update public.quote_settings set version_id='${version}';insert into public.quote_requests(id,version_id,idempotency_hash,payload_hash,snapshot,contact,expires_at)values('${request}','${version}','one','one','{}','{}',now()+interval '7 days');`,
    );
    async function claims(sub = owner, aal = "aal2", sid = session) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub, aal, session_id: sid }),
      ]);
      await db.exec("set role authenticated");
    }
    await db.exec("set role anon");
    await assert.rejects(
      db.query("select * from public.quote_requests"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select public.consume_quote_limit('a',1)"),
      /permission denied/,
    );
    await claims(owner, "aal1");
    assert.equal(
      (await db.query("select * from public.quote_requests")).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select public.publish_quote_version('{}',null)"),
      /Forbidden/,
    );
    await claims(owner, "aal2", request);
    assert.equal(
      (await db.query("select * from public.quote_requests")).rows.length,
      0,
    );
    await claims();
    assert.equal(
      (await db.query("select * from public.quote_requests")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("update public.quote_requests set snapshot='{}'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.quote_requests"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update public.quote_requests set state='Finalizada'"),
      /Invalid state transition/,
    );
    await db.query("update public.quote_requests set state='Contactada'");
    assert.equal(
      (await db.query("select revision from public.quote_requests")).rows[0]
        .revision,
      2,
    );
    assert.equal(
      (
        await db.query(
          "select * from public.quote_audit where action='state_changed'",
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      db.query("delete from public.quote_audit"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("update public.quote_versions set config='{}'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        'select public.publish_quote_version(\'{"services":[],"commercial":{},"transport":{}}\',null)',
      ),
      /Tariff conflict/,
    );
    const result = await db.query(
      'select public.publish_quote_version(\'{"services":[],"commercial":{},"transport":{}}\',$1)',
      [version],
    );
    assert.ok(result.rows[0].publish_quote_version);
    assert.equal(
      (await db.query("select version_id from public.quote_requests")).rows[0]
        .version_id,
      version,
    );
    await db.exec("reset role");
    await db.exec(`insert into auth.sessions values('${editor}','${editor}')`);
    await claims(editor, "aal2", editor);
    assert.equal(
      (await db.query("select * from public.quote_requests")).rows.length,
      1,
    );
    await assert.rejects(
      db.query("select public.publish_quote_version('{}',null)"),
      /Forbidden/,
    );
    await db.exec("reset role");
    await db.exec(
      `update public.quote_admins set active=false where user_id='${owner}'`,
    );
    await claims();
    assert.equal(
      (await db.query("select * from public.quote_requests")).rows.length,
      0,
    );
    await db.exec("reset role");
    await db.exec("set role service_role");
    assert.equal(
      (await db.query("select public.consume_quote_limit('test',1) as ok"))
        .rows[0].ok,
      true,
    );
    assert.equal(
      (await db.query("select public.consume_quote_limit('test',1) as ok"))
        .rows[0].ok,
      false,
    );
    const active = (
      await db.query("select version_id from public.quote_settings")
    ).rows[0].version_id;
    const row = {
      version_id: active,
      idempotency_hash: "request-two",
      payload_hash: "hash-two",
      snapshot: { total: null },
      contact: { name: "Prueba" },
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    };
    const first = await db.query(
      "select id from public.save_quote_request($1)",
      [row],
    );
    const second = await db.query(
      "select id from public.save_quote_request($1)",
      [row],
    );
    assert.equal(first.rows[0].id, second.rows[0].id);
    await assert.rejects(
      db.query("select id from public.save_quote_request($1)", [
        { ...row, version_id: version, idempotency_hash: "stale" },
      ]),
      /Tariff conflict/,
    );
    await assert.rejects(
      db.query(
        "update public.quote_requests set snapshot='{\"changed\":true}' where id=$1",
        [first.rows[0].id],
      ),
      /Immutable request snapshot/,
    );
  } finally {
    await db.close();
  }
});
