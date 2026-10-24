import * as cheerio from 'cheerio';
import { CalendarEventItem } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';

/**
 * Parsea los eventos del calendario de Moodle (/calendar/view.php?view=upcoming)
 */
export function parseCalendarEvents(html: string): CalendarEventItem[] {
  const $ = cheerio.load(html);
  const events: CalendarEventItem[] = [];

  $('.event, .eventlist .event-container').each((_, el) => {
    const $ev = $(el);
    const id = $ev.attr('data-event-id') || $ev.attr('id')?.replace(/^event-/, '') || String(_);

    const nameEl = $ev.find('.name a, h3.name, .event-title').first();
    const name = nameEl.text().trim();
    const eventUrl = nameEl.attr('href') ? new URL(nameEl.attr('href')!, CAMPUS_ORIGIN).href : undefined;

    // Fecha del evento
    let date = $ev.find('a[href*="/calendar/view.php?view=day"]').first().text().replace(/\s+/g, ' ').trim();
    if (!date) {
      date = $ev.find('.date, .event-time, time, .col-xs-11, .col-11').first().text().replace(/\s+/g, ' ').trim();
    }
    if (!date) {
      // Buscar texto que contenga nombres de meses o días
      $ev.find('a, span, div').each((_, cel) => {
        const txt = $(cel).text().replace(/\s+/g, ' ').trim();
        if (/(\d{1,2}\s+de\s+[a-z]+|\d{1,2}:\d{2}|lunes|martes|miércoles|jueves|viernes|sábado|domingo|hoy|mañana)/i.test(txt) && txt.length < 50 && !date) {
          date = txt;
        }
      });
    }

    const description = $ev.find('.description, .event-description, .card-text').text().trim() || undefined;

    // Detectar curso asociado
    let courseName: string | undefined = undefined;
    let courseId: string | undefined = undefined;
    const courseLink = $ev.find('a[href*="/course/view.php?id="]').first();
    if (courseLink.length > 0) {
      courseName = courseLink.text().trim();
      const m = courseLink.attr('href')?.match(/id=(\d+)/);
      if (m) courseId = m[1];
    }

    // Tipo de evento
    let eventType: CalendarEventItem['eventType'] = 'other';
    const classAttr = $ev.attr('class') || '';
    if (classAttr.includes('calendar_event_course') || courseId) {
      eventType = 'course';
    } else if (classAttr.includes('calendar_event_user')) {
      eventType = 'user';
    } else if (classAttr.includes('calendar_event_site')) {
      eventType = 'site';
    } else if (classAttr.includes('calendar_event_group')) {
      eventType = 'group';
    }

    if (name) {
      events.push({
        id,
        name,
        description,
        date,
        eventType,
        courseName,
        courseId,
        url: eventUrl
      });
    }
  });

  return events;
}
