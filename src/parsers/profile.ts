import * as cheerio from 'cheerio';
import { UserProfile, CourseParticipant } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';

/**
 * Parsea la página de perfil del usuario en Moodle (/user/profile.php)
 */
export function parseUserProfile(html: string): UserProfile {
  const $ = cheerio.load(html);

  // Nombre completo
  let fullName = $('.page-header-headings h1, .page-header-headings h2').text().trim();
  if (!fullName) {
    fullName = $('.usertext, .userbutton .usertext').text().trim();
  }

  // ID del usuario si está en enlaces
  let id: string | undefined = undefined;
  const editProfileLink = $('a[href*="/user/edit.php"], a[href*="/user/profile.php?id="]').attr('href');
  if (editProfileLink) {
    const m = editProfileLink.match(/[?&]id=(\d+)/);
    if (m) id = m[1];
  }

  // Avatar
  const avatarUrl = $('.userpicture').first().attr('src');

  // Email
  let email = '';
  $('dt:contains("Dirección de correo"), dt:contains("Correo"), .email dt').each((_, el) => {
    const dd = $(el).next('dd');
    if (dd.length > 0) {
      email = dd.text().trim().replace(/\s*\(.*\)$/, '').trim();
    }
  });
  if (!email) {
    const emailMatch = html.match(/([a-zA-Z0-9._%+-]+@alumnos\.frm\.utn\.edu\.ar|[a-zA-Z0-9._%+-]+@frm\.utn\.edu\.ar|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) email = emailMatch[1];
  }

  // Ciudad y País
  let city: string | undefined = undefined;
  let country: string | undefined = undefined;
  let timezone: string | undefined = undefined;

  $('dt:contains("Ciudad"), dt:contains("City")').each((_, el) => {
    city = $(el).next('dd').text().trim() || undefined;
  });
  $('dt:contains("País"), dt:contains("Country")').each((_, el) => {
    country = $(el).next('dd').text().trim() || undefined;
  });
  $('dt:contains("Zona horaria"), dt:contains("Timezone")').each((_, el) => {
    timezone = $(el).next('dd').text().trim() || undefined;
  });

  // Primer y último acceso
  let firstAccess: string | undefined = undefined;
  let lastAccess: string | undefined = undefined;
  $('dt:contains("Primer acceso"), dt:contains("First access")').each((_, el) => {
    firstAccess = $(el).next('dd').text().trim() || undefined;
  });
  $('dt:contains("Último acceso"), dt:contains("Last access")').each((_, el) => {
    lastAccess = $(el).next('dd').text().trim() || undefined;
  });

  // Cursos matriculados listados en el perfil
  const enrolledCourses: { id: string; name: string }[] = [];
  $('section.node_category:contains("Cursos"), section:contains("Detalles del curso")').find('li a[href*="/course/view.php?id="]').each((_, el) => {
    const href = $(el).attr('href');
    const name = $(el).text().trim();
    if (href && name) {
      const match = href.match(/id=(\d+)/);
      if (match && !enrolledCourses.some(c => c.id === match[1])) {
        enrolledCourses.push({ id: match[1], name });
      }
    }
  });

  return {
    id,
    fullName: fullName || 'Estudiante UTN FRM',
    email,
    avatarUrl,
    city,
    country,
    timezone,
    firstAccess,
    lastAccess,
    enrolledCourses: enrolledCourses.length > 0 ? enrolledCourses : undefined
  };
}

/**
 * Parsea la tabla de participantes de un curso (/user/index.php?id=...)
 */
export function parseCourseParticipants(html: string): CourseParticipant[] {
  const $ = cheerio.load(html);
  const participants: CourseParticipant[] = [];

  $('table#participants tbody tr').each((_, el) => {
    const $row = $(el);
    const userLink = $row.find('th.user a[href*="/user/view.php"], td a[href*="/user/view.php"]').first();
    const href = userLink.attr('href');
    if (!href) return;

    const idMatch = href.match(/[?&]id=(\d+)/);
    const id = idMatch ? idMatch[1] : '';
    const name = userLink.text().trim();

    // Roles
    const roles: string[] = [];
    $row.find('.column-roles, td.c2, [data-field="roles"]').each((_, rel) => {
      const roleText = $(rel).text().trim();
      if (roleText && roleText !== 'Sin roles' && roleText !== 'No roles') {
        roles.push(roleText);
      }
    });

    // Grupos
    const groups: string[] = [];
    $row.find('.column-groups, td.c3, [data-field="groups"]').each((_, gel) => {
      const grpText = $(gel).text().trim();
      if (grpText && grpText !== 'Sin grupos' && grpText !== 'No groups') {
        groups.push(grpText);
      }
    });

    // Último acceso
    const lastAccess = $row.find('.column-lastaccess, td.c4, [data-field="lastaccess"]').text().trim() || undefined;

    if (id && name) {
      participants.push({
        id,
        name,
        roles: roles.length > 0 ? roles : ['Estudiante'],
        groups: groups.length > 0 ? groups : undefined,
        lastAccess,
        profileUrl: new URL(href, CAMPUS_ORIGIN).href
      });
    }
  });

  return participants;
}
