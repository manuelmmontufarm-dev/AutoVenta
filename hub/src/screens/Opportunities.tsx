import { motion } from "framer-motion";
import { ETAPA_META, type FollowUpBucket, type FollowUpCard } from "../data/types";
import { navigate } from "../router";
import { useHub, useNow } from "../store";

const GROUPS: Array<{ id: FollowUpBucket; title: string; subtitle: string; icon: string }> = [
  { id: "needs_human", title: "Revisión humana", subtitle: "La ventana terminó; decidir si continuar con plantilla o marcar Perdido", icon: "👤" },
  { id: "closing", title: "Recta final", subtitle: "Visitas, reservas y compromisos que todavía podemos convertir", icon: "🏁" },
];

function OpportunityCard({ item, now }: { item: FollowUpCard; now: number }) {
  const commitment = item.commitment || (item.visitDate ? `Visita: ${new Date(item.visitDate).toLocaleString("es-EC")}` : null)
    || (item.pickupDate ? `Retiro: ${new Date(item.pickupDate).toLocaleDateString("es-EC")}` : null);
  const next = item.dueAt ? new Date(item.dueAt).toLocaleString("es-EC", { weekday: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const silenceHours = item.lastAt ? Math.max(0, Math.floor((now - new Date(item.lastAt).getTime()) / 3_600_000)) : 0;
  return <motion.button
    layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    onClick={() => navigate(`ticket/${item.conversationId}`)}
    className="glass grid w-full gap-2 rounded-2xl p-3 text-left shadow-soft transition-transform hover:-translate-y-0.5 hover:border-lime/25 sm:grid-cols-[minmax(0,1fr)_auto]"
  >
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-[13px] font-black">{item.customer}</span>
        <span className="rounded-full bg-paper/[.07] px-2 py-0.5 text-[9px] font-bold">{ETAPA_META[item.stage].corto}</span>
        <span className={`max-w-full truncate rounded-full px-2 py-0.5 text-[9px] font-black ${item.bucket === "needs_human" ? "bg-red/10 text-red" : "bg-lime/10 text-lime"}`} title={item.importanceReason}>
          {item.importanceLabel}
        </span>
        {item.bucket === "needs_human" && <span className="rounded-full bg-paper/[.07] px-2 py-0.5 text-[9px] font-bold">Sin responder {item.unansweredDays} d</span>}
      </div>
      <p className="mt-1 line-clamp-1 text-[10.5px] text-muted">{item.tireSize || item.selectedProductCode || "Medida pendiente"} · {item.summary}</p>
      <p className="mt-1 line-clamp-1 text-[10px] font-bold text-amber-500">⚡ {item.importanceReason}</p>
      {commitment && <p className="mt-1 line-clamp-1 text-[10.5px] font-bold text-lime">🚗 {commitment}</p>}
    </div>
    <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
      <p className="tnum text-[10px] font-bold">{next ? `Próximo: ${next}` : "Requiere decisión"}</p>
      <p className="mt-1 text-[9.5px] text-faint">{item.campaignPlan.length ? `${item.campaignPlan.length} plantillas programadas` : `${silenceHours} h desde actividad`}</p>
    </div>
  </motion.button>;
}

export function Opportunities() {
  const items = useHub((state) => state.followUps);
  const now = useNow();
  return <div className="h-full overflow-y-auto px-4 pb-8">
    <div className="mx-auto grid max-w-5xl gap-5">
      <div className="rounded-2xl border border-lime/10 bg-lime/[.035] px-4 py-3 text-[11px] text-muted">
        Aquí aparecen únicamente clientes que requieren una decisión humana y ventas que están en la recta final. Los seguimientos normales siguen trabajando en segundo plano.
      </div>
      {GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.bucket === group.id).sort((a, b) => {
          if (group.id === "needs_human") return b.unansweredDays - a.unansweredDays;
          return new Date(a.visitDate ?? a.pickupDate ?? a.dueAt ?? 0).getTime() - new Date(b.visitDate ?? b.pickupDate ?? b.dueAt ?? 0).getTime();
        });
        return <section key={group.id}>
          <div className="mb-2 flex items-center gap-2"><span>{group.icon}</span><h2 className="text-xs font-black uppercase tracking-wide">{group.title}</h2><span className="tnum rounded-full bg-paper/10 px-2 text-[10px]">{groupItems.length}</span><p className="ml-auto hidden text-[10px] text-faint md:block">{group.subtitle}</p></div>
          <div className="grid gap-2">{groupItems.length ? groupItems.map((item) => <OpportunityCard key={item.conversationId} item={item} now={now} />) : <div className="rounded-2xl border border-dashed border-paper/[.08] p-7 text-center text-[11px] text-faint">Sin oportunidades en este grupo</div>}</div>
        </section>;
      })}
    </div>
  </div>;
}
