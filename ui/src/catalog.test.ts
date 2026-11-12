import { describe, expect, it } from "vitest";
import { activeServices, type CatalogService, matches, shortName } from "./catalog";

const svc = (id: string, fullName: string, category = "Databases"): CatalogService => ({
  id, fullName, serviceId: id, category, icon: "", protocol: "json", operations: 1, listOps: [],
});

describe("catalog helpers", () => {
  const all = [svc("sqs", "Amazon Simple Queue Service"), svc("kms", "AWS Key Management Service"), svc("s3", "Amazon Simple Storage Service")];

  it("lists only services with resources, most first", () => {
    const inv = { kms: { count: 1, total: 1, ops: {} }, sqs: { count: 3, total: 3, ops: {} }, s3: { count: 0, total: 5, ops: {} } };
    expect(activeServices(all, inv).map((s) => s.id)).toEqual(["sqs", "kms"]);
    expect(activeServices(all, {})).toEqual([]);
  });

  it("shortens names for the sidebar", () => {
    expect(shortName("Amazon Simple Queue Service")).toBe("Simple Queue Service");
    expect(shortName("AWS Lambda")).toBe("Lambda");
    expect(shortName("Elastic Load Balancing")).toBe("Elastic Load Balancing");
  });

  it("searches by id, name and category", () => {
    expect(matches(all[0], "queue")).toBe(true);
    expect(matches(all[1], "KMS")).toBe(true);
    expect(matches(all[2], "databases")).toBe(true);
    expect(matches(all[2], "lambda")).toBe(false);
  });
});
