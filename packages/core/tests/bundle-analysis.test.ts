import { describe, expect, it } from "vitest";
import { analyzeBundleAgainstParts, type NormalizedListing } from "../src/index.js";

const bundleListing: NormalizedListing = {
  id: "bundle-1",
  retailer: "proshop",
  sourceType: "bundle",
  url: "https://www.proshop.dk/DUTZO/example",
  title: "DUTZO Esport Wildfire RTX 5080",
  normalizedModel: "dutzo esport wildfire rtx 5080",
  price: 18499,
  originalPrice: 19499,
  currency: "DKK",
  availability: "in_stock",
  badges: ["DUTZO"],
  components: [
    { category: "CPU", title: "AMD Ryzen 7 9800X3D", normalizedTitle: "amd ryzen 7 9800x3d" },
    { category: "GPU", title: "MSI GeForce RTX 5080 Ventus 16GB", normalizedTitle: "msi geforce rtx 5080 ventus 16gb" },
    { category: "RAM", title: "1 x 32GB DDR5-6000", normalizedTitle: "1 x 32gb ddr5-6000" },
    { category: "SSD", title: "2TB PCIe 4.0 QLC SSD", normalizedTitle: "2tb pcie 4.0 qlc ssd" },
    { category: "PSU", title: "Unknown 750W Bronze PSU", normalizedTitle: "unknown 750w bronze psu" },
  ],
  observedAt: new Date().toISOString(),
  rawHash: "bundle-1",
};

const parts: NormalizedListing[] = [
  {
    id: "cpu-1",
    retailer: "proshop",
    sourceType: "hardware",
    url: "https://www.proshop.dk/cpu-1",
    title: "AMD Ryzen 7 9800X3D",
    normalizedModel: "amd ryzen 7 9800x3d",
    price: 3799,
    currency: "DKK",
    availability: "in_stock",
    badges: [],
    observedAt: new Date().toISOString(),
    rawHash: "cpu-1",
  },
  {
    id: "gpu-1",
    retailer: "proshop",
    sourceType: "hardware",
    url: "https://www.proshop.dk/gpu-1",
    title: "MSI GeForce RTX 5080 Ventus 16GB",
    normalizedModel: "msi geforce rtx 5080 ventus 16gb",
    price: 7499,
    currency: "DKK",
    availability: "in_stock",
    badges: [],
    observedAt: new Date().toISOString(),
    rawHash: "gpu-1",
  },
  {
    id: "ram-1",
    retailer: "proshop",
    sourceType: "hardware",
    url: "https://www.proshop.dk/ram-1",
    title: "32GB DDR5-6000 kit",
    normalizedModel: "32gb ddr5-6000 kit",
    price: 899,
    currency: "DKK",
    availability: "in_stock",
    badges: [],
    observedAt: new Date().toISOString(),
    rawHash: "ram-1",
  },
  {
    id: "ssd-1",
    retailer: "proshop",
    sourceType: "hardware",
    url: "https://www.proshop.dk/ssd-1",
    title: "2TB PCIe 4.0 QLC SSD",
    normalizedModel: "2tb pcie 4.0 qlc ssd",
    price: 1199,
    currency: "DKK",
    availability: "in_stock",
    badges: [],
    observedAt: new Date().toISOString(),
    rawHash: "ssd-1",
  },
];

describe("bundle analysis", () => {
  it("flags weak components and computes delta", () => {
    const analysis = analyzeBundleAgainstParts(bundleListing, parts);
    expect(analysis).not.toBeNull();
    expect(analysis?.sumOfParts).toBe(13396);
    expect(analysis?.qualityFlags).toContain("Weak or unknown PSU quality");
    expect(analysis?.qualityFlags).toContain("Single-stick memory configuration reduces performance");
    expect(analysis?.verdict).toBe("avoid");
  });

  it("drops confidence when too many components are unmatched", () => {
    const analysis = analyzeBundleAgainstParts(
      {
        ...bundleListing,
        components: [{ category: "PSU", title: "Unknown 750W Bronze PSU", normalizedTitle: "unknown 750w bronze psu" }],
      },
      [],
    );
    expect(analysis?.confidence).toBeLessThan(0.3);
    expect(analysis?.verdict).toBe("needs_review");
  });
});
