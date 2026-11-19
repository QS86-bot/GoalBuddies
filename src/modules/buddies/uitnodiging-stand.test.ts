import { describe, expect, it } from "vitest";

import {
  lidmaatschapStand,
  magAutomatischToetreden,
  uitnodigingsStand,
} from "./uitnodiging-stand";

const groep = { group_id: "g-1" };

describe("uitnodigingsStand — de vier gevallen van QS8-708", () => {
  it('een bestaand lid ziet "al lid" en geen deelnemen', () => {
    const s = uitnodigingsStand({
      uitnodiging: groep,
      ingelogd: true,
      lidmaatschap: "actief",
    });
    expect(s).toEqual({ soort: "al-lid", groupId: "g-1" });
    expect(magAutomatischToetreden(s)).toBe(false);
  });

  it("een ingelogd niet-lid mag deelnemen", () => {
    const s = uitnodigingsStand({
      uitnodiging: groep,
      ingelogd: true,
      lidmaatschap: "geen",
    });
    expect(s.soort).toBe("kan-deelnemen");
    expect(magAutomatischToetreden(s)).toBe(true);
  });

  it("wie niet is ingelogd gaat eerst inloggen, ook als het lidmaatschap onbekend is", () => {
    const s = uitnodigingsStand({
      uitnodiging: groep,
      ingelogd: false,
      lidmaatschap: "laden",
    });
    expect(s.soort).toBe("niet-ingelogd");
    expect(magAutomatischToetreden(s)).toBe(false);
  });

  it("een ingetrokken of vervangen code is ongeldig, ook voor een ingelogd lid", () => {
    for (const lidmaatschap of [
      "laden",
      "actief",
      "geen",
      "onbekend",
    ] as const) {
      const s = uitnodigingsStand({
        uitnodiging: null,
        ingelogd: true,
        lidmaatschap,
      });
      expect(s.soort).toBe("ongeldig");
      expect(magAutomatischToetreden(s)).toBe(false);
    }
  });
});

describe("uitnodigingsStand — de naad", () => {
  it("tijdens het controleren is er geen knop en geen automatische stap", () => {
    const s = uitnodigingsStand({
      uitnodiging: groep,
      ingelogd: true,
      lidmaatschap: "laden",
    });
    expect(s.soort).toBe("controleren");
    expect(magAutomatischToetreden(s)).toBe(false);
  });

  it("een lidmaatschap dat niet te lezen was, bewéért niet dat je lid bent", () => {
    const s = uitnodigingsStand({
      uitnodiging: groep,
      ingelogd: true,
      lidmaatschap: "onbekend",
    });
    expect(s.soort).toBe("kan-deelnemen");
  });
});

describe("lidmaatschapStand", () => {
  const basis = {
    gevraagd: true,
    laadt: false,
    fout: false,
    status: null,
    antwoordVan: null,
    gebruiker: "u-1",
  };

  it("alleen een actieve rij is al lid", () => {
    expect(lidmaatschapStand({ ...basis, status: "active" })).toBe("actief");
    expect(lidmaatschapStand({ ...basis, status: "inactive" })).toBe("geen");
    expect(lidmaatschapStand({ ...basis, status: null })).toBe("geen");
  });

  it("laden gaat voor, een fout is onbekend en geen aanvraag is geen lid", () => {
    expect(lidmaatschapStand({ ...basis, laadt: true, status: "active" })).toBe(
      "laden",
    );
    expect(lidmaatschapStand({ ...basis, fout: true })).toBe("onbekend");
    expect(lidmaatschapStand({ ...basis, gevraagd: false, laadt: true })).toBe(
      "geen",
    );
  });

  it("een antwoord van een ander account telt als nog laden, niet als al lid", () => {
    const s = lidmaatschapStand({
      ...basis,
      status: "active",
      antwoordVan: "u-0",
    });
    expect(s).toBe("laden");
    expect(
      lidmaatschapStand({ ...basis, status: "active", antwoordVan: "u-1" }),
    ).toBe("actief");
  });
});
