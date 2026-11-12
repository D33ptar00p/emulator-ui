import { describe, expect, it } from "vitest";
import { href, parseHash } from "./router";

describe("router", () => {
  it("parses segments and query", () => {
    const r = parseHash("#/s3/my-bucket?prefix=a%2Fb%2F");
    expect(r.segments).toEqual(["s3", "my-bucket"]);
    expect(r.query.get("prefix")).toBe("a/b/");
  });

  it("handles the root", () => {
    expect(parseHash("").segments).toEqual([]);
    expect(parseHash("#/").segments).toEqual([]);
  });

  it("round-trips encoded segments", () => {
    const link = href(["stepfunctions", "machine"], { arn: "arn:aws:states:x:1:stateMachine:a b" });
    const r = parseHash(link);
    expect(r.segments).toEqual(["stepfunctions", "machine"]);
    expect(r.query.get("arn")).toBe("arn:aws:states:x:1:stateMachine:a b");
  });

  it("omits empty query values", () => {
    expect(href(["s3", "b"], { prefix: "" })).toBe("#/s3/b");
  });
});
