// Previewing as someone must show their powers, not yours on top of theirs.
//
// An admin previewing a carousel designer was still offered "Approve idea" and the
// publish controls. The area matrix switched to the designer correctly, but every role
// check went on reading the signed-in admin, so the screen was the union of both. The
// whole point of the feature is to answer "what does this person see", and it was
// answering "what do you see, plus their areas".
import { effectiveUser, resolvePersonAccess } from "./access";
import { isAdmin, canAssignProduction, canCreateIdea, isProducerRole } from "./roles";

const admin = { id: "u-admin", name: "Krishna", roles: ["Founder/Admin"], streams: ["BO", "HPN"] };
const designer = { id: "u-rjoe", name: "RJoe", roles: ["Designer"], streams: ["BO"] };
const users = [admin, designer];

test("no preview leaves the real person alone", () => {
  expect(effectiveUser(admin, null, users)).toBe(admin);
});

describe("previewing a person", () => {
  const as = effectiveUser(admin, { kind: "person", id: "u-rjoe" }, users);

  test("becomes them, not a blend", () => {
    expect(as.id).toBe("u-rjoe");
    expect(as.roles).toEqual(["Designer"]);
  });

  test("loses the admin powers that leaked through", () => {
    expect(isAdmin(as)).toBe(false);
    expect(canAssignProduction(as)).toBe(false);   // owner / reviewer / deadline
    expect(canCreateIdea(as)).toBe(false);
    expect(isProducerRole(as)).toBe(true);
  });

  test("and the real admin still has them", () => {
    expect(isAdmin(admin)).toBe(true);
    expect(canAssignProduction(admin)).toBe(true);
  });

  test("a designer gets Production and nothing else to edit", () => {
    const m = resolvePersonAccess(as.roles);
    expect(m.production).toBe("edit");
    expect(m.distribution).toBe("none");
    expect(m.settings).toBe("none");
    expect(m.users_roles).toBe("none");
  });
});

describe("previewing a role", () => {
  const as = effectiveUser(admin, { kind: "role", role: "Editor" }, users);

  test("keeps the person but takes only that role", () => {
    expect(as.id).toBe("u-admin");
    expect(as.roles).toEqual(["Editor"]);
    expect(isAdmin(as)).toBe(false);
    expect(canAssignProduction(as)).toBe(false);
  });
});

test("previewing someone who has since been removed falls back to the real user", () => {
  expect(effectiveUser(admin, { kind: "person", id: "u-gone" }, users)).toBe(admin);
});
