import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ScrollReveal } from "@/components/landing/scroll-reveal";

describe("ScrollReveal", () => {
  it("renders children", () => {
    const { getByText } = render(<ScrollReveal>Test content</ScrollReveal>);
    expect(getByText("Test content")).toBeDefined();
  });
});
