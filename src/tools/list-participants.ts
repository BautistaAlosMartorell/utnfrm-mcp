import { campusClient } from '../client/campus-client.js';
import { parseCourseParticipants } from '../parsers/profile.js';
import { CourseParticipant } from '../types/index.js';
import { PATHS } from '../config.js';
import { resolveCourse } from './course-ref.js';

export async function handleListParticipants(courseId: string, role?: 'student' | 'teacher' | 'all'): Promise<{
  courseId: string;
  participants: CourseParticipant[];
  count: number;
}> {
  const cleanCourseId = (await resolveCourse(courseId)).id;
  const html = await campusClient.getHtml(PATHS.participants(cleanCourseId));
  let participants = parseCourseParticipants(html);

  if (role && role !== 'all') {
    if (role === 'teacher') {
      participants = participants.filter(p =>
        p.roles.some(r => /profesor|docente|teacher|tutor|ayudante/i.test(r))
      );
    } else if (role === 'student') {
      participants = participants.filter(p =>
        p.roles.some(r => /estudiante|student|alumno/i.test(r))
      );
    }
  }

  return {
    courseId: cleanCourseId,
    participants,
    count: participants.length
  };
}
