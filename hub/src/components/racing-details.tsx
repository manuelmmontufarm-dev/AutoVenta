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
