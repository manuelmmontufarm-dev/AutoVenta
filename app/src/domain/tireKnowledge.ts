export interface TirePatternProfile {
  brand: string;
  design: string;
  category: string;
  strengths: string[];
  limitations: string[];
  sourceUrl: string;
}

const PROFILES: TirePatternProfile[] = [
  {
    brand: "FALKEN",
    design: "ZE310",
    category: "touring de carretera",
    strengths: ["agarre en mojado", "resistencia al aquaplaning", "frenado y bajo ruido"],
    limitations: ["no es una llanta A/T ni está diseñada para barro o caminos destapados"],
    sourceUrl: "https://www.falkentyre.com/en/tyres/car-tyres/product-detail/40535",
  },
  {
    brand: "KENDA",
    design: "KR203",
    category: "touring de carretera",
    strengths: ["manejo equilibrado", "rodaje silencioso", "uso urbano y carretera"],
    limitations: ["no es una llanta A/T para ripio o barro"],
    sourceUrl: "https://automotive.kendatire.com/en-eu/find-a-tire/passenger-car/kenetica-eco/",
  },
  {
    brand: "KENDA",
    design: "KR20",
    category: "UHP de verano para carretera",
    strengths: ["estabilidad", "respuesta en curvas", "tracción en pavimento"],
    limitations: ["no es una llanta todoterreno"],
    sourceUrl: "https://automotive.kendatire.com/es-es/find-a-tire/summer-passenger-car/kaiser/",
  },
  {
    brand: "KENDA",
    design: "KR608",
    category: "all-terrain",
    strengths: ["uso mixto en pavimento y caminos sin asfaltar"],
    limitations: ["más ruido y compromiso de confort que una touring"],
    sourceUrl: "https://automotive.kendatire.com/zh-tw/%E6%90%9C%E5%B0%8B%E8%BC%AA%E8%83%8E/%E4%BC%91%E6%97%85%E8%BB%8A-%E8%BC%95%E5%9E%8B%E5%8D%A1%E8%BB%8A%E8%BC%AA%E8%83%8E/klever-at-608/",
  },
];

export function getTirePatternProfile(brand: string, design: string): TirePatternProfile | null {
  const b = normalize(brand);
  const d = normalize(design);
  return PROFILES.find((p) => b.includes(normalize(p.brand)) && d.includes(normalize(p.design))) ?? null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
