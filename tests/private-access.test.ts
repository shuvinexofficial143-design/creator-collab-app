import test from "node:test";
import assert from "node:assert/strict";
import { resolvePrivateLogin } from "../src/lib/private-access";

const env = {
  ADMIN_LOGIN_USERNAME: "owner",
  ADMIN_AUTH_EMAIL: "owner@example.com",
  CREATOR_LOGIN_USERNAME: "creator",
  CREATOR_AUTH_EMAIL: "creator@example.com",
};

test("private login resolves only pre-provisioned usernames", () => {
  assert.deepEqual(resolvePrivateLogin(" CREATOR ", env), {
    email: "creator@example.com",
    role: "CREATOR",
  });
  assert.deepEqual(resolvePrivateLogin("owner", env), {
    email: "owner@example.com",
    role: "ADMIN",
  });
  assert.equal(resolvePrivateLogin("unknown", env), null);
  assert.equal(resolvePrivateLogin("creator@example.com", env), null);
});

test("duplicate usernames fail closed", () => {
  assert.equal(
    resolvePrivateLogin("owner", { ...env, CREATOR_LOGIN_USERNAME: "owner" }),
    null,
  );
});

test("missing mapped email fails closed", () => {
  assert.equal(resolvePrivateLogin("creator", { ...env, CREATOR_AUTH_EMAIL: "" }), null);
});
