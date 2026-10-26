import { campusClient } from '../client/campus-client.js';
import { parseCourseGrades } from '../parsers/grades.js';
import { CourseGradesReport } from '../types/index.js';
import { PATHS } from '../config.js';
import { resolveCourse } from './course-ref.js';

export async function handleGetGrades(courseId: string): Promise<CourseGradesReport> {
  const cleanCourseId = (await resolveCourse(courseId)).id;
  const html = await campusClient.getHtml(PATHS.grades(cleanCourseId));
  return parseCourseGrades(html, cleanCourseId);
}
