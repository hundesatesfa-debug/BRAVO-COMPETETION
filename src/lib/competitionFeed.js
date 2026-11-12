export function normalizeCompetitionFeed(data) {
  const rows = Array.isArray(data) ? data : data?.competitions;

  if (!Array.isArray(rows)) return [];

  return rows.map((competition) => ({
    ...competition,
    registration_id:
      competition.registration?.id ?? competition.registration_id ?? null,
    registration_status:
      competition.registration?.status ??
      competition.registration_status ??
      null,
  }));
}
