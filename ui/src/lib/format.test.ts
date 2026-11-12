import { describe, expect, it } from "vitest";
import { arnName, cell, columnsFor, formatBytes, itemKey, parseJson } from "./format";

describe("format", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(undefined)).toBe("-");
  });

  it("extracts names from ARNs", () => {
    expect(arnName("arn:aws:states:us-east-1:000000000000:stateMachine:my-sm")).toBe("my-sm");
    expect(arnName("arn:aws:iam::000000000000:role/svc-role")).toBe("svc-role");
    expect(arnName(null)).toBe("-");
  });

  it("parses JSON without throwing", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson("")).toEqual({ ok: true, value: null });
    expect(parseJson("{oops").ok).toBe(false);
  });

  it("picks DynamoDB key attributes", () => {
    expect(itemKey({ pk: "a", sk: 1, other: true }, { HASH: "pk", RANGE: "sk" })).toEqual({ pk: "a", sk: 1 });
  });

  it("orders columns with keys first", () => {
    expect(columnsFor([{ b: 1, pk: "x" }, { c: 2 }], ["pk"])).toEqual(["pk", "b", "c"]);
  });

  it("renders cells", () => {
    expect(cell({ a: 1 })).toBe('{"a":1}');
    expect(cell(null)).toBe("");
    expect(cell(3)).toBe("3");
  });
});
