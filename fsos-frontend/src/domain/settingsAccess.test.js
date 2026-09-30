// Settings is admins-only. Users & Roles can't grant it, and can't take it from an admin.
import { resolveRoleAccess, resolvePersonAccess, ROLE_ACCESS_DEFAULTS } from "./access";
import { ROLES } from "./constants";

const ADMINS = ["Founder/Admin", "COA"];

it("only admin roles get Settings by default", () => {
  ROLES.forEach((role) => {
    expect(resolveRoleAccess(role, {}).settings).toBe(ADMINS.includes(role) ? "edit" : "none");
  });
});

it("a saved role override cannot grant Settings, or remove it from an admin", () => {
  const overrides = { Designer: { settings: "view" }, Editor: { settings: "edit" }, COA: { settings: "none" } };
  expect(resolveRoleAccess("Designer", overrides).settings).toBe("none");
  expect(resolveRoleAccess("Editor", overrides).settings).toBe("none");
  expect(resolveRoleAccess("COA", overrides).settings).toBe("edit");
});

it("a per-person override cannot grant Settings, whatever level it names", () => {
  ["view", "edit"].forEach((level) => {
    expect(resolvePersonAccess(["Designer"], { settings: level }, {}).settings).toBe("none");
    expect(resolvePersonAccess(["CS", "Short-form Lead"], { settings: level }, {}).settings).toBe("none");
  });
});

it("a person keeps Settings if any one of their roles is an admin role", () => {
  expect(resolvePersonAccess(["Designer", "COA"], { settings: "none" }, {}).settings).toBe("edit");
  expect(resolvePersonAccess(["Founder/Admin"], null, {}).settings).toBe("edit");
});

it("other areas still follow overrides", () => {
  expect(resolvePersonAccess(["Designer"], { news: "edit", settings: "edit" }, {}).news).toBe("edit");
  expect(ROLE_ACCESS_DEFAULTS.Designer.production).toBe("edit");
});
