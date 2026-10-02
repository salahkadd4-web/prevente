import { describe, expect, it } from "vitest";
import { productQuantity, variantQuantity } from "@/lib/stock/quantity";

describe("quantité produit = somme des quantités de ses parfums", () => {
  it("la quantité d'un parfum est la somme de ses lots (jamais négative)", () => {
    expect(variantQuantity([{ availableQuantity: 10 }, { availableQuantity: 5 }, { availableQuantity: 0 }])).toBe(15);
    expect(variantQuantity([])).toBe(0);
    expect(variantQuantity([{ availableQuantity: -3 }, { availableQuantity: 4 }])).toBe(4);
  });

  it("la quantité du produit est exactement la somme des parfums affichés", () => {
    const lotsByVariant = { choco: [{ availableQuantity: 12 }, { availableQuantity: 8 }], vanille: [{ availableQuantity: 5 }], fraise: [] };
    const qty = new Map(Object.entries(lotsByVariant).map(([id, lots]) => [id, variantQuantity(lots)]));
    const ids = Object.keys(lotsByVariant);
    expect(productQuantity(ids, qty)).toBe(25);
    expect(productQuantity(ids, qty)).toBe(ids.reduce((n, id) => n + (qty.get(id) ?? 0), 0));
  });

  it("un produit sans parfum ou un parfum sans stock vaut 0", () => {
    expect(productQuantity([], new Map())).toBe(0);
    expect(productQuantity(["a"], new Map())).toBe(0);
  });

  it("modifier la quantité d'un parfum modifie d'autant celle du produit", () => {
    const ids = ["a", "b"];
    const before = productQuantity(ids, new Map([["a", 10], ["b", 4]]));
    const after = productQuantity(ids, new Map([["a", 7], ["b", 4]])); // correction de lot : 10 → 7
    expect(before - after).toBe(3);
  });
});
