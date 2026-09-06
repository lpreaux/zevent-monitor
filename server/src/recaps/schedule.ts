const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

export type DateParts = { year: number; month: number; day: number; hour: number; minute: number };

/** Date civile d'un instant dans un fuseau, sans dépendance native. */
export function zonedDateParts(date: Date, timeZone: string): DateParts {
  return parts(date, timeZone);
}

function parts(date: Date, timeZone: string): DateParts {
  const values = Object.fromEntries(
    formatter(timeZone).formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  return {
    year: values.year ?? 1970,
    month: values.month ?? 1,
    day: values.day ?? 1,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
  };
}

/** Convertit une date civile du fuseau en instant UTC, sans dépendance native. */
export function zonedDateTimeToUtc(
  date: { year: number; month: number; day: number },
  localTime: string,
  timeZone: string,
): Date {
  const [hour, minute] = localTime.split(':').map(Number);
  const wanted = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let candidate = wanted;
  // Deux corrections suffisent, y compris de part et d'autre d'un changement d'heure.
  for (let pass = 0; pass < 3; pass += 1) {
    const seen = parts(new Date(candidate), timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute);
    candidate += wanted - seenAsUtc;
  }
  return new Date(candidate);
}

function localDateWithOffset(reference: Date, timeZone: string, dayOffset: number) {
  const local = parts(reference, timeZone);
  const shifted = new Date(Date.UTC(local.year, local.month - 1, local.day + dayOffset));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

export function nextScheduleOccurrence(localTime: string, timeZone: string, after: Date): Date {
  const today = zonedDateTimeToUtc(localDateWithOffset(after, timeZone, 0), localTime, timeZone);
  return today > after
    ? today
    : zonedDateTimeToUtc(localDateWithOffset(after, timeZone, 1), localTime, timeZone);
}

/** Dernier horaire de la liste strictement antérieur à `before`. */
export function previousScheduleOccurrence(
  localTimes: string[],
  timeZone: string,
  before: Date,
): Date {
  const candidates = [-2, -1, 0].flatMap((dayOffset) =>
    localTimes.map((time) =>
      zonedDateTimeToUtc(localDateWithOffset(before, timeZone, dayOffset), time, timeZone),
    ),
  );
  const previous = candidates.filter((date) => date < before).sort((a, b) => b.getTime() - a.getTime())[0];
  if (!previous) return new Date(before.getTime() - 24 * 60 * 60 * 1000);
  return previous;
}
