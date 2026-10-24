import { campusClient } from '../client/campus-client.js';
import { parseUserProfile } from '../parsers/profile.js';
import { handleListCourses } from './list-courses.js';
import { UserProfile } from '../types/index.js';
import { PATHS } from '../config.js';

export async function handleWhoami(): Promise<UserProfile> {
  const html = await campusClient.getHtml(PATHS.profile);
  const profile = parseUserProfile(html);

  // Si el perfil no traía cursos en la vista resumida, suplementar con list_courses
  if (!profile.enrolledCourses || profile.enrolledCourses.length === 0) {
    try {
      const coursesRes = await handleListCourses();
      profile.enrolledCourses = coursesRes.courses.map(c => ({ id: c.id, name: c.name }));
    } catch {
      // Si falla, conservar perfil sin cursos
    }
  }

  return profile;
}
