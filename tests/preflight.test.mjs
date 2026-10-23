import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDeploymentEnv } from "../scripts/check-deploy-env.mjs";
const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrstuvwxyz",
  APP_URL: "https://creator-preview.vercel.app",
};
test("preview preflight checks valid configuration without returning secrets", () => {
  assert.deepEqual(validateDeploymentEnv(valid), {ok:true,errors:[]});
});
test("preflight fails closed on missing or unsafe secrets and URLs", () => {
  for (const patch of [
    {NEXT_PUBLIC_SUPABASE_URL:""},
    {APP_URL:"http://creator-preview.vercel.app"},
    {APP_URL:"https://creator-preview.vercel.app/auth/callback"},
    {APP_URL:"https://me:pass@creator-preview.vercel.app"},
    {APP_URL:"https://example.supabase.co"},
    {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"sb_secret_leak_leak_leak_leak"},
    {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"service_role_not_safe"},
    {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:""},
  ]) {
    const result=validateDeploymentEnv({...valid,...patch});
    assert.equal(result.ok,false,JSON.stringify(patch));
    const rendered=JSON.stringify(result);
    assert.ok(!rendered.includes(valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY));
    assert.ok(!rendered.includes("sb_secret_leak_leak_leak_leak"));
  }
});
