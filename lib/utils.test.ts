import { describe, expect, it } from "vitest";
import { initials } from "./utils";

describe("initials", () => {
  it("primeira letra das duas primeiras palavras", () => {
    expect(initials("Monique Rochneski Girua")).toBe("MR");
    expect(initials("ana")).toBe("A");
    expect(initials("555599446076")).toBe("5");
  });
  it("emoji e símbolo não cortam caractere ao meio", () => {
    expect(initials("🌸 Maria Souza")).toBe("MS");
    expect(initials("~ Ângela 💕")).toBe("Â");
    expect(initials("👍")).toBe("");
  });
});
