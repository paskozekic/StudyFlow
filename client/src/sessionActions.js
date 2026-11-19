import { api } from './api.js';
import { formatHours, shortDay, timeOf } from './dates.js';

/**
 * Mijenja status termina. Za "nisam stigao" plan se na serveru odmah slaže iznova,
 * a korisnik dobiva poruku gdje je propušteno učenje premješteno.
 */
export async function setSessionStatus(session, status, { notify, onChange }) {
  try {
    const result = await api.patch(`/sessions/${session.id}`, { status });
    if (status === 'missed') {
      const where = result.next.map((s) => `${shortDay(s.date)} u ${timeOf(s.start_at)}`).join(', ');
      if (result.warning) {
        notify(
          `Plan je preslagan, ali do roka za „${session.title}” nedostaje ${formatHours(result.warning.unscheduled_hours)}. Dodaj još slobodnog vremena.`,
          'warn',
        );
      } else {
        notify(where ? `Preslagano. „${session.title}” dalje učiš: ${where}.` : `„${session.title}” je preslagan.`);
      }
    }
    onChange();
    return true;
  } catch (e) {
    notify(e.message, 'error');
    return false;
  }
}
