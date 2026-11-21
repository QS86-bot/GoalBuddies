import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { freezeNow, unfreezeNow } from "../../shared/time";

import {
  bewaarWerkcode,
  openstaandeWerkcode,
  vergeetWerkcode,
  WERKCODE_GELDIG_UREN,
} from "./pending";

// De index van buddies trekt react-native binnen; de code-vorm staat in schemas.
vi.mock("../buddies", async () => import("../buddies/schemas"));

const OPSLAG = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (s: string) => Promise.resolve(OPSLAG.get(s) ?? null),
    setItem: (s: string, w: string) => {
      OPSLAG.set(s, w);
      return Promise.resolve();
    },
    removeItem: (s: string) => {
      OPSLAG.delete(s);
      return Promise.resolve();
    },
  },
}));

const CODE = "VYHC2X9GSRVH";

beforeEach(() => OPSLAG.clear());
afterEach(() => unfreezeNow());

describe("de bewaarde werkcode (QS8-663)", () => {
  it("overleeft een nieuwe sessie, ook met streepjes ingetikt", async () => {
    expect(await bewaarWerkcode("VYHC-2X9G-SRVH")).toBe(true);
    expect(await openstaandeWerkcode()).toBe(CODE);
  });

  it("bewaart niets dat geen code is", async () => {
    expect(await bewaarWerkcode("hallo")).toBe(false);
    expect(await openstaandeWerkcode()).toBeNull();
  });

  it("vergeten leegt hem", async () => {
    await bewaarWerkcode(CODE);
    await vergeetWerkcode();
    expect(await openstaandeWerkcode()).toBeNull();
  });

  it("wordt na 24 uur niet meer ingevuld, op de grens nog wel", async () => {
    const start = new Date("2026-11-20T10:00:00Z");
    freezeNow(start);
    await bewaarWerkcode(CODE);

    freezeNow(new Date(start.getTime() + WERKCODE_GELDIG_UREN * 3600_000));
    expect(await openstaandeWerkcode()).toBe(CODE);

    freezeNow(
      new Date(start.getTime() + WERKCODE_GELDIG_UREN * 3600_000 + 1000),
    );
    expect(await openstaandeWerkcode()).toBeNull();
  });

  it("onleesbare opslag is geen code", async () => {
    OPSLAG.set("goalbuddies.openstaande-werkcode", "{kapot");
    expect(await openstaandeWerkcode()).toBeNull();
  });
});
