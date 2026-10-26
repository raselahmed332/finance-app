"use strict";

// Role-assignment authority. Only an Admin may hand out the two privileged
// roles (Admin / Sub-Admin); everyone else may only create or demote to "User".

const test = require("node:test");
const assert = require("node:assert");
const { loadBackend } = require("./load-backend.js");

function setup(users) {
  const ctx = loadBackend();
  const store = {};
  users.forEach((u) => {
    store[u.Username.toLowerCase()] = u;
  });
  ctx.getUserRecord_ = (username) => store[String(username || "").toLowerCase()] || null;
  ctx.logAudit = () => {};
  return ctx;
}

const ADMIN = { Username: "boss", Role: "Admin", Status: "Active" };
const SUBADMIN = { Username: "sara", Role: "Sub-Admin", Status: "Active" };
const PLAIN = { Username: "rafi", Role: "User", Status: "Active" };

test("an Admin may create Admin and Sub-Admin users", () => {
  const ctx = setup([ADMIN]);
  assert.equal(ctx.assertCanManageUser_("boss", "new1", { role: "Admin" }), null);
  assert.equal(ctx.assertCanManageUser_("boss", "new2", { role: "Sub-Admin" }), null);
  assert.equal(ctx.assertCanManageUser_("boss", "new3", { role: "User" }), null);
});

test("a non-Admin may NOT create or assign a Sub-Admin", () => {
  // Regression: the check used to block only "Admin", so a Sub-Admin holding
  // ADD_USER could mint another Sub-Admin - a step up the hierarchy and the
  // entry point for granting any ADDITIONAL_PERMISSION afterwards.
  const ctx = setup([SUBADMIN, PLAIN]);
  const err = ctx.assertCanManageUser_("sara", "newbie", { role: "Sub-Admin" });
  assert.ok(err, "expected the Sub-Admin grant to be refused");
  assert.equal(err.status, "ERROR");
  assert.equal(err.code, ctx.ERR.PERMISSION_DENIED);
});

test("a non-Admin may NOT create or assign an Admin", () => {
  const ctx = setup([SUBADMIN, PLAIN]);
  const err = ctx.assertCanManageUser_("sara", "newbie", { role: "Admin" });
  assert.ok(err, "expected the Admin grant to be refused");
  assert.equal(err.code, ctx.ERR.PERMISSION_DENIED);
});

test("a non-Admin may NOT change an existing Admin's role", () => {
  const ctx = setup([SUBADMIN, { Username: "boss2", Role: "Admin", Status: "Active" }]);
  const err = ctx.assertCanManageUser_("sara", "boss2", { role: "User" });
  assert.ok(err, "expected the Admin demotion by a non-Admin to be refused");
  assert.equal(err.code, ctx.ERR.PERMISSION_DENIED);
});

test("a non-Admin may still create a plain User", () => {
  const ctx = setup([SUBADMIN]);
  assert.equal(ctx.assertCanManageUser_("sara", "newbie", { role: "User" }), null);
});

test("a non-Admin may not change their own role", () => {
  const ctx = setup([SUBADMIN]);
  const err = ctx.assertCanManageUser_("sara", "sara", { role: "User" });
  assert.ok(err);
  assert.equal(err.code, ctx.ERR.PERMISSION_DENIED);
});

test("an unknown role is rejected before any privilege check", () => {
  const ctx = setup([ADMIN]);
  const err = ctx.assertCanManageUser_("boss", "newbie", { role: "Superuser" });
  assert.ok(err);
  assert.equal(err.code, ctx.ERR.VALIDATION_ERROR);
});

test("an inactive or unknown actor cannot manage users at all", () => {
  const ctx = setup([{ Username: "sara", Role: "Sub-Admin", Status: "Inactive" }]);
  const err = ctx.assertCanManageUser_("sara", "newbie", { role: "User" });
  assert.ok(err);
  assert.equal(err.code, ctx.ERR.INVALID_SESSION);

  const ctx2 = setup([ADMIN]);
  const err2 = ctx2.assertCanManageUser_("ghost", "newbie", { role: "User" });
  assert.ok(err2);
  assert.equal(err2.code, ctx2.ERR.INVALID_SESSION);
});

test("only Admin may delete users or change status", () => {
  const ctx = setup([ADMIN, SUBADMIN, PLAIN]);
  assert.ok(ctx.assertCanManageUser_("sara", "rafi", { status: "Inactive" }));
  assert.ok(ctx.assertCanManageUser_("sara", "rafi", { deleting: true }));
  assert.equal(ctx.assertCanManageUser_("boss", "rafi", { status: "Inactive" }), null);
  assert.equal(ctx.assertCanManageUser_("boss", "rafi", { deleting: true }), null);
});

test("the role allowlist is exactly Admin / Sub-Admin / User", () => {
  const ctx = loadBackend();
  assert.deepEqual(ctx.VALID_ROLES, ["Admin", "Sub-Admin", "User"]);
  // And the privileged tiers are not grantable as a permission either - they
  // are stripped out of every non-Admin's effective permission set.
  assert.ok(ctx.ADMIN_ONLY_ACTIONS.includes("CHANGE_USER_ROLE"));
  assert.ok(ctx.ADMIN_ONLY_ACTIONS.includes("CREATE_ADMIN"));
  assert.equal(ctx.GRANTABLE_PERMISSIONS.includes("CHANGE_USER_ROLE"), false);
  assert.equal(ctx.GRANTABLE_PERMISSIONS.includes("CREATE_ADMIN"), false);
});
