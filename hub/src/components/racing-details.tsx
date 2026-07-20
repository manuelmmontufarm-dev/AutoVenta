import { motion } from "framer-motion";

export function RacingDetails() {
  return (
    <div className="gp-details" aria-hidden="true">
      <div className="gp-telemetry">
        <span className="gp-telemetry-dot" />
        <span>PIT SYSTEM</span>
        <b>DT—01</b>
      </div>

      <div className="gp-corner-mark gp-corner-mark-a">
        <span>30+</span>
        <small>AÑOS EN PISTA</small>
      </div>

      <div className="gp-corner-mark gp-corner-mark-b">
        <span>UI / 01</span>
        <small>QUITO · ECU</small>
      </div>

      <div className="gp-speed-lines">
        <i />
        <i />
        <i />
      </div>

      <motion.svg
        className="gp-car"
        viewBox="0 0 640 220"
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.9, delay: 0.25 }}
      >
        <path d="M60 154h38l27-45c11-18 30-29 51-30l108-5c24-1 46 6 65 20l40 29 102 13c26 3 46 18 57 40H84c-11 0-20-9-24-22Z" />
        <path d="m179 111 116-5 43 33H159l20-28Z" />
        <path d="M329 106v33" />
        <path d="M126 139h-23" />
        <path d="M492 148h39" />
        <circle cx="166" cy="174" r="31" />
        <circle cx="166" cy="174" r="13" />
        <circle cx="456" cy="174" r="31" />
        <circle cx="456" cy="174" r="13" />
        <path className="gp-car-red" d="M365 122h74" />
        <path className="gp-car-red" d="m431 111 26 13" />
      </motion.svg>

      <svg className="gp-mini-car" viewBox="0 0 240 92">
        <path d="M14 66h22l17-27c7-11 18-17 31-18l52-2c15-1 28 4 39 13l24 20 24 4c7 1 12 5 15 10H14Z" />
        <path d="m75 34 54-2 28 24H60l15-22Z" />
        <circle cx="65" cy="67" r="15" />
        <circle cx="65" cy="67" r="6" />
        <circle cx="183" cy="67" r="15" />
        <circle cx="183" cy="67" r="6" />
        <path className="gp-car-red" d="M151 44h42" />
      </svg>

      <svg className="gp-wheel gp-wheel-a" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" />
        <circle cx="50" cy="50" r="28" />
        <circle cx="50" cy="50" r="7" />
        <path d="M50 22v21M50 57v21M22 50h21M57 50h21M30 30l15 15M55 55l15 15M70 30 55 45M45 55 30 70" />
        <path className="gp-wheel-tread" d="M19 20l8 8M8 43l11 2M13 68l10-4M81 20l-8 8M92 43l-11 2M87 68l-10-4" />
      </svg>

      <svg className="gp-wheel gp-wheel-b" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" />
        <circle cx="50" cy="50" r="28" />
        <circle cx="50" cy="50" r="7" />
        <path d="M50 22v21M50 57v21M22 50h21M57 50h21M30 30l15 15M55 55l15 15M70 30 55 45M45 55 30 70" />
      </svg>

      <svg className="gp-circuit" viewBox="0 0 320 180">
        <path d="M28 108c18-38 47-36 67-15 17 18 39 20 57-10 23-38 66-51 104-26 33 22 37 66 13 92-25 27-64 22-79-4-18-32-49-30-72-8-34 32-72 8-90-29Z" />
        <circle cx="28" cy="108" r="5" />
        <path className="gp-circuit-red" d="M22 116h24M22 122h24" />
      </svg>

      <div className="gp-tire-spec">
        <b>245/40</b>
        <span>R18 · SPORT</span>
      </div>

      <div className="gp-tire-mark">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
