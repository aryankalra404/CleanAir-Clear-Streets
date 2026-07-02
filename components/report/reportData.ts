export const hazardTags = [
  {
    id: "garbage-fire",
    label: "Garbage fire",
    description: "Smoke or flames near waste piles",
    confidence: 78,
    result: "Likely garbage fire",
  },
  {
    id: "traffic-smog",
    label: "Traffic smog",
    description: "Dense fumes at a road junction",
    confidence: 71,
    result: "Likely traffic smog trap",
  },
  {
    id: "construction-dust",
    label: "Construction dust",
    description: "Dust plume from digging or debris",
    confidence: 74,
    result: "Likely construction dust",
  },
  {
    id: "industrial-emission",
    label: "Industrial emission",
    description: "Stack smoke, odor, or chemical haze",
    confidence: 82,
    result: "Likely industrial emission",
  },
];

export const defaultLocation = {
  label: "Ghazipur Landfill, East Delhi",
  lat: "28.6264",
  lng: "77.3192",
};
