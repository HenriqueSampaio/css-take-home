/**
 * A small, hand-written seed that satisfies the contract and contains one of
 * every situation the app has to handle. Tests seed it through resetFromSeed();
 * `npm run db:seed -- --fixture` loads it for a local demo without the workbook.
 *
 * What is in here, so tests can rely on it:
 * - R/V Tidewater: verified 60 ft. Fits everywhere.
 * - M/Y Far Horizon: PROBABLE 170 ft, twice on South Float East (90 ft): two live misfits.
 * - S/V Long Ketch: UNKNOWN length, four bookings.
 * - S/V Iron Petrel: CONFLICT (120 or 135 ft in the registry) with an open length_conflict issue.
 * - M/V Silver Gull: registry-only, never booked.
 * - North Pier East, July 2019: two needs_review stays that overlap (Jul 10-16 and Jul 14-20).
 * - South Float West, July 2019: an unlabelled needs_review block (Jul 8-11).
 * - South Float East, 2019: a needs_review stay caused by a calendar defect (Feb 26 - Mar 1).
 * - An event (Community sail day), closures (Pier repair - no docking), a stay that
 *   crosses a month boundary (Jul 28 - Aug 6) and two ambiguous_extent warnings on confirmed rows.
 * - OSV Amber Reef on South Float East, Jul 9-18 2017: the blocker used in conflict tests.
 *
 * July 2019 is the busy month; nothing is booked after Aug 23, 2019.
 */
import type { BerthId, BerthSeed, IssueSeed, ReservationSeed, Seed, VesselSeed } from "./contract";

const berths: BerthSeed[] = [
  { id: "north-pier-west", name: "North Pier West", lengthFt: 410, sortOrder: 1 },
  { id: "north-pier-face", name: "North Pier Face", lengthFt: 75, sortOrder: 2 },
  { id: "north-pier-east", name: "North Pier East", lengthFt: 240, sortOrder: 3 },
  { id: "inner-channel", name: "Inner Channel", lengthFt: 55, sortOrder: 4 },
  { id: "south-float-west", name: "South Float West", lengthFt: 90, sortOrder: 5 },
  { id: "south-float-east", name: "South Float East", lengthFt: 90, sortOrder: 6 },
];

const vessels: VesselSeed[] = [
  { id: "v_tidewater", name: "Tidewater", nameKey: "TIDEWATER", prefix: "R/V", lengthFt: 60, lengthStatus: "verified", lengthCandidates: [60], lengthEvidence: `Science!A12 "R/V Tidewater 60'"`, origin: "grid" },
  { id: "v_far-horizon", name: "Far Horizon", nameKey: "FAR HORIZON", prefix: "M/Y", lengthFt: 170, lengthStatus: "probable", lengthCandidates: [170], lengthEvidence: `Yachts!A49 "M/Y Far Horizon 170'" (name match, different prefix)`, origin: "grid" },
  { id: "v_long-ketch", name: "Long Ketch", nameKey: "LONG KETCH", prefix: "S/V", lengthFt: null, lengthStatus: "unknown", lengthCandidates: [], lengthEvidence: null, origin: "grid" },
  { id: "v_iron-petrel", name: "Iron Petrel", nameKey: "IRON PETREL", prefix: "S/V", lengthFt: null, lengthStatus: "conflict", lengthCandidates: [120, 135], lengthEvidence: `Yachts!A17 "M/Y Iron Petrel 120'"; Science!A31 "S/V Iron Petrel 135'"`, origin: "grid" },
  { id: "v_amber-reef", name: "Amber Reef", nameKey: "AMBER REEF", prefix: "OSV", lengthFt: 85, lengthStatus: "verified", lengthCandidates: [85], lengthEvidence: `Science!A8 "OSV Amber Reef 85'"`, origin: "grid" },
  { id: "v_golden-compass", name: "Golden Compass", nameKey: "GOLDEN COMPASS", prefix: "R/V", lengthFt: 72, lengthStatus: "verified", lengthCandidates: [72], lengthEvidence: `Science!A21 "R/V Golden Compass 72'"`, origin: "grid" },
  { id: "v_harbor-mule", name: "Harbor Mule", nameKey: "HARBOR MULE", prefix: "Tug", lengthFt: 48, lengthStatus: "verified", lengthCandidates: [48], lengthEvidence: `Science!A25 "Tug Harbor Mule 48'"`, origin: "grid" },
  { id: "v_silver-gull", name: "Silver Gull", nameKey: "SILVER GULL", prefix: "M/V", lengthFt: 40, lengthStatus: "probable", lengthCandidates: [40], lengthEvidence: `Yachts!A63 "M/V Silver Gull 40'"`, origin: "registry" },
];

type Extra = Partial<Pick<ReservationSeed, "status" | "notes" | "rawLabel">>;

/** The grid writes vessel labels in capitals with the prefix: `R/V TIDEWATER`. */
const gridLabel = (vesselId: string): string => {
  const vessel = vessels.find((v) => v.id === vesselId)!;
  return `${vessel.prefix} ${vessel.nameKey}`;
};

const stay = (id: string, berthId: BerthId, vesselId: string, startDate: string, endDate: string, sourceRef: string, extra: Extra = {}): ReservationSeed => ({
  id, berthId, kind: "vessel", vesselId, title: null, startDate, endDate, status: "confirmed", notes: "", rawLabel: gridLabel(vesselId), sourceRef, ...extra,
});

const block = (id: string, berthId: BerthId, kind: "event" | "closure", title: string, startDate: string, endDate: string, sourceRef: string, extra: Extra = {}): ReservationSeed => ({
  id, berthId, kind, vesselId: null, title, startDate, endDate, status: "confirmed", notes: "", rawLabel: title, sourceRef, ...extra,
});

const reservations: ReservationSeed[] = [
  // North Pier West (410 ft)
  stay("r_fx_amberreef_npw", "north-pier-west", "v_amber-reef", "2017-11-06", "2017-11-17", "2017!H6:S6"),
  stay("r_fx_farhorizon_npw", "north-pier-west", "v_far-horizon", "2018-06-04", "2018-06-15", "2018!F31:Q31"),
  stay("r_fx_ironpetrel_npw", "north-pier-west", "v_iron-petrel", "2019-07-01", "2019-07-08", "2019!C40:J40", { notes: "ETA 1200" }),
  block("r_fx_closure_npw", "north-pier-west", "closure", "Pier repair - no docking", "2019-07-15", "2019-07-26", "2019!Q40:AB40"),
  stay("r_fx_crossmonth_npw", "north-pier-west", "v_golden-compass", "2019-07-28", "2019-08-06", "2019!AD40:AG40;2019!C47:H47"),

  // North Pier Face (75 ft)
  stay("r_fx_tidewater_npf_1", "north-pier-face", "v_tidewater", "2019-07-02", "2019-07-06", "2019!D41:H41"),
  block("r_fx_sailday_npf", "north-pier-face", "event", "Community sail day", "2019-07-13", "2019-07-13", "2019!O41"),
  stay("r_fx_goldencompass_npf", "north-pier-face", "v_golden-compass", "2019-07-16", "2019-07-22", "2019!R41:X41", { notes: "Fueling @0800" }),
  stay("r_fx_tidewater_npf_2", "north-pier-face", "v_tidewater", "2019-08-10", "2019-08-14", "2019!L48:P48"),

  // North Pier East (240 ft): the double-booked pair
  stay("r_fx_ironpetrel_npe", "north-pier-east", "v_iron-petrel", "2018-09-03", "2018-09-12", "2018!E56:N56"),
  stay("r_fx_pair_a", "north-pier-east", "v_tidewater", "2019-07-10", "2019-07-16", "2019!L42:R42", { status: "needs_review" }),
  stay("r_fx_pair_b", "north-pier-east", "v_amber-reef", "2019-07-14", "2019-07-20", "2019!P43:V43", { status: "needs_review" }),
  stay("r_fx_amberreef_npe", "north-pier-east", "v_amber-reef", "2019-07-24", "2019-07-30", "2019!Z42:AF42"),
  block("r_fx_openhouse_npe", "north-pier-east", "event", "Public open house", "2019-08-17", "2019-08-18", "2019!S49:T49"),

  // Inner Channel (55 ft)
  stay("r_fx_harbormule_ic_2", "inner-channel", "v_harbor-mule", "2017-03-06", "2017-03-10", "2017!H20:L20"),
  stay("r_fx_longketch_ic_2", "inner-channel", "v_long-ketch", "2018-05-14", "2018-05-18", "2018!P27:T27"),
  block("r_fx_maintenance_ic", "inner-channel", "closure", "Dock maintenance - restricted access", "2018-11-05", "2018-11-16", "2018!G69:R69"),
  stay("r_fx_harbormule_ic_1", "inner-channel", "v_harbor-mule", "2019-07-01", "2019-07-31", "2019!C44:AG44"),
  stay("r_fx_longketch_ic_1", "inner-channel", "v_long-ketch", "2019-08-05", "2019-08-09", "2019!G51:K51"),

  // South Float West (90 ft)
  stay("r_fx_amberreef_sfw", "south-float-west", "v_amber-reef", "2018-07-09", "2018-07-13", "2018!K38:O38"),
  block("r_fx_tour_sfw", "south-float-west", "event", "Student tour", "2018-10-02", "2018-10-02", "2018!D63"),
  stay("r_fx_longketch_sfw", "south-float-west", "v_long-ketch", "2019-06-10", "2019-06-14", "2019!L38:P38"),
  block("r_fx_unlabelled_sfw", "south-float-west", "event", "Unlabelled booking", "2019-07-08", "2019-07-11", "2019!J45:M45", { status: "needs_review", rawLabel: null }),
  stay("r_fx_tidewater_sfw", "south-float-west", "v_tidewater", "2019-07-20", "2019-07-27", "2019!V45:AC45"),

  // South Float East (90 ft): where Far Horizon does not fit
  stay("r_fx_amberreef_sfe", "south-float-east", "v_amber-reef", "2017-07-09", "2017-07-18", "2017!K46:T46"),
  stay("r_fx_farhorizon_sfe_2", "south-float-east", "v_far-horizon", "2018-08-06", "2018-08-10", "2018!H53:L53"),
  stay("r_fx_calendar_sfe", "south-float-east", "v_tidewater", "2019-02-26", "2019-03-01", "2019!AB11:AE11", { status: "needs_review" }),
  stay("r_fx_goldencompass_sfe", "south-float-east", "v_golden-compass", "2019-06-20", "2019-06-27", "2019!V39:AC39"),
  stay("r_fx_farhorizon_sfe_1", "south-float-east", "v_far-horizon", "2019-07-03", "2019-07-09", "2019!E46:K46"),
  stay("r_fx_longketch_sfe", "south-float-east", "v_long-ketch", "2019-08-19", "2019-08-23", "2019!U53:Y53"),
];

const issues: IssueSeed[] = [
  {
    id: "i_fx_overlap_a", type: "overlap", severity: "blocking", reason: "double_booked", reservationId: "r_fx_pair_a", vesselId: null,
    relatedReservationIds: ["r_fx_pair_b"], detail: "R/V Tidewater and OSV Amber Reef are both on North Pier East from Jul 14 to Jul 16, 2019. Decide which stay is right, then change or cancel the other.", sourceRef: "2019!L42:R42",
  },
  {
    id: "i_fx_overlap_b", type: "overlap", severity: "blocking", reason: "double_booked", reservationId: "r_fx_pair_b", vesselId: null,
    relatedReservationIds: ["r_fx_pair_a"], detail: "OSV Amber Reef and R/V Tidewater are both on North Pier East from Jul 14 to Jul 16, 2019. Decide which stay is right, then change or cancel the other.", sourceRef: "2019!P43:V43",
  },
  {
    id: "i_fx_unlabelled", type: "unlabelled", severity: "blocking", reason: "label_unfilled", reservationId: "r_fx_unlabelled_sfw", vesselId: null,
    relatedReservationIds: [], detail: "South Float West is shaded Jul 8 to Jul 11, 2019 with no name written in. Find out who had the berth, or cancel the block.", sourceRef: "2019!J45:M45",
  },
  {
    id: "i_fx_calendar", type: "calendar_defect", severity: "blocking", reason: "nonexistent_day", reservationId: "r_fx_calendar_sfe", vesselId: null,
    relatedReservationIds: [], detail: "The 2019 sheet has a Feb 29 column, which does not exist. This stay runs through it, so its end date may be a day off.", sourceRef: "2019!AB11:AE11",
  },
  {
    id: "i_fx_extent_month_end", type: "ambiguous_extent", severity: "warning", reason: "merge_past_month_end", reservationId: "r_fx_crossmonth_npw", vesselId: null,
    relatedReservationIds: [], detail: "The July bar runs past the last day of the month and an August bar starts on the 1st. They were joined into one stay; check the dates.", sourceRef: "2019!AD40:AG40;2019!C47:H47",
  },
  {
    id: "i_fx_extent_shared_bar", type: "ambiguous_extent", severity: "warning", reason: "shared_bar", reservationId: "r_fx_tidewater_sfw", vesselId: null,
    relatedReservationIds: [], detail: "One shaded bar carries two labels. The split between the two stays was estimated from where each label sits.", sourceRef: "2019!V45:AC45",
  },
  {
    id: "i_fx_length_ironpetrel", type: "length_conflict", severity: "warning", reason: "registry_disagrees", reservationId: null, vesselId: "v_iron-petrel",
    relatedReservationIds: [], detail: "The vessel lists give S/V Iron Petrel two lengths: 120 ft and 135 ft. Enter the correct one so its bookings can be checked against the berth.", sourceRef: "Yachts!A17;Science!A31",
  },
];

export const fixtureSeed: Seed = { berths, vessels, reservations, issues };

/** A fresh deep copy, for tests that want to break a seed without affecting the others. */
export const cloneFixtureSeed = (): Seed => structuredClone(fixtureSeed);
