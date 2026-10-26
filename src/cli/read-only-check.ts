import { campusClient } from '../client/campus-client.js';
import { handleOpen } from '../tools/open.js';
import { handleWhoami } from '../tools/whoami.js';
import { handleListCourses } from '../tools/list-courses.js';
import { handleListAssignments } from '../tools/list-assignments.js';
import { handleGetAssignment } from '../tools/get-assignment.js';
import { handleListResources } from '../tools/list-resources.js';
import { handleReadFile } from '../tools/read-file.js';
import { handleGetGrades } from '../tools/get-grades.js';
import { handleListParticipants } from '../tools/list-participants.js';
import {
  handleListForums,
  handleGetForumDiscussions,
  handleGetDiscussionPosts,
  handleForumPostTopic,
  handleForumReply
} from '../tools/forums.js';
import { handleListCalendarEvents, handleCalendarAddEvent } from '../tools/calendar.js';
import { handleGetChoice, handleSubmitChoice } from '../tools/choice.js';
import { handleGetCourseContents } from '../tools/get-course-contents.js';
import { handleGetDeadlines } from '../tools/get-deadlines.js';
import { handleGetAnnouncements } from '../tools/get-announcements.js';
import { handleGetQuizInfo } from '../tools/get-quiz-info.js';

export interface ReadOnlyCheckResult {
  tool: string;
  status: 'passed' | 'failed' | 'skipped';
}

export async function runReadOnlyCampusChecks(): Promise<ReadOnlyCheckResult[]> {
  const results: ReadOnlyCheckResult[] = [];
  const check = async <T>(tool: string, action: () => Promise<T>): Promise<T | undefined> => {
    try {
      const value = await action();
      results.push({ tool, status: 'passed' });
      return value;
    } catch {
      results.push({ tool, status: 'failed' });
      return undefined;
    }
  };
  const skip = (tool: string) => results.push({ tool, status: 'skipped' });

  try {
    await check('whoami', () => handleWhoami());
    const courseResult = await check('list_courses', () => handleListCourses());
    const courses = courseResult?.courses.slice(0, 2) || [];

    for (const course of courses) {
      await check('open', () => handleOpen(course.id));
      const assignments = await check('list_assignments', () => handleListAssignments(course.id));
      const assignment = assignments?.assignments[0];
      if (assignment) {
        await check('get_assignment', () => handleGetAssignment(assignment.id));
      }

      const resources = await check('list_resources', () => handleListResources(course.id));
      const file = resources?.resources.find(resource =>
        resource.type === 'resource' || resource.type === 'file'
      );
      if (file) {
        await check('read_file', () => handleReadFile({ url: file.url, page_size: 1024 }));
      }

      await check('get_course_contents', () => handleGetCourseContents({ course_id: course.id }));
      await check('get_quiz_info', () => handleGetQuizInfo({ course_id: course.id }));
      await check('get_announcements', () => handleGetAnnouncements({ course_id: course.id, limit: 3 }));
      await check('get_grades', () => handleGetGrades(course.id));
      await check('list_participants', () => handleListParticipants(course.id, 'all'));
      const forums = await check('list_forums', () => handleListForums(course.id));
      const forum = forums?.forums[0];
      if (forum) {
        const discussions = await check('get_forum_discussions', () =>
          handleGetForumDiscussions(forum.url)
        );
        const discussion = discussions?.discussions[0];
        if (discussion) {
          await check('get_discussion_posts', () => handleGetDiscussionPosts(discussion.id));
        }
        await check('forum_post_topic preview', () => handleForumPostTopic({
          course_id: course.id,
          forum_id: forum.id,
          subject: 'Vista previa local',
          message: 'Esta comprobación no publica contenido.',
          confirm: false
        }));
      }

      const choice = resources?.resources.find(resource => resource.type === 'choice');
      if (choice) {
        const detail = await check('get_choice', () => handleGetChoice(choice.id));
        const option = detail?.options[0];
        if (option) {
          await check('submit_choice preview', () => handleSubmitChoice({
            choice_id: choice.id,
            option_id: option.id,
            confirm: false
          }));
        }
      }
    }

    await check('get_deadlines', () => handleGetDeadlines({ course_id: courses[0]?.id, days_ahead: 30 }));
    await check('list_calendar_events', () => handleListCalendarEvents(30));
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    await check('calendar_add_event preview', () => handleCalendarAddEvent({
      name: 'Vista previa local',
      date: futureDate,
      confirm: false
    }));
    await check('forum_reply preview', () => handleForumReply({
      discussion_id: '1',
      message: 'Esta comprobación no publica contenido.',
      confirm: false
    }));

    for (const tool of [
      'open', 'list_assignments', 'get_assignment', 'get_course_contents', 'get_quiz_info', 'get_announcements',
      'list_resources', 'read_file', 'get_grades', 'list_participants', 'list_forums',
      'get_forum_discussions', 'get_discussion_posts', 'forum_post_topic preview',
      'forum_reply preview', 'get_choice', 'submit_choice preview', 'calendar_add_event preview'
    ]) {
      if (!results.some(result => result.tool === tool)) skip(tool);
    }
  } finally {
    await campusClient.close();
  }

  return results;
}
