import { useEffect, useState } from "react";

export type Route =
  | { vista: "inbox" }
  | { vista: "pipeline" }
  | { vista: "dashboard" }
  | { vista: "cotizador" }
  | { vista: "settings" }
  | { vista: "ticket"; id: number };

function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [seg, id] = hash.split("/");
  if (seg === "ticket" && id && !Number.isNaN(Number(id))) return { vista: "ticket", id: Number(id) };
  if (seg === "pipeline") return { vista: "pipeline" };
  if (seg === "dashboard") return { vista: "dashboard" };
  if (seg === "cotizador") return { vista: "cotizador" };
  if (seg === "settings") return { vista: "settings" };
  return { vista: "inbox" };
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith("#") ? to : `#/${to.replace(/^\//, "")}`;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
