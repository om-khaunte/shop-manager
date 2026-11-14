import { describe, expect, it } from "vitest";
import { memberName, sortMembers, type Member } from "./members";

const m = (uid: string, role: Member["role"], displayName: string | null, email: string | null = null): Member => ({ uid, role, displayName, email });

describe("memberName", () => {
  it("prefers the display name, then email, then a short user id", () => {
    expect(memberName(m("abcdefghijk", "editor", "Sam Rivera", "sam@x.org"))).toBe("Sam Rivera");
    expect(memberName(m("abcdefghijk", "editor", " ", "sam@x.org"))).toBe("sam@x.org");
    expect(memberName(m("abcdefghijk", "editor", null))).toBe("abcdefgh…");
  });
});

describe("sortMembers", () => {
  it("lists admins first, then everyone alphabetically, without mutating the input", () => {
    const input = [m("1", "editor", "zed"), m("2", "admin", "Mia"), m("3", "editor", "amy"), m("4", "admin", "bo")];
    const out = sortMembers(input).map((x) => x.uid);
    expect(out).toEqual(["4", "2", "3", "1"]);
    expect(input.map((x) => x.uid)).toEqual(["1", "2", "3", "4"]);
  });
});
