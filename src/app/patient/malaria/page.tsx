import { type Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { directionsUrl, formatDistance } from "@/lib/geo";
import { OPEN_STATUSES, treatmentDay } from "@/lib/malaria/cases";
import { PREVENTION_TIPS, tipOfTheWeek } from "@/lib/malaria/screening";
import { formatDate } from "@/components/appointments/shared";
import { OUTCOME_LABEL, STATUS_CLASS, STATUS_LABEL } from "@/components/malaria/shared";
import { OutcomeQuestion, StartCheckButton, TakeDoseButton } from "@/components/malaria/PatientActions";

export const dynamic = "force-dynamic";

/** The patient's malaria page: their open case and what to do next, past checks, and prevention tips. */
export default async function PatientMalariaPage() {
  const patient = await requireUser(Role.PATIENT);
  const [cases, checks] = await Promise.all([
    prisma.malariaCase.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { pharmacy: true, doses: true, planApprovedBy: { select: { lastName: true } } },
    }),
    prisma.malariaScreening.findMany({ where: { patientId: patient.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const open = cases.find((c) => (OPEN_STATUSES as readonly string[]).includes(c.status));
  const past = cases.filter((c) => c !== open);
  const tip = tipOfTheWeek();

  return (
    <div className="settings malaria-page">
      <div className="appt-header">
        <div>
          <h2 className="section-heading">Malaria</h2>
          <p className="section-sub">Check your symptoms with Omega, follow your care, and protect your family.</p>
        </div>
        <div className="appt-header-actions">
          <StartCheckButton />
        </div>
      </div>

      {open && <OpenCase c={open} />}

      <section className="card malaria-tip-card">
        <i className="fa-solid fa-shield-virus" />
        <div>
          <h3>Tip of the week</h3>
          <p>{tip.text}</p>
        </div>
      </section>

      {past.length > 0 && (
        <>
          <h3 className="details-subhead">Earlier cases</h3>
          <div className="card table-wrap">
            <table className="appt-table">
              <tbody>
                {past.map((c) => (
                  <tr key={c.id}>
                    <td>Case #{c.number}</td>
                    <td>{formatDate(c.createdAt.toISOString())}</td>
                    <td>
                      <span className={`status-pill ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {checks.length > 0 && (
        <>
          <h3 className="details-subhead">Your malaria checks</h3>
          <div className="card table-wrap">
            <table className="appt-table">
              <tbody>
                {checks.map((s) => (
                  <tr key={s.id}>
                    <td>{formatDate(s.createdAt.toISOString())}</td>
                    <td>{s.score}% of symptoms</td>
                    <td>
                      <span className={`status-pill ${s.outcome === "LOW" ? "status-neutral" : s.outcome === "DANGER" ? "status-rejected" : "status-pending"}`}>
                        {OUTCOME_LABEL[s.outcome]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="details-subhead">Preventing malaria</h3>
      <ol className="card malaria-tips">
        {PREVENTION_TIPS.map((t, i) => (
          <li key={i} className={i === tip.index ? "on" : undefined}>
            {t}
          </li>
        ))}
      </ol>
    </div>
  );
}

type Case = Prisma.MalariaCaseGetPayload<{ include: { pharmacy: true; doses: true; planApprovedBy: { select: { lastName: true } } } }>;

function OpenCase({ c }: { c: Case }) {
  const day = treatmentDay(c);
  const tookToday = c.doses.some((d) => d.day === day);
  const facilityDirections = c.facilityLat != null && c.facilityLng != null ? directionsUrl(null, { lat: c.facilityLat, lng: c.facilityLng }) : null;
  const pharmacyDirections = c.pharmacy?.latitude != null && c.pharmacy.longitude != null ? directionsUrl(null, { lat: c.pharmacy.latitude, lng: c.pharmacy.longitude }) : null;

  return (
    <section className={`card malaria-case${c.urgency === "EMERGENCY" ? " emergency" : ""}`}>
      <div className="my-invoice-head">
        <div>
          <h3>Your malaria case #{c.number}</h3>
          <span className="section-sub">Opened {formatDate(c.createdAt.toISOString())}</span>
        </div>
        <span className={`status-pill ${STATUS_CLASS[c.status]}`}>{STATUS_LABEL[c.status]}</span>
      </div>

      {c.status === "REFERRED" && (
        <>
          <p>
            {c.urgency === "EMERGENCY" ? <strong>Go to hospital now. </strong> : "Please get a malaria test as soon as you can, today or tomorrow. "}
            The nearest place we found:
          </p>
          <div className="malaria-place">
            <div>
              <strong>{c.facilityName ?? "Your nearest health centre"}</strong>
              {c.facilityDistanceKm != null && <small> · {formatDistance(c.facilityDistanceKm)} away</small>}
            </div>
            <div className="omega-hospital-actions">
              {c.facilityPhone && (
                <a className="icon-btn" href={`tel:${c.facilityPhone.replace(/[^\d+]/g, "")}`} aria-label="Call">
                  <i className="fa-solid fa-phone" />
                </a>
              )}
              {facilityDirections && (
                <a className="btn btn-outline btn-sm" href={facilityDirections} target="_blank" rel="noopener noreferrer">
                  Directions
                </a>
              )}
            </div>
          </div>
          <p className="form-note">Show this page at the health centre. Once your result is recorded, it appears here.</p>
        </>
      )}

      {c.status === "POSITIVE" && <p>Your test was positive{c.species ? ` (${c.species})` : ""}. A clinician is preparing your treatment plan: you&apos;ll get it here and by text.</p>}

      {c.status === "TREATMENT" && c.planDays && (
        <>
          <p className="malaria-plan">
            <strong>Your treatment{c.planApprovedBy ? `, approved by Dr. ${c.planApprovedBy.lastName}` : ""}:</strong> {c.planText}
          </p>
          {c.pharmacy && (
            <div className="malaria-place">
              <div>
                <strong>{c.pharmacy.name}</strong>
                <small> · pharmacy on MiDokta{c.pharmacy.address ? ` · ${c.pharmacy.address}` : ""}</small>
              </div>
              {pharmacyDirections && (
                <a className="btn btn-outline btn-sm" href={pharmacyDirections} target="_blank" rel="noopener noreferrer">
                  Directions
                </a>
              )}
            </div>
          )}
          <ol className="malaria-days" aria-label="Treatment days">
            {Array.from({ length: c.planDays }, (_, i) => i + 1).map((d) => {
              const taken = c.doses.some((x) => x.day === d);
              return (
                <li key={d} className={taken ? "taken" : d < day ? "missed" : d === day ? "today" : undefined}>
                  <i className={`fa-solid ${taken ? "fa-circle-check" : d < day ? "fa-circle-xmark" : "fa-circle"}`} />
                  Day {d}
                  <small>{taken ? "Taken" : d < day ? "Not ticked" : d === day ? "Today" : ""}</small>
                </li>
              );
            })}
          </ol>
          {day >= 1 && day <= c.planDays && !tookToday && <TakeDoseButton caseId={c.id} day={day} days={c.planDays} />}
          {day >= 1 && day <= c.planDays && tookToday && <p className="form-note">Done for today. You&apos;ll get a reminder tomorrow.</p>}
          {day > c.planDays && <OutcomeQuestion caseId={c.id} />}
          <p className="form-note">Take every dose for all {c.planDays} days, even if you feel better. If you get worse, go to hospital.</p>
        </>
      )}

      {c.status === "INCOMPLETE" && <p>Thank you for telling us. A nurse will contact you. If you feel worse, go to hospital now.</p>}
    </section>
  );
}
