import { campusClient } from '../client/campus-client.js';
import { parseCourseGrades } from '../parsers/grades.js';
import { CourseGradesReport } from '../types/index.js';
import { PATHS } from '../config.js';
import { requireMoodleId } from '../client/moodle-id.js';

export async function handleGetGrades(courseId: string): Promise<CourseGradesReport> {
  const cleanCourseId = requireMoodleId(courseId);
  const html = await campusClient.getHtml(PATHS.grades(cleanCourseId));
  return parseCourseGrades(html, cleanCourseId);
}
